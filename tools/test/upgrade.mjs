// The upgrade-path test (§9.2). This is the one that decides whether a deploy is
// real: a returning player already has a service worker holding a full precache
// of the OLD build, and if the new one cannot reach them the deploy has not
// happened, however good the new build looks on a fresh install.
//
//   node tools/test/upgrade.mjs [oldRef]
//
// It serves the old build and the new build from the SAME origin and port, which
// is exactly what a Pages deploy does, and switches between them mid-run.
//
// Steps, in order:
//   1  serve OLD, load it, wait for the worker to control the page
//   2  go offline, reload — the old build must still boot from cache
//   3  come back online, switch the server to NEW
//   4  reload — the new build must be live, and this must work even though the
//      OLD build has no update UI of its own. That asymmetry is the whole
//      difficulty: whatever is already deployed cannot be changed.
//   5  the old cache is gone and the new one is complete
//   6  go offline again and reload — the NEW build must boot from cache
//   7  deploy a NEWER build on top and reload: now the page DOES have update UI,
//      so it must offer the reload rather than take it, and taking it must land
//      on the newer build
//
// Exits non-zero, loudly, on the first step that does not hold.
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { execFileSync } from 'child_process';
import { readFile } from 'fs/promises';
import { mkdtempSync, rmSync, readdirSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, extname, normalize, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const OLD_REF = process.argv[2] || 'origin/pre-overhaul-2026-08-26';
// A fixed port makes two runs collide with EADDRINUSE and interleave their
// output into something unreadable. Ask the OS for a free one instead.
const PORT = Number(process.env.UPGRADE_PORT || 0);
const PREFIX = '/Strongest-Man';
let ORIGIN = '';   // set once the server has a port

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.md': 'text/markdown',
};

// ---- lay the old build out on disk -----------------------------------------
const work = mkdtempSync(join(tmpdir(), 'sm-upgrade-'));
const oldRoot = join(work, 'old');
mkdirSync(oldRoot, { recursive: true });
let resolvedRef = OLD_REF;
try {
  execFileSync('git', ['rev-parse', '--verify', `${OLD_REF}^{commit}`], { cwd: repo, stdio: 'pipe' });
} catch {
  // the tag push is blocked on this remote (see BLOCKERS.md); fall back to the
  // commit the branch was cut from so the test still has a real old build
  resolvedRef = execFileSync('git', ['rev-list', '--max-parents=0', 'HEAD'], { cwd: repo })
    .toString().trim().split('\n')[0];
  console.error(`! ${OLD_REF} not found; falling back to ${resolvedRef}`);
}
execFileSync('bash', ['-c',
  `git -C ${JSON.stringify(repo)} archive ${resolvedRef} | tar -x -C ${JSON.stringify(oldRoot)}`]);
console.log(`old build: ${resolvedRef} -> ${oldRoot}`);

// ---- swappable static server ------------------------------------------------
let ROOT = oldRoot;
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(`${PREFIX}/`) && p !== PREFIX) { res.writeHead(404); res.end(); return; }
    p = p.slice(PREFIX.length) || '/';
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      // no-store on everything, so what the test observes is the service worker's
      // behaviour and never the HTTP cache's
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
ORIGIN = `http://127.0.0.1:${server.address().port}${PREFIX}/`;
console.log(`serving at ${ORIGIN}`);

function findChrome() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium') && !d.includes('headless_shell')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      try { readdirSync(join(base, d, 'chrome-linux')); return p; } catch { /* keep looking */ }
    }
  }
  throw new Error('chromium not found');
}

const steps = [];
let failed = false;
function check(name, ok, detail = '') {
  steps.push({ name, ok: !!ok, detail });
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
// one persistent context: the whole point is that the worker and its cache
// survive from step to step, exactly as they do on a player's phone
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// Named, because a bare "waitForFunction timed out" tells you nothing about
// which of the eight boots in this run was the one that hung.
let bootLabel = 'initial';
const boot = async (timeout = 240000) => {
  const t0 = Date.now();
  try {
    await page.waitForFunction(
      'window.__READY__ === true || window.__ready === true', null, { timeout },
    );
  } catch (e) {
    const st = await page.evaluate(`(async () => ({
      url: location.href,
      caches: await caches.keys(),
      controller: navigator.serviceWorker.controller ? 'yes' : 'no',
      loadingMsg: document.getElementById('loading-msg')?.textContent ?? null,
      readyFlags: [window.__ready === true, window.__READY__ === true],
    }))()`).catch((x) => ({ evaluateFailed: String(x).split('\n')[0] }));
    console.error(`\n! boot "${bootLabel}" never became ready (${Date.now() - t0} ms)`);
    console.error(`  ${JSON.stringify(st)}`);
    throw e;
  }
};
const controlled = () => page.evaluate(
  'navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller)',
);
const cacheNames = () => page.evaluate('caches.keys()');

try {
  // ---- 1: old build, worker installed and controlling ----------------------
  await page.goto(`${ORIGIN}?autoplay=1&seed=42`, { waitUntil: 'load' });
  bootLabel = '1: first load of the old build';
  await boot();
  await page.waitForFunction('navigator.serviceWorker.controller !== null', null, { timeout: 60000 })
    .catch(() => {});
  // the first load registers the worker but is not yet controlled by it; one
  // reload is what a returning player does anyway
  await page.reload({ waitUntil: 'load' });
  bootLabel = '1: reload into worker control';
  await boot();
  check('1. old build installs a service worker and controls the page', await controlled());
  const oldCaches = await cacheNames();
  check('1b. old build precached', oldCaches.length > 0, oldCaches.join(', '));

  // ---- 2: offline, old build still boots -----------------------------------
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  bootLabel = '2: offline, old build';
  await boot();
  check('2. old build boots offline from its precache', true);

  // ---- 3: deploy the new build --------------------------------------------
  await ctx.setOffline(false);
  ROOT = repo;
  console.log('server switched to the new build');

  // ---- 4: the new build reaches a player who had the old one --------------
  // ONE reload can never be enough here and that is not a defect in the new
  // build: the worker already installed is cache-first for navigations, so
  // reload #1 is always served the old HTML whatever the new build does. The
  // most any new build can do is install during that load and be there for the
  // next one. §9.2 asks for exactly this — reload, reload again — so two is the
  // number to hold to, and three would be a regression.
  const swVersion = await (await fetch(`${ORIGIN}sw.js`)).text()
    .then((t) => (t.match(/const VERSION = '([^']+)'/) || [])[1]);

  // Wait for the cache to be POPULATED, not merely to exist.
  //
  // caches.open(VERSION) creates the cache the instant the worker starts
  // installing, so a poll on caches.keys() returns true before addAll has put a
  // single file in it. Reloading then lands mid-precache: the page's own ~130
  // requests queue behind 121 concurrent {cache:'reload'} fetches through the
  // same worker, and boot takes long enough that the app's own stall watchdog
  // fires. That is the test creating the condition and then failing on it.
  //
  // index.html is the last thing to be missing and the first thing a navigation
  // needs, so its presence is the honest signal that the install is done.
  //
  // A plain poll, not waitForFunction: the predicate has to await caches.match(),
  // and a promise-returning expression is not something waitForFunction's poller
  // can be relied on to resolve — it timed out for three minutes at a time while
  // the cache had in fact appeared within five seconds.
  const waitForCache = async (name, ms = 120000) => {
    const t0 = Date.now();
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const ready = await page.evaluate(`(async () => {
        const keys = await caches.keys();
        if (!keys.includes(${JSON.stringify(name)})) return false;
        const c = await caches.open(${JSON.stringify(name)});
        return !!(await c.match('./index.html'));
      })()`);
      if (ready) return true;
      if (Date.now() - t0 > ms) return false;
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(1000);
    }
  };

  let reloads = 0;
  let hasMuseum = false;
  for (let i = 0; i < 3 && !hasMuseum; i++) {
    await page.reload({ waitUntil: 'load' });
    reloads++;
    bootLabel = `4: reload ${reloads} after the deploy`;
    await boot();
    hasMuseum = await page.evaluate('typeof window.__test?.museum === "function"');
    if (!hasMuseum) await waitForCache(swVersion);
  }
  check('4. the new build reaches a player who had the old one installed',
    hasMuseum && reloads <= 2, `reloads needed: ${reloads} (limit 2)`);
  const after = await cacheNames();
  check('5. exactly one cache survives, and it is the new one',
    after.length === 1 && after[0] === swVersion, `caches=[${after.join(', ')}] sw=${swVersion}`);

  const fresh = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    const reqs = await c.keys();
    return reqs.map((r) => new URL(r.url).pathname)
      .filter((p) => p.includes('/js/world/museum.js') || p.includes('/assets/art/')).length;
  });
  check('5b. new-build-only assets are in the surviving cache', fresh >= 5, `matched=${fresh}`);

  // ---- 6: offline again, on the new build ---------------------------------
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await boot();
  const offlineMuseum = await page.evaluate('typeof window.__test?.museum === "function"');
  check('6. the NEW build boots offline from its precache', offlineMuseum);
  await ctx.setOffline(false);

  // ---- 7: new -> newer, where the page DOES have update UI ----------------
  // A second deploy on top of a build that can talk to the player: it must be
  // OFFERED, not forced, and accepting must land on the newer build.
  const newerRoot = join(work, 'newer');
  mkdirSync(newerRoot, { recursive: true });
  // Copy the SITE, not the repository. `cp -a` of the whole tree pulls in
  // screenshots/final (622 PNGs, ~600 MB) and tools/node_modules, which is most
  // of a gigabyte of irrelevant IO in the middle of a timing-sensitive test.
  // This is the same set tools/gen-sw.mjs precaches, plus what it needs to run.
  const SITE = ['index.html', 'manifest.webmanifest', 'favicon.png', '.nojekyll',
    'css', 'js', 'vendor', 'assets', 'sw.js', 'tools/gen-sw.mjs', 'tools/package.json'];
  execFileSync('bash', ['-c',
    `cd ${JSON.stringify(repo)} && mkdir -p ${JSON.stringify(newerRoot)}/tools && `
    + SITE.map((f) => `cp -a --parents ${JSON.stringify(f)} ${JSON.stringify(newerRoot)}/`).join(' && ')]);
  // one byte of real difference, so the content hash and the worker both change
  execFileSync('bash', ['-c',
    `printf '\n// upgrade-path probe\nwindow.__UPGRADE_PROBE__ = true;\n' >> ${JSON.stringify(newerRoot)}/js/core/version.js`
    + ` && cd ${JSON.stringify(newerRoot)} && node tools/gen-sw.mjs >/dev/null`]);
  ROOT = newerRoot;
  console.log('server switched to a NEWER build');

  await page.reload({ waitUntil: 'load' });
  await boot();
  const banner = page.locator('#update-banner');
  let offered = false;
  try { await banner.waitFor({ state: 'visible', timeout: 90000 }); offered = true; } catch { /* below */ }
  check('7. a newer build is OFFERED to the player, not forced on them', offered);

  if (offered) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 120000 }).catch(() => {}),
      banner.click(),
    ]);
    await boot();
  }
  const onNewer = await page.evaluate('window.__UPGRADE_PROBE__ === true');
  check('7b. accepting the offer lands on the newer build', onNewer);

  const finalCaches = await cacheNames();
  const newerVersion = await (await fetch(`${ORIGIN}sw.js`)).text()
    .then((t) => (t.match(/const VERSION = '([^']+)'/) || [])[1]);
  check('7c. only the newest cache is left', finalCaches.length === 1 && finalCaches[0] === newerVersion,
    `caches=[${finalCaches.join(', ')}] sw=${newerVersion}`);

  check('8. no uncaught page errors across the whole upgrade', errors.length === 0,
    errors.slice(0, 3).join(' | '));
} catch (e) {
  check('run completed', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
  server.close();
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n${steps.filter((s) => s.ok).length}/${steps.length} checks passed`);
process.exit(failed ? 1 : 0);
