// Panic: threat events flip NPCs through ALERT → PANIC → HIDE → RECOVER.
// Panicking NPCs abandon the lattice, sprint from the threat toward intact
// doors (visible inside through any broken wall), trample the slow, and burst
// back out if their shelter starts collapsing.
import { on, emit, EV } from '../core/events.js';
import { neighbors } from './crowd.js';
import { capsuleVsWorld } from '../physics/collide.js';
import { randRange, rand, clamp } from '../core/mathx.js';

const scratch = [];

export function installPanic(npcSys, buildingsReg, city) {
  const { npcs, sys } = npcSys;

  function alertAt(x, z, radius, severity = 1) {
    neighbors(x, z, radius, scratch);
    for (const n of scratch) {
      if (n.state === 'dead' || n.state === 'carried' || n.state === 'hide') continue;
      n.threatX = x; n.threatZ = z;
      if (n.state === 'panic') { n.stateT = Math.max(n.stateT, randRange(8, 14)); continue; }
      if (severity > 1.5 || n.state === 'alert') {
        toPanic(n);
      } else {
        n.state = 'alert';
        n.stateT = randRange(0.3, 1.1);   // staggered — crowds don't move in lockstep
        n.targetSpeed = 0;
        n.yaw = Math.atan2(x - n.x, z - n.z); // face the threat
      }
    }
  }

  function toPanic(n) {
    n.state = 'panic';
    n.stateT = randRange(9, 16);
    n.panicLevel = 1;
    if (rand() < 0.5) emit_scream(n);
    // choose shelter: nearest intact building door roughly away from threat
    let best = null, bd = Infinity;
    for (const b of buildingsReg.buildings) {
      if (b.collapsed || b.falling) continue;
      const s = b.spec;
      if (s.closed) continue;
      const d = s.door;
      const dx = d.outX - n.x, dz = d.outZ - n.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 45) continue;
      // flee direction bias: door should not be toward the threat
      const tx = n.x - n.threatX, tz = n.z - n.threatZ;
      const tl = Math.hypot(tx, tz) || 1;
      const dot = (dx / dist) * (tx / tl) + (dz / dist) * (tz / tl);
      const score = dist * (1.6 - dot);
      if (score < bd) { bd = score; best = b; }
    }
    n.shelter = rand() < 0.72 ? best : null;   // some just run
  }

  function emit_scream(n) {
    // visible bark handled by dialogue; the event chains panic through crowds
    emit(EV.SCREAM, { x: n.x, z: n.z, radius: 18 });
  }

  // ---- event wiring
  on(EV.SCREAM, ({ x, z, radius }) => alertAt(x, z, radius, 1));
  on(EV.FEAT, ({ x, z, magnitude }) => alertAt(x, z, Math.min(20 + magnitude * 0.4, 40), magnitude > 40 ? 2 : 1));
  on(EV.CAR_EXPLODED, ({ x, z }) => alertAt(x, z, 30, 2));
  on(EV.NPC_DIED, ({ x, z }) => alertAt(x, z, 22, 2));
  on(EV.MONSTER_SPAWNED, ({ monster }) => alertAt(monster.x, monster.z, 35, 1));
  on(EV.BUILDING_COLLAPSED, ({ x, z }) => alertAt(x, z, 45, 2));
  on(EV.HYDRANT_BURST, ({ x, z }) => alertAt(x, z, 12, 1));

  // shelter collapse evacuations
  on(EV.CHUNK_DESTROYED, ({ x, z }) => {
    for (const n of npcs) {
      if (n.state === 'hide' && n.shelterB && !n.shelterB.collapsed) {
        const s = n.shelterB.spec;
        if (x > s.x0 - 3 && x < s.x1 + 3 && z > s.z0 - 3 && z < s.z1 + 3) evacuate(n);
      }
    }
  });
  on(EV.BUILDING_COLLAPSED, ({ building }) => {
    for (const n of npcs) {
      if (n.state === 'hide' && n.shelterB?.spec.id === building) {
        // shelter came down — casualties + screaming survivors
        if (rand() < 0.5) npcSys.kill(n, 'building', 8);
        else evacuate(n);
      }
    }
  });

  function evacuate(n) {
    n.state = 'panic';
    n.stateT = randRange(10, 16);
    n.shelter = null;
    n.shelterB = null;
    emit_scream(n);
  }

  // ---- per-tick brain for panic states (called from npc.think default)
  sys.panicThink = (n, dt) => {
    n.stateT -= dt;
    switch (n.state) {
      case 'alert': {
        if (n.stateT <= 0) toPanic(n);
        break;
      }
      case 'panic': {
        n.panicLevel = 1;
        if (n.shelter && !n.shelter.collapsed && !n.shelter.falling) {
          const d = n.shelter.spec.door;
          const dist = Math.hypot(d.outX - n.x, d.outZ - n.z);
          if (dist < 1.6) {
            // slip inside: park at an interior spot, visible through holes
            n.state = 'hide';
            n.shelterB = n.shelter;
            const s = n.shelter.spec;
            n.x = clamp(d.x + (d.x === s.x0 ? 2.2 : d.x === s.x1 ? -2.2 : 0), s.x0 + 1.2, s.x1 - 1.2);
            n.z = clamp(d.z + (d.z === s.z0 ? 2.2 : d.z === s.z1 ? -2.2 : 0), s.z0 + 1.2, s.z1 - 1.2);
            n.px = n.x; n.pz = n.z;
            n.targetSpeed = 0;
            n.stateT = randRange(24, 40);
            n.root.scale.y *= 0.92; // cower
            return;
          }
          n.yaw = Math.atan2(d.outX - n.x, d.outZ - n.z);
          n.targetSpeed = 4.6 + n.id % 3 * 0.5;
        } else {
          // pure flight from the threat
          const tx = n.x - n.threatX, tz = n.z - n.threatZ;
          const tl = Math.hypot(tx, tz) || 1;
          n.yaw = Math.atan2(tx / tl, tz / tl) + Math.sin(n.id * 3.7) * 0.3;
          n.targetSpeed = 5 + (n.id % 3) * 0.6;
        }
        // trample: fast panicker knocks over the calm
        if (n.speed > 3.5) {
          neighbors(n.x, n.z, 0.7, scratch);
          for (const o of scratch) {
            if (o !== n && o.state !== 'dead' && o.state !== 'tumbled' && o.panicLevel === 0 && rand() < 0.3) {
              o.state = 'tumbled';
              o.stateT = randRange(1.6, 2.6);
              o.targetSpeed = 0;
              o.loco.playOneshot('die', { timeScale: 1.6 });
            }
          }
        }
        if (n.stateT <= 0) recover(n);
        break;
      }
      case 'tumbled': {
        n.targetSpeed = 0;
        if (n.stateT <= 0) { n.state = 'panic'; n.stateT = randRange(6, 10); n.panicLevel = 1; }
        break;
      }
      case 'hide': {
        n.targetSpeed = 0;
        if (n.stateT <= 0) {
          n.root.scale.y /= 0.92;
          n.state = 'commute'; n.goal = null; n.panicLevel = 0;
          n.shelterB = null;
        }
        break;
      }
      case 'carried': {
        n.targetSpeed = 0;
        break;
      }
      default: break;
    }
  };

  // panicked direct movement must respect walls (they leave the lattice)
  const origMove = null;
  sys.panicCollide = (n, dt) => {
    if (n.state === 'panic' || n.state === 'tumbled') {
      const [cx, cz] = capsuleVsWorld(n.x, n.z, n.y + 0.9, 0.3);
      n.x = cx; n.z = cz;
    }
  };
}
