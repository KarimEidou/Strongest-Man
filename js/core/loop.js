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
  // Half-rate exists to drop a 120Hz ProMotion display to 60, never to drop 60
  // to 30 — at 30 the sim keeps stepping at 60 and it reads as stutter, not as
  // a smooth lower framerate. So measure the display first and only allow it on
  // a genuinely high-refresh panel.
  let refreshHz = 0;
  let refreshFrames = 0, refreshT0 = 0;
  let overBudget = 0;

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

    // display refresh probe (first ~60 frames)
    if (refreshHz === 0) {
      if (refreshT0 === 0) refreshT0 = tMs;
      else if (++refreshFrames >= 60) refreshHz = refreshFrames / ((tMs - refreshT0) / 1000);
    }

    // Adaptive half-rate, high-refresh displays only. Judged on the p90 of the
    // window rather than the mean, so one GC spike can't latch it on forever,
    // and it needs two bad checks in a row to trip but only one good one to
    // recover.
    const cost = performance.now() - tMs;
    frameTimes.push(cost);
    if (tMs - lastPerfCheck > 2000) {
      frameTimes.sort((a, b) => a - b);
      const p90 = frameTimes[Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * 0.9))] || 0;
      const allowed = refreshHz > 90;
      if (allowed && !halfRate && p90 > 11) {
        if (++overBudget >= 2) halfRate = true;
      } else if (halfRate && p90 < 6) {
        halfRate = false; overBudget = 0;
      } else {
        overBudget = 0;
      }
      if (!allowed) halfRate = false;
      frameTimes = [];
      lastPerfCheck = tMs;
    }
  }

  requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
  return {
    stop() { running = false; },
    get halfRate() { return halfRate; },
    get refreshHz() { return refreshHz; },
  };
}

export { FIXED_DT };
