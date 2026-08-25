// Screenshot + assertion driver used at every phase gate.
//   node test/shot.mjs <name> [urlSuffix] [waitMs] [script]
// Boots the page at iPhone-17-Pro-Max-landscape viewport, fails on any console
// error, optionally evaluates `script` after load, saves a screenshot, prints
// __perf. Exits non-zero on console/page errors so phases can't pass dirty.
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'shots'), { recursive: true });

const [name = 'shot', suffix = '?autoplay=1&seed=42', waitMs = '2500', script = ''] = process.argv.slice(2);

function findChrome() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      try { readdirSync(join(base, d, 'chrome-linux')); return p; } catch { /* keep looking */ }
    }
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const vw = parseInt(process.env.VW || '956', 10), vh = parseInt(process.env.VH || '440', 10);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });

const errors = [];
// A stubbed 4xx/5xx makes chromium log "Failed to load resource" on the console.
// That is the browser reporting a status code, not the application throwing, and
// the whole point of the 401/429 modes is to exercise those statuses — so the
// network log is not an error when we asked for it.
// The URL is not in the message text, only in its location.
const stubNoise = (m) => process.env.GROQSTUB
  && /Failed to load resource/.test(m.text())
  && /groq/i.test(`${m.text()} ${m.location()?.url || ''}`);
page.on('console', (m) => { if (m.type() === 'error' && !stubNoise(m)) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// GROQSTUB=ok|slow|401|429|dead fakes api.groq.com so client behaviour is
// testable offline. The client probes /models once a session to resolve a live
// model id, so the stub has to answer that too or every mode degrades into the
// no-catalogue path and the test measures the wrong thing.
//   ok    200, instantly            — the live path, end to end
//   slow  200 after 3s              — the pending "…" and the 15s budget
//   401   rejected key              — must be reported, never backed off
//   429   rate limited              — must back off the BARKS only
//   dead  404 on the first model id — must walk the list inside one turn
let groqCalls = 0;
const STUB_LINE = 'Stubbed line from the model.';
if (process.env.GROQSTUB) {
  const mode = process.env.GROQSTUB;
  await page.route('**/api.groq.com/**', async (route) => {
    groqCalls++;
    const url = route.request().url();
    if (url.includes('/models')) {
      if (mode === '401') { await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid API Key' } }) }); return; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'llama-3.1-8b-instant' }] }),
      });
      return;
    }
    if (mode === '429') { await route.fulfill({ status: 429, headers: { 'retry-after': '30' }, contentType: 'application/json', body: '{}' }); return; }
    if (mode === '401') { await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid API Key' } }) }); return; }
    if (mode === 'dead' && groqCalls < 3) { await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { message: 'model_not_found' } }) }); return; }
    if (mode === 'slow') await new Promise((res) => setTimeout(res, 3000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: STUB_LINE } }] }),
    });
  });
  await page.addInitScript(() => { try { localStorage.setItem('sm_groq_key', 'gsk_test'); } catch {} });
}

await page.goto(`http://127.0.0.1:8080/Strongest-Man/${suffix}`, { waitUntil: 'load' });
try {
  await page.waitForFunction('window.__ready === true', null, { timeout: 20000 });
} catch {
  errors.push('window.__ready never became true');
}

// OFFLINE=1: let the SW finish precaching, cut the network, reload — the game
// must boot entirely from cache (the Home Screen offline scenario).
if (process.env.OFFLINE) {
  await page.waitForTimeout(6000);
  await page.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false);
  await page.waitForTimeout(3000); // let precaching finish
  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction('window.__ready === true', null, { timeout: 25000 });
    console.log('OFFLINE RELOAD OK');
  } catch {
    errors.push('offline reload failed: __ready never true');
  }
}
await page.waitForTimeout(parseInt(waitMs, 10));

let scriptResult = null;
if (script) {
  scriptResult = await page.evaluate(script);
  await page.waitForTimeout(600);
}

const perf = await page.evaluate('window.__perf');
await page.screenshot({ path: join(here, 'shots', `${name}.png`) });
await browser.close();

console.log('PERF', JSON.stringify(perf));
if (scriptResult !== null && scriptResult !== undefined) console.log('SCRIPT', JSON.stringify(scriptResult));
if (errors.length) {
  console.error('CONSOLE/PAGE ERRORS:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`OK shots/${name}.png`);
