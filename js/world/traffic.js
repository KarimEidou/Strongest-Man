// Traffic: cars follow lane circuits, obey the lights at every intersection,
// yield to whatever is in front of them (on any circuit), physically collide
// with each other, brake for pedestrians, crush/deform when hit, explode with
// splash damage, and can be grabbed and thrown.
import * as THREE from 'three';
import { makeWorldMaterial, tagGeometry, faceShade, SURF } from '../engine/materials.js';
import { staticGeometry } from '../engine/assets.js';
import { trafficLensGeo, CAR_CLEARANCE } from './procprops.js';
import { neighbors } from '../ai/crowd.js';
import { groundHeight } from '../physics/heightfield.js';
import { removeSphere, craterAt } from './destruction.js';
import { burstFire, burstSmoke, shockwave, burstSparks } from '../engine/particles.js';
import { ROAD } from './city.js';
import { emit, on, EV } from '../core/events.js';
import { rand, pick, damp, dampAngle, clamp } from '../core/mathx.js';

const scratch = [];

// clockwise rectangles (right-hand-ish lanes); cars loop these forever
const CIRCUITS = [
  [[-65.5, -65.5], [65.5, -65.5], [65.5, 65.5], [-65.5, 65.5]],
  [[-60.5, 60.5], [60.5, 60.5], [60.5, -60.5], [-60.5, -60.5]].reverse(),
  [[-60.5, -2.5], [60.5, -2.5], [60.5, 2.5], [-60.5, 2.5]],
  [[-2.5, 60.5], [-2.5, -60.5], [2.5, -60.5], [2.5, 60.5]],
];
const KINDS = ['sedan', 'taxi', 'van', 'police', 'taxi', 'sedan'];
const CAR_COUNT = 12;

// Live lens column on the signal head, in prop-local metres.
const LENS_TOP = 4.30, LENS_STEP = 0.30, LENS_Z = 0.50;

// every road crossing, not just the middle one
const JUNCTIONS = [];
for (const cx of ROAD.centers) for (const cz of ROAD.centers) JUNCTIONS.push({ x: cx, z: cz });

// The imported cars (assets/models/car_*.glb, Kenney CC0) all share one palette
// atlas, so the whole fleet is one geometry per kind and ONE material. Built
// once, lazily, because createTraffic runs after the models are loaded but the
// geometry is wanted by both the traffic pool and the wreck swap.
const carCache = new Map();
function carParts(kind) {
  let hit = carCache.get(kind);
  if (hit) return hit;
  const g = staticGeometry(`car_${kind}`);
  if (!g.geometry.getAttribute('normal')) g.geometry.computeVertexNormals();
  // Paint, not concrete: SURF.PAINT is the id with the tight specular lobe, and
  // it is what makes a car read as bodywork under the streetlamps.
  tagGeometry(g.geometry, 0xffffff, 0, 1, SURF.PAINT);
  faceShade(g.geometry);
  hit = { geometry: g.geometry, map: g.material.map || null };
  carCache.set(kind, hit);
  return hit;
}

export function createTraffic(scene, propsReg, npcHooks, player, cam) {
  const mat = makeWorldMaterial({ map: carParts('sedan').map });
  // one scorched material for every wreck: repainting a car used to rewrite and
  // re-upload its whole vertex-colour buffer at the exact moment it exploded
  const scorchedMat = makeWorldMaterial({ map: carParts('sedan').map, color: 0x4a4a52 });
  const list = [];
  const lightState = { phase: 'EW', t: 0, amber: false };

  // circuit helpers
  const circuitLen = CIRCUITS.map((c) => {
    let L = 0;
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      L += Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    }
    return L;
  });
  function posAt(ci, s) {
    const c = CIRCUITS[ci];
    let rem = ((s % circuitLen[ci]) + circuitLen[ci]) % circuitLen[ci];
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      const seg = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      if (rem <= seg) {
        const t = rem / seg;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])];
      }
      rem -= seg;
    }
    return [c[0][0], c[0][1], 0];
  }

  for (let i = 0; i < CAR_COUNT; i++) {
    const kind = pick(KINDS);
    const mesh = new THREE.Mesh(carParts(kind).geometry, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const ci = i % CIRCUITS.length;
    const car = {
      id: i, kind, mesh, ci,
      s: (Math.floor(i / CIRCUITS.length) + rand() * 0.5) * (circuitLen[ci] / Math.ceil(CAR_COUNT / CIRCUITS.length)),
      speed: 0, cruise: 6.5 + rand() * 2,
      x: 0, z: 0, px: 0, pz: 0, yaw: 0, visYaw: 0,
      cos: 1, sin: 0,           // cached per step; capsuleVsWorld reads these
      hp: 2, alive: true, exploded: false,
      mode: 'drive',            // drive | loose | held | flying | wreck
      vx: 0, vz: 0, vy: 0, y: 0, wspin: 0,
      // half-extents of the imported body, mirrors excluded (measure with
      // `node tools/geom-probe.mjs assets/models/car_sedan.glb`)
      hw: 0.88, hl: 1.70,
      squash: 1,
      panicT: 0,
      reactT: 0,                // drivers are not instantaneous
      carryQuat: null,          // set while a certain someone is holding it
    };
    const [x, z, yaw] = posAt(ci, car.s);
    car.x = car.px = x; car.z = car.pz = z; car.yaw = car.visYaw = yaw;
    car.cos = Math.cos(yaw); car.sin = Math.sin(yaw);
    list.push(car);
  }

  // traffic-light lenses (3 per light head), colored by phase each frame
  const lightProps = propsReg.types.prop_trafficlight?.list ?? [];
  const lensMesh = new THREE.InstancedMesh(trafficLensGeo(), new THREE.MeshBasicMaterial({ vertexColors: true }), Math.max(lightProps.length * 3, 1));
  lensMesh.frustumCulled = false;
  scene.add(lensMesh);
  const LM = new THREE.Matrix4(), LQ = new THREE.Quaternion(), LV = new THREE.Vector3(), LS = new THREE.Vector3(1, 1, 1);
  const LC = new THREE.Color();
  lightProps.forEach((p, i) => {
    for (let k = 0; k < 3; k++) {
      LQ.setFromAxisAngle(LV.set(0, 1, 0), p.yaw);
      // On the imported signal head (assets/models/prop_trafficlight.glb): the
      // pole is on the prop's origin, the head hangs over +z and its lens face
      // sits at z 0.45 with the visors reaching 0.65. Re-measure after any model
      // swap with `node tools/geom-probe.mjs assets/models/prop_trafficlight.glb`.
      const off = new THREE.Vector3(0, LENS_TOP - k * LENS_STEP, LENS_Z).applyQuaternion(LQ);
      LM.compose(LV.set(p.x + off.x, (p.y || 0) + off.y, p.z + off.z), LQ, LS);
      lensMesh.setMatrixAt(i * 3 + k, LM);
    }
  });
  lensMesh.instanceMatrix.needsUpdate = true;

  let lensSig = '';
  function updateLights(dt) {
    lightState.t += dt;
    const GREEN = 9, AMBER = 2;
    if (!lightState.amber && lightState.t > GREEN) { lightState.amber = true; lightState.t = 0; }
    else if (lightState.amber && lightState.t > AMBER) {
      lightState.amber = false; lightState.t = 0;
      lightState.phase = lightState.phase === 'EW' ? 'NS' : 'EW';
    }
    // lens colors: k0 red, k1 amber, k2 green — heads show the NS phase.
    // Repainting 90 instances and re-uploading the buffer 60×/s for data that
    // changes every ~9s was pure bandwidth; only push on an actual change.
    const sig = `${lightState.phase}${lightState.amber}`;
    if (sig === lensSig) return;
    lensSig = sig;
    const nsGo = lightState.phase === 'NS' && !lightState.amber;
    const nsAmber = lightState.amber;
    lightProps.forEach((p, i) => {
      for (let k = 0; k < 3; k++) {
        let on = false, col = 0x220a0a;
        if (k === 0) { on = !nsGo && !nsAmber; col = on ? 0xff4433 : 0x2a0d0d; }
        if (k === 1) { on = nsAmber; col = on ? 0xffb347 : 0x2a1d0a; }
        if (k === 2) { on = nsGo; col = on ? 0x4dff6a : 0x0d2a12; }
        lensMesh.setColorAt(i * 3 + k, LC.setHex(col));
      }
    });
    if (lensMesh.instanceColor) lensMesh.instanceColor.needsUpdate = true;
  }

  // ---- driver AI -----------------------------------------------------------

  // The junction this car is approaching, if any, plus how far the stop line is.
  function junctionAhead(car) {
    let best = null, bd = 16;
    for (const j of JUNCTIONS) {
      const dx = j.x - car.x, dz = j.z - car.z;
      const along = car.sin * dx + car.cos * dz;      // forward distance
      const side = car.cos * dx - car.sin * dz;       // lateral offset
      if (along < -2 || along > bd) continue;
      if (Math.abs(side) > ROAD.half + 1.5) continue;
      bd = along; best = j;
    }
    return best ? { j: best, dist: bd } : null;
  }

  // A car is on the EW phase if it is travelling mostly along x.
  const isEW = (car) => Math.abs(car.sin) > Math.abs(car.cos);

  function lightStop(car) {
    const ja = junctionAhead(car);
    if (!ja) return -1;
    const go = isEW(car) ? lightState.phase === 'EW' : lightState.phase === 'NS';
    if (go && !lightState.amber) return -1;
    // amber: commit if we are already into the box, otherwise pull up
    const stopLine = ja.dist - (ROAD.half + 1.6);
    if (stopLine < -0.5) return -1;                   // past the line, keep going
    if (lightState.amber && go && stopLine < 3.5) return -1;
    return Math.max(0, stopLine);
  }

  // Anything in this car's forward corridor — any circuit, any mode. This is
  // what makes them queue behind each other and yield at intersections instead
  // of driving straight through one another.
  function gapAhead(car) {
    let gap = Infinity;
    const look = clamp(car.speed * 1.5 + 5, 6, 18);
    for (const o of list) {
      if (o === car || o.mode === 'held' || o.mode === 'flying') continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const along = car.sin * dx + car.cos * dz;
      if (along <= 0 || along > look) continue;
      const side = car.cos * dx - car.sin * dz;
      const oR = Math.hypot(o.hw, o.hl);              // conservative disc
      if (Math.abs(side) > car.hw + oR) continue;
      // Yield to anyone moving; among stopped cars the lower id goes first, so
      // two drivers arriving together never deadlock staring at each other.
      if (o.mode === 'drive' && o.speed < 0.4 && o.id > car.id) continue;
      gap = Math.min(gap, along - car.hl - oR);
    }
    return gap;
  }

  // terrified drivers: some abandon the car where it stands, the rest floor it
  function scareCars(x, z, radius) {
    for (const car of list) {
      if (car.mode !== 'drive' || car.panicT > 0) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d > radius) continue;
      if (rand() < 0.35) { car.mode = 'wreck'; car.speed = 0; }   // abandoned mid-lane
      else car.panicT = 15;
    }
  }
  on(EV.MONSTER_SPAWNED, ({ monster }) => scareCars(monster.x, monster.z, 40));
  on(EV.CAR_EXPLODED, ({ x, z }) => scareCars(x, z, 26));
  on(EV.BUILDING_COLLAPSED, ({ x, z }) => scareCars(x, z, 36));
  on(EV.FEAT, ({ x, z, magnitude }) => { if (magnitude >= 40) scareCars(x, z, 24); });

  function fixedUpdate(dt) {
    updateLights(dt);
    for (const car of list) {
      car.px = car.x; car.pz = car.z;
      car.panicT = Math.max(0, car.panicT - dt);
      car.reactT = Math.max(0, car.reactT - dt);
      if (car.mode === 'drive') {
        let target = car.panicT > 0 ? car.cruise * 2.1 : car.cruise;

        // whatever is in front, on any circuit
        const gap = gapAhead(car);
        if (gap < Infinity) {
          const MIN_GAP = 1.6;
          target = Math.min(target, Math.max(0, (gap - MIN_GAP) * 1.5));
        }

        if (car.panicT > 0) {
          // fleeing drivers run lights and mow what they can't miss
          neighbors(car.x + car.sin * 2.5, car.z + car.cos * 2.5, 1.2, scratch);
          if (scratch.length && car.speed > 4) npcHooks?.damageRadius?.(car.x + car.sin * 2.5, car.z + car.cos * 2.5, 1.2, 'car');
        } else {
          const stopAt = lightStop(car);
          // hard stop once we are on the line, so cars sit still at red
          if (stopAt >= 0) target = Math.min(target, stopAt < 1.2 ? 0 : stopAt * 1.6);
          // pedestrians / player ahead
          const aheadX = car.x + car.sin * 4, aheadZ = car.z + car.cos * 4;
          neighbors(aheadX, aheadZ, 2.6, scratch);
          if (scratch.some((n) => n.state !== 'dead')) target = 0;
          const pd = Math.hypot(player.p.x - aheadX, player.p.z - aheadZ);
          if (pd < 3) target = 0;
        }

        // braking is prompt, pulling away is not — plus a short reaction delay
        // so a queue eases forward instead of every car launching in lockstep
        if (target > car.speed + 0.5) {
          if (car.reactT > 0) target = car.speed;
          else if (car.speed < 0.2) car.reactT = 0.25 + rand() * 0.35;
        }
        car.speed = damp(car.speed, target, target < car.speed ? 8 : 2.5, dt);
        car.s += car.speed * dt;
        const [x, z, yaw] = posAt(car.ci, car.s);
        car.x = x; car.z = z; car.yaw = yaw;
        car.y = 0;
      } else if (car.mode === 'loose' || car.mode === 'flying') {
        car.vy -= 22 * dt;
        car.x += car.vx * dt; car.y += car.vy * dt; car.z += car.vz * dt;
        car.yaw += car.wspin * dt;
        const g = groundHeight(car.x, car.z);
        if (car.y <= g) {
          car.y = g;
          if (car.mode === 'flying') { explode(car); continue; }
          car.vy = 0;
          car.vx *= 0.86; car.vz *= 0.86; car.wspin *= 0.85;
          if (Math.hypot(car.vx, car.vz) < 0.4) {
            // A car you threw does not dust itself off and rejoin the traffic. It
            // used to: any 'loose' car that stopped moving went back to 'drive'
            // and snapToCircuit teleported it onto the nearest lane, upright and
            // driving, however far across the city it had landed. Only a car that
            // was merely nudged goes back to work.
            if (car.exploded || car.lastHitByPlayer || car.wasHeld) {
              car.mode = 'wreck';
              // it settles on whatever corner it came down on
              car.restRoll = (rand() - 0.5) * 0.5;
              car.restPitch = (rand() - 0.5) * 0.35;
              car.squash = Math.min(car.squash ?? 1, 0.82);
            } else {
              car.mode = 'drive';
              snapToCircuit(car);
            }
          }
        }
        // smash through walls while fast
        if ((car.vx * car.vx + car.vz * car.vz) > 60) {
          const hit = removeSphere(car.x, car.y + 1, car.z, 2.2, { impulse: 10, fragMult: 1.2, byPlayer: true, silent: true });
          if (hit) { car.vx *= 0.5; car.vz *= 0.5; car.hp--; if (car.hp <= 0) { explode(car); continue; } }
        }
        npcHooks?.damageRadius?.(car.x, car.z, 1.6, 'car');
      }
      car.cos = Math.cos(car.yaw); car.sin = Math.sin(car.yaw);
      // wrecks and held cars do nothing per-step
    }
    separateCars();
  }

  // ---- car↔car contact -----------------------------------------------------

  // Separating-axis test on two yaw-aligned boxes; returns overlap depth (>0) or 0.
  function boxOverlap(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    let depth = Infinity;
    for (const c of [a, b]) {
      // this box's two axes
      const ax = [c.sin, c.cos], az = [c.cos, -c.sin];
      for (const ax2 of [ax, az]) {
        const dist = Math.abs(dx * ax2[0] + dz * ax2[1]);
        const ra = Math.abs(a.hl * (ax2[0] * a.sin + ax2[1] * a.cos)) + Math.abs(a.hw * (ax2[0] * a.cos - ax2[1] * a.sin));
        const rb = Math.abs(b.hl * (ax2[0] * b.sin + ax2[1] * b.cos)) + Math.abs(b.hw * (ax2[0] * b.cos - ax2[1] * b.sin));
        const o = ra + rb - dist;
        if (o <= 0) return 0;
        if (o < depth) depth = o;
      }
    }
    return depth;
  }

  // Cars used to drive straight through each other at crossings because each
  // one only ever looked at its own circuit. gapAhead() makes them yield; this
  // guarantees they never interpenetrate even when a yield comes too late.
  function separateCars() {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.mode === 'held' || a.mode === 'flying') continue;
      for (let k = i + 1; k < list.length; k++) {
        const b = list[k];
        if (b.mode === 'held' || b.mode === 'flying') continue;
        if (Math.abs(a.x - b.x) > 7 || Math.abs(a.z - b.z) > 7) continue;
        const depth = boxOverlap(a, b);
        if (depth <= 0) continue;
        // back the yielding car along its own lane; displacing a driving car
        // sideways would take it off the circuit that defines its path
        const giveA = a.mode === 'drive' && (b.mode !== 'drive' || a.speed >= b.speed);
        const give = giveA ? a : (b.mode === 'drive' ? b : a);
        const other = give === a ? b : a;
        if (give.mode === 'drive') {
          give.s -= depth + 0.02;
          const [x, z, yaw] = posAt(give.ci, give.s);
          give.x = x; give.z = z; give.yaw = yaw;
          give.cos = Math.cos(yaw); give.sin = Math.sin(yaw);
          give.speed = Math.min(give.speed, other.speed * 0.5);
          give.reactT = Math.max(give.reactT, 0.3);
        } else {
          // two loose/wrecked hulks: push apart, they are not on any lane
          const dx = give.x - other.x, dz = give.z - other.z;
          const d = Math.hypot(dx, dz) || 1;
          give.x += (dx / d) * depth; give.z += (dz / d) * depth;
        }
      }
    }
  }

  function snapToCircuit(car) {
    // rejoin the nearest point of its circuit (cheap: keep s, teleport visual)
    const [x, z, yaw] = posAt(car.ci, car.s);
    const d = Math.hypot(car.x - x, car.z - z);
    if (d > 3) { car.mode = 'wreck'; return; }   // too far off the road: abandoned
    car.x = x; car.z = z; car.yaw = yaw;
  }

  function explode(car) {
    if (car.exploded) { car.mode = 'wreck'; return; }
    car.exploded = true;
    car.mode = 'wreck';
    car.speed = 0;
    burstFire(car.x, car.y + 0.5, car.z, 26);
    burstSmoke(car.x, car.y + 1, car.z, 18);
    shockwave(car.x, car.y + 0.3, car.z, 5, 0.4);
    craterAt(car.x, car.z, 1.8);
    removeSphere(car.x, car.y + 1, car.z, 3.2, { impulse: 14, fragMult: 1.4, byPlayer: false, silent: true });
    npcHooks?.damageRadius?.(car.x, car.z, 4.5, 'explosion');
    // scorch + crumple — a shared material, not 1400 vertex colours re-uploaded
    car.squash = 0.55;
    car.mesh.material = scorchedMat;
    cam.shake(0.4);
    emit(EV.CAR_EXPLODED, { x: car.x, z: car.z, byPlayer: car.lastHitByPlayer || false });
    emit(EV.SCREAM, { x: car.x, z: car.z, radius: 26 });
    emit(EV.FEAT, { type: 'car_explode', x: car.x, z: car.z, magnitude: 25 });
  }

  function frameUpdate(dt, alpha) {
    for (const car of list) {
      car.mesh.position.set(
        car.px + (car.x - car.px) * alpha,
        car.y,
        car.pz + (car.z - car.pz) * alpha,
      );
      if (car.carryQuat) {
        // held overhead: the carry pose owns the full orientation
        car.mesh.quaternion.copy(car.carryQuat);
      } else {
        car.visYaw = dampAngle(car.visYaw, car.yaw, 18, dt);
        // a wreck keeps the tilt it came to rest on; anything still driving is flat
        car.mesh.rotation.set(car.restPitch || 0, car.visYaw, car.restRoll || 0);
      }
      const sq = damp(car.mesh.scale.y, car.squash, 8, dt);
      car.mesh.scale.set(1, sq, 1);
    }
  }

  const hooks = {
    // A round found this car. hp is a small integer (2 fresh) because a fist is
    // the unit it was written for, so gunfire converts: 25 damage is one punch's
    // worth of sheet metal, and the cannon takes a car out in one.
    shoot(car, dmg, dirX, dirZ) {
      if (!car || !car.alive || car.exploded) return;
      car.lastHitByPlayer = true;
      car.hp -= dmg / 25;
      car.squash = Math.max(0.6, car.squash - dmg / 400);
      burstSparks(car.x, car.y + 0.9, car.z, 5, 0xffd08a);
      if (car.hp <= 0) {
        const d = Math.hypot(dirX, dirZ) || 1;
        car.mode = 'loose';
        car.vx += (dirX / d) * 3; car.vz += (dirZ / d) * 3;
        explode(car);
      }
    },
    onPunch(f, radius, impulse, charge) {
      for (const car of list) {
        // Never punch the car you are holding. This loop had no mode guard, unlike
        // gapAhead, separateCars and physics/collide.js — and a held car is inside
        // the punch sphere by construction, since the sphere is one metre in front
        // of the man whose hands it is in. Setting it 'loose' handed the same car
        // to the world collider while combat kept pinning it to his palms every
        // frame, so capsuleVsWorld ejected him 2.7m per fixed step, forever: the
        // "punching with a car launches me across the map" report.
        if (car.mode === 'held' || car.mode === 'flying') continue;
        const dx = car.x - f.x, dz = car.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d > Math.max(radius, 2.6) + 1.5) continue;
        car.lastHitByPlayer = true;
        car.hp--;
        car.squash = Math.max(0.62, car.squash - 0.18);
        burstSparks(car.x, car.y + 0.8, car.z, 10);
        if (car.hp <= 0 || charge > 0.5) {
          car.mode = 'loose';
          car.vx = (dx / (d || 1)) * impulse * 0.9;
          car.vz = (dz / (d || 1)) * impulse * 0.9;
          car.vy = 3 + charge * 7;
          car.wspin = (rand() - 0.5) * 6;
          if (car.hp <= -1 || charge > 0.85) explode(car);
        } else {
          car.mode = 'loose';
          car.vx = (dx / (d || 1)) * impulse * 0.5;
          car.vz = (dz / (d || 1)) * impulse * 0.5;
          car.vy = 1.5;
          car.wspin = (rand() - 0.5) * 3;
        }
        emit(EV.FEAT, { type: 'car_hit', x: car.x, z: car.z, magnitude: charge > 0.5 ? 40 : 18 });
      }
    },
    tryGrab(p) {
      let best = null, bd = 20; // cars are big — generous grab reach

      for (const car of list) {
        if (car.mode === 'held') continue;
        const dx = car.x - (p.x + Math.sin(p.yaw) * 1.8), dz = car.z - (p.z + Math.cos(p.yaw) * 1.8);
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = car; }
      }
      if (!best) return null;
      const car = best;
      car.mode = 'held';
      car.speed = 0;
      return {
        kind: 'entity', car, style: 'carry_overhead',
        // combat.js drops the carry when alive() goes false. The car handle used to
        // omit it entirely, so `undefined !== false` and a car that stopped being
        // held stayed pinned to the hands regardless.
        alive: () => car.alive !== false && car.mode === 'held',
        // a car's origin is its wheel-contact plane, so the palms have to meet the
        // chassis underside — otherwise the whole body rides a clearance above them
        gripDrop: CAR_CLEARANCE,
        // world pose at the moment of the grab, so the lift can ease from it
        origin: { x: car.x, y: car.y, z: car.z, yaw: car.yaw },
        // combat drives position + orientation; see anim/poselayer.js
        place: (x, y, z, quat) => {
          car.px = car.x = x; car.pz = car.z = z; car.y = y;
          car.carryQuat = quat;
        },
        launch: (from, vx, vy, vz) => {
          car.wasHeld = true;          // it never drives again, see the landing branch
          car.mode = 'flying';
          car.carryQuat = null;
          car.x = from.x; car.y = from.y + 1; car.z = from.z;
          car.vx = vx; car.vy = vy + 5; car.vz = vz;
          car.wspin = (rand() - 0.5) * 7;
          car.lastHitByPlayer = true;
          emit(EV.FEAT, { type: 'car_throw', x: from.x, z: from.z, magnitude: 40 });
        },
        release: () => { car.carryQuat = null; if (car.mode === 'held') car.mode = 'loose'; },
      };
    },
    list,
    lightState,
  };

  window.__test.carStats = () => ({
    modes: list.reduce((a, c) => { a[c.mode] = (a[c.mode] || 0) + 1; return a; }, {}),
    phase: lightState.phase, amber: lightState.amber,
    sample: { x: +list[0].x.toFixed(1), z: +list[0].z.toFixed(1), speed: +list[0].speed.toFixed(1) },
  });
  // #11 regression probe: deepest car-vs-car interpenetration right now
  window.__test.carOverlap = () => {
    let worst = 0;
    for (let i = 0; i < list.length; i++) {
      for (let k = i + 1; k < list.length; k++) {
        const a = list[i], b = list[k];
        if (a.mode === 'held' || b.mode === 'held' || a.mode === 'flying' || b.mode === 'flying') continue;
        worst = Math.max(worst, boxOverlap(a, b));
      }
    }
    return +worst.toFixed(3);
  };

  return { fixedUpdate, frameUpdate, hooks, list };
}
