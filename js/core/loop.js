// Frame loop: simulation locked to 60 Hz fixed steps, rendering at whatever
// rAF delivers (120 on ProMotion). Render state interpolates between the last
// two fixed steps via `alpha`, so 120 Hz displays actually see 120 Hz motion.
import { game } from './state.js';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 3;

export function createLoop({ fixed, frame, render }) {
  let last = performance.now();
  let acc = 0;
  let running = true;
  let halfRate = false;
  let skip = false;
  let frameTimes = [];
  let lastPerfCheck = 0;

  function tick(tMs) {
    if (!running) return;
    requestAnimationFrame(tick);
    if (halfRate && (skip = !skip)) return;

    let dt = Math.min((tMs - last) / 1000, 0.1);
    last = tMs;
    dt *= game.slowmo;

    acc += dt;
    let steps = 0;
    while (acc >= FIXED_DT && steps < MAX_STEPS) {
      fixed(FIXED_DT);
      acc -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0; // spiral-of-death guard: drop time

    const alpha = acc / FIXED_DT;
    frame(dt, alpha);
    render();

    // adaptive half-rate: if real frame cost creeps past ~11ms for 2s, render
    // at 60 instead of 120; sim rate never changes.
    const cost = performance.now() - tMs;
    frameTimes.push(cost);
    if (tMs - lastPerfCheck > 2000) {
      const avg = frameTimes.reduce((a, b) => a + b, 0) / Math.max(frameTimes.length, 1);
      if (!halfRate && avg > 11) halfRate = true;
      else if (halfRate && avg < 6) halfRate = false;
      frameTimes = [];
      lastPerfCheck = tMs;
    }
  }

  requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
  return {
    stop() { running = false; },
    get halfRate() { return halfRate; },
  };
}

export { FIXED_DT };
