// Metrics and the leak check.
//
//   node tools/test/metrics.mjs                       measure the working tree
//   node tools/test/metrics.mjs --ref <git-ref>       measure an older build
//
// Two things, because they want the same boot:
//
// 1. A SNAPSHOT — time to interactive, draw calls, triangles, geometry and
//    texture counts, program count, transfer size, and the frame budget split by
//    system. Absolute fps is deliberately NOT reported: there is no GPU in this
//    container and every frame is rasterized in software, so it would be a
//    number about SwiftShader. Everything here is either a count or CPU-side and
//    means the same thing on a phone.
//
// 2. A LEAK CHECK — twenty scene load/unload cycles, then twenty rounds of heavy
//    destruction, with renderer.info.memory and the JS heap read at each step.
//    A geometry or texture count that climbs across cycles is the #1 cause of a
//    WebGL app being killed on iOS, and it is invisible in any screenshot.
//
//    "Every scene, twenty times" needs saying carefully for this game: the city
//    is generated once at boot and there is no level select. The gallery IS
//    built as a unit and torn down as one, so it is what the cycle uses — it
//    covers merged geometry, canvas textures, image textures, materials and a
//    whole object graph, which is the shape of the thing being tested.
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { execFileSync } from 'child_process';
import { readFile } from 'fs/promises';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, extname, normalize, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const refIdx = process.argv.indexOf('--ref');
const REF = refIdx >= 0 ? process.argv[refIdx + 1] : null;
const PREFIX = '/Strongest-Man';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.md': 'text/markdown',
};

let serveRoot = root;
let temp = null;
if (REF) {
  temp = mkdtempSync(join(tmpdir(), 'sm-metrics-'));
  execFileSync('bash', ['-c',
    `git -C ${JSON.stringify(root)} archive ${REF} | tar -x -C ${JSON.stringify(temp)}`]);
  serveRoot = temp;
  console.log(`measuring ${REF}`);
} else {
  console.log('measuring the working tree');
}

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(`${PREFIX}/`) && p !== PREFIX) { res.writeHead(404); res.end(); return; }
    p = p.slice(PREFIX.length) || '/';
    if (p === '/') p = '/index.html';
    const file = normalize(join(serveRoot, p));
    if (!file.startsWith(serveRoot)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    // Content-Length, so the transfer total below is a real number. Without it
    // every response measured as 0 and the "total transfer" line was a lie.
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'content-length': data.length,
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}${PREFIX}/`;

function findChrome() {
  for (const d of readdirSync('/opt/pw-browsers')) {
    if (d.startsWith('chromium') && !d.includes('headless_shell')) {
      const p = join('/opt/pw-browsers', d, 'chrome-linux', 'chrome');
      try { readdirSync(join('/opt/pw-browsers', d, 'chrome-linux')); return p; } catch { /* keep looking */ }
    }
  }
  throw new Error('chromium not found');
}

// what the site weighs on disk, which is what a first visit downloads
function payload(dir) {
  let bytes = 0, biggest = { path: '', bytes: 0 }, count = 0;
  const skip = new Set(['tools', '.git', 'screenshots', 'docs', 'node_modules']);
  const walk = (p, rel) => {
    for (const f of readdirSync(p)) {
      if (rel === '' && skip.has(f)) continue;
      if (f.startsWith('.') && f !== '.nojekyll') continue;
      const full = join(p, f);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, rel ? `${rel}/${f}` : f);
      else if (!f.endsWith('.md')) {
        bytes += st.size; count++;
        if (st.size > biggest.bytes) biggest = { path: rel ? `${rel}/${f}` : f, bytes: st.size };
      }
    }
  };
  walk(dir, '');
  return { totalMB: +(bytes / 1048576).toFixed(2), files: count, biggest };
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 });

const transfer = { bytes: 0, requests: 0 };
page.on('response', async (r) => {
  transfer.requests++;
  try { transfer.bytes += Number((await r.headerValue('content-length')) || 0); } catch { /* fine */ }
});
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(String(e)));
page.on('requestfailed', (r) => problems.push(`${r.url()} ${r.failure()?.errorText}`));

const t0 = Date.now();
await page.goto(`${ORIGIN}?autoplay=1&seed=42&prof=1&time=0.70`, { waitUntil: 'load' });
await page.waitForFunction('window.__READY__ === true || window.__ready === true', null, { timeout: 300000 });
const tti = Date.now() - t0;

await page.waitForTimeout(2500);
const snap = await page.evaluate(async () => {
  const m = await import('./js/main.js');
  const info = m.renderer.info;
  const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs ? info.programs.length : null,
    pixelRatio: m.renderer.getPixelRatio(),
    heapMB: heap,
    perf: window.__perf,
    profile: window.__test.profile ? window.__test.profile() : null,
  };
});

// ---- the museum's own cost, measured against the same viewpoint ------------
const museumCost = await page.evaluate(async () => {
  if (!window.__test.museum) return null;
  const m = await import('./js/main.js');
  const mus = window.__test.museum();
  const read = () => ({ calls: m.renderer.info.render.calls, tris: m.renderer.info.render.triangles });
  window.__test.warpTo(3.0, mus.door.z, Math.PI / 2);
  window.__test.step(0.5);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const outside = read();
  window.__test.warpTo(-14.0, 20.0, Math.PI / 2);
  window.__test.step(0.5);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const inside = read();
  return { outside, inside };
});

// ---- leak check -------------------------------------------------------------
const leak = await page.evaluate(async () => {
  const m = await import('./js/main.js');
  const read = () => ({
    geometries: m.renderer.info.memory.geometries,
    textures: m.renderer.info.memory.textures,
    programs: m.renderer.info.programs ? m.renderer.info.programs.length : 0,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  });
  const out = { supported: typeof window.__test.museumCycle === 'function', samples: [] };
  if (!out.supported) return out;

  const before = read();
  for (let i = 0; i < 20; i++) {
    // eslint-disable-next-line no-await-in-loop
    await window.__test.museumCycle();
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (i === 0 || i === 9 || i === 19) out.samples.push({ cycle: i + 1, ...read() });
  }
  if (window.gc) window.gc();
  await new Promise((r) => setTimeout(r, 500));
  const after = read();

  // and twenty whole buildings brought down, which is what actually churns:
  // hundreds of debris bodies created, slept, reclaimed and re-instanced.
  const destroyBefore = read();
  for (let i = 0; i < 20; i++) {
    window.__test.collapseBuilding(i);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 60));   // the dynamic import resolves
    window.__test.step(1.5);
  }
  window.__test.step(20);        // let everything settle and sleep
  if (window.gc) window.gc();
  await new Promise((r) => setTimeout(r, 500));
  const destroyAfter = read();

  return {
    ...out,
    before,
    after,
    geomDelta: after.geometries - before.geometries,
    texDelta: after.textures - before.textures,
    heapDelta: before.heapMB != null ? +(after.heapMB - before.heapMB).toFixed(1) : null,
    destroyBefore,
    destroyAfter,
  };
});

await browser.close();
server.close();
const disk = payload(serveRoot);
if (temp) rmSync(temp, { recursive: true, force: true });

const noise = /KHR_parallel_shader_compile|Service Worker registration blocked/;
const realProblems = [...new Set(problems.filter((p) => !noise.test(p)))];

console.log(JSON.stringify({
  ref: REF || 'working tree',
  timeToInteractiveMs: tti,
  transfer: { requests: transfer.requests, MB: +(transfer.bytes / 1048576).toFixed(2) },
  payloadOnDisk: disk,
  snapshot: snap,
  museumCost,
  leak,
  consoleProblems: realProblems.slice(0, 12),
  consoleProblemCount: realProblems.length,
}, null, 1));
