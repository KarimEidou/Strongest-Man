// Boot + system wiring. Order matters: fixed-step systems run in the order
// they appear in `fixedSystems`; render-frame systems in `frameSystems`.
import * as THREE from 'three';
import { initDebug, perfFrame, flags } from './core/debug.js';
import { loadState, game, setGameState } from './core/state.js';
import { createLoop } from './core/loop.js';
import { pollInput } from './core/input.js';
import { createRenderer } from './engine/renderer.js';
import { initSky } from './engine/sky.js';
import { createCamera } from './engine/camera.js';
import { initHUD, hudFrame } from './ui/hud.js';
import { initOverlays, loadingProgress } from './ui/overlays.js';
import { initSettings } from './ui/settings.js';
import { PAL } from './core/palette.js';

initDebug();
loadState();

const canvas = document.getElementById('gl');
const { renderer } = createRenderer(canvas);
const scene = new THREE.Scene();
const cam = createCamera();

initHUD();
initOverlays();
initSettings();

// system lists (systems register during boot below)
const fixedSystems = [];
const frameSystems = [];

loadingProgress(0.05, 'sky…');
await initSky(scene, renderer);

loadingProgress(0.1, 'models…');
const { loadModels } = await import('./engine/assets.js');
await loadModels((f) => loadingProgress(0.1 + f * 0.5, 'models…'));

loadingProgress(0.65, 'city…');
const { buildCitySpec } = await import('./world/city.js');
const { buildStreets } = await import('./world/streets.js');
const { buildBuildings } = await import('./world/buildings.js');
const { buildProps } = await import('./world/props.js');
const city = buildCitySpec();
buildStreets(scene);
const buildingsReg = buildBuildings(scene, city.buildings);
const propsReg = buildProps(scene, city);

loadingProgress(0.85, 'player…');
const { initCollide, cameraAllowed, debrisVsWorld } = await import('./physics/collide.js');
const { buildClipBank } = await import('./anim/retarget.js');
const { step: physicsStep, bodyStats, setWorldCollider } = await import('./physics/pworld.js');
const { createPlayer } = await import('./player/player.js');

initCollide(buildingsReg, propsReg);
setWorldCollider(debrisVsWorld);
buildClipBank();
const player = createPlayer(scene, cam);
cam.st.occlusionQuery = (look, eye, wanted) => cameraAllowed(look, eye, wanted);

loadingProgress(0.92, 'destruction…');
const { initDebris, debrisFrame } = await import('./world/debris.js');
const { initParticles, particlesFrame } = await import('./engine/particles.js');
const { initDestruction, destructionFixed } = await import('./world/destruction.js');
const { initBlobShadows, addBlob, blobFrame } = await import('./engine/blobshadows.js');
const { createCombat } = await import('./player/combat.js');

initDebris(scene);
initParticles(scene);
initDestruction(scene, buildingsReg, propsReg, cam);
initBlobShadows(scene);
const combat = createCombat(player, cam, scene);
addBlob(() => ({ x: player.p.x, z: player.p.z, y: player.p.y, r: 0.75 }));
window.__buildingsReg = buildingsReg;
window.__propsReg = propsReg;

fixedSystems.push((dt) => player.fixedUpdate(dt));
fixedSystems.push((dt) => combat.fixedUpdate(dt));
fixedSystems.push((dt) => destructionFixed(dt));
fixedSystems.push((dt) => physicsStep(dt));
frameSystems.push((dt, alpha) => player.frameUpdate(dt, alpha));
frameSystems.push((dt) => combat.frameUpdate(dt));
frameSystems.push((dt) => { debrisFrame(dt); particlesFrame(dt); blobFrame(); });
window.__bodyStats = bodyStats;

loadingProgress(1, 'ready');
window.__test.city = () => ({ buildings: city.buildings.length, cells: buildingsReg.cells.length, props: propsReg.all.length });
window.__test.showcase = (names) => {
  const { staticGeometry } = window.__assets;
  names.forEach((n, i) => {
    const { geometry, material } = staticGeometry(n);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(-20 + i * 8, 0.02, 0);
    scene.add(m);
  });
  return names.length;
};
import('./engine/assets.js').then((m) => { window.__assets = m; });
window.__test.lookFrom = (x, y, z, tx, ty, tz) => {
  cam.st.noOcclusion = true;
  cam.st.freeCam = true;
  cam.st.target.set(tx, ty ?? 0, tz);
  cam.st.smoothed.set(tx, ty ?? 0, tz);
  const dx = x - tx, dz = z - tz;
  cam.st.yaw = Math.atan2(dx, dz); cam.st.curYaw = cam.st.yaw;
  const dist = Math.hypot(dx, dz);
  cam.st.pitch = Math.atan2(y - (ty ?? 0) - 1.55, dist); cam.st.curPitch = cam.st.pitch;
  cam.st.dist = Math.hypot(dx, y - (ty ?? 0), dz); cam.st.curDist = cam.st.dist;
};

if (flags.autoplay) {
  document.getElementById('title-screen').hidden = true;
  document.getElementById('hud').hidden = false;
  setGameState('playing');
}

let simTime = 0;
function fixed(dt) {
  if (game.state !== 'playing') return;
  pollInput(dt);
  simTime += dt;
  for (const s of fixedSystems) s(dt);
}

let lastDt = 1 / 60;
function frame(dt, alpha) {
  lastDt = dt;
  if (game.state === 'playing' || game.state === 'paused') {
    for (const s of frameSystems) s(dt, alpha);
    cam.frameUpdate(dt);
    hudFrame();
  }
}

function render() {
  renderer.info.reset();
  renderer.render(scene, cam.camera);
  perfFrame(renderer, lastDt, () => {
    const s = window.__bodyStats ? window.__bodyStats() : { active: 0, sleeping: 0 };
    return { activeBodies: s.active, sleeping: s.sleeping };
  });
  window.__ready = true;
}

createLoop({ fixed, frame, render });

// expose plumbing for later phases + tests
window.__test.simTime = () => simTime;
export { scene, renderer, cam, fixedSystems, frameSystems };

// Service worker: content-hash-versioned precache, generated by tools/gen-sw.mjs
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
