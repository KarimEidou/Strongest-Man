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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// GROQSTUB=slow|429 fakes api.groq.com so client behavior is testable offline
let groqCalls = 0;
if (process.env.GROQSTUB) {
  await page.route('**/api.groq.com/**', async (route) => {
    groqCalls++;
    if (process.env.GROQSTUB === '429') {
      await route.fulfill({ status: 429, headers: { 'retry-after': '30' }, body: '{}' });
      return;
    }
    await new Promise((res) => setTimeout(res, 3000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'Stubbed line from the model.' } }] }),
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
