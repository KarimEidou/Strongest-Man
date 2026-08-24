// Test/diagnostics surface consumed by the Playwright suite.
//   window.__ready  — true once the first frame rendered
//   window.__perf   — fps / frame + sim cost / draw calls / triangles / bodies (1 Hz)
//   window.__test   — scripted hooks (teleport, punchAt, spawnMonster, ...)
// URL params: ?seed=N (world seed), ?nogroq=1, ?fastday=1, ?time=0..1, ?autoplay=1
//
// `ms` is the average frame interval; `maxMs`/`p99Ms` are the WORST frames in
// the window — a game that averages 60 fps and stalls for 300ms when a building
// falls reads as fine on `ms` alone, so hitch work is judged on these.
// `simMs`/`maxSimMs` cover only the fixed+frame systems (no GPU), which is the
// number that stays meaningful under software rendering.
import { seedWorld } from './mathx.js';

export const flags = {
  seed: 1337,
  nogroq: false,
  fastday: false,
  time: -1,               // ?time=0..1 starts the clock at that time of day
  autoplay: false,
  nomonsters: false,
  prof: false,
  quality: '',            // ?quality=low|medium|high forces a tier at boot
  nogodrays: false,       // ?nogodrays=1 isolates the sun-shaft pass
  noshadows: false,       // ?noshadows=1 isolates the shadow pass
  nodetail: false,        // ?nodetail=1 isolates procedural surface detail
};

export function initDebug() {
  const q = new URLSearchParams(location.search);
  if (q.has('seed')) flags.seed = parseInt(q.get('seed'), 10) || 1337;
  flags.nogroq = q.has('nogroq');
  flags.fastday = q.has('fastday');
  flags.time = q.has('time') ? Math.min(1, Math.max(0, parseFloat(q.get('time')) || 0)) : -1;
  flags.autoplay = q.has('autoplay');
  flags.nomonsters = q.has('nomonsters');
  flags.prof = q.has('prof');
  flags.quality = q.get('quality') || '';
  flags.nogodrays = q.has('nogodrays');
  flags.noshadows = q.has('noshadows');
  flags.nodetail = q.has('nodetail');
  seedWorld(flags.seed);

  window.__perf = {
    fps: 0, ms: 0, maxMs: 0, p99Ms: 0,
    simMs: 0, maxSimMs: 0,
    drawCalls: 0, triangles: 0, activeBodies: 0, npcs: 0, sleeping: 0,
  };
  window.__test = {}; // systems register hooks as they come online
  window.__sys = {};   // ?prof=1 — per-system ms, see profile()
  window.__ready = false;
}

// Sim cost is accumulated by main.js around the fixed/frame system lists.
let simAcc = 0, simMax = 0;
export function addSimTime(ms) {
  simAcc += ms;
  if (ms > simMax) simMax = ms;
}

let frames = 0, tAcc = 0;
const window_ = [];
export function perfFrame(renderer, dt, extra) {
  frames++; tAcc += dt;
  window_.push(dt * 1000);
  if (tAcc >= 1) {
    const p = window.__perf;
    p.fps = Math.round(frames / tAcc);
    p.ms = +(tAcc / frames * 1000).toFixed(2);
    window_.sort((a, b) => a - b);
    p.maxMs = +window_[window_.length - 1].toFixed(2);
    p.p99Ms = +window_[Math.min(window_.length - 1, Math.floor(window_.length * 0.99))].toFixed(2);
    p.simMs = +(simAcc / frames).toFixed(3);
    p.maxSimMs = +simMax.toFixed(3);
    p.drawCalls = renderer.info.render.calls;
    p.triangles = renderer.info.render.triangles;
    if (extra) Object.assign(p, extra());
    frames = 0; tAcc = 0; simAcc = 0; simMax = 0;
    window_.length = 0;
  }
}

// ?prof=1 wraps a named system function in a timer. Off by default and free:
// without the flag the original function is returned unchanged.
export function profile(name, fn) {
  if (!flags.prof) return fn;
  const acc = (window.__sys[name] = { ms: 0, max: 0, calls: 0 });
  return (a, b) => {
    const t0 = performance.now();
    fn(a, b);
    const d = performance.now() - t0;
    acc.ms += d; acc.calls++;
    if (d > acc.max) acc.max = d;
  };
}
