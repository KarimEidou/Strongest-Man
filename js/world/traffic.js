// Traffic: cars follow lane circuits, queue behind each other, obey the
// centre-intersection lights, brake for pedestrians, crush/deform when hit,
// explode with splash damage, and can be grabbed and thrown.
import * as THREE from 'three';
import { makeWorldMaterial } from '../engine/materials.js';
import { carGeo, trafficLensGeo } from './procprops.js';
import { neighbors } from '../ai/crowd.js';
import { groundHeight } from '../physics/heightfield.js';
import { removeSphere, craterAt } from './destruction.js';
import { burstFire, burstSmoke, shockwave, burstSparks } from '../engine/particles.js';
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
const KINDS = ['sedan', 'taxi', 'van', 'sedan', 'taxi', 'sedan'];
const CAR_COUNT = 12;

export function createTraffic(scene, propsReg, npcHooks, player, cam) {
  const mat = makeWorldMaterial();
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
    const geo = carGeo(kind);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const ci = i % CIRCUITS.length;
    const car = {
      kind, mesh, ci,
      s: (Math.floor(i / CIRCUITS.length) + rand() * 0.5) * (circuitLen[ci] / Math.ceil(CAR_COUNT / CIRCUITS.length)),
      speed: 0, cruise: 6.5 + rand() * 2,
      x: 0, z: 0, px: 0, pz: 0, yaw: 0, visYaw: 0,
      hp: 2, alive: true, exploded: false,
      mode: 'drive',            // drive | loose | held | flying | wreck
      vx: 0, vz: 0, vy: 0, y: 0, wspin: 0,
      hw: 1.0, hl: 2.3,
      squash: 1,
    };
    const [x, z, yaw] = posAt(ci, car.s);
    car.x = car.px = x; car.z = car.pz = z; car.yaw = car.visYaw = yaw;
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
      const off = new THREE.Vector3(0, 4.08 - k * 0.28, 1.395).applyQuaternion(LQ);
      LM.compose(LV.set(p.x + off.x, (p.y || 0) + off.y, p.z + off.z), LQ, LS);
      lensMesh.setMatrixAt(i * 3 + k, LM);
    }
  });
  lensMesh.instanceMatrix.needsUpdate = true;

  function updateLights(dt) {
    lightState.t += dt;
    const GREEN = 9, AMBER = 2;
    if (!lightState.amber && lightState.t > GREEN) { lightState.amber = true; lightState.t = 0; }
    else if (lightState.amber && lightState.t > AMBER) {
      lightState.amber = false; lightState.t = 0;
      lightState.phase = lightState.phase === 'EW' ? 'NS' : 'EW';
    }
    // lens colors: k0 red, k1 amber, k2 green — heads show the NS phase
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

  function gateStop(car) {
    // approaching the (0,0) intersection on a centre circuit during cross phase
    if (car.ci === 2 && (lightState.phase !== 'EW' || lightState.amber)) {
      if (Math.abs(car.z) < 4 && Math.abs(car.x) > 6.5 && Math.abs(car.x) < 11 && movingToward(car, 0, car.z)) return true;
    }
    if (car.ci === 3 && (lightState.phase !== 'NS' || lightState.amber)) {
      if (Math.abs(car.x) < 4 && Math.abs(car.z) > 6.5 && Math.abs(car.z) < 11 && movingToward(car, car.x, 0)) return true;
    }
    return false;
  }
  const movingToward = (car, tx, tz) => (Math.sin(car.yaw) * (tx - car.x) + Math.cos(car.yaw) * (tz - car.z)) > 0;

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
      car.panicT = Math.max(0, (car.panicT || 0) - dt);
      if (car.mode === 'drive') {
        let target = car.panicT > 0 ? car.cruise * 2.1 : car.cruise;
        // queue behind the nearest car ahead on the same circuit
        for (const o of list) {
          if (o === car || o.ci !== car.ci || o.mode !== 'drive') continue;
          let gap = o.s - car.s;
          const L = circuitLen[car.ci];
          gap = ((gap % L) + L) % L;
          if (gap > 0.1 && gap < 8) { target = Math.min(target, Math.max(0, (gap - 4) * 1.6)); }
        }
        // wrecks/loose cars block
        for (const o of list) {
          if (o === car || o.mode === 'drive' || o.mode === 'held') continue;
          const dx = o.x - car.x, dz = o.z - car.z;
          if (dx * dx + dz * dz < 64 && movingToward(car, o.x, o.z)) target = Math.min(target, Math.max(0, Math.hypot(dx, dz) * 0.8 - 3));
        }
        if (car.panicT > 0) {
          // fleeing drivers run lights and mow what they can't miss
          neighbors(car.x + Math.sin(car.yaw) * 2.5, car.z + Math.cos(car.yaw) * 2.5, 1.2, scratch);
          if (scratch.length && car.speed > 4) npcHooks?.damageRadius?.(car.x + Math.sin(car.yaw) * 2.5, car.z + Math.cos(car.yaw) * 2.5, 1.2, 'car');
        } else {
          // red light
          if (gateStop(car)) target = 0;
          // pedestrians / player ahead
          const aheadX = car.x + Math.sin(car.yaw) * 4, aheadZ = car.z + Math.cos(car.yaw) * 4;
          neighbors(aheadX, aheadZ, 2.6, scratch);
          if (scratch.some((n) => n.state !== 'dead')) target = 0;
          const pd = Math.hypot(player.p.x - aheadX, player.p.z - aheadZ);
          if (pd < 3) target = 0;
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
          if (Math.hypot(car.vx, car.vz) < 0.4) { car.mode = car.exploded ? 'wreck' : 'drive'; snapToCircuit(car); }
        }
        // smash through walls while fast
        if ((car.vx * car.vx + car.vz * car.vz) > 60) {
          const hit = removeSphere(car.x, car.y + 1, car.z, 2.2, { impulse: 10, fragMult: 1.2, byPlayer: true, silent: true });
          if (hit) { car.vx *= 0.5; car.vz *= 0.5; car.hp--; if (car.hp <= 0) { explode(car); continue; } }
        }
        npcHooks?.damageRadius?.(car.x, car.z, 1.6, 'car');
      }
      // wrecks and held cars do nothing per-step
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
    // scorch + crumple
    car.squash = 0.55;
    const col = car.mesh.geometry.getAttribute('color');
    for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * 0.22, col.getY(i) * 0.22, col.getZ(i) * 0.25);
    col.needsUpdate = true;
    cam.shake(0.4);
    emit(EV.CAR_EXPLODED, { x: car.x, z: car.z, byPlayer: car.lastHitByPlayer || false });
    emit(EV.SCREAM, { x: car.x, z: car.z, radius: 26 });
    emit(EV.FEAT, { type: 'car_explode', x: car.x, z: car.z, magnitude: 25 });
  }

  function frameUpdate(dt, alpha) {
    for (const car of list) {
      car.visYaw = dampAngle(car.visYaw, car.yaw, 18, dt);
      car.mesh.position.set(
        car.px + (car.x - car.px) * alpha,
        car.y,
        car.pz + (car.z - car.pz) * alpha,
      );
      car.mesh.rotation.set(0, car.visYaw, 0);
      const sq = damp(car.mesh.scale.y, car.squash, 8, dt);
      car.mesh.scale.set(1, sq, 1);
    }
  }

  const hooks = {
    onPunch(f, radius, impulse, charge) {
      for (const car of list) {
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
      let best = null, bd = 9;
      for (const car of list) {
        if (car.mode === 'held') continue;
        const dx = car.x - (p.x + Math.sin(p.yaw) * 1.8), dz = car.z - (p.z + Math.cos(p.yaw) * 1.8);
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = car; }
      }
      if (!best) return null;
      const car = best;
      car.mode = 'held';
      return {
        kind: 'entity', car,
        follow: (f, yaw) => {
          car.px = car.x = f.x + Math.sin(yaw) * 0.4;
          car.pz = car.z = f.z + Math.cos(yaw) * 0.4;
          car.y = f.y + 1.35;
          car.yaw = yaw + Math.PI / 2;
        },
        launch: (from, vx, vy, vz) => {
          car.mode = 'flying';
          car.x = from.x; car.y = from.y + 1; car.z = from.z;
          car.vx = vx; car.vy = vy + 5; car.vz = vz;
          car.wspin = (rand() - 0.5) * 7;
          car.lastHitByPlayer = true;
          emit(EV.FEAT, { type: 'car_throw', x: from.x, z: from.z, magnitude: 40 });
        },
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

  return { fixedUpdate, frameUpdate, hooks, list };
}
