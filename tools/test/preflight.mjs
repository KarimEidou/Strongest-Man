// The check that runs before a push.
//
//   node tools/test/preflight.mjs
//
// A push to this repository is a deploy, so the last thing done before one is
// the thing a player does first: open the site at the URL it actually ships on
// and play it. Everything else in tools/ drives the game through a test harness
// with `?capture=1` or `?autoplay=1` and instrumentation attached — useful, and
// not the same as a cold load of the real page.
//
// It is deliberately strict about the network. A 404 on a texture does not throw
// and does not stop the game booting; it just quietly leaves a surface wrong,
// and it is exactly the failure mode a subpath deploy introduces. So a failed
// request or any 4xx/5xx is a failure here, alongside console errors, warnings
// and uncaught exceptions.
//
// Exits non-zero on anything, so it can gate a push.
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const PORT = Number(process.env.PORT || 8080);
// The deployed site lives under /Strongest-Man/, not at the origin root. Loading
// it from the root locally is what lets an absolute path ship and 404 in
// production, so preflight only ever loads the subpath.
const ORIGIN = `http://127.0.0.1:${PORT}/Strongest-Man/`;

const up = async () => { try { return (await fetch(ORIGIN)).ok; } catch { return false; } };
let server = null;
if (!(await up())) {
  server = spawn(process.execPath, [join(root, 'tools', 'test', 'serve.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await up())) throw new Error(`static server did not come up on ${ORIGIN}`);
}

const base = '/opt/pw-browsers';
let exe;
for (const d of readdirSync(base)) {
  if (d.startsWith('chromium') && !d.includes('headless_shell')) exe = join(base, d, 'chrome-linux', 'chrome');
}

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
// iPhone 16 Pro landscape, touch, at its real device pixel ratio
const page = await browser.newPage({
  viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('requestfailed', (r) => problems.push(`request failed: ${r.url().slice(0, 160)} ${r.failure()?.errorText || ''}`));
page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url().slice(0, 160)}`); });

const checks = [];
const check = (label, ok, detail = '') => { checks.push({ label, ok, detail }); };

await page.goto(ORIGIN, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
check('the site boots at the /Strongest-Man/ subpath', true);

// press PLAY the way a player does, and confirm the game is actually running
await page.evaluate(`(() => {
  const b = document.getElementById('play-btn') || document.querySelector('#title-screen button');
  if (b) b.click();
})()`);
await page.waitForTimeout(1500);
const ui = await page.evaluate(`({
  titleHidden: document.getElementById('title-screen').hidden,
  loadingHidden: document.getElementById('loading').hidden,
})`);
check('the title screen goes away on PLAY', ui.titleHidden);
check('the loading overlay is down', ui.loadingHidden);

// The loop is advancing, not stalled on a thrown error.
//
// WAIT for progress; do not sample a window. Both earlier versions of this
// check sampled one — first by counting rAF callbacks over a second, then by
// reading the simulation clock across four — and both failed on a healthy
// build, because how much happens in a fixed span here is a fact about the
// host, not about the game. SwiftShader rasterizes the whole city in software;
// one container managed 0.17s of simulation in four seconds and the next
// managed a single rAF in three, at which rate a four-second window contains
// no completed fixed step at all.
//
// Polling until the clock moves asserts the thing that actually matters — the
// loop makes progress — and is strictly stronger than a window: a dead loop
// still fails, by timing out, and a slow machine no longer can. The timeout is
// generous on purpose; it is a liveness bound, not a performance one.
const SIM_TIMEOUT_MS = 90000;
const simA = await page.evaluate('window.__test.simTime()');
const t0 = Date.now();
let simB = simA;
while (simB <= simA && Date.now() - t0 < SIM_TIMEOUT_MS) {
  await page.waitForTimeout(500);
  simB = await page.evaluate('window.__test.simTime()');
}
check('the simulation advances', simB > simA,
  `${simA.toFixed(2)}s -> ${simB.toFixed(2)}s in ${((Date.now() - t0) / 1000).toFixed(1)}s of wall clock`);

const sw = await page.evaluate(
  `navigator.serviceWorker.getRegistration().then((r) => (r ? (r.active ? 'active' : 'registered') : 'none')).catch((e) => 'error: ' + e)`,
);
check('a service worker is active', sw === 'active', sw);

check('no console errors, warnings, failed requests or 4xx/5xx', problems.length === 0);

await browser.close();
if (server) server.kill();

for (const c of checks) console.log(`${c.ok ? 'PASS ' : 'FAIL '} ${c.label}${c.detail ? `  — ${c.detail}` : ''}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)]) console.log(`  ${p}`);
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
