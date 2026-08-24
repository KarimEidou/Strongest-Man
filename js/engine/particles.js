// Particle systems: pooled THREE.Points for dust, sparks/glass, blood puffs,
// water jets, smoke/fire, plus an expanding shockwave ring mesh.
import * as THREE from 'three';
import { PAL } from '../core/palette.js';

let spriteTex = null;
function sprite() {
  if (spriteTex) return spriteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  spriteTex = new THREE.CanvasTexture(c);
  return spriteTex;
}

function makePoints(scene, cap, size, color, opacity = 1, blending = THREE.NormalBlending) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size, vertexColors: true, transparent: true, opacity,
    depthWrite: false, blending, sizeAttenuation: true,
    map: sprite(), alphaTest: 0.02,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  scene.add(points);
  return {
    points, cap,
    // parallel physics arrays
    px: pos, cx: col,
    vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap),
    life: new Float32Array(cap), maxLife: new Float32Array(cap),
    grav: new Float32Array(cap),
    head: 0, alive: 0,
  };
}

let dust, sparks, blood, water, smoke;
let ring, ring2;
const RC = new THREE.Color();

export function initParticles(scene) {
  dust = makePoints(scene, 500, 0.55, 0xffffff, 0.85);
  sparks = makePoints(scene, 200, 0.22, 0xffffff, 1, THREE.AdditiveBlending);
  blood = makePoints(scene, 160, 0.3, 0xffffff, 0.95);
  water = makePoints(scene, 480, 0.34, 0xffffff, 0.85);
  smoke = makePoints(scene, 300, 1.1, 0xffffff, 0.55);
  for (const p of [dust, sparks, blood, water, smoke]) hideAll(p);

  // shockwave rings (charged punches, explosions)
  const rg = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
  const rm = new THREE.MeshBasicMaterial({ color: 0xfff1d8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  ring = new THREE.Mesh(rg, rm);
  ring.renderOrder = 3; ring.frustumCulled = false; ring.visible = false;
  scene.add(ring);
  ring2 = ring.clone(); ring2.material = rm.clone();
  scene.add(ring2);
}

function hideAll(p) {
  for (let i = 0; i < p.cap; i++) { p.px[i * 3 + 1] = -100; p.life[i] = 0; }
  p.points.geometry.attributes.position.needsUpdate = true;
}

function emit(p, x, y, z, vx, vy, vz, life, color, grav) {
  const i = p.head; p.head = (p.head + 1) % p.cap;
  p.px[i * 3] = x; p.px[i * 3 + 1] = y; p.px[i * 3 + 2] = z;
  RC.set(color);
  p.cx[i * 3] = RC.r; p.cx[i * 3 + 1] = RC.g; p.cx[i * 3 + 2] = RC.b;
  p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
  p.life[i] = life; p.maxLife[i] = life; p.grav[i] = grav;
}

export function burstDust(x, y, z, n, color = 0x9aa3bd, power = 4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random();
    emit(dust, x, y + Math.random() * 0.6, z,
      Math.cos(a) * power * r, power * (0.4 + Math.random() * 0.8), Math.sin(a) * power * r,
      0.7 + Math.random() * 0.8, color, -9);
  }
}

export function burstSparks(x, y, z, n, color = 0xbfdcff) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    emit(sparks, x, y, z, Math.cos(a) * 7 * Math.random(), 3 + Math.random() * 6, Math.sin(a) * 7 * Math.random(),
      0.35 + Math.random() * 0.4, color, -18);
  }
}

export function burstBlood(x, y, z, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    emit(blood, x, y + 0.6, z, Math.cos(a) * 2.5 * Math.random(), 1.5 + Math.random() * 3, Math.sin(a) * 2.5 * Math.random(),
      0.5 + Math.random() * 0.35, i % 3 ? PAL.blood : 0xb32a2a, -16);
  }
}

export function burstSmoke(x, y, z, n, color = 0x2c2f3d) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    emit(smoke, x + Math.cos(a) * 0.5, y + Math.random(), z + Math.sin(a) * 0.5,
      Math.cos(a) * 0.8, 2.2 + Math.random() * 2, Math.sin(a) * 0.8,
      1.4 + Math.random() * 1.2, color, 2.5);
  }
}

export function burstFire(x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    emit(sparks, x, y + 0.4, z, Math.cos(a) * 3 * Math.random(), 4 + Math.random() * 5, Math.sin(a) * 3 * Math.random(),
      0.5 + Math.random() * 0.5, i % 2 ? 0xffb347 : 0xff7a2a, -4);
  }
}

// water jets: continuous emitters
const jets = [];
export function startWaterJet(x, y, z) {
  if (jets.length >= 2) jets.shift();
  jets.push({ x, y, z, t: 0, dur: 20 });
}

export function shockwave(x, y, z, maxR = 6, dur = 0.45) {
  const target = ring.visible && !ring2.visible ? ring2 : ring;
  target.position.set(x, y + 0.05, z);
  target.visible = true;
  target.userData = { t: 0, dur, maxR };
}

export function particlesFrame(dt) {
  for (const j of jets) {
    j.t += dt;
    const rate = j.t < j.dur ? 7 : 2;
    for (let i = 0; i < rate; i++) {
      const a = Math.random() * Math.PI * 2;
      emit(water, j.x, j.y + 0.5, j.z,
        Math.cos(a) * (0.5 + Math.random()), 12 + Math.random() * 4, Math.sin(a) * (0.5 + Math.random()),
        1.3, i % 4 ? 0xbfe0ff : 0xeef6ff, -20);
    }
    if (j.t > j.dur + 25) jets.splice(jets.indexOf(j), 1);
  }

  for (const p of [dust, sparks, blood, water, smoke]) {
    let dirty = false;
    for (let i = 0; i < p.cap; i++) {
      if (p.life[i] <= 0) continue;
      p.life[i] -= dt;
      dirty = true;
      if (p.life[i] <= 0) { p.px[i * 3 + 1] = -100; continue; }
      p.vy[i] += p.grav[i] * dt;
      p.px[i * 3] += p.vx[i] * dt;
      p.px[i * 3 + 1] += p.vy[i] * dt;
      p.px[i * 3 + 2] += p.vz[i] * dt;
      if (p.px[i * 3 + 1] < 0.05 && p.grav[i] < -10) { p.life[i] = Math.min(p.life[i], 0.12); p.vx[i] *= 0.4; p.vz[i] *= 0.4; p.vy[i] = 0; p.px[i * 3 + 1] = 0.05; }
    }
    if (dirty) p.points.geometry.attributes.position.needsUpdate = true;
    p.points.geometry.attributes.color.needsUpdate = dirty;
  }

  for (const r of [ring, ring2]) {
    if (!r.visible) continue;
    const u = r.userData;
    u.t += dt;
    const k = Math.min(u.t / u.dur, 1);
    const s = 0.4 + k * u.maxR;
    r.scale.set(s, 1, s);
    r.material.opacity = (1 - k) * 0.9;
    if (k >= 1) r.visible = false;
  }
}
