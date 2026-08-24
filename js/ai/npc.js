// NPCs: cloned skinned bodies with per-instance tint/scale variety, utility-AI
// daily schedules over the sidewalk lattice, LOD-tiered animation, and death
// (in-place fall or physics-root launch). Panic/monster reactions extend this
// in ai/panic.js; karma/reputation hooks live in their own systems.
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MODELS } from '../engine/assets.js';
import { createLocomotion } from '../anim/locomotion.js';
import { pickGoal, routeTo } from './schedule.js';
import { rebuildHash, neighbors } from './crowd.js';
import { groundHeight } from '../physics/heightfield.js';
import { createBody } from '../physics/pworld.js';
import { addBlob } from '../engine/blobshadows.js';
import { addBloodDecal } from '../world/debris.js';
import { burstBlood } from '../engine/particles.js';
import { emit, EV } from '../core/events.js';
import { game } from '../core/state.js';
import { rand, randRange, pick, clamp, damp, dampAngle } from '../core/mathx.js';
import { flags } from '../core/debug.js';

const COUNT = 48;
const ARCHETYPES = ['worker', 'vendor', 'kid'];
const scratch = [];

export function createNPCs(scene, city, player) {
  const npcs = [];
  const sys = { npcs, player, city };

  for (let i = 0; i < COUNT; i++) {
    const base = i % 2 ? 'npc_a' : 'npc_b';
    const root = cloneSkeleton(MODELS[base].scene);
    // per-NPC tint + build variety from just two bodies
    const tint = new THREE.Color().setHSL(rand(), 0.25 + rand() * 0.3, 0.55 + rand() * 0.2);
    root.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.color.lerp(tint, 0.22 + rand() * 0.18);
        o.frustumCulled = true;
      }
    });
    const h = randRange(0.92, 1.07);
    root.scale.setScalar(h);
    scene.add(root);

    const spawnNode = pick(city.nav.nodes);
    const npc = {
      id: i, root, base,
      x: spawnNode.x + randRange(-1, 1), z: spawnNode.z + randRange(-1, 1), y: 0,
      px: 0, pz: 0,
      yaw: rand() * Math.PI * 2, visYaw: 0,
      speed: 0, targetSpeed: 0,
      walkSpeed: randRange(1.15, 1.75),
      archetype: pick(ARCHETYPES),
      district: 0,
      state: 'commute',        // commute | at_poi | chat | alert | panic | hide | dead
      stateT: rand() * 6,
      path: [], pathI: 0,
      goal: null,
      home: null,
      loco: createLocomotion(root),
      tier: 2,
      mixerAcc: 0,
      // reputation/panic fields (used by later systems)
      knowledge: 0, knowSource: null, panicLevel: 0,
      threatX: 0, threatZ: 0, alertT: 0,
      chatPartner: null,
      body: null,               // physics body while launched
      dead: false,
      blob: null,
    };
    npc.px = npc.x; npc.pz = npc.z;
    npc.home = pick(city.pois.filter((p) => p.type === 'apartment')) || pick(city.pois);
    npc.district = npc.home.district;
    npc.blob = addBlob(() => ({ x: npc.x, z: npc.z, y: npc.y, r: 0.62, on: true }));
    npcs.push(npc);
  }

  let tickI = 0;

  function fixedUpdate(dt) {
    tickI++;
    if (tickI % 3 === 0) rebuildHash(npcs);
    const p = player.p;
    const t = game.timeOfDay;

    for (const n of npcs) {
      if (n.state === 'dead') { updateDead(n, dt); continue; }
      const dx = n.x - p.x, dz = n.z - p.z;
      const d2 = dx * dx + dz * dz;
      n.tier = d2 < 484 ? 0 : d2 < 3600 ? 1 : 2;

      // staggered AI cadence per tier
      const interval = n.tier === 0 ? 1 : n.tier === 1 ? 3 : 12;
      if ((tickI + n.id) % interval === 0) think(n, t, dt * interval);
      move(n, dt);
    }
  }

  function think(n, t, dt) {
    n.stateT -= dt;
    switch (n.state) {
      case 'commute': {
        if (!n.goal || n.pathI >= n.path.length) {
          if (n.goal && n.pathI >= n.path.length) {
            // arrived
            n.state = 'at_poi';
            n.stateT = randRange(8, 26);
            n.targetSpeed = 0;
            return;
          }
          n.goal = pickGoal(n, city.pois, t);
          if (n.goal?.closed) { n.goal = null; return; }
          n.path = routeTo(city.nav, n.x, n.z, n.goal.x, n.goal.z);
          n.pathI = 0;
        }
        n.targetSpeed = n.walkSpeed;
        break;
      }
      case 'at_poi': {
        n.targetSpeed = 0;
        if (n.stateT <= 0) {
          // maybe chat with someone idle nearby, else move on
          neighbors(n.x, n.z, 4, scratch);
          const other = scratch.find((o) => o !== n && o.state === 'at_poi' && !o.chatPartner);
          if (other && rand() < 0.4) {
            n.state = 'chat'; n.chatPartner = other; n.stateT = randRange(6, 14);
            other.state = 'chat'; other.chatPartner = n; other.stateT = n.stateT;
          } else {
            n.state = 'commute'; n.goal = null;
          }
        }
        break;
      }
      case 'chat': {
        n.targetSpeed = 0;
        const o = n.chatPartner;
        if (o) n.yaw = Math.atan2(o.x - n.x, o.z - n.z);
        if (n.stateT <= 0 || !o || o.state === 'dead') {
          if (o && o.chatPartner === n) { o.chatPartner = null; if (o.state === 'chat') o.state = 'commute'; }
          n.chatPartner = null;
          n.state = 'commute'; n.goal = null;
        }
        break;
      }
      default:
        if (sys.panicThink) sys.panicThink(n, dt, t);
        break;
    }
  }

  function move(n, dt) {
    // path following
    if (n.targetSpeed > 0 && n.pathI < n.path.length) {
      const node = n.path[n.pathI];
      const dx = node.x - n.x, dz = node.z - n.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) n.pathI++;
      else n.yaw = Math.atan2(dx, dz);
    }
    n.speed = damp(n.speed, n.targetSpeed, 6, dt);

    if (n.speed > 0.02) {
      let vx = Math.sin(n.yaw) * n.speed, vz = Math.cos(n.yaw) * n.speed;
      // separation
      neighbors(n.x, n.z, 1.3, scratch);
      for (const o of scratch) {
        if (o === n) continue;
        const sx = n.x - o.x, sz = n.z - o.z;
        const sd = Math.hypot(sx, sz) || 0.01;
        const push = (1.3 - sd) * 2.2;
        vx += (sx / sd) * push; vz += (sz / sd) * push;
      }
      n.px = n.x; n.pz = n.z;
      n.x += vx * dt; n.z += vz * dt;
      sys.panicCollide?.(n, dt);
    } else {
      n.px = n.x; n.pz = n.z;
    }
    n.y = groundHeight(n.x, n.z);
  }

  function updateDead(n, dt) {
    if (n.body) {
      // launched: mesh follows the physics root, tumbling
      n.x = n.body.x; n.z = n.body.z; n.y = n.body.y - 0.35;
      n.root.position.set(n.x, Math.max(n.y, groundHeight(n.x, n.z)), n.z);
      n.root.rotation.set(n.body.rx * 0.5, n.body.ry, n.body.rz * 0.5);
      if (n.body.asleep) {
        // settle lying down, stop tracking
        n.root.rotation.set(0, n.body.ry, Math.PI / 2 * 0.96);
        n.root.position.y = groundHeight(n.x, n.z) + 0.25;
        n.body = null;
        addBloodDecal(n.x, n.z, 0.55);
      }
    }
  }

  function frameUpdate(dt, alpha) {
    for (const n of npcs) {
      if (n.state === 'dead') {
        if (n.body) continue;         // physics-driven above
        n.loco.update(dt, 0);         // let die clip finish/clamp
        continue;
      }
      n.root.position.set(
        n.px + (n.x - n.px) * alpha,
        n.y,
        n.pz + (n.z - n.pz) * alpha,
      );
      n.visYaw = dampAngle(n.visYaw, n.yaw, 12, dt);
      n.root.rotation.set(0, n.visYaw, 0);

      // tiered mixer updates keep 48 skinned meshes cheap
      n.mixerAcc += dt;
      const step = n.tier === 0 ? 0 : n.tier === 1 ? 0.066 : 0.15;
      if (n.mixerAcc >= step) {
        n.loco.update(n.mixerAcc, n.speed);
        n.mixerAcc = 0;
      }
    }
  }

  // ---- damage API (combat + monsters + cars) -------------------------------

  function kill(n, cause, impulse = 0, dirX = 0, dirZ = 0) {
    if (n.state === 'dead') return;
    n.state = 'dead';
    n.dead = true;
    n.targetSpeed = 0;
    if (n.chatPartner) { const o = n.chatPartner; if (o.chatPartner === n) o.chatPartner = null; n.chatPartner = null; }
    burstBlood(n.x, n.y, n.z, 8);
    if (impulse > 14) {
      // launched corpse: physics root + frozen mid-fall pose
      n.loco.playOneshot('die', { timeScale: 0.8, clamp: true });
      n.body = createBody({
        kind: 'corpse',
        x: n.x, y: n.y + 1, z: n.z,
        vx: dirX * impulse * 0.55, vy: impulse * 0.4, vz: dirZ * impulse * 0.55,
        wy: (rand() - 0.5) * 8, wx: 0, wz: 0,
        half: 0.35, mass: 80, restitution: 0.1, friction: 0.5,
      });
    } else {
      n.loco.playOneshot('die', { timeScale: 1.1, clamp: true });
      addBloodDecal(n.x, n.z, 0.5);
    }
    emit(EV.NPC_DIED, { npc: n, cause, x: n.x, z: n.z });
    emit(EV.SCREAM, { x: n.x, z: n.z, radius: 20 });
  }

  const hooks = {
    onPunch(f, radius, impulse, charge) {
      const r = Math.max(radius, 1.6);
      neighbors(f.x, f.z, r, scratch);
      for (const n of [...scratch]) {
        const dx = n.x - f.x, dz = n.z - f.z;
        const d = Math.hypot(dx, dz) || 1;
        kill(n, 'player', impulse * (charge > 0.3 ? 1.4 : 0.8), dx / d, dz / d);
      }
    },
    onProjectile(b) {
      neighbors(b.x, b.z, 1.4, scratch);
      for (const n of [...scratch]) kill(n, 'thrown', 18, b.vx * 0.05, b.vz * 0.05);
    },
    damageRadius(x, z, r, cause) {
      neighbors(x, z, r, scratch);
      for (const n of [...scratch]) {
        const dx = n.x - x, dz = n.z - z;
        const d = Math.hypot(dx, dz) || 1;
        kill(n, cause, 20, dx / d, dz / d);
      }
    },
    tryGrab(p) {
      neighbors(p.x + Math.sin(p.yaw) * 1.4, p.z + Math.cos(p.yaw) * 1.4, 1.6, scratch);
      const n = scratch.find((o) => o.state !== 'dead');
      if (!n) return null;
      n.state = 'carried';
      n.targetSpeed = 0;
      return {
        kind: 'entity', npc: n,
        follow: (f) => { n.x = n.px = f.x; n.z = n.pz = f.z; n.y = f.y; },
        launch: (from, vx, vy, vz) => {
          n.x = from.x; n.z = from.z; n.y = from.y;
          kill(n, 'thrown', 26, vx / 26, vz / 26);
          if (n.body) { n.body.vx = vx; n.body.vy = vy + 4; n.body.vz = vz; }
        },
      };
    },
  };

  window.__test.npcStats = () => {
    const alive = npcs.filter((n) => n.state !== 'dead').length;
    const states = {};
    for (const n of npcs) states[n.state] = (states[n.state] || 0) + 1;
    return { alive, states, tiers: npcs.reduce((a, n) => { a[n.tier] = (a[n.tier] || 0) + 1; return a; }, {}) };
  };

  return { npcs, fixedUpdate, frameUpdate, kill, hooks, sys };
}
