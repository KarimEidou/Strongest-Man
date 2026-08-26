// Gunfire, drawn.
//
// Three pooled things, all additive, all in ONE mesh each, so a full-auto weapon
// at 820rpm costs three draw calls and no allocation:
//
//   tracers — a quad stretched from the muzzle to the point the shot landed,
//             billboarded about its own axis so it reads as a streak from any
//             angle rather than vanishing edge-on.
//   flashes — the muzzle bloom, a camera-facing quad parented to nothing and
//             placed at the barrel each shot.
//   impacts — the same quad at the far end, tinted by what was hit.
//
// A tracer is the shortest-lived thing in the game — 75ms, four frames at 60 —
// which is exactly why it cannot be a per-shot Mesh: at that rate the allocator
// is the cost, not the rendering. Every instance is written into a fixed
// InstancedMesh slot and retired by dropping its scale to zero.
import * as THREE from 'three';

const TRACER_CAP = 64;
const FLASH_CAP = 24;
const TRACER_LIFE = 0.075;
const FLASH_LIFE = 0.048;
const IMPACT_LIFE = 0.09;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// A soft streak: bright along its length, falling off across it. Drawn on a
// plane whose local +Y runs down the shot, so one texture serves any range.
function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 16, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 64);
  // taper the tail so the streak has a direction
  const t = ctx.createLinearGradient(0, 0, 0, 64);
  t.addColorStop(0, 'rgba(0,0,0,0.85)');
  t.addColorStop(0.45, 'rgba(0,0,0,0)');
  t.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = t;
  ctx.fillRect(0, 0, 16, 64);
  return new THREE.CanvasTexture(c);
}

function pool(scene, cap, geo, tex, renderOrder) {
  // instanceColor only reaches the fragment through vColor, and three's
  // color_fragment chunk is gated on USE_COLOR — which the material's
  // vertexColors flag defines and which then expects a real `color` attribute.
  // White here, so the per-instance tint is the only thing that tints.
  const n = geo.getAttribute('position').count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, vertexColors: true, toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, ZERO);
  scene.add(mesh);
  return { mesh, cap, next: 0, life: new Float32Array(cap), max: new Float32Array(cap), data: new Float32Array(cap * 8) };
}

let tracers = null, flashes = null, impacts = null, camRef = null;

export function initTracers(scene, camera) {
  camRef = camera;
  window.__test.fx = () => ({
    tracers: tracers ? tracers.life.filter((v) => v > 0).length : 0,
    flashes: flashes ? flashes.life.filter((v) => v > 0).length : 0,
    impacts: impacts ? impacts.life.filter((v) => v > 0).length : 0,
  });
  const streak = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);   // grows along +Y
  tracers = pool(scene, TRACER_CAP, streak, streakTexture(), 4);
  flashes = pool(scene, FLASH_CAP, new THREE.PlaneGeometry(1, 1), glowTexture(), 5);
  impacts = pool(scene, FLASH_CAP, new THREE.PlaneGeometry(1, 1), glowTexture(), 5);
}

// from -> to, in world space. `width` is the streak's thickness in metres.
export function addTracer(fx, fy, fz, tx, ty, tz, color = 0xbfe4ff, width = 0.075) {
  if (!tracers) return;
  const i = tracers.next; tracers.next = (tracers.next + 1) % tracers.cap;
  const d = tracers.data;
  d[i * 8] = fx; d[i * 8 + 1] = fy; d[i * 8 + 2] = fz;
  d[i * 8 + 3] = tx; d[i * 8 + 4] = ty; d[i * 8 + 5] = tz;
  d[i * 8 + 6] = width;
  tracers.life[i] = TRACER_LIFE; tracers.max[i] = TRACER_LIFE;
  _c.set(color);
  tracers.mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
  tracers.mesh.instanceColor.needsUpdate = true;
}

function addBillboard(p, life, x, y, z, size, color) {
  if (!p) return;
  const i = p.next; p.next = (p.next + 1) % p.cap;
  const d = p.data;
  d[i * 8] = x; d[i * 8 + 1] = y; d[i * 8 + 2] = z; d[i * 8 + 6] = size;
  p.life[i] = life; p.max[i] = life;
  _c.set(color);
  p.mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
  p.mesh.instanceColor.needsUpdate = true;
}

export function addMuzzleFlash(x, y, z, size = 0.55, color = 0xffd9a0) {
  addBillboard(flashes, FLASH_LIFE, x, y, z, size, color);
}

export function addImpactFlash(x, y, z, size = 0.4, color = 0xffe6b0) {
  addBillboard(impacts, IMPACT_LIFE, x, y, z, size, color);
}

function stepBillboards(p, dt) {
  let dirty = false;
  for (let i = 0; i < p.cap; i++) {
    if (p.life[i] <= 0) continue;
    p.life[i] -= dt;
    dirty = true;
    const d = p.data;
    if (p.life[i] <= 0) { p.mesh.setMatrixAt(i, ZERO); continue; }
    // pop to full size instantly, then collapse: a flash that fades at constant
    // size reads as a decal, one that shrinks reads as light
    const k = p.life[i] / p.max[i];
    const s = d[i * 8 + 6] * (0.55 + 0.45 * k) * (0.7 + 0.3 * k);
    _v.set(d[i * 8], d[i * 8 + 1], d[i * 8 + 2]);
    _q.copy(camRef.quaternion);
    _m.compose(_v, _q, _s.set(s, s, s));
    p.mesh.setMatrixAt(i, _m);
  }
  if (dirty) p.mesh.instanceMatrix.needsUpdate = true;
}

export function tracersFrame(dt) {
  if (!tracers) return;
  let dirty = false;
  for (let i = 0; i < tracers.cap; i++) {
    if (tracers.life[i] <= 0) continue;
    tracers.life[i] -= dt;
    dirty = true;
    const d = tracers.data;
    if (tracers.life[i] <= 0) { tracers.mesh.setMatrixAt(i, ZERO); continue; }
    _v.set(d[i * 8], d[i * 8 + 1], d[i * 8 + 2]);                       // origin
    _by.set(d[i * 8 + 3], d[i * 8 + 4], d[i * 8 + 5]).sub(_v);          // along the shot
    const len = _by.length() || 0.001;
    _by.divideScalar(len);
    // Roll the quad about the shot until its face is as square to the camera as
    // it can get: the plane's normal becomes the camera offset with the
    // component ALONG the shot removed. Without this a tracer fired straight
    // down the view axis is a one-pixel line.
    _bz.copy(camRef.position).sub(_v);
    _bz.addScaledVector(_by, -_bz.dot(_by));
    if (_bz.lengthSq() < 1e-8) {
      // Shot straight down the view axis: any perpendicular will do. The XZ one
      // is degenerate in turn for a vertical shot, hence the second fallback.
      _bz.set(-_by.z, 0, _by.x);
      if (_bz.lengthSq() < 1e-8) _bz.set(1, 0, 0);
    }
    _bz.normalize();
    _bx.crossVectors(_by, _bz);
    const k = tracers.life[i] / tracers.max[i];
    _bx.multiplyScalar(d[i * 8 + 6] * (0.5 + 0.5 * k));
    _by.multiplyScalar(len);
    _m.makeBasis(_bx, _by, _bz);
    _m.setPosition(_v);
    tracers.mesh.setMatrixAt(i, _m);
  }
  if (dirty) tracers.mesh.instanceMatrix.needsUpdate = true;
  stepBillboards(flashes, dt);
  stepBillboards(impacts, dt);
}
