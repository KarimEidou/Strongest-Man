// Boot + system wiring. Order matters: fixed-step systems run in the order
// they appear in `fixedSystems`; render-frame systems in `frameSystems`.
import * as THREE from 'three';
import { initDebug, perfFrame, addSimTime, profile, flags } from './core/debug.js';
import { loadState, game, setGameState, settings, persist } from './core/state.js';
import { createLoop, FIXED_DT } from './core/loop.js';
import { pollInput } from './core/input.js';
import { createRenderer, onContextLost, onContextRestored } from './engine/renderer.js';
import { initSky } from './engine/sky.js';
import { applyQuality, probeTier, tierOf } from './engine/quality.js';
import { createCamera } from './engine/camera.js';
import { initHUD, hudFrame } from './ui/hud.js';
import { initOverlays, loadingProgress, loadingComplete, setBootProgressHook, showUpdate, loadingFailed, toast, toastFrame } from './ui/overlays.js';
import { initSettings } from './ui/settings.js';
import { PAL } from './core/palette.js';
import { on as onEvent, EV } from './core/events.js';

initDebug();
loadState();

// Boot is a chain of top-level awaits behind an opaque overlay. If any link
// throws — a 404 on an asset, a GLB the decoder rejects, a WebGL context the
// device refuses — execution stops where it is and #loading stays up forever
// with a half-filled bar. These three are the only things that can tell the
// player what happened and offer them a way out. All of them are removed the
// moment boot succeeds; nothing here is a permanent global handler.
const bootFail = (reason) => { loadingFailed(reason); clearBootGuards(); };
const onErr = (e) => bootFail(e?.error?.message || e?.message || e);
const onRej = (e) => bootFail(e?.reason?.message || e?.reason || 'unhandled rejection');
// The watchdog measures STALL, not elapsed time, and the difference matters.
//
// A fixed ninety seconds from module evaluation is a claim about how long boot
// should take, and it is wrong in the one case it exists for: a first install on
// a slow phone, where the page is fetching its own hundred-and-thirty resources
// while the service worker precaches five megabytes beside it with
// `{cache: 'reload'}`. Boot there is slow and entirely healthy, and a timer that
// fires through it tells the player the app failed while it is still loading —
// which is a worse lie than the frozen bar it replaced. Caught doing exactly
// that in tools/test/upgrade.mjs, where the reload lands mid-precache.
//
// Every loadingProgress() call re-arms it, so what it now says is "nothing has
// happened for ninety seconds", which is what "never going to finish" means.
const BOOT_STALL_MS = 90000;
const stallMessage = 'Startup stalled. This is usually a failed asset download.';
let bootWatchdog = setTimeout(() => bootFail(stallMessage), BOOT_STALL_MS);
setBootProgressHook(() => {
  clearTimeout(bootWatchdog);
  bootWatchdog = setTimeout(() => bootFail(stallMessage), BOOT_STALL_MS);
});
function clearBootGuards() {
  clearTimeout(bootWatchdog);
  setBootProgressHook(null);
  removeEventListener('error', onErr);
  removeEventListener('unhandledrejection', onRej);
}
addEventListener('error', onErr);
addEventListener('unhandledrejection', onRej);

const canvas = document.getElementById('gl');
const { renderer, resize: setDpr } = createRenderer(canvas);
const scene = new THREE.Scene();
const cam = createCamera();

initHUD();
initOverlays();
initSettings();

// System lists (systems register during boot below).
//
// The render-frame pass is in TWO halves with the camera solve between them,
// because a single list forces one of two wrong orders. cam.frameUpdate() reads
// what player/combat/weapons wrote this frame and writes camera.position and the
// view matrix; the sky dome, the city-light billboards, the monster health pips
// and the speech bubbles all read that transform back. Solving the camera after
// one flat list posed every one of those from the PREVIOUS frame's camera —
// visible as bubbles lagging a head during a fast turn and the dome swimming.
// Solving it before the list instead would only move the lag onto the camera
// itself, which is worse. So: producers, camera, consumers.
const fixedSystems = [];
const frameSystems = [];
const lateFrameSystems = [];

loadingProgress(0.05, 'sky…');
const sky = await initSky(scene, renderer, tierOf((flags.quality || settings.quality) === 'auto' ? 'high' : (flags.quality || settings.quality)));

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

loadingProgress(0.80, 'gallery…');
const { initMuseum, nearestWork } = await import('./world/museum.js');
const museum = await initMuseum(scene, renderer);

loadingProgress(0.85, 'player…');
const { initCollide, cameraAllowed, debrisVsWorld } = await import('./physics/collide.js');
const { buildClipBank } = await import('./anim/retarget.js');
const pworld = await import('./physics/pworld.js');
const { step: physicsStep, bodyStats, setWorldCollider } = pworld;
const { createPlayer } = await import('./player/player.js');

initCollide(buildingsReg, propsReg);
setWorldCollider(debrisVsWorld);
buildClipBank();
const player = createPlayer(scene, cam);
cam.st.occlusionQuery = (look, eye, wanted) => cameraAllowed(look, eye, wanted);

const { createHealth } = await import('./player/health.js');
const { initPoints } = await import('./core/points.js');
const health = createHealth(player, cam);
const points = initPoints();
// One damage entry point, handed to whatever can hurt him rather than exported
// as a system — nothing outside player/health.js should be able to read his hit
// points, and everything that can take them needs exactly this signature.
player.hurt = (n, cause, severity) => health.damage(n, cause, severity);
fixedSystems.push(profile('health', (dt) => { health.fixedUpdate(dt); points.fixedUpdate(dt); }));

loadingProgress(0.92, 'destruction…');
const { initDebris, debrisFrame } = await import('./world/debris.js');
const { initParticles, particlesFrame } = await import('./engine/particles.js');
const { initDestruction, destructionFixed } = await import('./world/destruction.js');
const { initBlobShadows, addBlob, blobFrame } = await import('./engine/blobshadows.js');
const { createCombat } = await import('./player/combat.js');

const { initTracers, tracersFrame } = await import('./engine/tracers.js');
const { initHealthPips, healthPipsFrame } = await import('./engine/healthpips.js');
const { createWeapons } = await import('./player/weapons.js');

initDebris(scene);
initParticles(scene);
initDestruction(scene, buildingsReg, propsReg, cam);
initBlobShadows(scene);
initTracers(scene, cam.camera);
initHealthPips(scene, cam.camera);
const combat = createCombat(player, cam, scene);
const weapons = createWeapons(player, cam, combat);
// PUNCH is one button doing two jobs. combat asks the weapon system whether
// there is something in his hands before it throws a jab, so the two can never
// both fire off the same tap.
combat.st.armed = () => weapons.armed;
addBlob(player.p, 0.75);
window.__buildingsReg = buildingsReg;
window.__propsReg = propsReg;

fixedSystems.push(profile('player', (dt) => player.fixedUpdate(dt)));
fixedSystems.push(profile('weapons', (dt) => weapons.fixedUpdate(dt)));
fixedSystems.push(profile('combat', (dt) => combat.fixedUpdate(dt)));
// Gallery proximity. Ahead of dialogue in the list on purpose: both want the
// same interact press, and standing in front of a painting should offer the
// painting, not the tourist behind you.
const { initInspect, showPrompt, enterInspect, isInspecting } = await import('./ui/inspect.js');
initInspect(cam);
fixedSystems.push(profile('museum', () => {
  // Not while a text field has focus: INTERACT is deliberately kept alive
  // through pollInput's text-focus branch so TALK can close the conversation,
  // and the gallery must not eat that press on its way there.
  if (isInspecting() || inputRef.textFocus) return;
  const w = nearestWork(player.p.x, player.p.z, cam.st.curYaw);
  showPrompt(w);
  if (w && inputRef.interactPressed) {
    inputRef.interactPressed = false;
    enterInspect(w);
  }
}));
fixedSystems.push(profile('destruction', (dt) => destructionFixed(dt)));
fixedSystems.push(profile('physics', (dt) => physicsStep(dt)));
frameSystems.push(profile('player.frame', (dt, alpha) => player.frameUpdate(dt, alpha)));
frameSystems.push(profile('combat.frame', (dt) => combat.frameUpdate(dt)));
// After combat, and it has to be: combat owns pose.update(), and the aim twists
// are applied ON TOP of the pose it writes rather than under it.
frameSystems.push(profile('weapons.frame', (dt) => weapons.frameUpdate(dt)));
// dt is already zero while paused — frame() gates the whole list. blobFrame()
// takes none, because it only follows positions and would pop if it stopped.
frameSystems.push(profile('fx.frame', (dt) => {
  debrisFrame(dt); particlesFrame(dt); tracersFrame(dt); blobFrame();
}));
window.__bodyStats = bodyStats;
window.__pworld = pworld;   // test hook: the live active/sleeping body arrays

loadingProgress(0.96, 'people…');
const { createNPCs } = await import('./ai/npc.js');
const { createTraffic } = await import('./world/traffic.js');
const { setCars } = await import('./physics/collide.js');
const npcs = createNPCs(scene, city, player);
const traffic = createTraffic(scene, propsReg, npcs.hooks, player, cam);
setCars({ list: traffic.list });
combat.st.hooks.npcs = npcs.hooks;
combat.st.hooks.cars = traffic.hooks;
weapons.st.hooks.npcs = npcs.hooks;
weapons.st.hooks.cars = traffic.hooks;

const { installPanic } = await import('./ai/panic.js');
const { createMonsters, MONSTER_MAX_HP } = await import('./ai/monster.js');
const { createDirector } = await import('./ai/director.js');
const panic = installPanic(npcs, buildingsReg, city);
const monsters = createMonsters(scene, npcs, player, cam, player.hurt);
const director = createDirector(monsters);
combat.st.hooks.monsters = monsters.hooks;
weapons.st.hooks.monsters = monsters.hooks;

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

loadingProgress(0.97, 'lighting…');
const { initShadows, setCharacterCasting } = await import('./engine/shadows.js');
const { initGodrays } = await import('./engine/godrays.js');
const shadows = initShadows(renderer, scene, sky.sun, buildingsReg, traffic, tierOf(flags.quality || settings.quality), propsReg);
const godrays = initGodrays(renderer, cam.camera);
const qualityCtx = {
  renderer, scene, camera: cam.camera, sky, shadows, godrays,
  resize: (dpr) => setDpr(dpr),
  setCharacterShadows: (on) => { setCharacterCasting(player.p.root, on); monsters.sys.setCastShadows(on); },
};
window.__quality = (name) => applyQuality(name, qualityCtx);

const { initCityLights } = await import('./engine/citylights.js');
const cityLights = initCityLights(propsReg);
lateFrameSystems.push(profile('citylights', () => cityLights.frameUpdate(cam.camera)));

const { initShop } = await import('./ui/shop.js');
const { bindWeapons } = await import('./ui/hud.js');
initShop(points, weapons);
bindWeapons(weapons);

const { initBubbles } = await import('./dialogue/bubbles.js');
const { initDialogue } = await import('./dialogue/talk.js');
initBubbles(cam.camera);
const dialogue = initDialogue(npcs, monsters, reputation, player, cam);
fixedSystems.push(profile('dialogue', (dt) => {
  dialogue.fixedUpdate(dt);
  if (inputRef.interactPressed) dialogue.onInteract();
}));
// Also on the pause gate: a bubble lives speakDuration + 1.2s, under 8 seconds,
// so pausing to read what somebody just said used to destroy the line you
// paused to read. It still tracks the head, which is dt-free.
lateFrameSystems.push((dt) => dialogue.frameUpdate(dt));
const { input: inputRef } = await import('./core/input.js');

const { initAudio } = await import('./engine/audio.js');
const { initOutfit } = await import('./player/outfit.js');
initAudio();
initOutfit(player);
frameSystems.push(profile('chars.frame', (dt, alpha) => {
  npcs.frameUpdate(dt, alpha); traffic.frameUpdate(dt, alpha); monsters.frameUpdate(dt, alpha);
}));
// camera-facing quads, so they belong after the camera solve
lateFrameSystems.push(profile('pips.frame', (dt) => healthPipsFrame(dt, monsters.monsters, MONSTER_MAX_HP)));
if (flags.time >= 0) game.timeOfDay = flags.time;
fixedSystems.push((dt) => {
  if (flags.capture) return;   // a screenshot must not depend on how long it took
  game.timeOfDay = (game.timeOfDay + dt / (flags.fastday ? 60 : 1440)) % 1;
});
lateFrameSystems.push(profile('sky.frame', (dt) => sky.frameUpdate(dt, game.timeOfDay, cam.camera)));
window.__npcs = npcs;
window.__trafficList = traffic.list;
window.__trafficState = traffic.hooks.lightState;
window.__cityBuildings = city.buildings;
// night is otherwise seven minutes of play away, which no test is going to wait for
window.__test.setTimeOfDay = (t) => { game.timeOfDay = ((t % 1) + 1) % 1; return game.timeOfDay; };
window.__test.timeOfDay = () => game.timeOfDay;
// #5 regression probe: the key light must never dip below the horizon, or every
// shadow in the city gets projected upward onto the facades
window.__test.sun = () => ({
  sunY: +sky.sunDir.y.toFixed(4),
  lightY: +sky.lightDir.y.toFixed(4),
  intensity: +sky.sun.intensity.toFixed(3),
});

// Pick a graphics tier (default: everything on) then compile every deferred
// shader behind the loading screen — see engine/warmup.js
const wantQuality = flags.quality || settings.quality;
if (wantQuality === 'auto') {
  const picked = await probeTier(renderer, scene, cam.camera);
  settings.qualityResolved = picked;
  persist();
  applyQuality(picked, qualityCtx);
} else {
  applyQuality(wantQuality, qualityCtx);
}

if (flags.nogodrays) godrays.setTier({ godrays: 'off' });
if (flags.noshadows) shadows.setTier({ shadows: false });
if (flags.nodetail) (await import('./engine/materials.js')).worldUniforms.uWorld.value.z = 0;

loadingProgress(0.98, 'shaders…');
const { warmUp } = await import('./engine/warmup.js');
const { bangMaterial } = await import('./ai/monster.js');
await warmUp(renderer, scene, cam.camera, [bangMaterial()]);

// ?warp=museum drops him on the gallery forecourt in one step — the screenshot
// harness uses it, and so does anyone who does not want to walk there.
if (flags.warp === 'museum') {
  player.p.x = museum.door.x; player.p.z = museum.door.z;
  player.p.px = player.p.x; player.p.pz = player.p.z;
  cam.st.target.set(player.p.x, 0, player.p.z);
  cam.st.smoothed.copy(cam.st.target);
  // eye on the road side, looking west at the facade
  cam.st.yaw = Math.PI / 2; cam.st.curYaw = cam.st.yaw;
  cam.st.curDist = cam.st.dist;
}
window.__test.museum = () => ({
  door: museum.door,
  bounds: museum.bounds,
  works: museum.works.map((w) => ({
    slug: w.slug, title: w.title, year: w.year, medium: w.medium, artist: w.artist,
    x: +w.x.toFixed(3), z: +w.z.toFixed(3),
    viewX: +w.viewX.toFixed(3), viewZ: +w.viewZ.toFixed(3),
    plaqueX: +w.plaqueX.toFixed(3), plaqueZ: +w.plaqueZ.toFixed(3), plaqueY: w.plaqueY,
    yaw: +w.yaw.toFixed(4),
  })),
});
window.__test.warpTo = (x, z, yaw) => {
  player.p.x = x; player.p.z = z;
  player.p.px = x; player.p.pz = z;
  player.p.vx = 0; player.p.vz = 0;
  cam.st.target.set(x, 0, z); cam.st.smoothed.copy(cam.st.target);
  if (yaw !== undefined) { cam.st.yaw = yaw; cam.st.curYaw = yaw; }
  return { x, z };
};
window.__test.inspect = (slug) => {
  const w = museum.works.find((k) => k.slug === slug);
  if (!w) return false;
  enterInspect(w);
  return true;
};
window.__test.isInspecting = () => isInspecting();
// Scene load/unload, for the leak check in tools/test/metrics.mjs. The gallery
// is the one part of the world that is built as a unit and can be taken down as
// one — the city itself is generated once at boot — so it is what a "load and
// unload a scene twenty times" measurement has to use here.
window.__test.museumCycle = async () => {
  const mod = await import('./world/museum.js');
  mod.disposeMuseum(scene);
  await mod.initMuseum(scene, renderer);
  return true;
};
window.__test.gpuInfo = () => ({
  geometries: renderer.info.memory.geometries,
  textures: renderer.info.memory.textures,
  programs: renderer.info.programs?.length ?? 0,
  calls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
});
// Park the camera on one wall label at reading distance, square to the plate.
// The follow camera adds HEAD (1.55 m) and a 0.55 m shoulder offset to whatever
// target it is given, so both are subtracted out here — otherwise the plaque
// lands off-centre and half a metre low, and the screenshot proves nothing.
// engine/camera.js's own constants, backed out so a framed shot lands where it
// is asked to. Kept beside the only code that needs them rather than exported,
// because they are the camera's business and nothing in the game should be
// undoing them.
const CAM_SHOULDER = 0.55, CAM_HEAD = 1.55;

// Frame a work head-on with the camera on the wall's normal, at the work's own
// centre height. warpTo cannot do this: it is a shoulder camera, so the player's
// body stands between the lens and the picture and the shot that exists to show
// the artwork shows his back instead.
window.__test.artShot = (slug, dist = 2.1) => {
  const w = museum.works.find((k) => k.slug === slug);
  if (!w) return false;
  const st = cam.st;
  st.freeCam = true;
  st.noOcclusion = true;
  st.yaw = Math.atan2(w.nx, w.nz); st.curYaw = st.yaw;
  st.pitch = 0; st.curPitch = 0;
  st.dist = dist; st.curDist = dist;
  // frameUpdate looks at target.y + HEAD and offsets sideways by SHOULDER, so
  // both are backed out here to put the optical centre on the picture's centre.
  const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
  st.target.set(w.x - cy * CAM_SHOULDER, museum.canvasCY - CAM_HEAD, w.z + sy * CAM_SHOULDER);
  st.smoothed.copy(st.target);
  return true;
};

window.__test.plaqueShot = (slug, dist = 1.05) => {
  const w = museum.works.find((k) => k.slug === slug);
  if (!w) return false;
  const st = cam.st;
  st.freeCam = true;
  st.noOcclusion = true;
  st.yaw = Math.atan2(w.nx, w.nz); st.curYaw = st.yaw;
  st.pitch = 0; st.curPitch = 0;
  st.dist = dist; st.curDist = dist;
  const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
  st.target.set(w.plaqueX - cy * 0.55, w.plaqueY - 1.55, w.plaqueZ + sy * 0.55);
  st.smoothed.copy(st.target);
  return true;
};

clearBootGuards();
// Not 'ready' — the bar sits here for as long as the first frame takes to draw
// (see loadingComplete), and a screen that says ready while it is not is the
// small lie that makes a slow launch feel broken.
loadingProgress(1, 'first frame…');
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
    // ONE pause gate, here, for every render-frame system.
    //
    // The world keeps being drawn behind the pause panel, so the frame pass has
    // to keep running — but it was running on the real dt while the fixed step
    // that drives it was stopped. Every mixer, the pose layer, the recoil decay,
    // the carry sway, the particle integrators, the hydrant jets and the speech
    // bubbles' own lifetimes all advanced against a simulation that did not.
    // A player who paused mid-collapse came back to a settled street; a player
    // who paused to read a line watched it fade; a scheduled strike came out of
    // the pause desynced from the punch clip that was supposed to carry it.
    //
    // Zero dt freezes all of it and costs nothing: positional interpolation runs
    // off `alpha`, and the things that must keep tracking while paused — the
    // camera transform, blob shadows, bubble projection — are position-driven
    // and take no dt at all.
    const fdt = game.state === 'playing' ? dt : 0;
    for (const s of frameSystems) s(fdt, alpha);
    cam.frameUpdate(fdt);
    for (const s of lateFrameSystems) s(fdt, alpha);
    hudFrame(fdt);
    // Called from here, not from hud.js, which stays out of a static import of
    // overlays.js on purpose — see the note beside the dynamic import there.
    toastFrame(fdt);
    addSimTime(performance.now() - t0);
  }
}

// The title screen is an opaque navy panel with a full-bleed splash image on
// top of it, so every draw call behind it lands on pixels nobody can see — the
// whole city, the shadow pass and the god-ray pass, at full cost, on the screen
// an installed PWA sits on longest. A player who opens the app and puts the
// phone down was heating it indefinitely for nothing.
//
// The pause, settings and armoury overlays are 0.82 alpha over a backdrop blur
// and genuinely do show the world through them, so they keep drawing. Only the
// title (and the loading panel above it) is opaque.
//
// The first few frames draw regardless, so the canvas holds a real image of the
// city rather than warmUp's throwaway frame the instant PLAY hides the title.
const titleEl = document.getElementById('title-screen');
let primedFrames = 0;
let captureFrozen = false;
const worldVisible = () => (primedFrames < 3 ? (primedFrames++, true) : titleEl.hidden);

function render() {
  renderer.info.reset();
  if (worldVisible()) {
    // Order matters: the god-ray mask is its own render(), and
    // shadowMap.needsUpdate is consumed by whichever render() comes next — so the
    // shadow update has to be flagged BETWEEN the mask and the main pass, or the
    // mask would eat it and the main pass would use a stale shadow map.
    const rays = godrays.prepare(cam.camera, sky.sunDir, sky.sample().sun);
    if (rays) godrays.renderMask(scene);
    shadows.beforeRender(player.p, cam.camera, sky.lightDir);
    renderer.setRenderTarget(null);
    renderer.render(scene, cam.camera);
    if (rays) godrays.composite();
  }
  perfFrame(renderer, lastDt, () => {
    const s = window.__bodyStats ? window.__bodyStats() : { active: 0, sleeping: 0 };
    return { activeBodies: s.active, sleeping: s.sleeping };
  });
  // The frame is drawn. NOW the loading screen can come down — see the note on
  // loadingComplete(). Both flags mean the same thing and the capture harness
  // waits on the second, so they are set at the same moment, which is also the
  // moment the player first has something to look at.
  loadingComplete();
  window.__ready = true;
  // The capture harness waits on this name; keep both, they are one flag.
  window.__READY__ = true;
  // A capture must be a pure function of (scene setup, step count) and nothing
  // else. It was not: the loop goes on stepping the world at a fixed dt while
  // Playwright does its round trips, so however many rAF frames happened to run
  // between boot and the shutter was baked into the picture. On an idle machine
  // that was a handful; under load it was fewer. Scenes that could see out of a
  // doorway differed by up to 142,000 pixels between two runs of identical code
  // because the townsfolk and the traffic outside had walked a different
  // distance — and scenes with no view out were byte-identical, which is what
  // identified it.
  //
  // So: the first render of a capture run is the last thing the loop does by
  // itself. Everything after it is driven explicitly by __test.step() and
  // __test.renderNow(), both synchronous.
  if (flags.capture && !captureFrozen) { captureFrozen = true; loop.suspend(true); }
}

const loop = createLoop({ fixed, frame, render });

// iOS purges WebGL contexts under memory pressure and when the app is
// backgrounded. engine/renderer.js calls preventDefault() so the browser will
// try to give one back; this is the other half — stop stepping and stop drawing
// in between, because rendering into a lost context throws on every frame and
// the sim would run the whole time the screen is black.
onContextLost(() => {
  loop.suspend(true);
  toast('Graphics interrupted — restoring…', 6000);
});
onContextRestored(() => {
  // Everything three owns is re-uploaded on the next render. What is NOT
  // three's is the shadow map, which lives behind our own needsUpdate cadence
  // and would otherwise stay unbuilt for two frames and log a driver warning
  // per draw call, exactly as it did at boot.
  shadows.setTier(tierOf(settings.qualityResolved || flags.quality || settings.quality));
  loop.suspend(false);
  toast('Graphics restored', 2200);
});
window.__test.loseContext = () => {
  const ext = renderer.getContext().getExtension('WEBGL_lose_context');
  if (!ext) return false;
  ext.loseContext();
  setTimeout(() => ext.restoreContext(), 400);
  return true;
};
window.__test.loopSuspended = () => loop.suspended;
// Drive one render by hand. Called from inside a rAF callback by the capture
// harness so the compositor presents the frame that was just drawn.
window.__test.renderNow = () => { render(); return true; };
// The loop handle was unreachable: createLoop's return value went into a const
// and nothing ever read halfRate or refreshHz again, so neither the adaptive
// half-rate nor the display probe could be observed or asserted on.
window.__test.loop = () => ({ halfRate: loop.halfRate, refreshHz: +loop.refreshHz.toFixed(1), suspended: loop.suspended });

// Screen Wake Lock. A phone left to its own devices dims and locks after thirty
// seconds of no touch, and this game is played with long stretches of nothing
// but a thumb on a joystick, which iOS does not count. Not available everywhere
// and revoked whenever the app is backgrounded, so it is re-taken on the way
// back rather than assumed to survive; every failure is a no-op by design.
let wakeLock = null;
async function takeWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock || game.state !== 'playing') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { wakeLock = null; }
}
function dropWakeLock() {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}
onEvent(EV.GAME_STATE, ({ state }) => { if (state === 'playing') takeWakeLock(); else dropWakeLock(); });
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') takeWakeLock();
  else dropWakeLock();
});
window.__test.wakeLock = () => ({ supported: 'wakeLock' in navigator, held: !!wakeLock });

// expose plumbing for later phases + tests
window.__test.simTime = () => simTime;
// Pump the simulation without waiting on the display. Under software rendering a
// frame costs ~80ms, and core/loop.js caps catch-up at MAX_STEPS, so the world
// advances at about a seventh of real time — a two-second animation takes fifteen
// seconds of wall clock to observe and every timing assertion becomes a guess.
// This runs the same fixed+frame systems the loop runs, in order, as fast as the
// CPU will go. Test-only; nothing in the game calls it.
window.__test.step = (seconds, withFrame = true) => {
  const n = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < n; i++) {
    fixed(FIXED_DT);
    if (withFrame) frame(FIXED_DT, 1);
  }
  return +simTime.toFixed(3);
};
// ?prof=1: per-system average ms per call over the window since the last read
window.__test.profile = () => {
  const out = {};
  for (const [k, v] of Object.entries(window.__sys)) {
    out[k] = { avg: +(v.ms / Math.max(v.calls, 1)).toFixed(4), max: +v.max.toFixed(3), calls: v.calls };
    v.ms = 0; v.max = 0; v.calls = 0;
  }
  return out;
};
export { scene, renderer, cam, fixedSystems, frameSystems, lateFrameSystems };

// Service worker: content-hash-versioned precache, generated by tools/gen-sw.mjs.
//
// The worker takes over as soon as it installs (see the long note in
// tools/gen-sw.mjs for why a waiting worker could never reach anyone), but it
// keeps the old cache alive until a navigation, so the page running right now
// keeps working. That leaves this file one job: tell the player a new build is
// ready and let THEM pick the moment, rather than reloading out from under a
// fight.
const swOk = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && swOk) {
  const registerSW = async () => {
    try {
      // Ask the browser not to evict us. Declined is fine — this is a hint, and
      // an installed PWA usually gets it without prompting.
      navigator.storage?.persist?.().catch(() => {});

      const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });

      // controller null means this page loaded before any worker existed: it is
      // a first install, not an update, and must not offer a reload.
      // A page that loaded with no controller is a FIRST install: the worker
      // claims it and controllerchange fires, and offering an "update" for the
      // build already on screen would just bounce every new visitor mid-boot.
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      const reload = () => { if (!reloading) { reloading = true; location.reload(); } };
      const offer = (worker) => {
        if (!hadController) return;
        showUpdate(() => {
          // Harmless if the worker already activated itself; necessary if some
          // future build goes back to waiting.
          worker?.postMessage?.('SKIP_WAITING');
          // controllerchange may already have fired, so do not depend on it.
          setTimeout(reload, 200);
        });
      };
      // Three states, and the middle one used to be missed.
      //
      // register() resolves whenever it resolves, and the browser has usually
      // already begun fetching the new sw.js on the navigation before any of
      // this page's script runs. So by the time we look:
      //   - the new worker is WAITING      -> offer it now
      //   - the new worker is INSTALLING   -> offer it when it lands
      //   - nothing yet                    -> updatefound will tell us
      // Only the first and third were covered. A player who reloaded while a
      // new worker was mid-install got no banner at all: the startup check saw
      // reg.waiting empty, and updatefound had already fired before the listener
      // existed. That is the ordinary case on a phone, not an edge one, and it
      // is how tools/test/upgrade.mjs caught it — the newer build was installed
      // and waiting and never offered.
      const watch = (w) => {
        if (!w) return;
        if (w.state === 'installed') { offer(w); return; }
        w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      };
      watch(reg.waiting);
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // The takeover itself is not a reason to reload — it is a reason to
        // offer one. reg.waiting is empty by now, so the message goes nowhere
        // and the reload is what does the work.
        offer(navigator.serviceWorker.controller);
      });

      // A standalone PWA is launched, not reloaded, so it can run for days
      // without the browser ever re-checking sw.js. Check on every return to the
      // foreground instead.
      addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch { /* no worker: the game runs, it just will not be offline */ }
  };
  // top-level awaits above can outlast the load event — don't miss it
  if (document.readyState === 'complete') registerSW();
  else addEventListener('load', registerSW);
}
