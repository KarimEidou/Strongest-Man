// Soft blob shadows: one InstancedMesh of radial-gradient quads. Shadow maps
// over ever-changing destructible geometry invite acne and crawl; blobs are
// artifact-free and one draw call. Registered followers update every frame.
import * as THREE from 'three';
import { groundHeight } from '../physics/heightfield.js';

const CAP = 96;
let mesh;
// Followers hold a REFERENCE to the entity, not a getter. The old
// `addBlob(() => ({x, z, y, r}))` form allocated a fresh object per follower per
// frame — 96 objects × 60fps — which showed up as a GC saw-tooth. Reading the
// entity's live fields costs nothing and removes the one-frame lag too.
const followers = []; // {src, r, idx}
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();

export function initBlobShadows(scene) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(8,10,20,0.55)');
  grad.addColorStop(1, 'rgba(8,10,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  // The canvas is painted in sRGB (rgba(8,10,20,...)), so without this three
  // treats 8/255 as a LINEAR value and the blob comes out at sRGB 0.19 — a
  // slate-blue smudge rather than a shadow. Tagging it sRGB decodes it to
  // 0.0024 linear, which is the near-black that was painted.
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  mesh = new THREE.InstancedMesh(g, m, CAP);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  for (let i = 0; i < CAP; i++) mesh.setMatrixAt(i, ZERO);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
}

// src: any object with live .x/.y/.z. Set src.blobOn = false to hide the blob
// (used for dead monsters and, at higher quality tiers, for characters that get
// a real shadow instead).
// Free slots are reused. followers[] used to only ever grow: every monster the
// director despawned kept its slot for the rest of the session, so after ~90
// spawns addBlob returned null and nothing new — monster, NPC or the player
// himself after a scene reload — had a shadow again. The slot INDEX is what is
// pooled; the instance matrix at that index is zeroed on release so the quad
// disappears the same frame.
const freeSlots = [];
let nextSlot = 0;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function addBlob(src, r) {
  const idx = freeSlots.length ? freeSlots.pop() : nextSlot++;
  if (idx >= CAP) { nextSlot = CAP; return null; }
  const f = { src, r, idx };
  followers.push(f);
  return f;
}



export function blobFrame() {
  Q.identity();
  for (const f of followers) {
    const s = f.src;
    if (!s || s.blobOn === false) { M.makeScale(0, 0, 0); }
    else {
      const gy = groundHeight(s.x, s.z);
      const fade = Math.max(0.3, 1 - Math.max(0, (s.y ?? gy) - gy) * 0.18);
      const rr = f.r * fade;
      M.compose(V.set(s.x, gy + 0.015, s.z), Q, S.set(rr, 1, rr));
    }
    mesh.setMatrixAt(f.idx, M);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
