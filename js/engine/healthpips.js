// A monster's health, over its head.
//
// Guns changed what the player needs to know. A fist was binary — you hit it or
// you did not — but a rifle asks "is this one nearly down, or did I just waste a
// magazine on a fresh one", and blood spurts do not answer that. So: two
// camera-facing quads per monster, a dark backing and a fill, in ONE instanced
// mesh, shown only once something has actually taken damage and faded back out
// four seconds after the last hit.
//
// Deliberately not a DOM overlay. The speech bubbles are DOM because text has to
// be text; a two-colour bar does not, and projecting a dozen absolutely
// positioned divs every frame costs more than sixteen instances.
import * as THREE from 'three';

const CAP = 12;                 // monsters tracked at once; the director caps at 4
const SHOW_AFTER_HIT = 4.0;     // seconds the bar stays up after the last damage
const W = 1.6, H = 0.16;        // bar size in metres, at the monster's own scale

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _off = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

let mesh = null, camRef = null;
const seen = new WeakMap();     // monster -> { hp, t }

export function initHealthPips(scene, camera) {
  camRef = camera;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3));
  const mat = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    vertexColors: true, toneMapped: false, opacity: 0.92,
  });
  mesh = new THREE.InstancedMesh(geo, mat, CAP * 2);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2 * 3).fill(1), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;         // over the world, under the tracers
  for (let i = 0; i < CAP * 2; i++) mesh.setMatrixAt(i, ZERO);
  scene.add(mesh);
}

// `monsters` is the live array; `maxHp` the value a fresh one starts at.
export function healthPipsFrame(dt, monsters, maxHp) {
  if (!mesh) return;
  let slot = 0;
  camRef.getWorldQuaternion(_q);
  for (const m of monsters) {
    if (slot >= CAP) break;
    if (m.dead) { seen.delete(m); continue; }
    let rec = seen.get(m);
    if (!rec) { rec = { hp: m.hp, t: 0 }; seen.set(m, rec); }
    if (m.hp < rec.hp) rec.t = SHOW_AFTER_HIT;      // took a hit: bring it up
    rec.hp = m.hp;
    if (rec.t <= 0) continue;
    rec.t -= dt;

    const k = Math.max(0, Math.min(1, m.hp / maxHp));
    // The last half second shrinks the bar away rather than fading it: the
    // material has one shared opacity and instanceColor cannot carry alpha, so
    // dimming toward zero would leave a black smear over the monster's head.
    const out = Math.min(1, rec.t / 0.5);
    // Under the realization "!" (ai/monster.js hangs that at targetH + 0.75), or
    // the two fight for the same patch of sky at the exact moment both matter.
    const y = (m.y || 0) + m.targetH + 0.28;
    // A monster's own height drives the bar, so a 3.4m one does not wear a
    // pinhead's health bar and a 2.7m one a billboard.
    const w = W * (m.targetH / 3.0) * out;
    const h = H * out;

    _v.set(m.x, y, m.z);
    _m.compose(_v, _q, _s.set(w, h, 1));
    mesh.setMatrixAt(slot * 2, _m);
    _c.setRGB(0.04, 0.05, 0.08);
    mesh.instanceColor.setXYZ(slot * 2, _c.r, _c.g, _c.b);

    // The fill drains from the RIGHT: shrink its width by k and slide it left
    // along the bar's own X axis by half of what was removed, or it would empty
    // symmetrically from both ends and read as a shrinking bar, not a spent one.
    const inner = w * 0.94;
    const fw = inner * k;
    _off.set(1, 0, 0).applyQuaternion(_q).multiplyScalar(-(inner - fw) * 0.5);
    _m.compose(_v2.set(m.x + _off.x, y + _off.y, m.z + _off.z), _q, _s.set(fw, h * 0.62, 1));
    mesh.setMatrixAt(slot * 2 + 1, _m);
    // green while it is still a fight, orange when it is nearly over
    _c.setRGB(1 - k * 0.78, 0.28 + k * 0.62, 0.20 + k * 0.12);
    mesh.instanceColor.setXYZ(slot * 2 + 1, _c.r, _c.g, _c.b);
    slot++;
  }
  for (let i = slot * 2; i < CAP * 2; i++) mesh.setMatrixAt(i, ZERO);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}
