// Combat: tap = jab, hold = charge (full charge fells buildings), grab &
// throw. Anticipation/contact/recovery come from the boxing clip with the
// strike scheduled at its impact frame; full-charge adds hit-stop + shockwave.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { game } from '../core/state.js';
import { emit, EV } from '../core/events.js';
import { removeSphere, hitProp, nearestProp, craterAt, shockwave } from '../world/destruction.js';
import { spawnDebris } from '../world/debris.js';
import { burstDust, burstSparks } from '../engine/particles.js';
import { wakeRadius, active as activeBodies, sleeping as sleepingBodies } from '../physics/pworld.js';
import { groundHeight } from '../physics/heightfield.js';
import { punchSound } from '../engine/audio.js';
import { PROP_TYPES } from '../world/props.js';
import { setGrabLabel } from '../ui/hud.js';
import { clamp } from '../core/mathx.js';

const CHARGE_TIME = 1.15;   // seconds to full
const CHARGE_MIN = 0.16;    // hold time before charging starts

// Carry timings. There is no pickup clip, so the lift is a pose blend plus an
// eased arc from wherever the object was standing to the carry anchor — the arc
// is what makes it read as picking something UP rather than the object snapping
// into place, which is what it used to do.
const REACH_T = 0.25, LIFT_T = 0.35, THROW_T = 0.20, RELEASE_AT = 0.11;
const CARRY_OFFSET = {
  carry_neck: new THREE.Vector3(0.42, 1.98, 0.55),   // high enough that their feet clear the floor
  carry_overhead: new THREE.Vector3(0.00, 2.05, 0.10),   // chassis rests on the hands
};
// how much the carried thing tracks the animated hands vs a fixed body offset.
// All hands and a car visibly wobbles with the run cycle; no hands and the grip
// looks painted on.
const HAND_MIX = { carry_neck: 0.55, carry_overhead: 0.35 };
const LIFT_ARC = { carry_neck: 0.35, carry_overhead: 0.80 };
const CARRY_SLOW = { carry_neck: 0.82, carry_overhead: 0.62 };

const EU = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export function createCombat(playerSys, cam, scene) {
  const p = playerSys.p;
  const pose = p.poseLayer;
  const st = {
    swing: null,        // pending strike {t, charge}
    slowmoT: 0,
    carried: null,      // active carry handle, or null
    hooks: { npcs: null, monsters: null, cars: null }, // installed by later systems
    carry: {
      phase: 'idle',    // idle | reaching | lifting | carrying | throwing | whiff
      t: 0, elapsed: 0, style: null, released: false, wantThrow: false,
      from: new THREE.Vector3(), fromQ: new THREE.Quaternion(),
      anchor: new THREE.Vector3(), anchorQ: new THREE.Quaternion(),
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
      strideT: 0,
    },
  };

  function forwardPoint(dist, h = 1.3) {
    return {
      x: p.x + Math.sin(p.yaw) * dist,
      y: p.y + h,
      z: p.z + Math.cos(p.yaw) * dist,
    };
  }

  function fixedUpdate(dt) {
    // charging state (input.chargeTime accrues while held)
    p.charge = input.punchDown && input.chargeTime > CHARGE_MIN
      ? clamp((input.chargeTime - CHARGE_MIN) / CHARGE_TIME, 0, 1)
      : (input.punchDown ? 0 : p.charge);

    if (input.punchReleased && !p.dead) {
      const charge = p.charge;
      p.charge = 0;
      swing(charge);
    }

    if (input.grabPressed && !p.dead) {
      const ph = st.carry.phase;
      if (ph === 'carrying') beginThrow();
      // pressed mid-lift: remember it and throw the moment the lift lands,
      // rather than eating the input (which is what a dropped frame used to do)
      else if (ph === 'reaching' || ph === 'lifting') st.carry.wantThrow = true;
      else if (ph === 'idle') tryGrab();
    }
    advanceCarry(dt);

    // strike lands at the clip's contact moment
    if (st.swing) {
      st.swing.t -= dt;
      if (st.swing.t <= 0) {
        strike(st.swing.charge);
        st.swing = null;
      }
    }

    // hit-stop decay
    if (st.slowmoT > 0) {
      st.slowmoT -= dt / Math.max(game.slowmo, 0.05);
      if (st.slowmoT <= 0) game.slowmo = 1;
    }
  }

  function swing(charge) {
    const heavy = charge > 0.2;
    playerSys.p.loco.playOneshot('punch', {
      timeScale: heavy ? 2.1 : 2.8,
      fade: 0.06,
    });
    // clip contact ~0.62s in at timeScale 1 (trimmed clip) → schedule
    st.swing = { t: heavy ? 0.3 : 0.22, charge };
  }

  function strike(charge) {
    punchSound(charge);
    const reach = 1.5 + charge * 1.2;
    const f = forwardPoint(reach);
    const radius = 1.15 + charge * 4.6;
    const impulse = 9 + charge * 34;
    const fragMult = 1 + charge * 3.6;

    // buildings
    const destroyed = removeSphere(f.x, f.y, f.z, radius, { impulse, fragMult, byPlayer: true });

    // props in the arc
    let propHits = 0;
    const pr = nearestProp(f.x, f.z, Math.max(radius, 1.6));
    if (pr) {
      hitProp(pr, Math.sin(p.yaw), Math.cos(p.yaw), impulse * 0.8);
      propHits++;
      emit(EV.PROP_DESTROYED, { type: pr.type });
    }

    // entities (installed by later phases)
    st.hooks.npcs?.onPunch(f, radius, impulse, charge);
    st.hooks.monsters?.onPunch(f, radius, impulse, charge);
    st.hooks.cars?.onPunch(f, radius, impulse, charge);

    // wake + fling nearby debris
    wakeRadius(f.x, f.z, radius * 0.9, impulse * 0.35);

    if (charge > 0.55) {
      craterAt(f.x, f.z, 1.2 + charge * 1.6);
      shockwave(f.x, groundHeight(f.x, f.z), f.z, 3 + charge * 6, 0.5);
      burstDust(f.x, 0.5, f.z, 20 + charge * 20, 0x9a92a8, 6 + charge * 5);
      cam.shake(0.35 + charge * 0.4);
      emit(EV.FEAT, { type: 'charged_punch', x: f.x, z: f.z, magnitude: 30 + charge * 15 });
    } else if (destroyed || propHits) {
      cam.shake(0.14);
      burstDust(f.x, f.y - 0.6, f.z, 6, 0x9a92a8, 4);
    } else {
      burstDust(f.x, f.y - 0.4, f.z, 2, 0x777788, 2);
    }

    if (charge >= 0.95) {
      // full send: brief hit-stop sells the impossible force
      game.slowmo = 0.25;
      st.slowmoT = 0.45;
    }
  }

  // ---- grab / carry / throw ------------------------------------------------
  //
  // Phases: idle -> reaching -> lifting -> carrying -> throwing -> idle.
  // tryGrab commits the target immediately (the hooks freeze the NPC / flag the
  // car) and the visual transition is animated on top, so nothing can be grabbed
  // twice mid-lift.

  function tryGrab() {
    const c = st.carry;
    // priority: entity hooks (monster/NPC/car) -> sleeping debris -> props
    for (const h of [st.hooks.monsters, st.hooks.npcs, st.hooks.cars]) {
      const got = h?.tryGrab?.(p);
      if (got) { beginCarry(got); return; }
    }
    const f = forwardPoint(1.4, 0);
    for (const b of sleepingBodies) {
      const dx = b.x - f.x, dz = b.z - f.z;
      if (dx * dx + dz * dz < 2.2) {
        const ud = b.userData;
        const i = sleepingBodies.indexOf(b);
        if (i >= 0) sleepingBodies.splice(i, 1);
        beginCarry({ kind: 'debris', body: b, size: ud?.size || 0.5, origin: { x: b.x, y: b.y, z: b.z, yaw: 0 } });
        return;
      }
    }
    const pr = nearestProp(f.x, f.z, 2.6, (x) => x.type !== 'prop_streetlamp' && x.type !== 'prop_trafficlight');
    if (pr) {
      // the prop instance leaves the pool; a matching debris part rides in-hand
      pr.alive = false;
      window.__propsReg.hide(pr);
      const cfg = PROP_TYPES[pr.type];
      const colors = { prop_bench: 0xb98a54, prop_dumpster: 0x2c4f9e, prop_tree: 0xd89048, prop_kiosk: 0x2452b8, prop_hydrant: 0xd06a28, prop_sign: 0x3090f0 };
      const b = spawnDebris('part', pr.x, (pr.y || 0) + cfg.h * 0.5, pr.z, 0, 0, 0, Math.max(cfg.r * 1.3, 0.6), colors[pr.type] || 0x888888, { mass: cfg.mass });
      if (b) {
        const i = activeBodies.indexOf(b);
        if (i >= 0) activeBodies.splice(i, 1);
        beginCarry({
          kind: 'debris', body: b, size: b.userData.size,
          blastR: Math.max(cfg.r * 1.6, 1.2),
          origin: { x: pr.x, y: (pr.y || 0) + cfg.h * 0.5, z: pr.z, yaw: pr.yaw || 0 },
        });
      }
      return;
    }
    // grabbed at nothing: a short reach that comes back empty
    c.phase = 'whiff'; c.t = 0.28;
    pose.set('reach', 0.6, 14);
  }

  function beginCarry(handle) {
    const c = st.carry;
    st.carried = handle;
    c.style = handle.style
      || (handle.kind === 'debris' && handle.size > 0.85 ? 'carry_overhead' : 'carry_neck');
    const o = handle.origin || { x: p.x, y: p.y + 1, z: p.z, yaw: p.yaw };
    c.from.set(o.x, o.y, o.z);
    EU.set(0, o.yaw || 0, 0);
    c.fromQ.setFromEuler(EU);
    c.pos.copy(c.from); c.quat.copy(c.fromQ);
    c.phase = 'reaching'; c.t = REACH_T; c.elapsed = 0; c.released = false; c.strideT = 0;
    c.wantThrow = false;
    pose.set('reach', 0.9, 16);
    p.carrySlow = CARRY_SLOW[c.style];
    // a car held overhead needs the camera to back off or it clips the near plane
    if (c.style === 'carry_overhead') cam.st.dist = 7.0;
    setGrabLabel('THROW');
  }

  function advanceCarry(dt) {
    const c = st.carry;
    if (c.phase === 'idle') return;
    c.elapsed += dt;
    c.t -= dt;
    if (c.phase === 'whiff') {
      if (c.t <= 0) { c.phase = 'idle'; pose.set(null, 0, 14); }
      return;
    }
    if (c.phase === 'reaching' && c.t <= 0) {
      c.phase = 'lifting'; c.t = LIFT_T;
      pose.set(c.style, 0.85, 10);
    } else if (c.phase === 'lifting' && c.t <= 0) {
      c.phase = 'carrying';
      if (c.wantThrow) { c.wantThrow = false; beginThrow(); }
    } else if (c.phase === 'throwing') {
      if (!c.released && c.t <= THROW_T - RELEASE_AT) release();
      if (c.t <= 0) { c.phase = 'idle'; pose.set(null, 0, 12); }
    }
  }

  function beginThrow() {
    const c = st.carry;
    c.phase = 'throwing'; c.t = THROW_T; c.released = false;
    pose.set('throw_release', 1.0, 40);
    playerSys.p.loco.playOneshot('punch', { timeScale: 3.2, fade: 0.05 });
  }

  function release() {
    const c = st.carry;
    const h = st.carried;
    c.released = true;
    st.carried = null;
    p.carrySlow = 1;
    cam.st.dist = 6.2;
    setGrabLabel('GRAB');
    if (!h) return;
    const power = 26;
    const vx = Math.sin(p.yaw) * power, vz = Math.cos(p.yaw) * power;
    const from = c.style === 'carry_overhead' ? forwardPoint(1.0, 2.4) : forwardPoint(1.2, 1.6);
    if (h.kind === 'debris') {
      const b = h.body;
      b.x = from.x; b.y = from.y; b.z = from.z;
      b.vx = vx; b.vy = 6; b.vz = vz;
      b.wx = 6; b.wy = 4; b.wz = 6;
      b.asleep = false; b.quiet = 0;
      if (b.pileCell >= 0) b.pileCell = -1;
      activeBodies.push(b);
      armProjectile(b, h.blastR || 1.4);
    } else {
      h.launch(from, vx, 7, vz);
    }
    emit(EV.PLAYER_THREW, { what: h.kind });
    emit(EV.FEAT, { type: 'throw', x: p.x, z: p.z, magnitude: h.kind === 'entity' ? 40 : 22 });
  }

  // the carried thing died / despawned under us
  function dropCarried() {
    const c = st.carry;
    st.carried?.release?.();
    st.carried = null;
    c.phase = 'idle';
    p.carrySlow = 1;
    cam.st.dist = 6.2;
    pose.set(null, 0, 12);
    setGrabLabel('GRAB');
  }

  // Where the carried thing sits this frame. Read off the hand bones so it
  // tracks the actual animated pose, blended toward a fixed body offset so a
  // 1.5-tonne car does not swing with the arm cycle.
  function updateAnchor(dt) {
    const c = st.carry;
    c.anchor.copy(CARRY_OFFSET[c.style]).applyMatrix4(p.root.matrixWorld);

    const mix = HAND_MIX[c.style];
    if (c.style === 'carry_neck') {
      const h = p.bones.rHand;
      if (h) {
        h.updateWorldMatrix(true, false);
        _v.setFromMatrixPosition(h.matrixWorld);
        c.anchor.lerp(_v, mix);
      }
    } else if (p.bones.lHand && p.bones.rHand) {
      p.bones.lHand.updateWorldMatrix(true, false);
      p.bones.rHand.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(p.bones.lHand.matrixWorld);
      _v2.setFromMatrixPosition(p.bones.rHand.matrixWorld);
      c.anchor.lerp(_v.add(_v2).multiplyScalar(0.5), mix);
    }

    // stride-locked sway: the load answers to the footfalls
    c.strideT += (p.speed * dt) / 1.6;
    const k = Math.min(p.speed / 7, 1);
    if (c.style === 'carry_overhead') {
      c.anchor.y += Math.sin(c.strideT * Math.PI * 4) * 0.045 * k;
      EU.set(
        -0.10 + Math.sin(c.strideT * Math.PI * 2) * 0.05 * k,
        p.visYaw + Math.PI / 2,                       // held across the body
        0.06 + Math.cos(c.strideT * Math.PI) * 0.07 * k,
      );
    } else {
      // held out at arm's length, facing away — and struggling, less and less
      const w = Math.exp(-c.elapsed * 0.35);
      EU.set(
        -0.12 + Math.sin(c.elapsed * 7.1) * 0.10 * w,
        p.visYaw + Math.sin(c.elapsed * 4.3) * 0.16 * w,
        Math.sin(c.elapsed * 5.7) * 0.08 * w,
      );
    }
    c.anchorQ.setFromEuler(EU);
  }

  function placeCarried() {
    const c = st.carry, h = st.carried;
    if (!h) return;
    if (h.kind === 'debris') {
      const b = h.body;
      b.x = b.px = c.pos.x; b.y = b.py = c.pos.y; b.z = b.pz = c.pos.z;
      b.onMove?.(b);
    } else {
      h.place?.(c.pos.x, c.pos.y, c.pos.z, c.quat, c.elapsed);
    }
  }

  // thrown bodies smash what they land on
  function armProjectile(body, blastR) {
    body.kind = 'thrown';
    const prevMove = body.onMove;
    body.onMove = (b) => {
      prevMove?.(b);
      const speed2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (speed2 > 90) {
        const hit = removeSphere(b.x, b.y, b.z, blastR, { impulse: 10, fragMult: 1.4, byPlayer: true, silent: true });
        if (hit) {
          b.vx *= 0.4; b.vy *= 0.4; b.vz *= 0.4;
          burstDust(b.x, b.y, b.z, 8, 0x9a92a8, 5);
          cam.shake(0.18);
        }
        st.hooks.npcs?.onProjectile?.(b);
        st.hooks.monsters?.onProjectile?.(b);
      }
    };
  }

  function frameUpdate(dt) {
    // Runs after player.frameUpdate (and therefore after loco.update) — see the
    // frameSystems order in main.js. The pose layer writes on top of the mixer.
    pose.update(dt);

    const c = st.carry;
    if (c.phase === 'idle' || c.phase === 'whiff') return;
    if (st.carried?.alive?.() === false) { dropCarried(); return; }

    p.root.updateWorldMatrix(true, false);
    updateAnchor(dt);

    if (c.phase === 'reaching' || c.phase === 'lifting') {
      const k = clamp(c.elapsed / (REACH_T + LIFT_T), 0, 1);
      const e = k * k * (3 - 2 * k);
      c.pos.lerpVectors(c.from, c.anchor, e);
      c.pos.y += Math.sin(e * Math.PI) * LIFT_ARC[c.style];   // the arc sells the lift
      c.quat.copy(c.fromQ).slerp(c.anchorQ, e);
    } else if (c.phase === 'carrying') {
      c.pos.copy(c.anchor);
      c.quat.copy(c.anchorQ);
    }
    placeCarried();
  }

  window.__test.punchAt = (x, z, charge = 0) => {
    p.x = p.px = x - Math.sin(p.yaw) * 2;
    p.z = p.pz = z - Math.cos(p.yaw) * 2;
    strike(charge);
    return true;
  };
  window.__test.collapseBuilding = (i) => {
    import('../world/destruction.js').then((d) => d.collapseBuilding(window.__buildingsReg.buildings[i]));
    return true;
  };

  window.__test.carry = () => ({
    phase: st.carry.phase,
    style: st.carry.style,
    label: document.getElementById('btn-grab')?.textContent,
    pos: [+st.carry.pos.x.toFixed(2), +st.carry.pos.y.toFixed(2), +st.carry.pos.z.toFixed(2)],
  });

  return { fixedUpdate, frameUpdate, st };
}
