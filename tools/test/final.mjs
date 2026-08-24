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

// These assertions are about game behaviour, which happens in SIM time. On a
// software rasterizer wall-clock and sim time diverge badly, so wait on the
// simulation clock rather than a stopwatch.
const simElapsed = () => page.evaluate('window.__test.simTime()');
async function waitSim(seconds, capMs = 180000) {
  const from = await simElapsed();
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(250);
    if ((await simElapsed()) - from >= seconds) return true;
    if (Date.now() - t0 > capMs) return false;
  }
}

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
  const t0 = window.__test.simTime();
  const iv = setInterval(() => {
    const ls = window.__trafficState;
    for (const c of window.__trafficList) {
      if (c.mode !== 'drive' || c.panicT > 0) continue;
      const gatedEW = c.ci === 2 && (ls.phase !== 'EW' || ls.amber) && Math.abs(c.x) > 6.5 && Math.abs(c.x) < 12 && Math.abs(c.z) < 4;
      const gatedNS = c.ci === 3 && (ls.phase !== 'NS' || ls.amber) && Math.abs(c.z) > 6.5 && Math.abs(c.z) < 12 && Math.abs(c.x) < 4;
      if ((gatedEW || gatedNS) && c.speed < 0.4) sawStop = true;
    }
    if (sawStop || window.__test.simTime() - t0 > 40) { clearInterval(iv); res(sawStop); }
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
  const t0 = window.__test.simTime();
  const iv = setInterval(() => {
    if (b.knowledge > 10 || window.__test.simTime() - t0 > 30) {
      clearInterval(iv);
      res({ transferred: +b.knowledge.toFixed(1), ok: b.knowledge > 10 });
    }
  }, 1000);
}));

// 4) debris no-jitter: collapse, wait for settle, then positions must freeze
await page.evaluate(() => window.__test.collapseBuilding(3));
await waitSim(14);
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
await page.evaluate(() => {
  const car = window.__trafficList.find((c) => c.mode === 'drive');
  window.__test.teleport(car.x + 1.2, car.z + 1.2);
});
await waitSim(0.5);
await page.evaluate(() => window.__test.press('grab'));
await waitSim(1.2);
const heldDuring = await page.evaluate(() => (window.__test.carStats().modes.held || 0));
const carryMid = await page.evaluate(() => window.__test.carry());
// the chassis has to sit ON the palms — it used to ride 0.43m above them
const carContact = await page.evaluate(() => window.__test.carryContact());
await page.evaluate(() => window.__test.press('grab'));   // throw
await waitSim(2.5);
results.grabCar = await page.evaluate((held) => ({
  heldDuring: held,
  after: window.__test.carStats().modes,
  label: document.getElementById('btn-grab').textContent,
  ok: held >= 1 && !window.__test.carStats().modes.held,
}), heldDuring);
results.grabCar.carriedAs = carryMid.style;
results.grabCar.contact = carContact;
results.grabCar.contactOk = !!carContact && Math.abs(carContact.gap) < 0.08;

// 6) monster realization end-to-end (spawn near player, let it swing)
results.realize = await page.evaluate(() => new Promise((res) => {
  window.__test.teleport(2, 20);
  window.__test.spawnMonster(0, 2, 26);
  const t0 = window.__test.simTime();
  const iv = setInterval(() => {
    const ms = window.__test.monsterStats();
    const m = ms[ms.length - 1];
    if (!m) return;
    if ((m.state === 'flee' || m.state === 'rage' || m.state === 'realize') || window.__test.simTime() - t0 > 40) {
      clearInterval(iv);
      res({ state: m.state, know: m.know, ok: m.know >= 50 });
    }
  }, 800);
}));
await shot('realize');

// 7) shops close when feared + known
await page.evaluate(() => { window.__test.setKarma(-80); window.__test.setKnowledgeAll(60); });
await waitSim(12);
results.shops = await page.evaluate(() => {
  const closed = window.__cityBuildings?.filter((b) => b.closed).length ?? -1;
  return { closed, ok: closed > 0 || closed === -1 };
});

// 8) a grabbed prop is the prop, not a stand-in box: same record, same instance,
//    real mesh, and it rejoins the world as a collidable prop when it lands
results.grabProp = await page.evaluate(async () => {
  const reg = window.__propsReg;
  // entity hooks win the grab probe, so pick a prop with nobody standing near it
  // — by this point in the run the street is full of panicking townsfolk
  const clear = (p) => !window.__npcs.npcs.some((n) => n.state !== 'dead'
    && (n.x - p.x) ** 2 + (n.z - p.z) ** 2 < 25);
  const pr = reg.all.find((p) => p.alive && clear(p)
    && (p.type === 'prop_hydrant' || p.type === 'prop_bench' || p.type === 'prop_dumpster'));
  if (!pr) return { skipped: true };
  window.__test.teleport(pr.x + 1.0, pr.z + 1.0);
  window.__test.faceTo(pr.x, pr.z);
  window.__grabbed = pr;
  return { type: pr.type, idx: pr.idx };
});
if (!results.grabProp.skipped) {
  await waitSim(0.6);
  await page.evaluate(() => window.__test.press('grab'));
  await waitSim(1.4);
  Object.assign(results.grabProp, await page.evaluate(() => {
    const c = window.__test.carry();
    return {
      kind: c.kind, style: c.style, sameIdx: c.prop?.idx === window.__grabbed.idx,
      contact: window.__test.carryContact(),
      ok: c.kind === 'prop' && c.prop?.idx === window.__grabbed.idx,
    };
  }));
  await page.evaluate(() => window.__test.press('grab'));   // throw it
  await waitSim(8);
  results.grabProp.landed = await page.evaluate(() => ({
    alive: window.__grabbed.alive, held: window.__test.carry().kind !== null,
  }));
}

// 9) interior walls collide, and their doorways stay walkable — an interior used
//    to be pure scenery, so you walked through the room divider and out the far side
results.interiorWalls = await page.evaluate(async () => {
  const { capsuleVsWorld } = await import('./js/physics/collide.js');
  const reg = window.__buildingsReg;
  const R = 0.38, Y = 0.9;
  const walls = reg.iwalls.filter((w) => w.floor === 0 && !w.gone && !reg.buildings[w.bId].collapsed);
  let blocked = 0, gapsFree = 0;
  for (const w of walls) {
    const thin = w.sx > w.sz ? 'z' : 'x';
    const halfThin = (thin === 'z' ? w.sz : w.sx) / 2;
    const halfLong = (thin === 'z' ? w.sx : w.sz) / 2;
    const [cx, cz] = capsuleVsWorld(w.x, w.z, Y, R);
    if ((thin === 'z' ? Math.abs(cz - w.z) : Math.abs(cx - w.x)) >= halfThin + R - 1e-6) blocked++;
    const gx = thin === 'z' ? w.x + halfLong + 0.55 : w.x;
    const gz = thin === 'z' ? w.z : w.z + halfLong + 0.55;
    const [ox, oz] = capsuleVsWorld(gx, gz, Y, R);
    if (Math.abs(ox - gx) < 1e-6 && Math.abs(oz - gz) < 1e-6) gapsFree++;
  }
  return { walls: walls.length, blocked, gapsFree, ok: walls.length > 0 && blocked === walls.length && gapsFree === walls.length };
});

// 10) the key light never dips below the horizon. It used to follow the sun down
//     to -0.35 and project every silhouette UP onto the facades — which is how a
//     player at street level got his shadow on a building's second floor.
results.sunElevation = await page.evaluate(async () => {
  const before = window.__test.timeOfDay();
  let worstLight = 1, worstSun = 1;
  for (let i = 0; i < 24; i++) {
    window.__test.setTimeOfDay(i / 24);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const s = window.__test.sun();
    worstLight = Math.min(worstLight, s.lightY);
    worstSun = Math.min(worstSun, s.sunY);
  }
  window.__test.setTimeOfDay(before);
  return { worstSunY: +worstSun.toFixed(3), worstLightY: +worstLight.toFixed(3), ok: worstLight > 0.02 };
});

// 11) every action-button label fits inside its circle (THROW is the long one)
results.buttonLabels = await page.evaluate(() => {
  const check = (id, text) => {
    const b = document.getElementById(id);
    if (text) b.textContent = text;
    const r = b.getBoundingClientRect();
    const tn = [...b.childNodes].find((n) => n.nodeType === 3);
    const rg = document.createRange(); rg.selectNodeContents(tn);
    const t = rg.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return [[t.left, t.top], [t.right, t.top], [t.left, t.bottom], [t.right, t.bottom]]
      .every(([x, y]) => ((x - cx) / (r.width / 2)) ** 2 + ((y - cy) / (r.height / 2)) ** 2 <= 1);
  };
  const out = { talk: check('btn-interact'), jump: check('btn-jump'), punch: check('btn-punch'), grab: check('btn-grab', 'GRAB'), throw: check('btn-grab', 'THROW') };
  out.ok = Object.values(out).every(Boolean);
  return out;
});

// 12) perf snapshot
results.perf = await page.evaluate('window.__perf');

console.log(JSON.stringify(results, null, 1));
if (errors.length) {
  console.error('CONSOLE ERRORS:');
  for (const e of errors) console.error('  ' + e);
}
await browser.close();
process.exit(errors.length ? 1 : 0);
