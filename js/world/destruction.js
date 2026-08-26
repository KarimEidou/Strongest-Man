// Destruction: sphere removals, the per-building support solver, progressive
// top-down collapse queues, and prop/hydrant/streetlight break-up. All debris
// and dust flows through here so punch strength maps to fragment counts.
import * as THREE from 'three';
import { emit, EV } from '../core/events.js';
import { FLOOR_H } from './city.js';
import { spawnDebris, addCrater } from './debris.js';
import { burstDust, burstSparks, burstBlood, startWaterJet, shockwave } from '../engine/particles.js';
import { wakeRadius } from '../physics/pworld.js';
import { queryProps } from '../physics/collide.js';
import { PROP_TYPES } from './props.js';
import { rand } from '../core/mathx.js';

let B = null, P = null, sceneRef = null, camRef = null;
const collapseQueue = [];   // {cell|slab|roof|iwall|furn, due, building}
const lampFalls = [];       // animated streetlight tip-overs
let simT = 0;

const V = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
const TINT = new THREE.Color();
const Q2 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);

export function initDestruction(scene, buildingsReg, propsReg, cam) {
  sceneRef = scene; B = buildingsReg; P = propsReg; camRef = cam;
}

// ---- public API ------------------------------------------------------------

// Remove building cells within a sphere. fragMult scales debris granularity.
export function removeSphere(x, y, z, r, { impulse = 8, fragMult = 1, byPlayer = false, silent = false } = {}) {
  let destroyed = 0;
  const touched = new Set();
  for (const b of B.buildings) {
    if (b.collapsed || !b.aliveCount) continue;
    const s = b.spec;
    if (x < s.x0 - r || x > s.x1 + r || z < s.z0 - r || z > s.z1 + r) continue;
    // Y reject: a punch at street level used to walk every cell of an 8-storey
    // tower. Thrown bodies call this every step while fast, and so does every
    // walking monster, so the saving is per-step, not per-punch.
    const f0 = Math.max(0, Math.floor((y - r) / FLOOR_H));
    const f1 = Math.min(s.floors - 1, Math.floor((y + r) / FLOOR_H));
    for (let f = f0; f <= f1; f++) {
      const cells = b.byFloor[f];
      if (!cells) continue;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (!cell.alive) continue;
        const dx = cell.x - x, dy = cell.y - y, dz = cell.z - z;
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
        destroyCellWithDebris(b, cell, x, y, z, impulse, fragMult);
        destroyed++;
        touched.add(b);
      }
    }
  }
  for (const b of touched) {
    solveSupport(b);
    checkBuildingFall(b, byPlayer);
  }
  if (destroyed && !silent) {
    emit(EV.CHUNK_DESTROYED, { count: destroyed, x, y, z });
    camRef?.shake(Math.min(0.12 + destroyed * 0.015, 0.4));
  }
  return destroyed;
}

function destroyCellWithDebris(b, cell, sx, sy, sz, impulse, fragMult) {
  if (!B.destroyCell(cell)) return;
  const tint = TINT.setHex(b.spec.tint).multiplyScalar(cell.floor === 0 ? 0.8 : 0.95);
  const frags = Math.max(1, Math.round((1 + rand() * 1.5) * fragMult));
  for (let i = 0; i < frags; i++) {
    const dx = cell.x - sx, dy = cell.y - sy, dz = cell.z - sz;
    const d = Math.hypot(dx, dy, dz) || 1;
    const kick = impulse * (0.5 + rand() * 0.7);
    spawnDebris('chunk',
      cell.x + (rand() - 0.5), cell.y + (rand() - 0.5) * 1.6, cell.z + (rand() - 0.5),
      (dx / d) * kick + (rand() - 0.5) * 3, Math.abs(dy / d) * kick * 0.4 + 2 + rand() * 3, (dz / d) * kick + (rand() - 0.5) * 3,
      0.5 + rand() * 0.45 * fragMult, tint.getHex());
  }
  if (cell.kind === 'window') {
    for (let i = 0; i < 3; i++) {
      spawnDebris('glass', cell.x, cell.y + rand(), cell.z, (rand() - 0.5) * 6, 2 + rand() * 3, (rand() - 0.5) * 6, 0.25 + rand() * 0.2, 0x9fc4ff);
    }
    burstSparks(cell.x, cell.y, cell.z, 6);
  }
  burstDust(cell.x, cell.y - 1, cell.z, 5, 0x8a86a0, 3.5);
}

// ---- support solver --------------------------------------------------------

function solveSupport(b) {
  const s = b.spec;
  // supported set flood: floor 0 alive cells are roots; support climbs
  // vertically with 1-cell diagonal tolerance per side grid.
  const unsupported = [];
  for (const side of ['north', 'east', 'south', 'west']) {
    const n = b.sideCols[side];
    // supported[col] per floor, computed bottom-up
    let below = null;
    for (let f = 0; f < s.floors; f++) {
      const cur = new Array(n).fill(false);
      for (let c = 0; c < n; c++) {
        const cell = b.idx.get(`${side}:${c}:${f}`);
        if (!cell || !cell.alive) continue;
        if (f === 0) { cur[c] = true; continue; }
        if (below[c] || (c > 0 && below[c - 1]) || (c < n - 1 && below[c + 1])) cur[c] = true;
        else unsupported.push(cell);
      }
      below = cur;
    }
  }
  for (const cell of unsupported) queueCollapse(b, { cell }, 0.09 * cell.floor + rand() * 0.05);
}

function checkBuildingFall(b, byPlayer) {
  if (b.collapsed || b.falling) return;
  if (b.groundAlive / Math.max(b.groundTotal, 1) < 0.42 || b.aliveCount < b.groundTotal * 1.2) {
    collapseBuilding(b, byPlayer);
  }
}

export function collapseBuilding(b, byPlayer = true) {
  if (b.collapsed || b.falling) return;
  b.falling = true;
  const s = b.spec;
  for (const [, cell] of b.idx) {
    if (cell.alive) queueCollapse(b, { cell }, 0.1 * cell.floor + rand() * 0.06);
  }
  for (const sl of b.slabIds) queueCollapse(b, { slab: sl }, 0.1 * sl.floor + 0.05);
  for (const iw of b.iwallIds) queueCollapse(b, { iwall: iw }, 0.1 * iw.floor + 0.04);
  for (const fu of b.furnIds) queueCollapse(b, { furn: fu }, 0.1 * fu.floor + 0.07);
  queueCollapse(b, { done: true, byPlayer }, 0.12 * s.floors + 0.5);
  emit(EV.FEAT, { type: 'building', x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, magnitude: 60 });
}

function queueCollapse(b, what, delay) {
  collapseQueue.push({ b, ...what, due: simT + delay });
}

// ---- per-step processing ---------------------------------------------------

export function queueInfo() {
  return { len: collapseQueue.length, mound: moundQueue.length, simT: +simT.toFixed(2), next: collapseQueue[0] ? +(collapseQueue[0].due - simT).toFixed(2) : null };
}

const MAX_COLLAPSE_PER_STEP = 40;

export function destructionFixed(dt) {
  simT += dt;
  drainMound();
  // Collapsing a tall building queues several hundred entries at once. Splicing
  // each processed entry out of the middle made every step O(queue × processed);
  // one compacting pass keeps it O(queue).
  let processed = 0, write = 0;
  for (let i = 0; i < collapseQueue.length; i++) {
    const q = collapseQueue[i];
    if (q.due > simT || processed >= MAX_COLLAPSE_PER_STEP) { collapseQueue[write++] = q; continue; }
    processed++;
    if (q.cell) {
      if (!q.cell.alive) continue;
      const tint = TINT.setHex(q.b.spec.tint);
      B.destroyCell(q.cell);
      // collapsing cells: sparse falling fragments (the permanent mound is
      // built on completion — transient debris only sells the motion)
      if (rand() < 0.4) {
        spawnDebris('chunk', q.cell.x + (rand() - 0.5), q.cell.y, q.cell.z + (rand() - 0.5),
          (rand() - 0.5) * 2.5, -2 - rand() * 3, (rand() - 0.5) * 2.5,
          0.55 + rand() * 0.4, tint.getHex());
      }
      if (rand() < 0.25) burstDust(q.cell.x, q.cell.y - 1, q.cell.z, 6, 0x8a86a0, 4);
      camRef?.shake(0.06);
    } else if (q.slab) {
      if (q.slab.gone) continue;
      q.slab.gone = true;
      B.hideInstance(q.slab.roof ? 'roof' : 'slab', q.slab.idx);
      const c = q.slab.roof ? 0x424a63 : 0x7d735c;
      for (let k = 0; k < 4; k++) {
        spawnDebris('chunk', q.slab.x + (rand() - 0.5) * q.slab.sx * 0.5, q.slab.y, q.slab.z + (rand() - 0.5) * q.slab.sz * 0.5,
          (rand() - 0.5) * 3, -1 - rand() * 2, (rand() - 0.5) * 3, 0.7 + rand() * 0.5, c);
      }
      burstDust(q.slab.x, q.slab.y, q.slab.z, 10, 0x8a86a0, 6);
    } else if (q.iwall) {
      if (q.iwall.gone) continue;
      q.iwall.gone = true;
      B.hideInstance('iwall', q.iwall.idx);
      spawnDebris('brick', q.iwall.x, q.iwall.y, q.iwall.z, (rand() - 0.5) * 3, -1, (rand() - 0.5) * 3, 0.8, 0x8a8298);
    } else if (q.furn) {
      if (q.furn.gone) continue;
      q.furn.gone = true;
      B.hideInstance('furn', q.furn.idx);
      spawnDebris('part', q.furn.x, q.furn.y, q.furn.z, (rand() - 0.5) * 4, 1, (rand() - 0.5) * 4, 0.6, q.furn.desk ? 0xa8772f : 0x2c4f9e);
    } else if (q.done) {
      q.b.falling = false;
      q.b.collapsed = true;
      const s = q.b.spec;
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      addCrater(cx, cz, Math.min((s.x1 - s.x0), 14) * 0.45);
      buildRubbleMound(s);
      burstDust(cx, 1, cz, 40, 0x9a92a8, 9);
      camRef?.shake(0.55);
      emit(EV.BUILDING_COLLAPSED, {
        building: s.id, byPlayer: q.byPlayer, occupied: s.occupied || 0,
        x: cx, z: cz, r: Math.max(s.x1 - s.x0, s.z1 - s.z0) * 0.5,
      });
    }
  }
  collapseQueue.length = write;

  // animated streetlight tip-overs
  for (let i = lampFalls.length - 1; i >= 0; i--) {
    const L = lampFalls[i];
    L.t += dt;
    const k = Math.min(L.t / 0.9, 1);
    // damped elastic: overshoot then settle
    const ease = 1 - Math.pow(1 - k, 3);
    const wobble = Math.sin(k * 9) * (1 - k) * 0.12;
    const ang = L.target * (ease + wobble);
    const t = P.types[L.p.type];
    Q.setFromAxisAngle(V.set(L.axX, 0, L.axZ), ang);
    Q2.setFromAxisAngle(UP, L.p.yaw);
    Q.multiply(Q2);
    M.compose(V.set(L.p.x, L.p.y, L.p.z), Q, S.set(1, 1, 1));
    t.mesh.setMatrixAt(L.p.idx, M);
    t.mesh.instanceMatrix.needsUpdate = true;
    if (k >= 1) lampFalls.splice(i, 1);
  }
}

// A permanent mound of pre-slept chunks over a collapsed footprint: instant
// heightfield pile, zero active bodies, walkable rubble that stays forever.
// The chunks are pre-rolled here but SPAWNED a few per step — dropping 46 bodies
// into one fixed step was a spike on the very frame the building landed.
import { forceSleep } from '../physics/pworld.js';
const moundQueue = [];
const MOUND_PER_STEP = 6;

function buildRubbleMound(s) {
  const w = s.x1 - s.x0, d = s.z1 - s.z0;
  const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
  const n = Math.min(46, Math.round((w * d) / 6));
  const tint = new THREE.Color(s.tint);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // denser + taller toward the centre
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    moundQueue.push({
      x: cx + Math.cos(a) * rr * w * 0.48,
      z: cz + Math.sin(a) * rr * d * 0.48,
      y: 3 + rand() * 2,
      size: 0.6 + rand() * 0.9 * (1.3 - rr),
      color: c.copy(tint).multiplyScalar(0.55 + rand() * 0.4).getHex(),
    });
  }
}

function drainMound() {
  for (let i = 0; i < MOUND_PER_STEP && moundQueue.length; i++) {
    const m = moundQueue.shift();
    const body = spawnDebris('chunk', m.x, m.y, m.z, 0, 0, 0, m.size, m.color);
    if (body) forceSleep(body);
  }
}

// ---- props -----------------------------------------------------------------

export function hitProp(p, dirX, dirZ, power) {
  if (!p.alive) return false;
  p.alive = false;
  const cfg = PROP_TYPES[p.type];
  if (p.type === 'prop_hydrant') {
    P.hide(p);
    startWaterJet(p.x, 0.1, p.z);
    spawnDebris('part', p.x, 1, p.z, dirX * power, 6 + power * 0.5, dirZ * power, 0.4, 0xd06a28);
    burstSparks(p.x, 0.6, p.z, 10, 0xbfe0ff);
    emit(EV.HYDRANT_BURST, { x: p.x, z: p.z });
  } else if (p.type === 'prop_streetlamp' || p.type === 'prop_trafficlight' || p.type === 'prop_sign') {
    // tip over: scripted damped fall in the push direction, stays down
    const len = Math.hypot(dirX, dirZ) || 1;
    lampFalls.push({
      p, t: 0,
      target: Math.PI / 2 * (0.85 + rand() * 0.12),
      // rotation axis ⊥ push direction
      axX: -dirZ / len, axZ: dirX / len,
    });
    P.retire(p);   // a felled lamp keeps its mesh but stops blocking walkers
    burstSparks(p.x, 4, p.z, 8);
  } else {
    // bench, dumpster, tree, kiosk: break into parts
    P.hide(p);
    const colors = { prop_bench: 0xb98a54, prop_dumpster: 0x2c4f9e, prop_tree: 0xd89048, prop_kiosk: 0x2452b8 };
    const n = p.type === 'prop_kiosk' ? 6 : 4;
    for (let i = 0; i < n; i++) {
      spawnDebris('part', p.x + (rand() - 0.5), 0.5 + rand() * cfg.h * 0.7, p.z + (rand() - 0.5),
        dirX * power * (0.5 + rand() * 0.6) + (rand() - 0.5) * 2, 3 + rand() * power * 0.5, dirZ * power * (0.5 + rand() * 0.6) + (rand() - 0.5) * 2,
        0.45 + rand() * 0.3, colors[p.type] || 0x888888);
    }
    if (p.type === 'prop_tree') burstDust(p.x, 2, p.z, 10, 0xd89048, 5);
    else burstDust(p.x, 0.8, p.z, 6, 0x8a86a0, 4);
  }
  // One emit, here, for every type — and exactly once, because the `p.alive`
  // guard above already made this function idempotent. It used to be announced
  // by each of the five callers instead, on top of the emit the lamp branch did
  // for itself, so a streetlamp, a traffic light or a sign paid AWARDS.prop
  // twice and cost 1.0 karma instead of 0.5 while the other five types paid once.
  emit(EV.PROP_DESTROYED, { type: p.type });
  return true;
}

const propScratch = [];
export function nearestProp(x, z, r, filter) {
  let best = null, bd = r * r;
  for (const p of queryProps(x, z, r, propScratch)) {
    if (!p.alive) continue;
    if (filter && !filter(p)) continue;
    const dx = p.x - x, dz = p.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = p; }
  }
  return best;
}

export function craterAt(x, z, r) { addCrater(x, z, r); }
export { shockwave };
