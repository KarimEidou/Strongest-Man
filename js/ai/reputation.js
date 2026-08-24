// Reputation: WHO knows what the player is. Nobody starts knowing. Feats are
// witnessed (30m, roughly facing), knowledge spreads person-to-person in
// visible gossip pairs, decays over time, and pools into per-district lore.
// Karma is what people think of him; reputation is whether they know at all.
import { on, emit, EV } from '../core/events.js';
import { neighbors } from './crowd.js';
import { save } from '../core/state.js';
import { karmaBand } from './karma.js';
import { rand } from '../core/mathx.js';

const scratch = [];
const FEAT_MAG = { charged_punch: 30, car_hit: 18, car_throw: 40, car_explode: 25, throw: 22, building: 60, monster_kill: 80, monster_throw: 70, monster_throw_npc: 0 };

export function initReputation(npcSys, monsterSys, player, city) {
  const districtRep = [0, 0, 0, 0];

  on(EV.FEAT, ({ type, x, z, magnitude }) => {
    const mag = magnitude ?? FEAT_MAG[type] ?? 20;
    if (mag <= 0) return;
    // witnesses: NPCs within 30m facing within ~100°
    neighbors(x, z, 30, scratch);
    for (const n of scratch) {
      if (n.state === 'dead') continue;
      const toX = x - n.x, toZ = z - n.z;
      const d = Math.hypot(toX, toZ) || 1;
      const facing = Math.sin(n.yaw) * (toX / d) + Math.cos(n.yaw) * (toZ / d);
      if (facing > -0.17 || d < 8) { // wide cone; close events are unmissable
        if (mag > n.knowledge) {
          n.knowledge = mag;
          n.knowSource = 'seen';
          emit(EV.WITNESS, { npc: n, featType: type, magnitude: mag });
        }
      }
    }
    // monsters witness too (sight 45m, no facing check — they hunt by senses)
    for (const m of monsterSys.monsters) {
      if (m.dead) continue;
      if (Math.hypot(m.x - x, m.z - z) < 45 && mag >= 50) m.knowledge = Math.max(m.knowledge, mag);
    }
  });

  let gossipT = 0, decayT = 0, districtT = 0;

  function fixedUpdate(dt) {
    gossipT += dt; decayT += dt; districtT += dt;

    // gossip: idle pairs within 3m visibly exchange what they know
    if (gossipT >= 5) {
      gossipT = 0;
      for (const n of npcSys.npcs) {
        if (n.state === 'dead' || n.panicLevel > 0) continue;
        neighbors(n.x, n.z, 3, scratch);
        for (const o of scratch) {
          if (o === n || o.state === 'dead' || o.panicLevel > 0) continue;
          const hi = n.knowledge > o.knowledge ? n : o;
          const lo = hi === n ? o : n;
          const gap = hi.knowledge - lo.knowledge;
          if (gap > 10) {
            lo.knowledge = Math.min(lo.knowledge + gap * 0.35, 70); // hearsay caps at 70
            lo.knowSource = lo.knowSource || 'heard';
            // face each other: the spread is visible
            if (lo.state === 'at_poi' || lo.state === 'commute') {
              lo.yaw = Math.atan2(hi.x - lo.x, hi.z - lo.z);
            }
          }
        }
      }
    }

    // decay: seen fades slowly, hearsay fast
    if (decayT >= 12) {
      decayT = 0;
      for (const n of npcSys.npcs) {
        if (n.knowledge <= 0) continue;
        n.knowledge = Math.max(0, n.knowledge - (n.knowSource === 'seen' ? 0.04 : 0.2) * 12);
        if (n.knowledge === 0) n.knowSource = null;
      }
    }

    // district aggregates; newcomers absorb local lore
    if (districtT >= 10) {
      districtT = 0;
      const sums = [0, 0, 0, 0], counts = [1, 1, 1, 1];
      for (const n of npcSys.npcs) {
        const d = (n.x >= 0 ? 1 : 0) + (n.z >= 0 ? 2 : 0);
        sums[d] += n.knowledge; counts[d]++;
        n.district = d;
      }
      for (let i = 0; i < 4; i++) districtRep[i] = sums[i] / counts[i];
      // shops shutter where a feared strongman is known
      const kb = karmaBand();
      for (const s of city.buildings) {
        if (s.type === 'shop' || s.type === 'diner') {
          s.closed = (kb === 'feared' || kb === 'monster') && districtRep[s.district] >= 30;
        }
      }
    }
  }

  // live proximity behavior: fear, distance-keeping, staring
  npcSys.sys.playerReact = (n) => {
    const dx = player.p.x - n.x, dz = player.p.z - n.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 256) return;
    const a = attitude(n);
    const d = Math.sqrt(d2);
    if (a === 'terror' && d < 15) {
      npcSys.sys.forcePanic?.(n, player.p.x, player.p.z);
    } else if (a === 'wary' && d < 4.5) {
      // keep distance, eyes on him
      n.x -= (dx / d) * 0.05; n.z -= (dz / d) * 0.05;
      n.yaw = Math.atan2(dx, dz);
    } else if ((a === 'awe' || a === 'whisper' || a === 'curious') && d < 8) {
      if (n.state === 'at_poi' || n.state === 'chat') n.yaw = Math.atan2(dx, dz);
    }
  };

  // how an individual treats the player right now
  function attitude(n) {
    const know = n.knowledge;
    const kb = karmaBand();
    if (know < 25) return 'oblivious';
    if (kb === 'saint' || kb === 'good') return know >= 55 ? 'awe' : 'curious';
    if (kb === 'feared' || kb === 'monster') return know >= 55 ? 'terror' : 'wary';
    return know >= 55 ? 'whisper' : 'curious';
  }

  window.__test.setKarma = (v) => { save.karma = v; return karmaBand(); };
  window.__test.setKnowledgeAll = (v) => { for (const n of npcSys.npcs) { n.knowledge = v; n.knowSource = 'seen'; } return v; };
  window.__test.repStats = () => ({
    districts: districtRep.map((d) => +d.toFixed(1)),
    known: npcSys.npcs.filter((n) => n.knowledge >= 25).length,
    max: Math.max(...npcSys.npcs.map((n) => n.knowledge)),
    karma: save.karma,
    band: karmaBand(),
  });

  return { fixedUpdate, attitude, districtRep };
}
