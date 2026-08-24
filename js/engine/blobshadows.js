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
  const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  mesh = new THREE.InstancedMesh(g, m, CAP);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < CAP; i++) mesh.setMatrixAt(i, zero);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
}

// src: any object with live .x/.y/.z. Set src.blobOn = false to hide the blob
// (used for dead monsters and, at higher quality tiers, for characters that get
// a real shadow instead).
export function addBlob(src, r) {
  const idx = followers.length;
  if (idx >= CAP) return null;
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
