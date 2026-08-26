import { chromium } from 'playwright-core';
import { readdirSync } from 'fs';
import { join } from 'path';
function findChrome() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      try { readdirSync(join(base, d, 'chrome-linux')); return p; } catch {}
    }
  }
  throw new Error('no chromium');
}
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 956, height: 440 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:8080/Strongest-Man/${process.env.URLQ || '?autoplay=1&seed=42'}`, { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: Number(process.env.BOOT_MS || 120000) });
} catch (e) {
  console.log('BOOT TIMEOUT');
  console.log('loading msg:', await page.evaluate(() => document.getElementById('loading-msg')?.textContent));
  console.log('CONSOLE:', JSON.stringify(errors, null, 2));
  await browser.close();
  process.exit(1);
}
const script = process.argv[2] || 'null';
const out = await page.evaluate(`(async () => { ${script} })()`);
console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('CONSOLE ERRORS:', JSON.stringify(errors, null, 2));
await browser.close();
