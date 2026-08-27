// Frame loop: simulation locked to 60 Hz fixed steps, rendering at whatever
// rAF delivers (120 on ProMotion). Render state interpolates between the last
// two fixed steps via `alpha`, so 120 Hz displays actually see 120 Hz motion.
import { game } from './state.js';
import { flags } from './debug.js';

const FIXED_DT = 1 / 60;
// Cap on catch-up steps per frame. At 3 the simulation silently falls behind
// real time below ~20fps — the accumulator saturates, the remainder is thrown
// away, and the whole world runs in slow motion exactly when a collapse is
// making frames expensive. 5 keeps sim and wall clock together down to ~12fps
// and still bounds the worst-case step cost.
const MAX_STEPS = 5;

export function createLoop({ fixed, frame, render }) {
  let last = performance.now();
  let acc = 0;
  let running = true;
  // Backgrounded, or the GL context is gone. iOS suspends rAF when the app goes
  // to the background, so the loop mostly stops on its own — but the FIRST frame
  // back arrives with a multi-second gap, and 0.1s of that still buys five fixed
  // steps of catch-up the player never asked for. Zeroing the accumulator on the
  // way back in is what stops him walking through a wall on return.
  let hidden = document.visibilityState === 'hidden';
  let suspended = false;
  const resetClock = () => { last = performance.now(); acc = 0; };
  addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden';
    if (!hidden) resetClock();
  });
  // pagehide/pageshow are the pair iOS actually delivers when a PWA is swiped
  // away and reopened from the app switcher; visibilitychange alone misses it.
  addEventListener('pagehide', () => { hidden = true; });
  addEventListener('pageshow', () => { hidden = document.visibilityState === 'hidden'; resetClock(); });
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
    // Nothing may step or draw while the context is gone or the app is away:
    // rendering into a lost context throws, and stepping into a hidden tab
    // burns battery for frames nobody sees.
    if (hidden || suspended) { last = tMs; acc = 0; return; }
    if (halfRate && (skip = !skip)) return;

    // Capture mode renders on a metronome: same dt every frame, so damping,
    // interpolation and every decaying effect land in the same place on two
    // different runs. Without it a screenshot is a photograph of whatever the
    // machine's load happened to be.
    let dt = flags.capture ? FIXED_DT : Math.min((tMs - last) / 1000, 0.1);
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
    // Held by whatever knows the renderer cannot draw right now — see the
    // webglcontextlost wiring in js/main.js.
    suspend(v) { suspended = !!v; if (!v) resetClock(); },
    get suspended() { return suspended || hidden; },
    get halfRate() { return halfRate; },
    get refreshHz() { return refreshHz; },
  };
}

export { FIXED_DT };
