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
import { PROP_TYPES } from '../world/props.js';
import { clamp } from '../core/mathx.js';

const CHARGE_TIME = 1.15;   // seconds to full
const CHARGE_MIN = 0.16;    // hold time before charging starts

export function createCombat(playerSys, cam, scene) {
  const p = playerSys.p;
  const st = {
    swing: null,        // pending strike {t, charge}
    slowmoT: 0,
    carried: null,      // {kind:'prop'|'debris', vis, data}
    hooks: { npcs: null, monsters: null, cars: null }, // installed by later systems
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
      if (st.carried) throwCarried();
      else tryGrab();
    }

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
    import('../engine/audio.js').then(({ punchSound }) => punchSound(charge));
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

  // ---- grab / throw --------------------------------------------------------

  function tryGrab() {
    // priority: entity hooks (NPC/monster/car) → sleeping debris → props
    for (const h of [st.hooks.monsters, st.hooks.npcs, st.hooks.cars]) {
      const got = h?.tryGrab?.(p);
      if (got) { st.carried = got; return; }
    }
    const f = forwardPoint(1.4, 0);
    // sleeping debris near fist
    for (const b of sleepingBodies) {
      const dx = b.x - f.x, dz = b.z - f.z;
      if (dx * dx + dz * dz < 2.2) {
        const ud = b.userData;
        st.carried = { kind: 'debris', body: b, size: ud?.size || 0.5 };
        // remove from physics while carried; keep the instance following hands
        const i = sleepingBodies.indexOf(b);
        if (i >= 0) sleepingBodies.splice(i, 1);
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
      const b = spawnDebris('part', f.x, f.y + 1.1, f.z, 0, 0, 0, Math.max(cfg.r * 1.3, 0.6), colors[pr.type] || 0x888888, { mass: cfg.mass });
      if (b) {
        const i = activeBodies.indexOf(b);
        if (i >= 0) activeBodies.splice(i, 1);
        st.carried = { kind: 'debris', body: b, size: b.userData.size, blastR: Math.max(cfg.r * 1.6, 1.2) };
      }
    }
  }

  function throwCarried() {
    const c = st.carried;
    st.carried = null;
    const power = 26;
    const vx = Math.sin(p.yaw) * power, vz = Math.cos(p.yaw) * power;
    const from = forwardPoint(1.2, 1.6);
    if (c.kind === 'debris') {
      const b = c.body;
      b.x = from.x; b.y = from.y; b.z = from.z;
      b.vx = vx; b.vy = 6; b.vz = vz;
      b.wx = 6; b.wy = 4; b.wz = 6;
      b.asleep = false; b.quiet = 0;
      if (b.pileCell >= 0) b.pileCell = -1;
      activeBodies.push(b);
      armProjectile(b, c.blastR || 1.4);
    } else if (c.kind === 'entity') {
      c.launch(from, vx, 7, vz); // NPC/monster/car ragdoll launch (installed later)
    }
    playerSys.p.loco.playOneshot('punch', { timeScale: 3.2, fade: 0.05 });
    emit(EV.PLAYER_THREW, { what: c.kind });
    emit(EV.FEAT, { type: 'throw', x: p.x, z: p.z, magnitude: c.kind === 'entity' ? 40 : 22 });
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
    // carried object rides in front of the chest
    if (st.carried) {
      const f = forwardPoint(1.1, 1.15);
      if (st.carried.kind === 'debris') {
        const b = st.carried.body;
        b.x = b.px = f.x; b.y = b.py = f.y; b.z = b.pz = f.z;
        b.onMove?.(b);
      } else if (st.carried.kind === 'entity') {
        st.carried.follow?.(f, p.yaw);
      }
    }
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

  return { fixedUpdate, frameUpdate, st };
}
