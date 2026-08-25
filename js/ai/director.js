// Event director: schedules monster arrivals (walking in from beyond the fog,
// never popping), caps concurrency, and holds events back when the frame
// budget is under pressure.
import { emit, on, EV } from '../core/events.js';
import { rand, randRange, pick } from '../core/mathx.js';
import { flags } from '../core/debug.js';

const EDGES = [
  [0, -86], [0, 86], [-86, 0], [86, 0],
  [50, -86], [-50, 86], [-86, -50], [86, 50],
];

// Which edge a monster walks in from decides whether the player ever meets it.
// Picking uniformly on a 172m map averaged 103m from arrival point to player —
// 35-40s of walking at a 2.4-3.1 m/s cruise, all of it somewhere else, and the
// crowd it reached first was not the crowd the player was standing in. Scoring
// each edge by how closely its bearing matches the player's brings that to ~36m
// (median 29m). The rand()*0.6 jitter against a [-1,1] dot is enough that two
// waves running do not walk in from the same corner.
function pickEdge(px, pz) {
  const len = Math.hypot(px, pz);
  if (len < 12) return pick(EDGES);   // player near the middle: no side to prefer
  const ux = px / len, uz = pz / len;
  let best = EDGES[0], bestScore = -Infinity;
  for (const e of EDGES) {
    const el = Math.hypot(e[0], e[1]) || 1;
    const s = (e[0] * ux + e[1] * uz) / el + rand() * 0.6;
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return best;
}

export function createDirector(monsterSys) {
  let nextEvent = randRange(15, 30);   // first monster shows up early enough to matter
  let tick = 0;

  function fixedUpdate(dt) {
    if (flags.nomonsters) return;
    tick += dt;
    if (tick < 1) return;
    nextEvent -= tick;
    tick = 0;

    const activeMonsters = monsterSys.monsters.filter((m) => !m.dead).length;
    if (nextEvent <= 0) {
      // `|| 60`, not `?? 60`: debug.js creates __perf at boot with fps: 0, so the
      // nullish form read 0 and `0 > 24` was false. That made the frame-budget
      // check not a safety valve but an off switch — a phone that never sustains
      // 24fps shipped with monsters permanently disabled, which is most of why
      // they were never met. It is a cap now instead of a veto: a struggling
      // device gets fewer monsters at once, never none.
      const fps = window.__perf?.fps || 60;
      const cap = fps > 26 ? 4 : fps > 18 ? 2 : 1;
      if (activeMonsters < cap) {
        const p = monsterSys.player?.p;   // createMonsters exposes it for exactly this
        const [x, z] = pickEdge(p ? p.x : 0, p ? p.z : 0);
        // two at once is the encounter people remember, so allow a pair whenever
        // the street is nearly empty rather than only when it is completely empty
        const pair = activeMonsters <= 1 && activeMonsters + 2 <= cap && rand() < 0.4;
        monsterSys.spawn(rand() < 0.5 ? 0 : 1, x + randRange(-6, 6), z + randRange(-6, 6));
        if (pair) monsterSys.spawn(rand() < 0.5 ? 0 : 1, x + randRange(-10, 10), z + randRange(-10, 10));
        nextEvent = randRange(35, 90);
      } else {
        nextEvent = 10; // at the cap: a kill frees a slot in seconds, so re-check soon
      }
    }
  }

  return { fixedUpdate };
}
