// Boot + system wiring. Order matters: fixed-step systems run in the order
// they appear in `fixedSystems`; render-frame systems in `frameSystems`.
import * as THREE from 'three';
import { initDebug, perfFrame, addSimTime, profile, flags } from './core/debug.js';
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
addBlob(player.p, 0.75);
window.__buildingsReg = buildingsReg;
window.__propsReg = propsReg;

fixedSystems.push(profile('player', (dt) => player.fixedUpdate(dt)));
fixedSystems.push(profile('combat', (dt) => combat.fixedUpdate(dt)));
fixedSystems.push(profile('destruction', (dt) => destructionFixed(dt)));
fixedSystems.push(profile('physics', (dt) => physicsStep(dt)));
frameSystems.push(profile('player.frame', (dt, alpha) => player.frameUpdate(dt, alpha)));
frameSystems.push(profile('combat.frame', (dt) => combat.frameUpdate(dt)));
frameSystems.push(profile('fx.frame', (dt) => { debrisFrame(dt); particlesFrame(dt); blobFrame(); }));
window.__bodyStats = bodyStats;

loadingProgress(0.96, 'people…');
const { createNPCs } = await import('./ai/npc.js');
const { createTraffic } = await import('./world/traffic.js');
const { setCars } = await import('./physics/collide.js');
const npcs = createNPCs(scene, city, player);
const traffic = createTraffic(scene, propsReg, npcs.hooks, player, cam);
setCars({ list: traffic.list });
combat.st.hooks.npcs = npcs.hooks;
combat.st.hooks.cars = traffic.hooks;

const { installPanic } = await import('./ai/panic.js');
const { createMonsters } = await import('./ai/monster.js');
const { createDirector } = await import('./ai/director.js');
const panic = installPanic(npcs, buildingsReg, city);
const monsters = createMonsters(scene, npcs, player, cam);
const director = createDirector(monsters);
combat.st.hooks.monsters = monsters.hooks;

const { initKarma } = await import('./ai/karma.js');
const { initReputation } = await import('./ai/reputation.js');
const karma = initKarma();
const reputation = initReputation(npcs, monsters, player, city);
karma.fire();

fixedSystems.push(profile('panic', (dt) => panic.fixedUpdate(dt)));
fixedSystems.push(profile('npcs', (dt) => npcs.fixedUpdate(dt)));
fixedSystems.push(profile('traffic', (dt) => traffic.fixedUpdate(dt)));
fixedSystems.push(profile('monsters', (dt) => monsters.fixedUpdate(dt)));
fixedSystems.push(profile('director', (dt) => director.fixedUpdate(dt)));
fixedSystems.push(profile('karmaRep', (dt) => { karma.fixedUpdate(dt); reputation.fixedUpdate(dt); }));
window.__reputation = reputation;

const { initBubbles } = await import('./dialogue/bubbles.js');
const { initDialogue } = await import('./dialogue/talk.js');
initBubbles(cam.camera);
const dialogue = initDialogue(npcs, monsters, reputation, player, cam);
fixedSystems.push(profile('dialogue', (dt) => {
  dialogue.fixedUpdate(dt);
  if (inputRef.interactPressed) dialogue.onInteract();
}));
frameSystems.push((dt) => dialogue.frameUpdate(dt));
const { input: inputRef } = await import('./core/input.js');

const { initAudio } = await import('./engine/audio.js');
const { initOutfit } = await import('./player/outfit.js');
initAudio();
initOutfit(player);
frameSystems.push(profile('chars.frame', (dt, alpha) => { npcs.frameUpdate(dt, alpha); traffic.frameUpdate(dt, alpha); monsters.frameUpdate(dt, alpha); }));
fixedSystems.push((dt) => {
  game.timeOfDay = (game.timeOfDay + dt / (flags.fastday ? 60 : 1440)) % 1;
});
window.__npcs = npcs;
window.__trafficList = traffic.list;
window.__trafficState = traffic.hooks.lightState;
window.__cityBuildings = city.buildings;

// Compile every deferred shader behind the loading screen — see engine/warmup.js
loadingProgress(0.98, 'shaders…');
const { warmUp } = await import('./engine/warmup.js');
const { bangMaterial } = await import('./ai/monster.js');
await warmUp(renderer, scene, cam.camera, [bangMaterial()]);

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
  const t0 = performance.now();
  pollInput(dt);
  simTime += dt;
  for (const s of fixedSystems) s(dt);
  addSimTime(performance.now() - t0);
}

let lastDt = 1 / 60;
function frame(dt, alpha) {
  lastDt = dt;
  if (game.state === 'playing' || game.state === 'paused') {
    const t0 = performance.now();
    for (const s of frameSystems) s(dt, alpha);
    cam.frameUpdate(dt);
    hudFrame();
    addSimTime(performance.now() - t0);
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
// ?prof=1: per-system average ms per call over the window since the last read
window.__test.profile = () => {
  const out = {};
  for (const [k, v] of Object.entries(window.__sys)) {
    out[k] = { avg: +(v.ms / Math.max(v.calls, 1)).toFixed(4), max: +v.max.toFixed(3), calls: v.calls };
    v.ms = 0; v.max = 0; v.calls = 0;
  }
  return out;
};
export { scene, renderer, cam, fixedSystems, frameSystems };

// Service worker: content-hash-versioned precache, generated by tools/gen-sw.mjs
const swOk = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && swOk) {
  const registerSW = () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  // top-level awaits above can outlast the load event — don't miss it
  if (document.readyState === 'complete') registerSW();
  else addEventListener('load', registerSW);
}
