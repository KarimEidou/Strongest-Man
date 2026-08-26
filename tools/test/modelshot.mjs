// Screenshot the model viewer: node tools/test/modelshot.mjs <out> <models,csv> [view] [dist]
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'shots'), { recursive: true });
function findChrome() {
  for (const d of readdirSync('/opt/pw-browsers')) {
    if (!d.startsWith('chromium')) continue;
    try { readdirSync(join('/opt/pw-browsers', d, 'chrome-linux')); return join('/opt/pw-browsers', d, 'chrome-linux', 'chrome'); } catch { /* next */ }
  }
  throw new Error('chromium not found');
}
const [out = 'models', models = '', view = 'iso', dist = '0', gap = '0'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 620 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:8080/Strongest-Man/tools/test/viewer.html?m=${models}&view=${view}&d=${dist}&gap=${gap}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
console.log(await page.evaluate(() => document.getElementById('lab').textContent));
await page.screenshot({ path: join(here, 'shots', `${out}.png`) });
if (errs.length) console.log('ERRORS', errs);
await browser.close();
