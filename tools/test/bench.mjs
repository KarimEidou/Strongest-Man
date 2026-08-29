// Frame-hitch benchmark: worst-frame timing across scripted stress events. The
// acceptance bar for "the game freezes when something big happens" is p99/max
// frame time here, not average FPS.
//   node tools/test/bench.mjs <label>   (needs tools/test/serve.mjs running)
import { chromium } from 'playwright-core';
import { readdirSync } from 'fs';
import { join } from 'path';

function findChrome() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      try { readdirSync(join(base, d, 'chrome-linux')); return p; } catch { /* this build has no chrome-linux; keep looking */ }
    }
  }
  throw new Error('no chromium');
}

const label = process.argv[2] || 'run';
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 956, height: 440 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// Sample window.__perf every 250ms so each phase reports the worst SECOND it
// saw, not just whatever was in the counter when the phase ended. Under
// SwiftShader the GPU dominates wall-clock frame time, so simMs/maxSimMs (the
// fixed+frame system cost, no GPU) is the number that actually tracks our work.
await page.addInitScript(() => {
  window.__frames = [];
  window.__samples = [];
  let last = 0;
  const rec = (t) => {
    if (last) window.__frames.push(t - last);
    last = t;
    requestAnimationFrame(rec);
  };
  requestAnimationFrame(rec);
  setInterval(() => { if (window.__perf) window.__samples.push({ ...window.__perf }); }, 250);
  window.__mark = () => { window.__frames.length = 0; window.__samples.length = 0; };
  window.__stats = () => {
    const f = window.__frames.slice().sort((a, b) => a - b);
    const q = (arr, p) => +arr[Math.min(arr.length - 1, Math.floor(arr.length * p))].toFixed(1);
    const out = f.length
      ? { n: f.length, med: q(f, 0.5), p95: q(f, 0.95), max: +f[f.length - 1].toFixed(1) }
      : { n: 0 };
    const s = window.__samples;
    if (s.length) {
      out.simMs = +Math.max(...s.map((x) => x.simMs)).toFixed(3);
      out.maxSimMs = +Math.max(...s.map((x) => x.maxSimMs)).toFixed(3);
      out.bodies = Math.max(...s.map((x) => x.activeBodies));
      out.draws = Math.max(...s.map((x) => x.drawCalls));
    }
    return out;
  };
});

const QUALITY = process.env.QUALITY ? `&quality=${process.env.QUALITY}` : '';
await page.goto(`http://127.0.0.1:8080/Strongest-Man/?autoplay=1&seed=7&nogroq=1${QUALITY}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
await page.waitForTimeout(4000);

const out = { label };

// idle baseline
await page.evaluate('window.__mark()');
await page.waitForTimeout(5000);
out.idle = await page.evaluate('window.__stats()');

// first charged punch (shockwave ring material compiles here)
await page.evaluate('window.__mark()');
await page.evaluate('window.__test.punchAt(6, 20, 1.0)');
await page.waitForTimeout(2500);
out.firstChargedPunch = await page.evaluate('window.__stats()');

// building collapse
await page.evaluate('window.__mark()');
await page.evaluate('window.__test.collapseBuilding(3)');
await page.waitForTimeout(6000);
out.collapse = await page.evaluate('window.__stats()');

// sustained post-collapse panic
await page.evaluate('window.__mark()');
await page.waitForTimeout(6000);
out.postCollapsePanic = await page.evaluate('window.__stats()');

// car grab + throw
await page.evaluate(`(() => {
  const car = window.__trafficList.find((c) => c.mode === 'drive');
  window.__test.teleport(car.x + 1.2, car.z + 1.2);
})()`);
await page.waitForTimeout(600);
await page.evaluate('window.__mark()');
await page.evaluate(`window.__test.press('grab')`);
await page.waitForTimeout(900);
await page.evaluate(`window.__test.press('grab')`);
await page.waitForTimeout(3500);
out.carThrow = await page.evaluate('window.__stats()');


out.perf = await page.evaluate('window.__perf');
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
