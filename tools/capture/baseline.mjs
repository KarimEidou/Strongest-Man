// Baseline captures, taken from the PRE-OVERHAUL build.
//
//   node tools/capture/baseline.mjs [ref]
//
// The old build is checked out of git into a temp directory and served at the
// same /Strongest-Man/ subpath, so the before and after images are the same
// scenes at the same viewports with the same safe-area insets — the only
// difference is the code.
//
// It is NOT the same harness, because the old build cannot run it: there is no
// ?capture=1, no window.__READY__, no window.__test.warpTo, no hudStress, and no
// museum at all. This drives it with what it has (window.__ready,
// __test.teleport, __test.setPoints) and covers the scenes that exist in both
// builds. The museum, plaque, inspect and update-banner scenes have no baseline
// for the honest reason that there was nothing there to photograph; the final
// set carries them alone and VERIFICATION.md says so.
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { execFileSync } from 'child_process';
import { readFile } from 'fs/promises';
import { mkdtempSync, rmSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, extname, normalize, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEVICES, insetsFor, viewportFor } from './devices.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const REF = process.argv[2] || 'origin/pre-overhaul-2026-08-26';
const OUT = join(root, 'screenshots', 'baseline');
const PREFIX = '/Strongest-Man';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.md': 'text/markdown',
};

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const work = mkdtempSync(join(tmpdir(), 'sm-baseline-'));
execFileSync('bash', ['-c',
  `git -C ${JSON.stringify(root)} archive ${REF} | tar -x -C ${JSON.stringify(work)}`]);
console.log(`baseline build: ${REF} -> ${work}`);

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(`${PREFIX}/`) && p !== PREFIX) { res.writeHead(404); res.end(); return; }
    p = p.slice(PREFIX.length) || '/';
    if (p === '/') p = '/index.html';
    const file = normalize(join(work, p));
    if (!file.startsWith(work)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}${PREFIX}/`;
console.log(`serving at ${ORIGIN}`);

function findChrome() {
  for (const d of readdirSync('/opt/pw-browsers')) {
    if (d.startsWith('chromium') && !d.includes('headless_shell')) {
      const p = join('/opt/pw-browsers', d, 'chrome-linux', 'chrome');
      try { readdirSync(join('/opt/pw-browsers', d, 'chrome-linux')); return p; } catch { /* keep looking */ }
    }
  }
  throw new Error('chromium not found');
}

// Scenes that exist in BOTH builds, reached with the old build's own hooks.
const SCENES = [
  { id: 'title', query: 'seed=42', setup: () => { document.getElementById('loading').hidden = true; } },
  {
    id: 'loading',
    query: 'seed=42',
    setup: () => {
      document.getElementById('loading').hidden = false;
      document.getElementById('loading-fill').style.width = '62%';
      document.getElementById('loading-msg').textContent = 'destruction…';
    },
  },
  { id: 'settings', query: 'seed=42', setup: () => document.getElementById('btn-settings').click() },
  { id: 'hud-idle', query: 'autoplay=1&seed=42&nomonsters=1&time=0.70', setup: null },
  { id: 'street', query: 'autoplay=1&seed=42&nomonsters=1&time=0.70', setup: null },
  {
    id: 'hud-bright',
    query: 'autoplay=1&seed=42&nomonsters=1&time=0.42',
    setup: () => window.__test.teleport?.(2.5, -30),
  },
  {
    id: 'hud-dark',
    query: 'autoplay=1&seed=42&nomonsters=1&time=0.02',
    setup: () => window.__test.teleport?.(2.5, -30),
  },
  {
    id: 'shop',
    query: 'autoplay=1&seed=42&nomonsters=1&time=0.70',
    setup: () => { window.__test.setPoints?.(9000); document.getElementById('btn-shop').click(); },
  },
  {
    id: 'pause',
    query: 'autoplay=1&seed=42&nomonsters=1&time=0.70',
    setup: () => document.getElementById('btn-pause').click(),
  },
];

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const report = [];
for (const device of DEVICES) {
  for (const orientation of ['landscape-left', 'landscape-right']) {
    const vp = viewportFor(device, orientation);
    const insets = insetsFor(device, orientation);
    const ctx = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: device.dpr,
      isMobile: device.id !== 'desktop',
      hasTouch: device.id !== 'desktop',
      serviceWorkers: 'block',
    });
    await ctx.addInitScript(`(() => {
      const css = ':root{--sa-t:${insets.top}px;--sa-r:${insets.right}px;'
        + '--sa-b:${insets.bottom}px;--sa-l:${insets.left}px;}';
      const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
      if (document.head) add(); else addEventListener('DOMContentLoaded', add);
    })()`);

    for (const scene of SCENES) {
      const page = await ctx.newPage();
      const problems = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`[pageerror] ${String(e)}`));
      page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
      const name = `${scene.id}_${device.id}_${orientation}`;
      try {
        await page.goto(`${ORIGIN}?${scene.query}`, { waitUntil: 'load' });
        await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });
        if (scene.setup) await page.evaluate(scene.setup);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: join(OUT, `${name}.png`) });
        report.push({ device: device.id, orientation, scene: scene.id, file: `screenshots/baseline/${name}.png`, problems });
        process.stdout.write(problems.length ? 'x' : '.');
      } catch (e) {
        report.push({ device: device.id, orientation, scene: scene.id, file: null, problems: [String(e).split('\n')[0]] });
        process.stdout.write('E');
      }
      await page.close();
    }
    await ctx.close();
  }
}

await browser.close();
server.close();
rmSync(work, { recursive: true, force: true });

// The baseline's console output IS a finding: it is the "before" half of
// "zero console errors on every screen".
const dirty = report.filter((r) => r.problems.length);
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify({ ref: REF, report }, null, 2)}\n`);
console.log(`\n${report.filter((r) => r.file).length} baseline screenshots -> screenshots/baseline/`);
console.log(`${dirty.length} of them logged a console problem in the OLD build`);
const counts = new Map();
for (const d of dirty) {
  for (const p of d.problems) {
    const k = p.replace(/\[\.WebGL-[^\]]*\]/, '').slice(0, 120);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
}
for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${n}x ${k}`);
