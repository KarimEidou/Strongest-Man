// Test/diagnostics surface consumed by the Playwright suite.
//   window.__ready  — true once the first frame rendered
//   window.__perf   — fps / draw calls / triangles / body counts (1 Hz)
//   window.__test   — scripted hooks (teleport, punchAt, spawnMonster, ...)
// URL params: ?seed=N (world seed), ?nogroq=1, ?fastday=1, ?autoplay=1
import { seedWorld } from './mathx.js';

export const flags = {
  seed: 1337,
  nogroq: false,
  fastday: false,
  autoplay: false,
  nomonsters: false,
};

export function initDebug() {
  const q = new URLSearchParams(location.search);
  if (q.has('seed')) flags.seed = parseInt(q.get('seed'), 10) || 1337;
  flags.nogroq = q.has('nogroq');
  flags.fastday = q.has('fastday');
  flags.autoplay = q.has('autoplay');
  flags.nomonsters = q.has('nomonsters');
  seedWorld(flags.seed);

  window.__perf = { fps: 0, ms: 0, drawCalls: 0, triangles: 0, activeBodies: 0, npcs: 0, sleeping: 0 };
  window.__test = {}; // systems register hooks as they come online
  window.__ready = false;
}

let frames = 0, tAcc = 0;
export function perfFrame(renderer, dt, extra) {
  frames++; tAcc += dt;
  if (tAcc >= 1) {
    const p = window.__perf;
    p.fps = Math.round(frames / tAcc);
    p.ms = +(tAcc / frames * 1000).toFixed(2);
    p.drawCalls = renderer.info.render.calls;
    p.triangles = renderer.info.render.triangles;
    if (extra) Object.assign(p, extra());
    frames = 0; tAcc = 0;
  }
}
