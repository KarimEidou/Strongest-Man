// Screenshot capture harness.
//
//   node tools/capture/capture.mjs --set baseline
//   node tools/capture/capture.mjs --set final --engine both
//   node tools/capture/capture.mjs --set final --only museum
//
// Drives tools/test/serve.mjs, which mounts the site at /Strongest-Man/ exactly
// as GitHub Pages does — so a root-absolute path that works on a local root
// server fails here too, which is the whole point of not using `npx serve`.
//
// SAFE AREAS: no headless browser reports env(safe-area-inset-*). The harness
// injects the real per-device values as the --sa-* custom properties css/main.css
// already reads, asymmetrically, and captures BOTH landscape orientations so the
// notch swapping sides is actually exercised. This is emulation, not the device;
// VERIFICATION.md says so plainly and §5.5 covers the rest.
//
// WEBKIT is Playwright's WebKit, not Mobile Safari. It is the closest automatable
// engine and it catches a different class of bug from Chromium, but it is a proxy.
import { chromium, webkit } from 'playwright-core';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpus } from 'os';
import { DEVICES, ORIENTATIONS, insetsFor, viewportFor } from './devices.mjs';
import { SCENES, PORTRAIT_SCENES, artworkScenes } from './scenes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const PORT = Number(process.env.PORT || 8080);
const ORIGIN = `http://127.0.0.1:${PORT}/Strongest-Man/`;

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);
const SET = arg('set', 'final');
const ENGINE = arg('engine', 'chromium');       // chromium | webkit | both
// --only takes a comma-separated list of substrings, so one re-run can cover
// several scene families against a single build rather than relaunching the
// browser once per family. Empty means everything.
const ONLY = arg('only', '').split(',').map((s) => s.trim()).filter(Boolean);
const wanted = (id) => !ONLY.length || ONLY.some((o) => id.includes(o));
const DEVICE_FILTER = arg('device', '');
const KEEP = has('keep');
// How many scenes are captured at once. Each lane is a browser page rendering
// the whole city through SwiftShader, so this is CPU-bound: one lane per core
// with one core left for the server, the harness and the compositor.
const LANES = Math.max(1, Math.min(8, Number(arg('lanes', 0)) || (cpus().length - 1)));

const OUT = join(root, 'screenshots', SET);
if (!KEEP && existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ---- chromium binary ------------------------------------------------------
function findChrome() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium') && !d.includes('headless_shell')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      try { readdirSync(join(base, d, 'chrome-linux')); return p; } catch { /* keep looking */ }
    }
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

// ---- server ---------------------------------------------------------------
async function serverUp() {
  try {
    const r = await fetch(ORIGIN);
    return r.ok;
  } catch { return false; }
}

let server = null;
if (!(await serverUp())) {
  server = spawn(process.execPath, [join(root, 'tools', 'test', 'serve.mjs')], {
    stdio: 'ignore', detached: false,
  });
  for (let i = 0; i < 60 && !(await serverUp()); i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!(await serverUp())) throw new Error(`static server did not come up on ${ORIGIN}`);
}

// ---- launch ---------------------------------------------------------------
const engines = ENGINE === 'both' ? ['chromium', 'webkit'] : [ENGINE];
const report = [];
let failures = 0;

for (const engineName of engines) {
  let browser;
  try {
    browser = engineName === 'webkit'
      ? await webkit.launch()
      : await chromium.launch({
        executablePath: findChrome(),
        // SwiftShader: the container has no GPU. Slow, but it renders the real
        // shaders rather than skipping them.
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
  } catch (e) {
    console.error(`\n!! ${engineName} could not launch — skipping this engine`);
    console.error(`   ${String(e).split('\n')[0]}`);
    report.push({ engine: engineName, skipped: String(e).split('\n')[0] });
    failures++;
    continue;
  }

  // the artwork list drives part of the matrix, so read it from the game once
  const probe = await browser.newPage({ viewport: { width: 852, height: 393 } });
  await probe.goto(`${ORIGIN}?autoplay=1&seed=42&capture=1&nomonsters=1`, { waitUntil: 'load' });
  await probe.waitForFunction('window.__READY__ === true', null, { timeout: 180000 });
  const works = await probe.evaluate('window.__test.museum().works');
  await probe.close();

  const landscapeScenes = [...SCENES, ...artworkScenes(works)]
    .filter((s) => wanted(s.id));
  const portraitScenes = PORTRAIT_SCENES.filter((s) => wanted(s.id));

  for (const device of DEVICES) {
    if (DEVICE_FILTER && device.id !== DEVICE_FILTER) continue;
    for (const orientation of [...ORIENTATIONS, 'portrait']) {
      const scenes = orientation === 'portrait' ? portraitScenes : landscapeScenes;
      // portrait is a single-device check by design (§5.3): the overlay is not
      // device-specific and forty more portrait shots prove nothing
      if (orientation === 'portrait' && device.id !== 'ip16pro') continue;
      if (!scenes.length) continue;

      const vp = viewportFor(device, orientation);
      const insets = insetsFor(device, orientation);
      const ctx = await browser.newContext({
        viewport: vp,
        deviceScaleFactor: device.dpr,
        isMobile: device.id !== 'desktop',
        hasTouch: device.id !== 'desktop',
        // the game refuses to register a SW off localhost/https; block it here so
        // one capture run cannot serve a stale build to the next
        serviceWorkers: 'block',
      });
      // Inject the safe-area values before any of the page's own script runs.
      await ctx.addInitScript(`(() => {
        // Safe-area insets, plus: no CSS transitions or animations.
        //
        // Everything in the SIMULATION is on a fixed step, but CSS is on the
        // wall clock, and the two are not the same clock. #art-prompt fades in
        // over 0.18s, so whether the shutter caught it at 0.7 opacity or at 1.0
        // depended on how fast the machine was — 196,819 pixels of difference
        // between two runs of identical code, all of it inside that one pill.
        // Killing the transitions puts every DOM overlay at its settled state,
        // which is the state worth photographing anyway.
        //
        // Every scene starts from an empty save.
        //
        // The pool runs scenes in whatever order lanes free up, and they share a
        // browser context — so they shared localStorage. The shop scene writes
        // 9,000 points; hud-stress writes the whole armoury; karma and reputation
        // persist too, and reputation decides which shops are shut, which
        // decides where the townsfolk walk. Scenes captured after those ones
        // therefore differed from the same scenes captured before them, by up to
        // 6,600 pixels of pedestrians in a street. Clearing here, before any of
        // the page's own script runs, makes a capture independent of what else
        // was captured in the same viewport.
        try { localStorage.clear(); } catch (e) { /* private mode; nothing to clear */ }
        const css = ':root{--sa-t:${insets.top}px;--sa-r:${insets.right}px;'
          + '--sa-b:${insets.bottom}px;--sa-l:${insets.left}px;}'
          + '*,*::before,*::after{transition:none!important;animation:none!important;}';
        const add = () => {
          const st = document.createElement('style');
          st.id = 'capture-safe-area';
          st.textContent = css;
          document.head.appendChild(st);
        };
        if (document.head) add();
        else addEventListener('DOMContentLoaded', add);
      })()`);

      // Scenes run CONCURRENTLY across a small pool of pages.
      //
      // Safe because a capture is not wall-clock dependent: ?capture=1 pins the
      // frame loop to a fixed dt, freezes the day cycle and the shake, and seeds
      // Math.random, and every scene advances the world with __test.step(), a
      // whole number of fixed steps. Two scenes racing on two cores therefore
      // produce byte-comparable images to the same two scenes run one after the
      // other — the only thing that changes is how long the run takes.
      //
      // It matters a great deal: the full matrix is ~600 boots and each boot is
      // ~20s of city generation, model decode and shader compilation. Serially
      // that is most of a working day.
      const queue = scenes.map((scene, i) => ({ scene, i }));
      const slots = new Array(scenes.length);
      const worker = async () => {
      for (;;) {
        const job = queue.shift();
        if (!job) return;
        const { scene } = job;
        const page = await ctx.newPage();
        const problems = [];
        // Noise the HARNESS causes, not the app. Everything else counts.
        //  - the SW warning is Playwright announcing our own serviceWorkers:'block'
        //  - KHR_parallel_shader_compile is SwiftShader; real Safari has it
        const HARNESS_NOISE = [
          /Service Worker registration blocked by Playwright/,
          /KHR_parallel_shader_compile extension not supported/,
        ];
        page.on('console', (m) => {
          if (m.type() !== 'error' && m.type() !== 'warning') return;
          const t = m.text();
          if (HARNESS_NOISE.some((re) => re.test(t))) return;
          problems.push(`[${m.type()}] ${t}`);
        });
        page.on('pageerror', (e) => problems.push(`[pageerror] ${String(e)}`));
        page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

        const name = `${scene.id}_${device.id}_${orientation}`;
        const file = join(OUT, `${engineName === 'webkit' ? 'wk_' : ''}${name}.png`);
        try {
          await page.goto(`${ORIGIN}?${scene.query}`, { waitUntil: 'load' });
          await page.waitForFunction('window.__READY__ === true', null, { timeout: 180000 });
          if (scene.setup) {
            await page.evaluate(typeof scene.setup === 'string' ? scene.setup : scene.setup);
          }
          if (scene.steps) await page.evaluate(`window.__test.step(${scene.steps / 60})`);
          // The loop froze itself after its first render (see js/main.js), so
          // nothing has advanced since except the steps just asked for. Draw the
          // frame from inside a rAF callback so the compositor presents what was
          // drawn — and then wait TWO more frames before the shutter.
          //
          // Two, not one, and it is not superstition. renderNow() rasterizes the
          // whole city in software inside its rAF, which is seconds long here;
          // the compositor can commit the surface from BEFORE that frame, and a
          // screenshot taken then is the previous composite. It showed up as
          // `loading` captures that were bare canvas with no panel on them —
          // the panel had been made visible by the scene's setup a moment
          // earlier and simply had not been painted yet. One in 602, on a
          // different device each run, which is what a timing race looks like.
          await page.evaluate(`new Promise((r) => requestAnimationFrame(() => {
            window.__test.renderNow();
            requestAnimationFrame(() => requestAnimationFrame(r));
          }))`);
          // …and then a real pause before the shutter.
          //
          // Two extra rAFs made the stale-surface race rare rather than gone: a
          // `loading` capture still came out as bare canvas roughly once in a
          // few hundred. renderNow() rasterizes the whole city in software, and
          // the compositor is entitled to commit the surface from before that
          // frame; rAF callbacks are not a promise that a commit has happened.
          //
          // This wait cannot change what is IN the picture — the loop is
          // suspended and the world is frozen — so it costs determinism nothing
          // and buys the compositor room it evidently needs.
          await page.waitForTimeout(150);
          // Fonts laid out and every image fully decoded before the shutter.
          //
          // The title screen is a full-bleed JPEG behind the logo, and two runs
          // of it differed across 1,344,780 pixels at a mean delta of 1.2 —
          // invisible, and still a difference, because one run photographed an
          // intermediate decode. decode() resolves only when the bitmap is ready
          // to paint, which is the thing actually being waited for.
          await page.evaluate(`(async () => {
            await (document.fonts ? document.fonts.ready : Promise.resolve());
            await Promise.all([...document.images]
              .filter((i) => i.src && !i.complete === false)
              .map((i) => i.decode().catch(() => {})));
          })()`);
          await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
          await page.screenshot({ path: file, fullPage: false });
          slots[job.i] = {
            engine: engineName, device: device.id, orientation, scene: scene.id,
            note: scene.note, file: file.slice(root.length + 1), problems,
          };
          if (problems.length) failures++;
          process.stdout.write(problems.length ? 'x' : '.');
        } catch (e) {
          failures++;
          slots[job.i] = {
            engine: engineName, device: device.id, orientation, scene: scene.id,
            note: scene.note, file: null, problems: [`[capture] ${String(e).split('\n')[0]}`],
          };
          process.stdout.write('E');
        }
        await page.close();
      }
      };
      await Promise.all(Array.from({ length: Math.min(LANES, scenes.length) }, worker));
      // written back in scene order, so the report reads the same whatever
      // order the pool happened to finish in
      for (const r of slots) if (r) report.push(r);
      await ctx.close();
    }
  }
  await browser.close();
}

if (server) server.kill();

// --keep re-shoots a subset into an existing set, so the report has to MERGE
// rather than replace: a targeted re-run of one scene would otherwise leave a
// report claiming the set contains ten captures when it contains six hundred.
// Rows are keyed by engine+device+orientation+scene, and the new run wins.
let merged = report;
if (KEEP && existsSync(join(OUT, 'report.json'))) {
  const key = (r) => `${r.engine}|${r.device}|${r.orientation}|${r.scene}`;
  const fresh = new Set(report.map(key));
  const prior = JSON.parse(readFileSync(join(OUT, 'report.json'), 'utf8'));
  merged = [...prior.filter((r) => !fresh.has(key(r))), ...report];
  console.log(`\nmerged into ${prior.length} existing rows -> ${merged.length}`);
}
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(merged, null, 2)}\n`);
const shots = report.filter((r) => r.file).length;
const dirty = report.filter((r) => r.problems && r.problems.length);
console.log(`\n${shots} screenshots -> screenshots/${SET}/`);
if (dirty.length) {
  console.log(`\n${dirty.length} capture(s) with console problems:`);
  for (const d of dirty.slice(0, 25)) {
    console.log(`  ${d.scene} ${d.device} ${d.orientation}`);
    for (const p of [...new Set(d.problems)].slice(0, 4)) console.log(`     ${p.slice(0, 180)}`);
  }
}
process.exit(failures ? 1 : 0);
