// Combat: tap = jab, hold = charge (full charge fells buildings), grab &
// throw. Anticipation/contact/recovery come from the boxing clip with the
// strike scheduled at its impact frame; full-charge adds hit-stop + shockwave.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { game } from '../core/state.js';
import { emit, EV } from '../core/events.js';
import { removeSphere, hitProp, nearestProp, craterAt, shockwave } from '../world/destruction.js';
import { burstDust, burstSparks } from '../engine/particles.js';
import { wakeRadius, createBody, active as activeBodies, sleeping as sleepingBodies } from '../physics/pworld.js';
import { groundHeight, removePile } from '../physics/heightfield.js';
import { punchSound } from '../engine/audio.js';
import { PROP_TYPES } from '../world/props.js';
import { setGrabLabel } from '../ui/hud.js';
import { clamp, damp } from '../core/mathx.js';

const CHARGE_TIME = 1.15;   // seconds to full
const CHARGE_MIN = 0.16;    // hold time before charging starts

// Carry timings. There is no pickup clip, so the lift is a pose blend plus an
// eased arc from wherever the object was standing to the carry anchor — the arc
// is what makes it read as picking something UP rather than the object snapping
// into place, which is what it used to do.
const REACH_T = 0.25, LIFT_T = 0.35, THROW_T = 0.20, RELEASE_AT = 0.11;
// The anchor is where the load's CONTACT SURFACE meets the palms, and it is read
// straight off the hand bones. It used to be a fixed body offset that the hands
// were merely lerped toward, which is why a car floated: a car's origin is its
// wheel plane, so putting the ORIGIN near the hands left the chassis 0.43m above
// them. Each handle now declares `gripDrop` — the object-local height of the face
// that should rest on the palms — and the anchor drops by that much.
// These offsets are the posed hand positions in player space, used only as a
// fallback when the hand bones are missing.
const CARRY_OFFSET = {
  carry_neck: new THREE.Vector3(-0.46, 1.53, 0.49),
  carry_overhead: new THREE.Vector3(0.00, 1.88, 0.32),
};
const GRIP_REACH = 0.07;   // wrist bone -> the middle of the closed fist
const GRIP_SINK = 0.03;    // how far the palms press into the load
// A person held by the throat hangs their own height below the fist, so the fist
// is the one anchor that has a floor: the run clip swings the hand through a
// 25cm arc, and taking it raw put the victim's knees through the tarmac twice a
// stride. Damped, and never below this.
const GRIP_MIN_H = 1.30;
const GRIP_SMOOTH = 11;
const LIFT_ARC = { carry_neck: 0.35, carry_overhead: 0.80 };
const CARRY_SLOW = { carry_neck: 0.82, carry_overhead: 0.62 };
// Swinging the load. Wind-up, strike, recover — the object rides the hands, so the
// arc is authored once as a pair of poses (anim/poses.js swing_wind/swing_follow)
// and the anchor, which is already read off the hand bones every frame, follows it
// for free. Overhead loads come down through the target; one-handed loads go
// through it flat, like a bat.
const SWING_WIND = 0.20, SWING_STRIKE = 0.15, SWING_RECOVER = 0.28;
const SWING_AT = 0.45;      // fraction into the strike where contact lands

const EU = new THREE.Euler(0, 0, 0, 'YXZ');
const TUMBLE = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();

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
      strideT: 0, smoothY: 0,
      // carried-object swing (see swingCarried)
      swingT: 0, swingDur: 0, swingCharge: 0, swingHit: false,
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
    // Charging state (input.chargeTime accrues while held). The charge has to
    // survive the button going up so the release frame can spend it — but only
    // that one frame. It used to be latched indefinitely whenever the button was
    // up, so a release edge lost to the chat text field (see core/input.js) left
    // p.charge pinned at 1 and the player at 45% speed for the rest of the
    // session: full-stick sprint became 3.15 m/s, which the locomotion blend
    // reads as a fast walk. That is the "run animation stopped working" report.
    if (input.punchDown) {
      p.charge = input.chargeTime > CHARGE_MIN
        ? clamp((input.chargeTime - CHARGE_MIN) / CHARGE_TIME, 0, 1)
        : 0;
    } else if (input.punchReleased && !p.dead) {
      const charge = p.charge;
      p.charge = 0;
      // With something in your hands, PUNCH swings THAT. It used to throw a normal
      // jab whose damage landed at an abstract point in front of you while the
      // carry pose held the arms still — and, with a car, the punch hit the car in
      // your own hands and shot you across the city (see world/traffic.js onPunch).
      if (!swingCarried(charge)) swing(charge);
    } else {
      p.charge = 0;
    }

    if (input.grabPressed && !p.dead) {
      const ph = st.carry.phase;
      if (ph === 'carrying') beginThrow();
      // pressed mid-lift: remember it and throw the moment the lift lands,
      // rather than eating the input (which is what a dropped frame used to do)
      else if (ph === 'reaching' || ph === 'lifting' || ph === 'swinging') st.carry.wantThrow = true;
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
      const reg = window.__propsReg;
      if (reg.detach(pr)) { beginCarry(propHandle(pr, reg)); return; }
    }
    // grabbed at nothing: a short reach that comes back empty
    c.phase = 'whiff'; c.t = 0.28;
    pose.set('reach', 0.6, 14);
  }

  // A grabbed prop is carried as ITSELF. Props have no standalone mesh — each is
  // a slot in a per-type InstancedMesh — so this drives that slot's matrix rather
  // than hiding the prop and spawning a debris box in its place, which is what
  // turned every hydrant, tree and bench into a grey cube. Same record, same
  // instance, same state, all the way through the throw and back to rest.
  function propHandle(pr, reg) {
    const cfg = PROP_TYPES[pr.type];
    const scale = pr.s || 1;
    const height = cfg.h * scale, radius = cfg.r * scale;
    // bulky things go overhead; poles and trunks are carried like a club, gripped
    // near the base so a 6m tree points at the sky instead of through the pavement
    const overhead = !cfg.tall && (height > 1.1 || radius > 0.7);
    const half = height * 0.5;

    // body centre -> the prop's own base origin, tumbled about its middle
    const writeBody = (b) => {
      _q.setFromEuler(TUMBLE.set(b.rx, b.ry, b.rz));
      _v3.set(0, -half, 0).applyQuaternion(_q).add(_v2.set(b.x, b.y, b.z));
      reg.setMatrix(pr, _v3, _q, scale);
    };

    return {
      kind: 'prop', prop: pr,
      style: overhead ? 'carry_overhead' : 'carry_neck',
      // props are base-origin: overhead they sit ON the palms; one-handed the fist
      // closes around their middle, or just above the base for anything long
      gripDrop: overhead ? 0 : Math.min(half, 0.6),
      origin: { x: pr.x, y: pr.y || 0, z: pr.z, yaw: pr.yaw || 0 },
      alive: () => true,
      place: (x, y, z, quat) => reg.setMatrix(pr, _v3.set(x, y, z), quat, scale),
      // dropped rather than thrown: if it was already lying there, leave it lying
      release: () => (pr.felled && pr.restQ
        ? reg.rest(pr, pr.x, pr.y, pr.z, pr.restQ)
        : reg.reattach(pr, pr.x, pr.z)),
      launch: (from, vx, vy, vz) => {
        const body = createBody({
          kind: 'thrown',
          x: from.x, y: from.y + half, z: from.z,
          vx, vy, vz,
          wx: (Math.random() - 0.5) * 7, wy: (Math.random() - 0.5) * 7, wz: (Math.random() - 0.5) * 7,
          half, mass: cfg.mass,
          onMove: writeBody,
          onSleep: (b) => {
            // it is a prop again, not rubble: leave the body world entirely so it
            // cannot be re-grabbed as generic debris or raise the rubble pile
            const si = sleepingBodies.indexOf(b);
            if (si >= 0) sleepingBodies.splice(si, 1);
            const ai = activeBodies.indexOf(b);
            if (ai >= 0) activeBodies.splice(ai, 1);
            if (b.pileCell >= 0) { removePile(b.pileCell, b.pileAmount); b.pileCell = -1; }
            if (b.dead) { reg.hide(pr); return; }        // fell out of the world
            landProp(reg, pr, b, cfg, height, radius);
          },
        });
        armProjectile(body, Math.max(radius * 1.6, 1.2));
      },
    };
  }

  // What a thrown prop does when it stops moving. It used to snap upright at
  // baseHeight — a 6m tree standing on the crosswalk it had just been hurled
  // across. Now it either breaks (the two props with a good break already
  // authored in world/destruction.js) or it lies down, in a clean pose derived
  // from the heading it came to rest on rather than from the raw tumble Euler,
  // which after a few seconds of integration is a long way from anything stable.
  function landProp(reg, pr, b, cfg, height, radius) {
    // A hydrant is bolted to a main: hit the road at speed and it shears off and
    // lets go, which world/destruction.js already knows how to stage. Everything
    // else is more interesting lying in the street than exploded into four boxes —
    // a felled tree across the carriageway is the whole point of throwing it.
    const hard = (b.peak2 || 0) > 380;               // ~19 m/s: a real throw
    if (hard && pr.type === 'prop_hydrant') {
      pr.x = b.x; pr.z = b.z; pr.y = groundHeight(b.x, b.z);
      pr.alive = true;                                // hitProp refuses a detached prop
      hitProp(pr, b.vx || Math.sin(p.yaw), b.vz || Math.cos(p.yaw), 8);
      return;
    }
    // upright enough to have landed on its feet? then it did.
    _q.setFromEuler(TUMBLE.set(b.rx, b.ry, b.rz));
    _v.set(0, 1, 0).applyQuaternion(_q);
    if (_v.y > 0.82 && !cfg.tall) { reg.reattach(pr, b.x, b.z, b.ry); return; }
    // lay it along the heading it stopped on, resting on its side
    EU.set(0, b.ry, -Math.PI / 2);
    _q.setFromEuler(EU);
    const lie = Math.min(radius, height * 0.5);
    reg.rest(pr, b.x, groundHeight(b.x, b.z) + lie, b.z, _q);
  }

  function beginCarry(handle) {
    const c = st.carry;
    st.carried = handle;
    c.style = handle.style
      || (handle.kind === 'debris' && handle.size > 0.85 ? 'carry_overhead' : 'carry_neck');
    if (handle.gripDrop === undefined) {
      // debris geometry is centre-origin, so its underside is half a size BELOW
      // the origin; a negative gripDrop lifts it back onto the palms
      handle.gripDrop = handle.kind === 'debris' && c.style === 'carry_overhead'
        ? -(handle.size || 0) * 0.5
        : 0;
    }
    const o = handle.origin || { x: p.x, y: p.y + 1, z: p.z, yaw: p.yaw };
    c.from.set(o.x, o.y, o.z);
    EU.set(0, o.yaw || 0, 0);
    c.fromQ.setFromEuler(EU);
    c.pos.copy(c.from); c.quat.copy(c.fromQ);
    c.phase = 'reaching'; c.t = REACH_T; c.elapsed = 0; c.released = false; c.strideT = 0; c.smoothY = 0;
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
    } else if (c.phase === 'swinging') {
      c.swingT += dt;
      if (c.swingT >= SWING_WIND && pose.pose !== 'swing_follow') pose.set('swing_follow', 1, 42);
      if (!c.swingHit && c.swingT >= SWING_WIND + SWING_STRIKE * SWING_AT) {
        c.swingHit = true;
        swingImpact();
      }
      if (c.swingT >= c.swingDur) {
        if (!st.carried) { c.phase = 'idle'; pose.set(null, 0, 12); setGrabLabel('GRAB'); p.carrySlow = 1; }
        else if (c.wantThrow) { c.wantThrow = false; beginThrow(); }
        else { c.phase = 'carrying'; pose.set(c.style, 0.85, 12); }
      }
    } else if (c.phase === 'throwing') {
      if (!c.released && c.t <= THROW_T - RELEASE_AT) release();
      if (c.t <= 0) { c.phase = 'idle'; pose.set(null, 0, 12); }
    }
  }

  // ---- swinging the load ----------------------------------------------------

  // How much weapon the thing in your hands actually is: how far it reaches past
  // the fists, and how hard it lands. Read off the same numbers the carry uses.
  function loadBulk(h) {
    if (!h) return { r: 0.5, heft: 1 };
    if (h.kind === 'prop' && h.prop) {
      const cfg = PROP_TYPES[h.prop.type];
      const sc = h.prop.s || 1;
      return {
        r: Math.max(cfg.r, cfg.h * 0.34) * sc,
        heft: clamp(cfg.mass / 200, 0.55, 2.4),
      };
    }
    if (h.kind === 'debris') return { r: Math.max(h.size || 0.5, 0.4), heft: clamp((h.size || 0.5) * 1.6, 0.5, 1.8) };
    if (h.car) return { r: 1.9, heft: 2.4 };
    if (h.monster) return { r: 1.4, heft: 2.0 };
    return { r: 0.55, heft: 0.9 };            // a person
  }

  function swingCarried(charge) {
    const c = st.carry;
    if (!st.carried || c.phase !== 'carrying') return false;
    c.phase = 'swinging';
    c.swingT = 0;
    c.swingCharge = charge;
    c.swingHit = false;
    c.swingDur = SWING_WIND + SWING_STRIKE + SWING_RECOVER;
    pose.set('swing_wind', 1, 26);
    playerSys.p.loco.playOneshot('punch', { timeScale: 2.3, fade: 0.05 });
    cam.shake(0.04 + charge * 0.06);
    return true;
  }

  function swingImpact() {
    const c = st.carry;
    const h = st.carried;
    if (!h) return;
    const charge = c.swingCharge;
    const bulk = loadBulk(h);
    // the hit happens where the LOAD is, not where a fist would be
    const reach = 1.35 + bulk.r * 0.95 + charge * 0.9;
    const f = forwardPoint(reach, c.style === 'carry_overhead' ? 1.05 : 1.30);
    const radius = 0.95 + bulk.r * 1.15 + charge * 2.4;
    const impulse = (10 + charge * 26) * bulk.heft;

    punchSound(Math.min(1, charge + 0.25));
    const destroyed = removeSphere(f.x, f.y, f.z, radius, { impulse, fragMult: 1 + charge * 2.4, byPlayer: true });
    st.hooks.npcs?.damageRadius(f.x, f.z, radius, 'swung');
    // never the thing being swung: a held monster is skipped here, a held car by
    // world/traffic.js, a held person by ai/npc.js, and a held prop is detached so
    // nearestProp already cannot see it
    if (!h.monster) st.hooks.monsters?.onPunch(f, radius, impulse, charge);
    st.hooks.cars?.onPunch(f, radius, impulse, charge);
    const propHit = nearestProp(f.x, f.z, Math.max(radius, 1.6));
    if (propHit) {
      hitProp(propHit, Math.sin(p.yaw), Math.cos(p.yaw), impulse * 0.7);
      emit(EV.PROP_DESTROYED, { type: propHit.type });
    }
    wakeRadius(f.x, f.z, radius * 0.95, impulse * 0.4);

    const heavy = charge > 0.5 || bulk.heft > 1.8;
    burstDust(f.x, f.y - 0.5, f.z, heavy ? 14 : 6, 0x9a92a8, heavy ? 6 : 4);
    if (destroyed || propHit) burstSparks(f.x, f.y, f.z, 8);
    cam.shake(0.18 + charge * 0.35);
    emit(EV.FEAT, { type: 'swing', x: f.x, z: f.z, magnitude: 20 + charge * 22 + bulk.heft * 8 });
    if (charge >= 0.95) { game.slowmo = 0.3; st.slowmoT = 0.35; }

    damageLoad(h, charge, bulk, destroyed || !!propHit);
  }

  // A car folds, a tree snaps, a hydrant lets go. Swinging something into a wall
  // costs you the thing you swung — which is the whole reason to have a throw as
  // well as a swing.
  function damageLoad(h, charge, bulk, connected) {
    if (h.car) {
      h.car.squash = Math.max(0.55, (h.car.squash ?? 1) - (connected ? 0.14 : 0.05));
      h.car.hp -= connected ? 1 : 0;
      return;
    }
    if (h.kind !== 'prop' || !h.prop) return;
    const pr = h.prop;
    const frail = PROP_TYPES[pr.type].mass < 260;
    if (!connected || !(frail || charge > 0.55)) return;
    // break it where it actually is — in your hands, not back where it grew
    const c = st.carry;
    pr.x = c.pos.x; pr.z = c.pos.z; pr.y = c.pos.y;
    pr.alive = true;                                   // hitProp refuses a detached prop
    st.carried = null;                                  // release() must not put it back
    hitProp(pr, Math.sin(p.yaw), Math.cos(p.yaw), 10 + charge * 12);
    p.carrySlow = 1;
    cam.st.dist = 6.2;
    setGrabLabel('GRAB');
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

  // Where the carried thing sits this frame: the palms, dropped by the load's own
  // gripDrop so its contact face — not its origin — is what meets the hands.
  function updateAnchor(dt) {
    const c = st.carry;
    let onHands = false;

    if (c.style === 'carry_neck') {
      // one-handed: the throat goes IN the fist, so reach past the wrist joint
      // along the forearm rather than sitting on the bone origin
      const hand = p.bones.rHand;
      if (hand) {
        hand.updateWorldMatrix(true, false);
        c.anchor.setFromMatrixPosition(hand.matrixWorld);
        const fore = p.bones.rFore;
        if (fore) {
          fore.updateWorldMatrix(true, false);
          _v2.setFromMatrixPosition(fore.matrixWorld);
          _v.copy(c.anchor).sub(_v2);
          if (_v.lengthSq() > 1e-6) c.anchor.addScaledVector(_v.normalize(), GRIP_REACH);
        }
        // take the stride out of the grip height, and give it a floor
        const floor = groundHeight(p.x, p.z) + GRIP_MIN_H;
        const wantY = Math.max(c.anchor.y, floor);
        c.smoothY = c.smoothY ? damp(c.smoothY, wantY, GRIP_SMOOTH, dt) : wantY;
        c.anchor.y = c.smoothY;
        onHands = true;
      }
    } else if (p.bones.lHand && p.bones.rHand) {
      p.bones.lHand.updateWorldMatrix(true, false);
      p.bones.rHand.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(p.bones.lHand.matrixWorld);
      _v2.setFromMatrixPosition(p.bones.rHand.matrixWorld);
      c.anchor.copy(_v).add(_v2).multiplyScalar(0.5);
      onHands = true;
    }
    if (!onHands) c.anchor.copy(CARRY_OFFSET[c.style]).applyMatrix4(p.root.matrixWorld);
    c.anchor.y -= (st.carried?.gripDrop || 0) + GRIP_SINK;

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
      // the carrier's speed goes with the transform: a victim needs to know
      // whether to hang or to trail (ai/npc.js), and a load needs the stride sway
      h.place?.(c.pos.x, c.pos.y, c.pos.z, c.quat, p.speed);
    }
  }

  // thrown bodies smash what they land on
  function armProjectile(body, blastR) {
    body.kind = 'thrown';
    const prevMove = body.onMove;
    body.onMove = (b) => {
      prevMove?.(b);
      const speed2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (speed2 > (b.peak2 || 0)) b.peak2 = speed2;   // how hard it lands, see landProp
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
    } else if (c.phase === 'carrying' || c.phase === 'swinging') {
      // during a swing the load simply rides the hands, which the swing poses are
      // already throwing through the arc — updateAnchor reads them every frame
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

  window.__test.swing = () => ({
    phase: st.carry.phase,
    t: +st.carry.swingT.toFixed(3),
    hit: st.carry.swingHit,
    charge: +st.carry.swingCharge.toFixed(2),
    holding: st.carried?.kind ?? null,
  });

  window.__test.carry = () => ({
    phase: st.carry.phase,
    style: st.carry.style,
    kind: st.carried?.kind ?? null,
    prop: st.carried?.prop ? { type: st.carried.prop.type, idx: st.carried.prop.idx } : null,
    label: document.getElementById('btn-grab')?.textContent,
    t: +st.carry.t.toFixed(3), elapsed: +st.carry.elapsed.toFixed(3),
    pos: [+st.carry.pos.x.toFixed(2), +st.carry.pos.y.toFixed(2), +st.carry.pos.z.toFixed(2)],
  });

  // Regression probe for the grip: where the palms are, and where the load's
  // contact face ended up. `gap` must stay within a few cm of -GRIP_SINK — a car
  // used to sit 0.43m above the hands.
  window.__test.carryContact = () => {
    const h = st.carried;
    if (!h || !p.bones.lHand || !p.bones.rHand) return null;
    p.bones.lHand.updateWorldMatrix(true, false);
    p.bones.rHand.updateWorldMatrix(true, false);
    _v.setFromMatrixPosition(p.bones.lHand.matrixWorld);
    _v2.setFromMatrixPosition(p.bones.rHand.matrixWorld);
    const handY = st.carry.style === 'carry_neck' ? _v2.y : (_v.y + _v2.y) * 0.5;
    const contactY = st.carry.pos.y + (h.gripDrop || 0);
    const out = {
      kind: h.kind, style: st.carry.style,
      handY: +handY.toFixed(3),
      contactY: +contactY.toFixed(3),
      gap: +(contactY - handY).toFixed(3),
    };
    // a person is held BY THE THROAT: measure the actual neck bone against the fist
    const npc = h.npc || h.person || null;
    if (npc?.root) {
      let neck = null;
      npc.root.traverse((o) => { if (!neck && o.isBone && (o.name === 'neck' || o.name === 'Neck')) neck = o; });
      if (neck) {
        neck.updateWorldMatrix(true, false);
        _v3.setFromMatrixPosition(neck.matrixWorld);
        out.neck = [+_v3.x.toFixed(3), +_v3.y.toFixed(3), +_v3.z.toFixed(3)];
        out.fist = [+_v2.x.toFixed(3), +_v2.y.toFixed(3), +_v2.z.toFixed(3)];
        out.throatDist = +_v3.distanceTo(_v2).toFixed(3);
      }
    }
    return out;
  };

  return { fixedUpdate, frameUpdate, st };
}
