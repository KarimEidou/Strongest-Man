// NPCs: cloned skinned bodies with per-instance tint/scale variety, utility-AI
// daily schedules over the sidewalk lattice, LOD-tiered animation, and death
// (in-place fall or physics-root launch). Panic/monster reactions extend this
// in ai/panic.js; karma/reputation hooks live in their own systems.
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MODELS } from '../engine/assets.js';
import { createLocomotion } from '../anim/locomotion.js';
import { createPoseLayer } from '../anim/poselayer.js';
import { groundOffset, findBone } from '../anim/retarget.js';
import { capsuleVsWorld, blockedAt } from '../physics/collide.js';
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
const GRABV = new THREE.Vector3();
const NPC_R = 0.3;          // capsule radius used against the static world
const WHISKER = 1.8;        // how far ahead they look for something to walk round
const WHISKER_ANG = 0.61;   // ±35°

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
        o.receiveShadow = true;
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
      footY: 0,
      stuckT: 0,
      speakT: 0,                // >0 while mid-sentence (dialogue/conversation.js)
      // built here, while the clone is still in bind pose — a layer created
      // mid-animation would capture the wrong rest rotations
      poseLayer: createPoseLayer(root),
    };
    npc.footY = groundOffset(root);
    npc.px = npc.x; npc.pz = npc.z;
    npc.home = pick(city.pois.filter((p) => p.type === 'apartment')) || pick(city.pois);
    npc.district = npc.home.district;
    npc.blob = addBlob(npc, 0.62);
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
      n.tier = n.state === 'talking' ? 0 : d2 < 484 ? 0 : d2 < 3600 ? 1 : 2;

      // staggered AI cadence per tier
      const interval = n.tier === 0 ? 1 : n.tier === 1 ? 3 : 12;
      if ((tickI + n.id) % interval === 0) think(n, t, dt * interval);
      move(n, dt);
    }
  }

  function think(n, t, dt) {
    n.stateT -= dt;
    if (n.state === 'commute' || n.state === 'at_poi' || n.state === 'chat') sys.playerReact?.(n);
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
      case 'talking': {
        // mid-conversation: they stand still and keep their eyes on you
        n.targetSpeed = 0;
        n.yaw = Math.atan2(sys.player.p.x - n.x, sys.player.p.z - n.z);
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
    // someone is holding them; player/combat.js owns the transform entirely
    if (n.state === 'carried') { n.px = n.x; n.pz = n.z; return; }

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
      // Whiskers: look ahead and turn, so they route AROUND a bench or a corner
      // instead of grinding along it until the pushout shoves them clear.
      // Staggered by LOD tier — distant crowds do not need this every step.
      if ((tickI + n.id) % (n.tier === 2 ? 4 : 1) === 0) steerAround(n);

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

      // Unconditional now. This used to run only for panicking NPCs, which is
      // why everyone else strolled straight through the buildings.
      const [cx, cz] = capsuleVsWorld(n.x, n.z, n.y + 0.9, NPC_R);
      n.x = cx; n.z = cz;

      // wedged against something the whiskers could not solve? ask for a new route
      const moved = Math.abs(n.x - n.px) + Math.abs(n.z - n.pz);
      if (n.targetSpeed > 0.1 && moved < 0.012) {
        n.stuckT += dt;
        if (n.stuckT > 1.2) {
          n.stuckT = 0;
          n.yaw += (n.id & 1 ? 1 : -1) * (0.8 + rand() * 0.9);
          n.goal = null; n.path.length = 0; n.pathI = 0;
        }
      } else n.stuckT = 0;
    } else {
      n.px = n.x; n.pz = n.z;
      n.stuckT = 0;
    }
    n.y = groundHeight(n.x, n.z);
  }

  function steerAround(n) {
    const y = n.y + 0.9;
    const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
    if (!blockedAt(n.x + fx * WHISKER, n.z + fz * WHISKER, y, NPC_R)) return;
    const lYaw = n.yaw + WHISKER_ANG, rYaw = n.yaw - WHISKER_ANG;
    const lFree = !blockedAt(n.x + Math.sin(lYaw) * WHISKER, n.z + Math.cos(lYaw) * WHISKER, y, NPC_R);
    const rFree = !blockedAt(n.x + Math.sin(rYaw) * WHISKER, n.z + Math.cos(rYaw) * WHISKER, y, NPC_R);
    if (lFree && !rFree) n.yaw = lYaw;
    else if (rFree && !lFree) n.yaw = rYaw;
    else if (lFree && rFree) n.yaw = (n.id & 1) ? lYaw : rYaw;
    else n.yaw += (n.id & 1 ? 1 : -1) * 1.4;   // boxed in: turn hard and try again
  }

  function updateDead(n, dt) {
    if (n.body) {
      // launched: mesh follows the physics root, tumbling
      n.x = n.body.x; n.z = n.body.z; n.y = n.body.y - 0.35;
      n.root.position.set(n.x, Math.max(n.y, groundHeight(n.x, n.z)) + n.footY, n.z);
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
      if (n.state === 'carried') {
        // player/combat.js owns the transform; the legs keep cycling, which
        // held a metre off the ground reads as kicking
        if (n.carryQuat) {
          n.root.position.set(n.x, n.carryY, n.z);
          n.root.quaternion.copy(n.carryQuat);
        }
        n.loco.update(dt, 2.6);
        continue;
      }
      n.root.position.set(
        n.px + (n.x - n.px) * alpha,
        n.y + n.footY,
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
        // Speaking is physical: the head nods and turns, the chest sways, a hand
        // comes up on the stresses. Applied here, right after the mixer has
        // written this frame's pose — an additive twist would otherwise compound
        // on every frame the mixer skipped. Additive rather than an authored
        // pose because the rigs do not share bind rotations.
        if (n.speakT > 0) {
          n.speakT -= dt;
          n.speakPhase = (n.speakPhase || 0) + dt;
          const st_ = n.speakPhase;
          const amp = Math.min(1, n.speakT * 2.5);
          n.poseLayer.twist('Head', Math.sin(st_ * 7.3) * 0.10 * amp, Math.sin(st_ * 3.1) * 0.13 * amp, 0);
          n.poseLayer.twist('neck', Math.sin(st_ * 5.1) * 0.06 * amp, 0, 0);
          n.poseLayer.twist('Spine02', Math.sin(st_ * 2.3) * 0.05 * amp, Math.sin(st_ * 1.7) * 0.06 * amp, 0);
          const g = Math.max(0, Math.sin(st_ * 1.9)) * 0.5 * amp;
          n.poseLayer.twist('RightArm', -g, 0, g * 0.4);
          n.poseLayer.twist('RightForeArm', -g * 0.9, 0, 0);
        }
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

  // dialogue/talk.js drives these
  sys.beginTalk = (n) => {
    if (n.state === 'dead' || n.state === 'carried') return false;
    n.prevState = n.state;
    n.state = 'talking';
    n.targetSpeed = 0;
    n.speed = 0;
    n.chatPartner = null;
    return true;
  };
  sys.endTalk = (n) => {
    if (n.state !== 'talking') return;
    n.state = 'commute';
    n.goal = null; n.path.length = 0; n.pathI = 0;
    n.speakT = 0;
  };
  sys.speak = (n, seconds) => { n.speakT = seconds; n.speakPhase = 0; };

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
      const n = scratch.find((o) => o.state !== 'dead' && o.state !== 'carried');
      if (!n) return null;
      n.state = 'carried';
      n.targetSpeed = 0;
      n.carryQuat = null;
      // Measure this body's neck: heights vary 0.92–1.07 per NPC, and the whole
      // point is that the fist lands on the collar, not somewhere near it.
      let neckDrop = 1.45 * (n.root.scale.y || 1);
      const neck = findBone(n.root, 'neck') || findBone(n.root, 'Head');
      if (neck) {
        n.root.updateWorldMatrix(true, true);
        neckDrop = neck.getWorldPosition(GRABV).y - n.root.position.y;
      }
      emit(EV.SCREAM, { x: n.x, z: n.z, radius: 14 });
      return {
        kind: 'entity', npc: n, style: 'carry_neck',
        origin: { x: n.x, y: n.y + n.footY, z: n.z, yaw: n.visYaw },
        alive: () => n.state === 'carried',
        place: (x, y, z, quat) => {
          n.x = n.px = x; n.z = n.pz = z;
          n.carryY = y - neckDrop;      // held BY THE NECK, so the collar is the anchor
          n.carryQuat = quat;
        },
        release: () => {
          if (n.state !== 'carried') return;
          n.carryQuat = null;
          n.state = 'panic'; n.stateT = 8; n.panicLevel = 1;
          n.y = groundHeight(n.x, n.z);
        },
        launch: (from, vx, vy, vz) => {
          n.carryQuat = null;
          n.x = from.x; n.z = from.z; n.y = from.y;
          kill(n, 'thrown', 26, vx / 26, vz / 26);
          if (n.body) { n.body.vx = vx; n.body.vy = vy + 4; n.body.vz = vz; }
        },
      };
    },
  };

  // #5 regression probe: how many townsfolk are standing inside a building
  window.__test.npcsInsideBuildings = () => {
    let inside = 0;
    for (const n of npcs) {
      if (n.state === 'dead' || n.state === 'hide' || n.state === 'carried') continue;
      for (const s of city.buildings) {
        const b = window.__buildingsReg?.buildings[s.id];
        if (b?.collapsed) continue;
        if (n.x > s.x0 + 0.2 && n.x < s.x1 - 0.2 && n.z > s.z0 + 0.2 && n.z < s.z1 - 0.2) { inside++; break; }
      }
    }
    return inside;
  };
  window.__test.npcStats = () => {
    const alive = npcs.filter((n) => n.state !== 'dead').length;
    const states = {};
    for (const n of npcs) states[n.state] = (states[n.state] || 0) + 1;
    return { alive, states, tiers: npcs.reduce((a, n) => { a[n.tier] = (a[n.tier] || 0) + 1; return a; }, {}) };
  };

  return { npcs, fixedUpdate, frameUpdate, kill, hooks, sys };
}
