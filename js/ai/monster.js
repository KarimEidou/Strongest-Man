// Monsters: rampage the crowd, treat the quiet man in the jacket as easy prey,
// and have the worst realization of their lives. FSM:
// ARRIVE → RAMPAGE → ATTACK_PLAYER → REALIZE → (FLEE | RAGE) → DEAD
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MODELS } from '../engine/assets.js';
import { clipFor, findBone } from '../anim/retarget.js';
import { neighbors } from './crowd.js';
import { groundHeight } from '../physics/heightfield.js';
import { capsuleVsWorld } from '../physics/collide.js';
import { createBody } from '../physics/pworld.js';
import { removeSphere } from '../world/destruction.js';
import { burstBlood, burstDust } from '../engine/particles.js';
import { addBlob } from '../engine/blobshadows.js';
import { addBloodDecal } from '../world/debris.js';
import { flashVignette } from '../ui/hud.js';
import { emit, on, EV } from '../core/events.js';
import { save } from '../core/state.js';
import { rand, randRange, damp, dampAngle, clamp } from '../core/mathx.js';

const scratch = [];
const MAX_HP = 12;

// One canvas + texture + material for every monster's realization "!". Building
// these per spawn meant a fresh SpriteMaterial whose shader program compiled the
// first time a monster realized — a visible stall at the exact dramatic beat.
// Shared here, and warmed at boot by main.js.
let bangMat = null;
export function bangMaterial() {
  if (bangMat) return bangMat;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '900 54px -apple-system, Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0a860';
  ctx.strokeStyle = '#0d1b3e';
  ctx.lineWidth = 8;
  ctx.strokeText('!', 32, 52);
  ctx.fillText('!', 32, 52);
  bangMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false });
  return bangMat;
}

export function createMonsters(scene, npcSys, player, cam) {
  const monsters = [];
  const sys = { monsters };
  // characters cast from their real mesh at the top tier — a boxy proxy under
  // the thing you are looking at is worse than no shadow at all
  let charShadows = false;
  sys.setCastShadows = (on) => {
    charShadows = on;
    for (const m of monsters) m.root.traverse((o) => { if (o.isMesh) o.castShadow = on; });
  };

  // Per-kind material and rest-pose measurements, computed once. Every monster
  // of a kind gets the same constant brightening, so cloning the material per
  // spawn only bought a shader-program lookup and a spawn-time stall.
  const kindCache = [];
  function kindInfo(kindIdx, base) {
    let k = kindCache[kindIdx];
    if (k) return k;
    const src = MODELS[base].scene;
    const bbox = new THREE.Box3().setFromObject(src);
    const height = Math.max(bbox.max.y - bbox.min.y, 0.1);
    const targetH = kindIdx === 0 ? 3.4 : 2.7;
    const scale = targetH / height;
    let mat = null;
    src.traverse((o) => { if (o.isMesh && !mat) mat = o.material; });
    const shared = mat.clone();
    shared.color.multiplyScalar(1.18);
    // feet-to-origin offset: the rig's origin is not necessarily its sole, and
    // planting the root at ground height without this is why monsters hovered
    k = { scale, shared, targetH, footY: -bbox.min.y * scale };
    kindCache[kindIdx] = k;
    return k;
  }

  function spawn(kindIdx = 0, sx, sz) {
    const base = kindIdx === 0 ? 'monster_a' : 'monster_b';
    const info = kindInfo(kindIdx, base);
    const root = cloneSkeleton(MODELS[base].scene);
    root.traverse((o) => { if (o.isMesh) { o.material = info.shared; o.frustumCulled = true; o.receiveShadow = true; o.castShadow = charShadows; } });
    // the auto-rig ships human-scaled; monsters must tower
    root.scale.setScalar(info.scale);
    scene.add(root);

    const mixer = new THREE.AnimationMixer(root);
    const hips = findBone(root, 'Hips');
    const hipsY = hips ? hips.position.y : 1.4;
    const walkName = kindIdx === 0 ? 'monster_walk' : 'orc_walk';
    const walk = mixer.clipAction(clipFor(walkName, hipsY));
    walk.play();

    const m = {
      id: monsters.length, base, root, mixer, hipsY,
      x: sx, z: sz, y: 0, px: sx, pz: sz,
      yaw: Math.atan2(-sx, -sz), visYaw: 0,
      speed: 0, targetSpeed: 0, cruise: kindIdx === 0 ? 2.4 : 3.1,
      hp: MAX_HP, knowledge: 0,
      state: 'arrive',       // arrive|rampage|attack_player|eat|realize|flee|rage|dead
      stateT: 0, swingT: 0, wreckT: 0,
      target: null, heldNpc: null,
      walk, dead: false,
      footY: info.footY, targetH: info.targetH,
      bang: makeBang(root, info),   // the "!" realization sprite
      body: null,
      scale: kindIdx === 0 ? 1.0 : 1.0,
      kindIdx,
    };
    m.blob = addBlob(m, 1.5);
    monsters.push(m);
    emit(EV.MONSTER_SPAWNED, { monster: m });
    return m;
  }

  function makeBang(root, info) {
    const sprite = new THREE.Sprite(bangMaterial());
    const inv = 1 / info.scale;                    // root is scaled; undo it
    sprite.scale.set(1.1 * inv, 1.1 * inv, 1);
    sprite.position.y = (info.targetH + 0.75) * inv;
    sprite.visible = false;
    sprite.renderOrder = 5;
    root.add(sprite);
    return sprite;
  }

  function fixedUpdate(dt) {
    for (const m of monsters) {
      if (m.dead) { updateDead(m, dt); continue; }
      m.stateT -= dt; m.swingT -= dt; m.wreckT -= dt;
      const pd = Math.hypot(player.p.x - m.x, player.p.z - m.z);

      // witnessing a feat is the other way a monster learns what he is
      if (m.knowledge >= 50 && !m.realized && m.state !== 'realize' && pd < 30) realize(m);

      switch (m.state) {
        case 'arrive': {
          m.targetSpeed = m.cruise;
          m.yaw = Math.atan2(-m.x, -m.z);
          if (Math.abs(m.x) < 62 && Math.abs(m.z) < 62) enterRampage(m);
          break;
        }
        case 'rampage': {
          // player nearby and still "just some guy"? easiest prey on the street
          if (pd < 11 && m.knowledge < 50) { m.state = 'attack_player'; m.stateT = 10; break; }
          if (!m.target || m.target.state === 'dead') m.target = pickVictim(m);
          if (!m.target) { m.targetSpeed = m.cruise; m.yaw += dt * 0.4; break; }
          const t = m.target;
          const d = Math.hypot(t.x - m.x, t.z - m.z);
          m.yaw = Math.atan2(t.x - m.x, t.z - m.z);
          m.targetSpeed = m.cruise * 1.35;
          if (d < 2.6 && m.swingT <= 0) {
            m.swingT = 1.4;
            if (rand() < 0.3) { // grab & eat
              m.state = 'eat'; m.stateT = 1.9;
              m.heldNpc = t;
              t.state = 'carried'; t.targetSpeed = 0;
            } else if (rand() < 0.45) { // hurl the victim
              npcSys.kill(t, 'monster', 24, Math.sin(m.yaw), Math.cos(m.yaw));
              emit(EV.FEAT, { type: 'monster_throw_npc', x: m.x, z: m.z, magnitude: 0 }); // scare only
            } else {
              npcSys.kill(t, 'monster', 10, Math.sin(m.yaw), Math.cos(m.yaw));
            }
            m.target = null;
          }
          break;
        }
        case 'eat': {
          m.targetSpeed = 0;
          const t = m.heldNpc;
          if (t) {
            t.x = t.px = m.x + Math.sin(m.yaw) * 1.4;
            t.z = t.pz = m.z + Math.cos(m.yaw) * 1.4;
            t.y = m.y + m.targetH * 0.55;   // held at the monster's chest
            // head-dip "eating" read
            m.root.rotation.x = Math.sin(m.stateT * 12) * 0.08;
          }
          if (m.stateT <= 0) {
            if (t) { t.y = m.y; npcSys.kill(t, 'eaten', 4); }
            m.heldNpc = null;
            m.root.rotation.x = 0;
            m.state = 'rampage';
          }
          break;
        }
        case 'attack_player': {
          m.yaw = Math.atan2(player.p.x - m.x, player.p.z - m.z);
          m.targetSpeed = pd > 2.4 ? m.cruise * 1.5 : 0;
          if (pd <= 2.8 && m.swingT <= 0) {
            m.swingT = 1.2;
            // the hit lands... and does nothing. every first hit teaches them.
            cam.shake(0.15);
            flashVignette(0.5);
            burstDust(player.p.x, player.p.y + 1.2, player.p.z, 4, 0x9a92a8, 2);
            m.knowledge = Math.max(m.knowledge, 55);
            realize(m);
          }
          if (m.stateT <= 0 && pd > 14) enterRampage(m);
          break;
        }
        case 'realize': {
          m.targetSpeed = 0;
          // stagger-back
          m.x -= Math.sin(m.yaw) * dt * 1.6;
          m.z -= Math.cos(m.yaw) * dt * 1.6;
          if (m.stateT <= 0) {
            m.bang.visible = false;
            if (m.hp < MAX_HP * 0.5 || save.karma < -40) {
              m.state = 'flee'; m.stateT = 30;
              emit(EV.SCREAM, { x: m.x, z: m.z, radius: 24 });
            } else {
              m.state = 'rage'; m.stateT = 26;
            }
          }
          break;
        }
        case 'flee': {
          m.yaw = Math.atan2(m.x - player.p.x, m.z - player.p.z);
          m.targetSpeed = m.cruise * 1.9;
          if (Math.abs(m.x) > 86 || Math.abs(m.z) > 86) despawn(m);
          break;
        }
        case 'rage': {
          m.yaw = Math.atan2(player.p.x - m.x, player.p.z - m.z);
          m.targetSpeed = pd > 2.4 ? m.cruise * 2.1 : 0;
          if (pd <= 2.8 && m.swingT <= 0) {
            m.swingT = 0.9;
            cam.shake(0.22);
            // futile, forever
          }
          if (m.stateT <= 0) enterRampage(m);
          break;
        }
        default: break;
      }

      // movement + integration
      m.speed = damp(m.speed, m.targetSpeed, 5, dt);
      if (m.speed > 0.02) {
        m.px = m.x; m.pz = m.z;
        m.x += Math.sin(m.yaw) * m.speed * dt;
        m.z += Math.cos(m.yaw) * m.speed * dt;
        // bulldoze through buildings while moving
        if (m.wreckT <= 0) {
          const ahead = 1.6;
          const hits = removeSphere(m.x + Math.sin(m.yaw) * ahead, m.y + 2, m.z + Math.cos(m.yaw) * ahead, 2.2, { impulse: 7, fragMult: 1, silent: true });
          if (hits) m.wreckT = 0.4;
        }
        const [cx, cz] = capsuleVsWorld(m.x, m.z, m.y + 1.5, 0.8);
        m.x = cx; m.z = cz;
      } else { m.px = m.x; m.pz = m.z; }
      m.y = groundHeight(m.x, m.z);
    }
  }

  function enterRampage(m) { m.state = 'rampage'; m.target = null; m.stateT = 999; }

  function pickVictim(m) {
    // A 60m hash query spans 17×17 cells; with only 48 townsfolk a direct scan
    // is both cheaper and exact.
    let best = null, bd = Infinity;
    for (const n of npcSys.npcs) {
      if (n.state === 'dead' || n.state === 'carried' || n.state === 'hide') continue;
      const dx = n.x - m.x, dz = n.z - m.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  function realize(m) {
    if (m.state === 'realize' || m.dead || m.realized) return;
    m.realized = true;
    m.state = 'realize';
    m.stateT = 1.1;
    m.bang.visible = true;
    cam.realizePushIn();
    cam.shake(0.2);
    emit(EV.MONSTER_REALIZED, { monster: m });
    emit(EV.SCREAM, { x: m.x, z: m.z, radius: 16 });
  }

  function hurt(m, dmg, dirX, dirZ, impulse) {
    if (m.dead) return;
    m.hp -= dmg;
    burstBlood(m.x, m.y + m.hipsY, m.z, 6);
    if (m.knowledge < 55 && dmg >= 1) { m.knowledge = 60; realize(m); }
    if (m.hp <= 0) {
      die(m, dirX, dirZ, impulse);
    } else if (dmg >= 3) {
      m.x += dirX * 1.5; m.z += dirZ * 1.5; // heavy knockback
    }
  }

  function die(m, dirX = 0, dirZ = 0, impulse = 18) {
    if (m.dead) return;
    m.dead = true;
    m.state = 'dead';
    m.bang.visible = false;
    m.walk.stop();
    const die_ = m.mixer.clipAction(clipFor('die', m.hipsY));
    die_.setLoop(THREE.LoopOnce, 1);
    die_.clampWhenFinished = true;
    die_.play();
    m.body = createBody({
      kind: 'corpse', x: m.x, y: m.y + 1.5, z: m.z,
      vx: dirX * impulse * 0.7, vy: impulse * 0.35, vz: dirZ * impulse * 0.7,
      wy: (rand() - 0.5) * 4,
      half: 0.8, mass: 600, restitution: 0.05, friction: 0.4,
    });
    neighbors(m.x, m.z, 15, scratch);
    const nearNpcs = scratch.filter((n) => n.state !== 'dead').length;
    emit(EV.MONSTER_DIED, { monster: m, byPlayer: true, x: m.x, z: m.z, nearNpcs });
    emit(EV.FEAT, { type: 'monster_kill', x: m.x, z: m.z, magnitude: 80 });
    addBloodDecal(m.x, m.z, 1.1);
  }

  function updateDead(m, dt) {
    m.mixer.update(dt);
    if (m.body) {
      m.x = m.body.x; m.z = m.body.z;
      m.root.position.set(m.x, Math.max(m.body.y - 0.8, groundHeight(m.x, m.z) + m.footY), m.z);
      m.root.rotation.y = m.body.ry;
      if (m.body.asleep) { m.body = null; m.deadT = 0; m.blobOn = false; }
    } else {
      m.deadT = (m.deadT || 0) + dt;
      if (m.deadT > 14) {
        // sink away, then release
        m.root.position.y -= dt * 0.4;
        if (m.deadT > 18) despawn(m);
      }
    }
  }

  function despawn(m) {
    scene.remove(m.root);
    const i = monsters.indexOf(m);
    if (i >= 0) monsters.splice(i, 1);
  }

  function frameUpdate(dt, alpha) {
    for (const m of monsters) {
      if (m.dead) continue;
      if (m.carryQuat) {
        m.root.position.set(m.x, m.carryY, m.z);
        m.root.quaternion.copy(m.carryQuat);
        m.walk.setEffectiveTimeScale(1.6);   // still thrashing
        m.mixer.update(dt);
        continue;
      }
      m.root.position.set(
        m.px + (m.x - m.px) * alpha,
        m.y + m.footY,
        m.pz + (m.z - m.pz) * alpha,
      );
      m.visYaw = dampAngle(m.visYaw, m.yaw, 10, dt);
      m.root.rotation.y = m.visYaw;
      m.walk.setEffectiveTimeScale(clamp(m.speed / 1.6, 0.35, 2.1));
      m.mixer.update(dt);
    }
  }

  const hooks = {
    onPunch(f, radius, impulse, charge) {
      for (const m of [...monsters]) {
        const dx = m.x - f.x, dz = m.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d > Math.max(radius, 2.8)) continue;
        hurt(m, charge > 0.55 ? 6 : 1, dx / (d || 1), dz / (d || 1), impulse);
      }
    },
    onProjectile(b) {
      for (const m of [...monsters]) {
        const dx = m.x - b.x, dz = m.z - b.z;
        if (dx * dx + dz * dz < 4) hurt(m, 2, dx, dz, 10);
      }
    },
    tryGrab(p) {
      const m = monsters.find((m) => !m.dead && m.hp <= MAX_HP * 0.25
        && Math.hypot(m.x - p.x, m.z - p.z) < 3);
      if (!m) return null;
      m.state = 'grabbed';
      m.targetSpeed = 0;
      return {
        kind: 'entity', monster: m, style: 'carry_neck',
        origin: { x: m.x, y: m.y + m.footY, z: m.z, yaw: m.visYaw },
        alive: () => m.state === 'grabbed' && !m.dead,
        place: (x, y, z, quat) => {
          m.x = m.px = x; m.z = m.pz = z;
          m.carryY = y - m.targetH * 0.82;   // by the scruff of the neck
          m.carryQuat = quat;
        },
        release: () => {
          if (m.dead) return;
          m.carryQuat = null;
          m.state = 'flee'; m.stateT = 20;
        },
        launch: (from, vx, vy, vz) => {
          m.carryQuat = null;
          m.x = from.x; m.z = from.z;
          die(m, vx / 30, vz / 30, 30);
          if (m.body) { m.body.vx = vx; m.body.vy = vy + 6; m.body.vz = vz; }
          emit(EV.FEAT, { type: 'monster_throw', x: from.x, z: from.z, magnitude: 70 });
        },
      };
    },
    spawn,
  };

  window.__test.spawnMonster = (kind = 0, x = 40, z = 40) => { spawn(kind, x, z); return monsters.length; };
  // #13 regression probe: soles must sit on the ground, not above it
  window.__test.monsterFeet = () => monsters.map((m) => {
    const b = new THREE.Box3().setFromObject(m.root);
    return { kind: m.base, gap: +(b.min.y - groundHeight(m.x, m.z)).toFixed(3), h: +(b.max.y - b.min.y).toFixed(2) };
  });
  window.__test.monsterStats = () => monsters.map((m) => ({
    state: m.state, hp: m.hp, x: +m.x.toFixed(1), z: +m.z.toFixed(1), know: m.knowledge,
  }));

  return { monsters, fixedUpdate, frameUpdate, hooks, spawn, sys };
}
