// NPCs: cloned skinned bodies with per-instance tint/scale variety, utility-AI
// daily schedules over the sidewalk lattice, LOD-tiered animation, and death
// (in-place fall or physics-root launch). Panic/monster reactions extend this
// in ai/panic.js; karma/reputation hooks live in their own systems.
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MODELS } from '../engine/assets.js';
import { makeCharacterMaterial } from '../engine/materials.js';
import { createLocomotion } from '../anim/locomotion.js';
import { createPoseLayer } from '../anim/poselayer.js';
import { VICTIM_POSES, VICTIM_BONE_WEIGHT } from '../anim/poses.js';
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
const GRABV = new THREE.Vector3(), GRABV2 = new THREE.Vector3();
const NPC_R = 0.3;          // capsule radius used against the static world
const CORPSE_CLEAR = 0.05;  // how far a settled body's lowest bone sits off the ground
const CARRY_CLEAR = 0.10;   // and how far a dangling victim's lowest bone must clear it
const DRAG_ON = 4.6, DRAG_OFF = 3.2;   // carrier speed hysteresis: hang <-> drag
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
        // Built rather than cloned: onBeforeCompile is an own property on the
        // material engine/assets.js made, and three's Material.copy does not carry
        // own properties across, so a clone would quietly drop the lamp lighting
        // and the specular lobe and leave 48 people shaded differently from the
        // one player standing next to them. They still share one program — the
        // cache key is identical — so this costs nothing but the material object.
        o.material = makeCharacterMaterial(o.material);
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
      // mid-animation would capture the wrong rest rotations. NPCs get their own
      // pose table: anim/poses.js POSES is authored against the PLAYER's bind
      // rotations and lands somewhere else entirely on these rigs.
      poseLayer: createPoseLayer(root, VICTIM_POSES, VICTIM_BONE_WEIGHT),
      baseY: h,                 // ai/panic.js squashes scale.y to cower; this is the way back
      settled: false,           // corpse has come to rest and stopped animating
      deadT: 0,
      dieDur: 0,
      carrySpeed: 0,            // the CARRIER's speed, so the victim knows to trail
      carryFast: false,
      carryT: 0,
      // the bones that decide whether this body is through the pavement
      lowBones: [],
    };
    for (const bn of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand']) {
      const b = findBone(root, bn);
      if (b) npc.lowBones.push(b);
    }
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
        n.root.rotation.set(0, n.body.ry, Math.PI / 2 * 0.96);   // rolled onto its side
        n.body = null;
        settleCorpse(n);
        addBloodDecal(n.x, n.z, 0.55);
      }
    }
  }

  // Put a body on the ground and leave it there. The die clip is HELD (see kill),
  // so the pose is whatever frame it clamped on; where that frame puts the mesh
  // relative to the root is the clip's business, not ours, and guessing it is how
  // corpses used to float. Measure the lowest bone and drop the root by that much.
  // After this the mixer is never ticked again: the pose is frozen for free.
  function settleCorpse(n) {
    n.root.updateWorldMatrix(true, true);
    let lowest = Infinity;
    n.root.traverse((o) => {
      if (!o.isBone) return;
      const y = o.getWorldPosition(GRABV).y;
      if (y < lowest) lowest = y;
    });
    if (isFinite(lowest)) n.root.position.y += (groundHeight(n.x, n.z) + CORPSE_CLEAR) - lowest;
    n.y = n.root.position.y - n.footY;
    n.settled = true;
    n.blobOn = false;          // a body flat on the pavement casts no separate blob
  }

  function frameUpdate(dt, alpha) {
    for (const n of npcs) {
      if (n.state === 'dead') {
        if (n.body) continue;         // physics-driven above
        if (n.settled) continue;      // frozen: the mixer is not ticked again
        // Run the die clip out, then stop forever. It is a HELD one-shot, so it
        // no longer fades back into idle a second after landing — which is what
        // "they drop to the ground and then stand back up" actually was.
        n.deadT += dt;
        n.loco.update(dt, 0);
        n.poseLayer.update(dt);       // any carry pose decays away under it
        if (n.deadT >= n.dieDur) settleCorpse(n);
        continue;
      }
      if (n.state === 'carried') {
        // player/combat.js owns the transform.
        if (n.carryQuat) {
          n.root.position.set(n.x, n.carryY, n.z);
          n.root.quaternion.copy(n.carryQuat);
        }
        // The victim used to be run at a hardcoded speed of 2.6, which the blend
        // graph resolves to 79% quick-walk: someone dangling by the throat, doing
        // a brisk walk in mid-air. The base is idle now and the animation is the
        // pose layer — clawing at the arm across their throat when you stand
        // still, legs swept back behind you when you run, limp if they are dead.
        n.loco.update(dt, 0);
        n.carryFast = n.carrySpeed > (n.carryFast ? DRAG_OFF : DRAG_ON);
        n.poseLayer.set(n.dead ? 'victim_limp' : n.carryFast ? 'victim_drag' : 'victim_hang', 1, 9);
        n.poseLayer.update(dt);
        if (!n.dead) {
          // still fighting you, less and less
          const w = Math.exp(-(n.carryT || 0) * 0.3);
          const t = (n.carryT = (n.carryT || 0) + dt);
          n.poseLayer.twist('Spine02', Math.sin(t * 6.1) * 0.06 * w, Math.sin(t * 4.3) * 0.08 * w, 0);
          n.poseLayer.twist('RightUpLeg', Math.sin(t * 7.7) * 0.22 * w, 0, 0);
          n.poseLayer.twist('LeftUpLeg', Math.sin(t * 7.7 + 2.1) * 0.22 * w, 0, 0);
          n.poseLayer.twist('RightForeArm', Math.sin(t * 9.3) * 0.09 * w, 0, 0);
          n.poseLayer.twist('LeftForeArm', Math.sin(t * 9.3 + 1.4) * 0.09 * w, 0, 0);
        }
        // Land the THROAT on the fist, not the root at a guessed distance below
        // it. carryY was derived from a neck height measured once at grab time,
        // but the neck's offset from the root moves every frame — the legs are
        // still cycling — and the carry tilt swings it sideways too, which left
        // the hand a good 20cm off the collar. Correcting against the live bone,
        // after the mixer has written this frame, is exact and self-healing.
        if (n.neckBone && n.carryTarget) {
          n.root.updateWorldMatrix(false, true);
          n.neckBone.getWorldPosition(GRABV);
          n.root.position.add(GRABV2.copy(n.carryTarget).sub(GRABV));
          // ...and then make sure that did not push their knees through the road.
          // Nothing in the carry path was grounded: the correction plants the NECK
          // on the fist, so whatever the clip did with the legs came out below it,
          // and at a sprint the swinging hand took half the body under the tarmac.
          let lowest = Infinity;
          for (const b of n.lowBones) { const y = b.getWorldPosition(GRABV).y; if (y < lowest) lowest = y; }
          const floor = groundHeight(n.x, n.z) + CARRY_CLEAR;
          if (isFinite(lowest) && lowest < floor) n.root.position.y += floor - lowest;
        }
        n.y = n.root.position.y - n.footY;
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
        const acc = n.mixerAcc;
        n.loco.update(acc, n.speed);
        n.mixerAcc = 0;
        // Speaking is physical: the head nods and turns, the chest sways, a hand
        // comes up on the stresses. Applied here, right after the mixer has
        // written this frame's pose — an additive twist would otherwise compound
        // on every frame the mixer skipped. Additive rather than an authored
        // pose because the rigs do not share bind rotations.
        if (n.speakT > 0) {
          // this block runs on the MIXER's cadence, not the frame's, so it has to
          // spend the accumulated time — subtracting one frame's dt per LOD step
          // stretched a 6s line to a minute for anyone who walked away
          n.speakT -= acc;
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
    if (n.dead) return;           // `state` may be 'carried' on a body in your hands
    n.state = 'dead';
    n.dead = true;
    n.targetSpeed = 0;
    n.settled = false;
    n.deadT = 0;
    // ai/panic.js squashes scale.y to cower and only restores it on the normal
    // hide timeout; dying inside a doorway used to leave a permanently 8% short
    // corpse.
    n.root.scale.y = n.baseY;
    // let any carry pose fade out under the die clip rather than fight it
    n.poseLayer.set(null, 0, 30);
    if (n.chatPartner) { const o = n.chatPartner; if (o.chatPartner === n) o.chatPartner = null; n.chatPartner = null; }
    burstBlood(n.x, n.y, n.z, 8);
    if (impulse > 14) {
      // launched corpse: physics root + frozen mid-fall pose
      n.loco.playOneshot('die', { timeScale: 0.8, clamp: true, hold: true });
      n.body = createBody({
        kind: 'corpse',
        x: n.x, y: n.y + 1, z: n.z,
        vx: dirX * impulse * 0.55, vy: impulse * 0.4, vz: dirZ * impulse * 0.55,
        wy: (rand() - 0.5) * 8, wx: 0, wz: 0,
        half: 0.35, mass: 80, restitution: 0.1, friction: 0.5,
      });
    } else {
      n.loco.playOneshot('die', { timeScale: 1.1, clamp: true, hold: true });
      addBloodDecal(n.x, n.z, 0.5);
    }
    // `hold` pins the clip on its last frame instead of fading it out and letting
    // idle climb back to weight 1 underneath — the corpse stays down. dieDur is
    // how long that takes, after which the mixer is retired entirely.
    n.dieDur = n.loco.oneshotDuration || 3;
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
    n.speakT = 0;
    // start the conversation from a known animation state: no half-finished
    // one-shot bleeding through the standing-and-listening pose
    n.loco.reset();
    return true;
  };
  sys.endTalk = (n) => {
    // Unconditional cleanup. An NPC leaves 'talking' on its own all the time —
    // panic, hiding, being grabbed, dying — and the old early-return then skipped
    // every line below, stranding speakT so the speaking gesture kept playing on
    // top of whatever they were doing next, for tens of seconds at low LOD.
    n.speakT = 0;
    n.speakPhase = 0;
    n.prevState = null;
    if (n.state !== 'talking') return;   // don't clobber panic/hide/dead
    n.state = 'commute';
    n.goal = null; n.path.length = 0; n.pathI = 0;
  };
  sys.speak = (n, seconds) => { n.speakT = seconds; n.speakPhase = 0; };

  const hooks = {
    onPunch(f, radius, impulse, charge) {
      const r = Math.max(radius, 1.6);
      neighbors(f.x, f.z, r, scratch);
      for (const n of [...scratch]) {
        // Not the person in your own hand. Carried NPCs stay in the crowd hash
        // (ai/crowd.js only excludes the dead) and are pinned a metre in front of
        // the chest, i.e. inside every punch sphere you will ever throw — so a jab
        // while holding someone killed them, and the corpse then hung in mid-air
        // because the carry handle's release path bails out on a dead victim.
        if (n.state === 'carried') continue;
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
        if (n.state === 'carried') continue;   // not the one you are swinging
        const dx = n.x - x, dz = n.z - z;
        const d = Math.hypot(dx, dz) || 1;
        kill(n, cause, 20, dx / d, dz / d);
      }
    },
    tryGrab(p) {
      const gx = p.x + Math.sin(p.yaw) * 1.4, gz = p.z + Math.cos(p.yaw) * 1.4;
      neighbors(gx, gz, 1.6, scratch);
      let n = scratch.find((o) => o.state !== 'dead' && o.state !== 'carried');
      // Bodies are still there to be picked up. ai/crowd.js drops the dead from
      // the spatial hash, so they need their own pass — there are only ever 48
      // people, and only the settled ones (the die clip finished, they are on the
      // ground) are liftable, so a corpse cannot be snatched mid-fall.
      if (!n) {
        let best = 2.9;
        for (const o of npcs) {
          if (!o.dead || !o.settled || o.state === 'carried') continue;
          const d2 = (o.x - gx) ** 2 + (o.z - gz) ** 2;
          if (d2 < best) { best = d2; n = o; }
        }
      }
      if (!n) return null;
      const wasDead = n.dead;
      n.state = 'carried';
      n.targetSpeed = 0;
      n.carryQuat = null;
      n.carryT = 0;
      n.carrySpeed = 0;
      n.carryFast = false;
      n.settled = false;
      n.blobOn = true;
      n.root.scale.y = n.baseY;   // in case they were cowering in a doorway
      n.root.rotation.set(0, n.visYaw, 0);
      // Measure this body's neck: heights vary 0.92–1.07 per NPC, and the whole
      // point is that the fist lands on the collar, not somewhere near it.
      let neckDrop = 1.45 * (n.root.scale.y || 1);
      const neck = findBone(n.root, 'neck') || findBone(n.root, 'Head');
      if (neck) {
        n.root.updateWorldMatrix(true, true);
        neckDrop = neck.getWorldPosition(GRABV).y - n.root.position.y;
      }
      n.neckBone = neck || null;
      n.carryTarget = n.carryTarget || new THREE.Vector3();
      emit(EV.SCREAM, { x: n.x, z: n.z, radius: 14 });
      return {
        kind: 'entity', npc: n, style: 'carry_neck', dead: wasDead,
        origin: { x: n.x, y: n.y + n.footY, z: n.z, yaw: n.visYaw },
        alive: () => n.state === 'carried',
        place: (x, y, z, quat, carrierSpeed) => {
          n.carryTarget.set(x, y, z);
          n.x = n.px = x; n.z = n.pz = z;
          n.carryY = y - neckDrop;      // held BY THE NECK, so the collar is the anchor
          n.carryQuat = quat;
          n.carrySpeed = carrierSpeed || 0;
        },
        release: () => {
          if (n.state !== 'carried') return;
          n.carryQuat = null;
          if (wasDead || n.dead) {
            // a body goes back to being a body, wherever you dropped it
            n.state = 'dead';
            n.y = groundHeight(n.x, n.z);
            n.root.position.set(n.x, n.y + n.footY, n.z);
            n.poseLayer.set(null, 0, 30);
            settleCorpse(n);
            return;
          }
          n.state = 'panic'; n.stateT = 8; n.panicLevel = 1;
          n.y = groundHeight(n.x, n.z);
        },
        launch: (from, vx, vy, vz) => {
          n.carryQuat = null;
          n.x = from.x; n.z = from.z; n.y = from.y;
          if (n.dead) {
            // already a corpse: re-launch the body rather than killing it twice
            n.settled = false;
            n.state = 'dead';
            n.body = createBody({
              kind: 'corpse', x: n.x, y: n.y, z: n.z,
              vx, vy: vy + 4, vz, wy: (rand() - 0.5) * 8, wx: 0, wz: 0,
              half: 0.35, mass: 80, restitution: 0.1, friction: 0.5,
            });
            return;
          }
          kill(n, 'thrown', 26, vx / 26, vz / 26);
          if (n.body) { n.body.vx = vx; n.body.vy = vy + 4; n.body.vz = vz; }
        },
      };
    },
  };

  // #3 regression probe: how far the person in your fist clears the pavement.
  // Negative means part of them is through it, which is what a sprint used to do.
  window.__test.carryLowest = () => {
    const n = npcs.find((o) => o.state === 'carried');
    if (!n) return null;
    n.root.updateWorldMatrix(true, true);
    let lowest = Infinity;
    for (const b of n.lowBones) { const y = b.getWorldPosition(GRABV).y; if (y < lowest) lowest = y; }
    return {
      id: n.id,
      clear: +(lowest - groundHeight(n.x, n.z)).toFixed(3),
      pose: n.poseLayer.pose,
      carrySpeed: +n.carrySpeed.toFixed(2),
      dead: n.dead,
    };
  };

  // #4 regression probe: a body stays a body. `stand` is how tall the rig is off
  // the ground — a corpse that got back up reads about 1.7, one lying down about
  // half a metre — and `idle` is the locomotion weight that used to climb back to 1.
  window.__test.corpses = () => npcs.filter((n) => n.dead).map((n) => {
    n.root.updateWorldMatrix(true, true);
    let lo = Infinity, hi = -Infinity;
    n.root.traverse((o) => {
      if (!o.isBone) return;
      const y = o.getWorldPosition(GRABV).y;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    });
    const g = groundHeight(n.x, n.z);
    return {
      id: n.id, state: n.state, settled: n.settled,
      stand: +(hi - g).toFixed(3), clear: +(lo - g).toFixed(3),
      idle: n.loco.weights().idle, held: n.loco.weights().held,
      scaleY: +n.root.scale.y.toFixed(3), baseY: +n.baseY.toFixed(3),
    };
  });

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
