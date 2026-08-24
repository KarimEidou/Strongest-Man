// Event director: schedules monster arrivals (walking in from beyond the fog,
// never popping), caps concurrency, and holds events back when the frame
// budget is under pressure.
import { emit, on, EV } from '../core/events.js';
import { rand, randRange, pick } from '../core/mathx.js';

const EDGES = [
  [0, -86], [0, 86], [-86, 0], [86, 0],
  [50, -86], [-50, 86], [-86, -50], [86, 50],
];

export function createDirector(monsterSys) {
  let nextEvent = randRange(35, 60);   // first monster shows up early enough to matter
  let tick = 0;

  function fixedUpdate(dt) {
    tick += dt;
    if (tick < 1) return;
    nextEvent -= tick;
    tick = 0;

    const activeMonsters = monsterSys.monsters.filter((m) => !m.dead).length;
    if (nextEvent <= 0) {
      const fpsOk = (window.__perf?.fps ?? 60) > 24;
      if (activeMonsters < 2 && fpsOk) {
        const [x, z] = pick(EDGES);
        const pair = activeMonsters === 0 && rand() < 0.25;
        monsterSys.spawn(rand() < 0.5 ? 0 : 1, x + randRange(-6, 6), z + randRange(-6, 6));
        if (pair) monsterSys.spawn(rand() < 0.5 ? 0 : 1, x + randRange(-10, 10), z + randRange(-10, 10));
        nextEvent = randRange(90, 240);
      } else {
        nextEvent = 20; // try again shortly
      }
    }
  }

  return { fixedUpdate };
}
