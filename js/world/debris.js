// Debris rendering: four InstancedMesh pools coupled to physics bodies.
// Bodies write their instance matrix on move and once on sleep; despawn always
// animates (shrink), never pops. Craters and decals live here too.
import * as THREE from 'three';
import { makeWorldMaterial, tagGeometry, faceShade } from '../engine/materials.js';
import { createBody, active as activeBodies, sleeping as sleepingBodies } from '../physics/pworld.js';
import { addDent, removePile } from '../physics/heightfield.js';
import { PAL } from '../core/palette.js';

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
const C = new THREE.Color();

const POOLS = {
  chunk: { cap: 520, geo: () => jitterBox(1, 1, 1, 0.22) },
  glass: { cap: 160, geo: () => tagGeometry(new THREE.PlaneGeometry(1, 1).toNonIndexed(), 0x9fc4ff, 0, 1.1) },
  brick: { cap: 260, geo: () => jitterBox(1, 0.6, 0.7, 0.15) },
  part: { cap: 140, geo: () => jitterBox(1, 0.8, 0.9, 0.1) },
};

function jitterBox(w, h, d, j) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = g.getAttribute('position');
  // consistent corner jitter: displace each unique corner by a hash of its signs
  for (let i = 0; i < pos.count; i++) {
    const sx = Math.sign(pos.getX(i)), sy = Math.sign(pos.getY(i)), sz = Math.sign(pos.getZ(i));
    const h1 = Math.sin(sx * 12.9898 + sy * 78.233 + sz * 37.719) * 43758.5453;
    const f = (n) => ((Math.sin(h1 * n) + 1) / 2 - 0.5) * j;
    pos.setXYZ(i, pos.getX(i) + f(1.3), pos.getY(i) + f(2.1), pos.getZ(i) + f(3.7));
  }
  g.computeVertexNormals();
  tagGeometry(g, 0xffffff, 0, 1);
  return faceShade(g);
}

const pools = {};
let scene3;

export function initDebris(scene) {
  scene3 = scene;
  const mat = makeWorldMaterial();
  for (const [name, cfg] of Object.entries(POOLS)) {
    const im = new THREE.InstancedMesh(cfg.geo(), mat, cfg.cap);
    im.frustumCulled = false;
    im.name = `debris_${name}`;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cfg.cap; i++) im.setMatrixAt(i, zero);
    scene.add(im);
    pools[name] = {
      mesh: im, cap: cfg.cap,
      free: Array.from({ length: cfg.cap }, (_, i) => cfg.cap - 1 - i),
      used: [], // {idx, body, size}
      shrink: [], // {idx, t, size, x,y,z, rx,ry,rz}
    };
  }
  initCraters(scene);
  initDecals(scene);
}

export function spawnDebris(type, x, y, z, vx, vy, vz, size, color, opts = {}) {
  const pool = pools[type];
  if (!pool) return null;
  if (!pool.free.length) reclaimOldest(pool);
  if (!pool.free.length) return null;
  const idx = pool.free.pop();
  pool.mesh.setColorAt(idx, C.set(color));
  if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;

  const body = createBody({
    kind: 'debris',
    x, y, z, vx, vy, vz,
    rx: Math.random() * 3, ry: Math.random() * 3, rz: Math.random() * 3,
    wx: (Math.random() - 0.5) * 9, wy: (Math.random() - 0.5) * 9, wz: (Math.random() - 0.5) * 9,
    half: size * 0.5,
    mass: opts.mass || size * size * 40,
    onMove: (b) => writeMatrix(pool, idx, b, size),
    onSleep: (b) => {
      writeMatrix(pool, idx, b, size);
      if (b.dead) freeSlot(pool, idx);
    },
  });
  body.userData = { pool, idx, size };
  const rec = { idx, body, size, born: performance.now() };
  pool.used.push(rec);
  writeMatrix(pool, idx, body, size);
  return body;
}

function writeMatrix(pool, idx, b, size) {
  E.set(b.rx, b.ry, b.rz);
  Q.setFromEuler(E);
  M.compose(V.set(b.x, b.y, b.z), Q, S.set(size, size, size));
  pool.mesh.setMatrixAt(idx, M);
  pool.mesh.instanceMatrix.needsUpdate = true;
}

function reclaimOldest(pool) {
  // oldest sleeping instance shrinks out
  let oldest = null, oi = -1;
  for (let i = 0; i < pool.used.length; i++) {
    const r = pool.used[i];
    if (r.body.asleep && (!oldest || r.born < oldest.born)) { oldest = r; oi = i; }
  }
  if (!oldest) { oldest = pool.used[0]; oi = 0; }
  if (!oldest) return;
  pool.used.splice(oi, 1);
  removeFromPhysics(oldest.body);
  pool.shrink.push({ idx: oldest.idx, t: 0, size: oldest.size, b: snapshot(oldest.body) });
}

function snapshot(b) { return { x: b.x, y: b.y, z: b.z, rx: b.rx, ry: b.ry, rz: b.rz }; }

function removeFromPhysics(body) {
  // pull out of active/sleeping lists + release pile share
  let i = activeBodies.indexOf(body); if (i >= 0) activeBodies.splice(i, 1);
  i = sleepingBodies.indexOf(body); if (i >= 0) sleepingBodies.splice(i, 1);
  if (body.pileCell >= 0) { removePile(body.pileCell, body.pileAmount); body.pileCell = -1; }
}

function freeSlot(pool, idx) {
  M.makeScale(0, 0, 0);
  pool.mesh.setMatrixAt(idx, M);
  pool.mesh.instanceMatrix.needsUpdate = true;
  pool.free.push(idx);
  const i = pool.used.findIndex((r) => r.idx === idx);
  if (i >= 0) pool.used.splice(i, 1);
}

export function debrisFrame(dt) {
  for (const pool of Object.values(pools)) {
    for (let i = pool.shrink.length - 1; i >= 0; i--) {
      const s = pool.shrink[i];
      s.t += dt * 2;
      const k = Math.max(0, 1 - s.t) * s.size;
      E.set(s.b.rx, s.b.ry, s.b.rz); Q.setFromEuler(E);
      M.compose(V.set(s.b.x, s.b.y, s.b.z), Q, S.set(k, k, k));
      pool.mesh.setMatrixAt(s.idx, M);
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (s.t >= 1) { pool.shrink.splice(i, 1); pool.free.push(s.idx); }
    }
  }
  updateDecals(dt);
}

// ---- craters ---------------------------------------------------------------

const CRATER_CAP = 24;
let craterMesh, craterNext = 0;
function initCraters(scene) {
  const g = craterGeo();
  craterMesh = new THREE.InstancedMesh(g, makeWorldMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), CRATER_CAP);
  craterMesh.renderOrder = 1;
  craterMesh.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < CRATER_CAP; i++) craterMesh.setMatrixAt(i, zero);
  craterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(craterMesh);
}

function craterGeo() {
  // irregular 16-gon disc, centre dropped, rim raised — dark scorched colors
  const n = 16;
  const positions = [], colors = [], interior = [];
  const rim = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 * (0.85 + Math.sin(i * 7.3) * 0.15);
    rim.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const dark = new THREE.Color(0x14161f), mid = new THREE.Color(0x232635);
  for (let i = 0; i < n; i++) {
    const a = rim[i], b = rim[(i + 1) % n];
    positions.push(0, -0.14, 0, a[0], 0.02, a[1], b[0], 0.02, b[1]);
    colors.push(dark.r, dark.g, dark.b, mid.r, mid.g, mid.b, mid.r, mid.g, mid.b);
    interior.push(0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('aInterior', new THREE.Float32BufferAttribute(interior, 1));
  g.computeVertexNormals();
  return g;
}

export function addCrater(x, z, radius) {
  const y = 0.03;
  M.compose(V.set(x, y, z), Q.identity(), S.set(radius, 1, radius));
  craterMesh.setMatrixAt(craterNext % CRATER_CAP, M);
  craterMesh.instanceMatrix.needsUpdate = true;
  craterNext++;
  addDent(x, z, Math.ceil(radius), 0.14);
}

// ---- decals (blood splats — user opted for light blood) --------------------

const DECAL_CAP = 24;
let decalMesh, decalNext = 0;
const decalLife = new Float32Array(DECAL_CAP);
function initDecals(scene) {
  const g = new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2).toNonIndexed();
  tagGeometry(g, PAL.blood, 0, 1);
  decalMesh = new THREE.InstancedMesh(g, makeWorldMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, transparent: true, opacity: 0.85 }), DECAL_CAP);
  decalMesh.renderOrder = 2;
  decalMesh.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < DECAL_CAP; i++) decalMesh.setMatrixAt(i, zero);
  decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(decalMesh);
}

export function addBloodDecal(x, z, radius = 0.5) {
  const i = decalNext % DECAL_CAP;
  M.compose(V.set(x, 0.035, z), Q.identity(), S.set(radius, 1, radius));
  decalMesh.setMatrixAt(i, M);
  decalMesh.instanceMatrix.needsUpdate = true;
  decalLife[i] = 40; // fades late
  decalNext++;
}

function updateDecals(dt) {
  // decals just persist; recycling overwrites the oldest
}
