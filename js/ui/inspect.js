// Artwork inspect mode, and the proximity prompt that opens it.
//
// The picture is a DOM <img> rather than a second WebGL surface. That buys three
// things at once: object-fit:contain makes losing the native aspect ratio
// impossible, a 1024px source is decoded at whatever the 3x panel can actually
// show, and none of it lands in texture memory beside the four wall textures.
//
// Entering freezes the simulation by putting the game in 'paused'. main.js runs
// fixedSystems only while 'playing' and frameSystems for 'paused' too, so the
// city keeps rendering behind the overlay while nothing in it moves — which is
// also why the player's position needs no saving to survive the visit. The
// camera IS snapshotted, because it damps toward its target every frame and
// "restores the exact prior orientation" should mean exactly that.
import { game, setGameState } from '../core/state.js';
import { input, resetInput } from '../core/input.js';

const el = (id) => document.getElementById(id);

let open = false;
let camRef = null;
let snapshot = null;
let promptWork = null;

// pinch/pan
const view = { scale: 1, x: 0, y: 0 };
const pointers = new Map();
let pinchStart = 0, pinchScale = 1;
let panFrom = null;
let lastTap = 0;

export function initInspect(cam) {
  camRef = cam;

  el('art-prompt').addEventListener('click', (e) => {
    e.preventDefault();
    if (promptWork) enterInspect(promptWork);
  });
  el('inspect-close').addEventListener('click', (e) => { e.preventDefault(); exitInspect(); });

  const stage = el('inspect-stage');
  const opts = { passive: false };

  stage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinchStart = pinchDistance();
      pinchScale = view.scale;
      panFrom = null;
    } else if (pointers.size === 1) {
      panFrom = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      const now = performance.now();
      if (now - lastTap < 320) { reset(); lastTap = 0; } else lastTap = now;
    }
  }, opts);

  stage.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2 && pinchStart > 0) {
      const d = pinchDistance();
      view.scale = clampScale(pinchScale * (d / pinchStart));
      clampPan();
      apply();
    } else if (panFrom && view.scale > 1.001) {
      view.x = panFrom.vx + (e.clientX - panFrom.x);
      view.y = panFrom.vy + (e.clientY - panFrom.y);
      clampPan();
      apply();
    }
  }, opts);

  const lift = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) panFrom = null;
    // a two-finger release leaves one finger down; re-anchor the pan to it so
    // the picture does not jump on the next move
    if (pointers.size === 1) {
      const [only] = pointers.values();
      panFrom = { x: only.x, y: only.y, vx: view.x, vy: view.y };
    }
  };
  stage.addEventListener('pointerup', lift, opts);
  stage.addEventListener('pointercancel', lift, opts);
  // a captured pointer that is taken away (an incoming call, a system gesture)
  // fires this and nothing else — without it the map keeps a dead entry and the
  // next single touch is treated as the second finger of a pinch
  stage.addEventListener('lostpointercapture', lift, opts);

  // keyboard escape, for desktop verification runs
  window.addEventListener('keydown', (e) => {
    if (open && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); exitInspect(); }
  });
}

function pinchDistance() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampScale(s) { return Math.min(4, Math.max(1, s)); }

// Keep the picture's own box on screen: at scale 1 there is nothing to pan, and
// past that the offset is bounded by how far the scaled box overhangs the stage.
function clampPan() {
  if (view.scale <= 1.001) { view.x = 0; view.y = 0; return; }
  const img = el('inspect-img');
  const r = img.getBoundingClientRect();
  const stage = el('inspect-stage').getBoundingClientRect();
  const overX = Math.max(0, (r.width - stage.width) / 2);
  const overY = Math.max(0, (r.height - stage.height) / 2);
  view.x = Math.min(overX, Math.max(-overX, view.x));
  view.y = Math.min(overY, Math.max(-overY, view.y));
}

function apply() {
  el('inspect-img').style.transform =
    `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

function reset() {
  view.scale = 1; view.x = 0; view.y = 0;
  apply();
}

// ---------------------------------------------------------------------------

export function showPrompt(work) {
  const p = el('art-prompt');
  if (!work) {
    if (promptWork) { p.classList.add('hidden'); promptWork = null; }
    return;
  }
  if (promptWork !== work) {
    el('art-prompt-text').textContent = work.title;
    p.classList.remove('hidden');
    promptWork = work;
  }
}

export function isInspecting() { return open; }

export function enterInspect(work) {
  if (open || !work) return;
  open = true;
  promptWork = null;
  el('art-prompt').classList.add('hidden');

  snapshot = camRef ? {
    yaw: camRef.st.yaw, pitch: camRef.st.pitch, dist: camRef.st.dist,
    curYaw: camRef.st.curYaw, curPitch: camRef.st.curPitch, curDist: camRef.st.curDist,
    target: camRef.st.target.clone(), smoothed: camRef.st.smoothed.clone(),
    state: game.state,
  } : null;

  el('inspect-img').src = `./assets/art/${work.slug}.webp`;
  el('inspect-img').alt = `${work.title}, ${work.artist}, ${work.year}`;
  el('inspect-title').textContent = work.title;
  el('inspect-artist').textContent = work.artist;
  el('inspect-year').textContent = work.year;
  el('inspect-medium').textContent = work.medium;
  reset();

  el('inspect').hidden = false;
  el('hud').hidden = true;
  // Same lock the conversation panel uses: pollInput zeroes every axis and edge
  // while it is set, so nothing queued behind the overlay can fire on the way
  // out. resetInput clears what was already pending when we arrived.
  input.textFocus = true;
  resetInput();
  if (game.state === 'playing') setGameState('paused');
}

export function exitInspect() {
  if (!open) return;
  open = false;

  el('inspect').hidden = true;
  // drop the decoded image so a visit does not hold ~1.5 MB of bitmap for the
  // rest of the session
  el('inspect-img').removeAttribute('src');
  el('hud').hidden = false;

  if (snapshot && camRef) {
    const st = camRef.st;
    st.yaw = snapshot.yaw; st.pitch = snapshot.pitch; st.dist = snapshot.dist;
    st.curYaw = snapshot.curYaw; st.curPitch = snapshot.curPitch; st.curDist = snapshot.curDist;
    st.target.copy(snapshot.target); st.smoothed.copy(snapshot.smoothed);
  }
  const back = snapshot?.state === 'title' ? 'title' : 'playing';
  snapshot = null;
  input.textFocus = false;
  resetInput();
  if (game.state === 'paused') setGameState(back);
}
