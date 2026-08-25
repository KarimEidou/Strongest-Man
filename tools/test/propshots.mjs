// One-session screenshot sweep of the procedural street props + cars.
// Boots once (SwiftShader boots are slow), then frames each prop kind via
// __test.lookFrom and screenshots. Fails on any console/page error.
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'shots'), { recursive: true });

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
const page = await browser.newPage({ viewport: { width: 956, height: 440 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://127.0.0.1:8080/Strongest-Man/?autoplay=1&seed=42&nogroq=1&nomonsters=1', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
await page.waitForTimeout(1500);

async function shot(name, script) {
  const r = await page.evaluate(script);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(here, 'shots', `${name}.png`) });
  console.log(name, JSON.stringify(r));
}

// pick prop helper injected once
// Returns null rather than undefined when a seed happens to place none of a
// type: l[Math.min(i, -1)] is l[-1], and every caller then died on p.x, taking
// the rest of the run down with it.
await page.evaluate(`window.__pick = (type, i=0) => {
  const l = window.__propsReg.types[type].list.filter(p => p.alive);
  return l.length ? l[Math.min(i, l.length-1)] : null;
}`);

await shot('pp-lamp', `(() => {
  const p = __pick('prop_streetlamp', 2);
  if (!p) return 'none placed at this seed';
  __test.lookFrom(p.x + 6.5, 3.4, p.z + 5.5, p.x, 2.6, p.z);
  return { x: p.x, z: p.z, yaw: p.yaw };
})()`);

await shot('pp-lamp-front', `(() => {
  const p = __pick('prop_streetlamp', 2);
  if (!p) return 'none placed at this seed';
  __test.lookFrom(p.x + 0.5, 2.6, p.z + 8.5, p.x, 2.8, p.z);
  return 1;
})()`);

await shot('pp-trafficlight', `(() => {
  const p = __pick('prop_trafficlight', 0);
  if (!p) return 'none placed at this seed';
  const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
  __test.lookFrom(p.x + dx * 7 + dz * 3, 3.4, p.z + dz * 7 - dx * 3, p.x + dx * 1.2, 2.7, p.z + dz * 1.2);
  return { x: p.x, z: p.z, yaw: p.yaw };
})()`);

await shot('pp-trafficlight-side', `(() => {
  const p = __pick('prop_trafficlight', 1);
  if (!p) return 'none placed at this seed';
  const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
  __test.lookFrom(p.x - dz * 6 + dx * 4, 2.8, p.z + dx * 6 + dz * 4, p.x + dx * 1.0, 2.6, p.z + dz * 1.0);
  return 1;
})()`);

await shot('pp-sign', `(() => {
  const p = __pick('prop_sign', 1);
  if (!p) return 'none placed at this seed';
  const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
  __test.lookFrom(p.x + dx * 4.5, 2.0, p.z + dz * 4.5, p.x, 1.6, p.z);
  return { x: p.x, z: p.z };
})()`);

await shot('pp-tree', `(() => {
  const p = __pick('prop_tree', 0);
  if (!p) return 'none placed at this seed';
  __test.lookFrom(p.x - 4.5, 3.4, p.z + 5.5, p.x, 2.7, p.z);
  return { x: p.x, z: p.z, s: p.s };
})()`);

await shot('pp-kiosk', `(() => {
  const p = __pick('prop_kiosk', 0);
  if (!p) return 'none placed at this seed';
  const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
  __test.lookFrom(p.x + dx * 5 + dz * 2.2, 2.3, p.z + dz * 5 - dx * 2.2, p.x, 1.4, p.z);
  return { x: p.x, z: p.z, yaw: p.yaw };
})()`);

await shot('pp-kiosk-front', `(() => {
  const p = __pick('prop_kiosk', 1);
  if (!p) return 'none placed at this seed';
  const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
  __test.lookFrom(p.x + dx * 4.6, 1.9, p.z + dz * 4.6, p.x, 1.35, p.z);
  return 1;
})()`);

// cars: spawn one of each kind on open road, three-quarter view then side view
await shot('pp-cars', `(async () => {
  const T = await import('./vendor/three/three.module.min.js');
  const P = await import('./js/world/procprops.js');
  const M = await import('./js/engine/materials.js');
  const scene = window.__propsReg.types.prop_tree.mesh.parent;
  const mat = M.makeWorldMaterial();
  ['sedan','taxi','van'].forEach((k, i) => {
    const m = new T.Mesh(P.carGeo(k), mat);
    m.position.set(-14 + i * 7, 0, -57);
    m.rotation.y = 0.6;
    scene.add(m);
  });
  __test.lookFrom(-8, 3.6, -49, -7.5, 0.8, -57);
  return 'spawned';
})()`);

await shot('pp-cars-side', `(() => { __test.lookFrom(-7.5, 1.7, -50.5, -7.2, 0.75, -57); return 1; })()`);
await shot('pp-cars-rear', `(() => { __test.lookFrom(-22, 2.4, -62, -10, 0.7, -56.5); return 1; })()`);

// live traffic on the road (real cars in drive mode, lenses on lights)
await shot('pp-traffic-live', `(() => {
  const c = window.__trafficList.find(c => c.mode === 'drive');
  __test.lookFrom(c.x + 8, 3.2, c.z + 6, c.x, 0.8, c.z);
  return { kind: c.kind };
})()`);

await browser.close();
if (errors.length) {
  console.error('CONSOLE/PAGE ERRORS:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('OK all prop shots');
