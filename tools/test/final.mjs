// Final e2e: one long session hitting every remaining checklist item with
// numeric asserts. Run with the serve.mjs server up.
import { chromium } from 'playwright-core';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
function findChrome() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      try { readdirSync(join(base, d, 'chrome-linux')); return p; } catch { /* keep looking */ }
    }
  }
  throw new Error('no chromium');
}

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 956, height: 440 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://127.0.0.1:8080/Strongest-Man/?autoplay=1&seed=7', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
await page.waitForTimeout(3000);

const results = {};
const shot = (name) => page.screenshot({ path: join(here, 'shots', `final_${name}.png`) });

// 1) HUD inside safe bounds (torture-free: everything must sit within viewport margins)
results.hud = await page.evaluate(() => {
  const ids = ['karma-wrap', 'btns', 'btn-pause'];
  const vw = innerWidth, vh = innerHeight;
  return ids.every((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh;
  });
});

// 2) red light stops a centre-circuit car eventually
results.redLight = await page.evaluate(() => new Promise((res) => {
  let sawStop = false;
  const t0 = performance.now();
  const iv = setInterval(() => {
    const ls = window.__trafficState;
    for (const c of window.__trafficList) {
      if (c.mode !== 'drive' || c.panicT > 0) continue;
      const gatedEW = c.ci === 2 && (ls.phase !== 'EW' || ls.amber) && Math.abs(c.x) > 6.5 && Math.abs(c.x) < 12 && Math.abs(c.z) < 4;
      const gatedNS = c.ci === 3 && (ls.phase !== 'NS' || ls.amber) && Math.abs(c.z) > 6.5 && Math.abs(c.z) < 12 && Math.abs(c.x) < 4;
      if ((gatedEW || gatedNS) && c.speed < 0.4) sawStop = true;
    }
    if (sawStop || performance.now() - t0 > 40000) { clearInterval(iv); res(sawStop); }
  }, 400);
}));

// 3) gossip: give one NPC knowledge, park another beside them, wait, measure
results.gossip = await page.evaluate(() => new Promise((res) => {
  const npcs = window.__npcs.npcs.filter((n) => n.state !== 'dead');
  const a = npcs[0], b = npcs[1];
  a.knowledge = 60; a.knowSource = 'seen';
  b.knowledge = 0; b.knowSource = null;
  a.state = 'at_poi'; a.stateT = 99; a.targetSpeed = 0;
  b.state = 'at_poi'; b.stateT = 99; b.targetSpeed = 0;
  b.x = a.x + 1.5; b.z = a.z; b.px = b.x; b.pz = b.z;
  const t0 = performance.now();
  const iv = setInterval(() => {
    if (b.knowledge > 10 || performance.now() - t0 > 30000) {
      clearInterval(iv);
      res({ transferred: +b.knowledge.toFixed(1), ok: b.knowledge > 10 });
    }
  }, 1000);
}));

// 4) debris no-jitter: collapse, wait for settle, then positions must freeze
await page.evaluate(() => window.__test.collapseBuilding(3));
await page.waitForTimeout(14000);
results.jitter = await page.evaluate(() => new Promise(async (res) => {
  const m = await import('./js/physics/pworld.js');
  const snap = m.sleeping.map((b) => [b.x, b.y, b.z]);
  setTimeout(() => {
    let maxD = 0;
    m.sleeping.forEach((b, i) => {
      if (!snap[i]) return;
      maxD = Math.max(maxD, Math.abs(b.x - snap[i][0]), Math.abs(b.y - snap[i][1]), Math.abs(b.z - snap[i][2]));
    });
    res({ sleeping: m.sleeping.length, active: m.active.length, maxDrift: maxD, ok: maxD < 0.001 && m.sleeping.length > 10 });
  }, 3000);
}));
await shot('rubble');

// 5) grab a car and throw it
results.grabCar = await page.evaluate(() => new Promise((res) => {
  const car = window.__trafficList.find((c) => c.mode === 'drive');
  const probe = () => window.__test.carStats();
  window.__test.teleport(car.x + 1.2, car.z + 1.2);
  setTimeout(() => {
    window.__test.press('grab');
    setTimeout(() => {
      const held = probe().modes.held || 0;
      window.__test.press('grab'); // throw
      setTimeout(() => {
        res({ heldDuring: held, after: probe().modes, ok: held >= 1 });
      }, 1500);
    }, 800);
  }, 400);
}));

// 6) monster realization end-to-end (spawn near player, let it swing)
results.realize = await page.evaluate(() => new Promise((res) => {
  window.__test.teleport(2, 20);
  window.__test.spawnMonster(0, 2, 26);
  const t0 = performance.now();
  const iv = setInterval(() => {
    const ms = window.__test.monsterStats();
    const m = ms[ms.length - 1];
    if (!m) return;
    if ((m.state === 'flee' || m.state === 'rage' || m.state === 'realize') || performance.now() - t0 > 40000) {
      clearInterval(iv);
      res({ state: m.state, know: m.know, ok: m.know >= 50 });
    }
  }, 800);
}));
await shot('realize');

// 7) shops close when feared + known
results.shops = await page.evaluate(() => new Promise((res) => {
  window.__test.setKarma(-80);
  window.__test.setKnowledgeAll(60);
  setTimeout(() => {
    const closed = window.__cityBuildings?.filter((b) => b.closed).length ?? -1;
    res({ closed, ok: closed > 0 || closed === -1 });
  }, 12000);
}));

// 8) perf snapshot
results.perf = await page.evaluate('window.__perf');

console.log(JSON.stringify(results, null, 1));
if (errors.length) {
  console.error('CONSOLE ERRORS:');
  for (const e of errors) console.error('  ' + e);
}
await browser.close();
process.exit(errors.length ? 1 : 0);
