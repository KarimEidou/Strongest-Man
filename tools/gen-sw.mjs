// Generates ../sw.js: walks the site files, hashes their contents into a cache
// version, and writes the service worker with a full relative-path precache
// list. Run before any commit that changes site files.
//
//   node tools/gen-sw.mjs
//
// The generated worker's shape, and why:
//
//  * VERSION is a content hash of every precached byte. Any asset change changes
//    it, which is what lets a worker recognise every cache that is not its own.
//
//  * Navigations are NETWORK-FIRST with a short timeout, not cache-first. Under
//    cache-first the HTML never updates from the network and a returning player
//    can only ever get a new build if the browser happens to notice sw.js itself
//    changed. The timeout is what keeps an offline cold launch instant: if the
//    network has not answered in NAV_TIMEOUT ms, the cached page is served and
//    the network copy, if it ever lands, refreshes the cache for next time.
//
//  * Everything else is cache-first, and the lookup is SCOPED to this worker's
//    own cache before it falls back to any other. caches.match() searches every
//    cache in creation order, and old caches are deliberately kept alive for a
//    while (below) — so an unscoped match would let the OLD cache shadow the new
//    one and serve the previous build's JS to the current build's page. The
//    unscoped search is still the fallback, because that is exactly what keeps
//    the page from the previous build working while it is still on screen.
//
//  * Every precache fetch uses {cache: 'reload'}, and so does the navigation's
//    network attempt. GitHub Pages serves with Cache-Control: max-age=600, and
//    cache.addAll() goes through the HTTP cache by default — so a worker
//    installing within ten minutes of a deploy would happily fill its BRAND NEW
//    cache with the PREVIOUS build's bytes, and the content-hash version name
//    would swear it was correct.
//
//  * skipWaiting IS called, and the old caches are NOT deleted with it. Those
//    two decisions go together, and the upgrade-path test (tools/test/upgrade.mjs)
//    is what forced them.
//
//    Without skipWaiting a new worker sits in `waiting` until every client
//    controlled by the old one is gone. A reload does not release a client, and
//    the currently deployed build has no update UI of its own to offer the
//    waiting worker — so the update reaches nobody. Measured: the test's steps
//    4, 5 and 6 all failed, with the new cache installed and the new build
//    unreachable.
//
//    Taking over immediately AND deleting the old cache in `activate` is the
//    other trap: the page still running is now controlled by a worker whose
//    cache no longer holds the assets that page will ask for next. Online it
//    falls through to the network; in airplane mode it simply breaks.
//
//    So: claim at once, and purge the old caches at the FIRST NAVIGATION this
//    worker handles — by which point the page reading the old cache is already
//    being replaced. A worker that starts with no window at all (a cold launch
//    after the app was closed) purges immediately, because there is nothing to
//    protect. js/main.js still offers the player a reload rather than yanking
//    them out of a session; this only makes sure the offer can be made at all.
//    This is the deliberate choice §9.1 asks for.
//
//  * Non-GET and cross-origin requests are not handled at all, so an opaque
//    response can never enter a cache.
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['index.html', 'manifest.webmanifest', 'favicon.png', 'css', 'js', 'vendor', 'assets'];
// Shipped by the asset pipeline but never requested at runtime. Precaching them
// costs every first-time visitor bytes for files the game does not open.
//   sky_equirect  — the sky is fully procedural (engine/sky.js)
//   art/sources   — a provenance record written by tools/import-art.mjs
//   CREDITS.md    — the attribution table; read on GitHub, not by the game
const EXCLUDE_PREFIX = [
  // iOS fetches an apple-touch-startup-image when it LAUNCHES the app, before
  // any page or worker exists, so these never pass through the fetch handler.
  // Precaching them is pure weight in every visitor's first load.
  'assets/splash/',
];
const EXCLUDE = [
  'assets/tex/sky_equirect.webp',
  'assets/art/sources.json',
  'assets/CREDITS.md',
];

const files = [];
function walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) { for (const f of readdirSync(p).sort()) walk(join(p, f)); }
  else files.push(p);
}
for (const inc of INCLUDE) { try { walk(join(root, inc)); } catch { /* absent early on */ } }
const rel = (f) => relative(root, f).split('\\').join('/');
const dropped = files.filter((f) => EXCLUDE.includes(rel(f))).length;
if (dropped !== EXCLUDE.length) {
  // an EXCLUDE entry that matches nothing is a stale path, and silently keeping
  // it would hide the day someone renames the file it was meant to skip
  console.error(`gen-sw: EXCLUDE matched ${dropped} of ${EXCLUDE.length} entries`);
  process.exit(1);
}
files.splice(0, files.length, ...files.filter((f) => {
  const r = rel(f);
  return !EXCLUDE.includes(r) && !EXCLUDE_PREFIX.some((p) => r.startsWith(p));
}));

// Every precached URL must exist in the DEPLOYED tree, and what deploys is what
// git has. cache.addAll() is all-or-nothing: a single 404 rejects the install
// and the worker never activates, so one file left untracked does not degrade
// the site, it removes offline play entirely and silently. This is cheap to
// check and impossible to notice by hand.
try {
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
      .toString().split('\0').filter(Boolean),
  );
  const missing = files.map(rel).filter((f) => !tracked.has(f));
  if (missing.length) {
    console.error('gen-sw: these precached files are not tracked in git, so a deploy '
      + 'would 404 them and cache.addAll() would reject:');
    for (const m of missing) console.error(`  ${m}`);
    process.exit(1);
  }
} catch (e) {
  if (e?.status === 1 && String(e.stderr || '').length === 0) throw e;
  if (!(e instanceof Error) || !/ENOENT|not a git repository/i.test(String(e))) throw e;
  console.error('gen-sw: not a git checkout, skipping the tracked-files check');
}

const hash = createHash('sha256');
for (const f of files) hash.update(readFileSync(f));
const version = `sm-${hash.digest('hex').slice(0, 10)}`;
const list = files.map((f) => `./${rel(f)}`);
const bytes = files.reduce((n, f) => n + statSync(f).size, 0);

// iOS storage quotas are not generous and an over-large precache fails silently
// mid-install, leaving a worker that is installed and useless offline.
const BUDGET = 25 * 1024 * 1024;
if (bytes > BUDGET) {
  console.error(`gen-sw: precache is ${(bytes / 1048576).toFixed(1)} MB, over the ${BUDGET / 1048576} MB budget`);
  process.exit(1);
}

const sw = `// generated by tools/gen-sw.mjs — do not edit by hand
const VERSION = '${version}';
const NAV_TIMEOUT = 2500;
const PRECACHE = ${JSON.stringify(['./', ...list], null, 1)};

// 'reload' bypasses the HTTP cache on the way out AND refreshes it on the way
// back, so nothing here can be a stale copy of the previous deploy.
const fresh = (u) => new Request(u, { cache: 'reload' });

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(PRECACHE.map(fresh)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// Deleting a cache a live page is still reading from is how an update breaks
// offline play. Deferred until the page that was reading it is on its way out.
let purged = false;
function purgeOldCaches() {
  if (purged) return Promise.resolve();
  purged = true;
  return caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('sm-') && k !== VERSION).map((k) => caches.delete(k)),
  ));
}

// Keep at most ONE old cache alive — the most recent, which is the only one a
// page still on screen can be reading from. Without this a standalone PWA that
// is launched once and left running collects a 5.4 MB cache per deploy, because
// the full purge waits for a navigation that may never come. caches.keys()
// returns creation order, so the last non-current entry is the newest.
function trimOldCaches() {
  return caches.keys().then((keys) => {
    const old = keys.filter((k) => k.startsWith('sm-') && k !== VERSION);
    return Promise.all(old.slice(0, -1).map((k) => caches.delete(k)));
  });
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    self.clients.claim()
      .then(() => self.clients.matchAll({ type: 'window' }))
      // no window open: nothing is reading the old cache, so take it now
      .then((cs) => (cs.length === 0 ? purgeOldCaches() : trimOldCaches())),
  );
});

// The page shell, network-first with a timeout. Whichever answers first wins; a
// network response that lands late still refreshes the cache for next launch.
async function navigate(req) {
  const cache = await caches.open(VERSION);
  // This worker's own cache first, then any other — the fallback is what keeps a
  // page from the previous build alive while it is still on screen.
  const shell = async () => (await cache.match('./index.html'))
    || (await cache.match('./'))
    || (await caches.match('./index.html'));

  const network = fetch(fresh(req.url))
    .then((res) => {
      // A 404 or a 502 is not a page. Serving one would replace a working
      // offline shell with an error document and then cache it as the index.
      if (res && res.ok && res.type === 'basic') {
        cache.put('./index.html', res.clone()).catch(() => {});
        return res;
      }
      return null;
    })
    .catch(() => null);

  const TIMED_OUT = Symbol('timeout');
  const first = await Promise.race([
    network,
    new Promise((r) => setTimeout(() => r(TIMED_OUT), NAV_TIMEOUT)),
  ]);
  if (first && first !== TIMED_OUT) return first;

  // Slow, offline, or an error status: serve what we have.
  const cached = await shell();
  if (cached) return cached;
  // Nothing cached at all (a first visit that raced the install). The network
  // request is already in flight; wait it out rather than failing early.
  return (await network) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Never touch a non-GET, and never touch another origin — that is what keeps
  // an opaque response out of every cache here.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // A navigation means whatever was reading the previous cache is being
    // replaced; this is the moment it is safe to reclaim the space.
    e.respondWith(navigate(req));
    e.waitUntil(purgeOldCaches());
    return;
  }
  e.respondWith(
    caches.open(VERSION)
      .then((c) => c.match(req, { ignoreSearch: true }))
      // Only then any other cache: that fallback is what keeps a page from the
      // previous build alive while it is still on screen.
      .then((hit) => hit || caches.match(req, { ignoreSearch: true }))
      .then((hit) => hit || fetch(req)),
  );
});
`;
writeFileSync(join(root, 'sw.js'), sw);
console.log(`sw.js written: ${version}, ${list.length} files, ${(bytes / 1048576).toFixed(2)} MB precached`);
