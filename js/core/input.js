// Unified multi-touch + keyboard/mouse input.
//  - left half of the screen: floating virtual joystick (movement)
//  - right half: swipe to look (camera), simultaneous with everything else
//  - DOM action buttons manage their own pointers and set flags here
//  - desktop testing: WASD move, mouse-drag look, J punch/fire (hold=charge or
//    full-auto), K jump, L grab/throw, E interact, Q cycle weapon
import { settings, game } from './state.js';
import { clamp } from './mathx.js';

export const input = {
  moveX: 0, moveZ: 0,           // joystick, unit circle
  lookDX: 0, lookDY: 0,         // accumulated look delta this frame (px)
  punchDown: false,             // button currently held
  punchPressed: false,          // went down this fixed step
  punchReleased: false,         // went up this fixed step
  chargeTime: 0,                // seconds punch has been held
  jumpPressed: false,
  grabPressed: false,
  interactPressed: false,
  weaponCycle: false,           // desktop only: Q steps through the armoury
  anyTouch: false,
  // true while a text field has focus (the conversation panel). The world keeps
  // simulating; only the controls go quiet, so a typed sentence never also
  // drives the character.
  textFocus: false,
};

const state = {
  stickId: -1, stickCX: 0, stickCY: 0,
  lookId: -1, lookLX: 0, lookLY: 0,
  keys: new Set(),
  mouseLook: false,
  pendingPunchDown: false, pendingPunchUp: false,
  pendingJump: false, pendingGrab: false, pendingInteract: false, pendingCycle: false,
};

const STICK_R = 56;
let stickEl = null, nubEl = null;

const buttons = [];

export function bindButtons({ punch, jump, grab, interact }) {
  const opts = { passive: false };
  const press = (el, down, up) => {
    buttons.push({ el, up });
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add('held'); down(); }, opts);
    const release = (e) => { e.preventDefault(); el.classList.remove('held'); up && up(); };
    el.addEventListener('pointerup', release, opts);
    el.addEventListener('pointercancel', release, opts);
    // A captured pointer can be taken away without a pointerup: the element is
    // hidden mid-press (PAUSE with a thumb on PUNCH, the HUD going away for
    // inspect mode), an incoming call, a system edge gesture. Only this event
    // fires then, and without it the button keeps its .held styling and — for
    // PUNCH — leaves punchDown latched, which pins him to charge speed for the
    // rest of the session.
    el.addEventListener('lostpointercapture', release, opts);
  };
  const guarded = (fn) => () => { if (!input.textFocus) fn(); };
  press(punch, guarded(() => { state.pendingPunchDown = true; input.punchDown = true; }),
    () => { state.pendingPunchUp = true; input.punchDown = false; });
  press(jump, guarded(() => { state.pendingJump = true; }));
  press(grab, guarded(() => { state.pendingGrab = true; }));
  press(interact, () => { state.pendingInteract = true; });   // TALK closes the panel too
}

export function initInput(surface, stick, nub) {
  stickEl = stick; nubEl = nub;
  const opts = { passive: false };

  surface.addEventListener('pointerdown', (e) => {
    if (game.state !== 'playing' || input.textFocus) return;
    e.preventDefault();
    input.anyTouch = true;
    const w = window.innerWidth;
    if (e.clientX < w * 0.44 && state.stickId === -1) {
      state.stickId = e.pointerId;
      state.stickCX = e.clientX; state.stickCY = e.clientY;
      stickEl.style.left = `${e.clientX}px`; stickEl.style.top = `${e.clientY}px`;
      stickEl.classList.add('active');
      moveNub(0, 0);
    } else if (state.lookId === -1) {
      state.lookId = e.pointerId;
      state.lookLX = e.clientX; state.lookLY = e.clientY;
    }
  }, opts);

  surface.addEventListener('pointermove', (e) => {
    if (e.pointerId === state.stickId) {
      e.preventDefault();
      let dx = e.clientX - state.stickCX, dy = e.clientY - state.stickCY;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) { dx = dx / len * STICK_R; dy = dy / len * STICK_R; }
      moveNub(dx, dy);
      input.moveX = dx / STICK_R;
      input.moveZ = dy / STICK_R;
    } else if (e.pointerId === state.lookId) {
      e.preventDefault();
      input.lookDX += (e.clientX - state.lookLX) * settings.lookSensitivity;
      input.lookDY += (e.clientY - state.lookLY) * settings.lookSensitivity * (settings.invertY ? -1 : 1);
      state.lookLX = e.clientX; state.lookLY = e.clientY;
    }
  }, opts);

  const end = (e) => {
    if (e.pointerId === state.stickId) {
      state.stickId = -1;
      input.moveX = 0; input.moveZ = 0;
      stickEl.classList.remove('active');
    } else if (e.pointerId === state.lookId) {
      state.lookId = -1;
    }
  };
  surface.addEventListener('pointerup', end, opts);
  surface.addEventListener('pointercancel', end, opts);

  // ---- desktop fallbacks for development/testing
  window.addEventListener('keydown', (e) => {
    if (e.repeat || input.textFocus) return;
    state.keys.add(e.code);
    if (e.code === 'KeyJ') { state.pendingPunchDown = true; input.punchDown = true; }
    if (e.code === 'KeyK') state.pendingJump = true;
    if (e.code === 'KeyL') state.pendingGrab = true;
    if (e.code === 'KeyE') state.pendingInteract = true;
    if (e.code === 'KeyQ') state.pendingCycle = true;
  });
  window.addEventListener('keyup', (e) => {
    // A RELEASE is processed even while typing. Returning first used to strand
    // input.punchDown at true, which latched the charge slow-down for good.
    if (e.code === 'KeyJ') { state.pendingPunchUp = true; input.punchDown = false; }
    if (input.textFocus) { state.keys.clear(); return; }
    state.keys.delete(e.code);
  });
  surface.addEventListener('mousedown', (e) => { if (e.button === 0 && !e.isPrimary === false) state.mouseLook = true; });
  window.addEventListener('mouseup', () => { state.mouseLook = false; });
  surface.addEventListener('mousemove', (e) => {
    if (state.mouseLook && game.state === 'playing') {
      input.lookDX += e.movementX * settings.lookSensitivity;
      input.lookDY += e.movementY * settings.lookSensitivity * (settings.invertY ? -1 : 1);
    }
  });

  // iOS belt-and-braces: kill pinch zoom / double-tap zoom / callouts
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, (e) => e.preventDefault(), opts);
  }
  document.addEventListener('dblclick', (e) => e.preventDefault(), opts);
  document.addEventListener('touchmove', (e) => { if (e.target === surface) e.preventDefault(); }, opts);
}

function moveNub(dx, dy) {
  nubEl.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px)`;
}

// test hook: scripted stick input (Playwright drives the character with this)
let driveOverride = null;
let driveCleared = false;
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    if (window.__test) {
      window.__test.drive = (x, z) => {
        driveOverride = x === null ? null : { x, z };
        if (x === null) driveCleared = true;
      };
      window.__test.press = (btn) => {
        if (btn === 'punchDown') { state.pendingPunchDown = true; input.punchDown = true; }
        if (btn === 'punchUp') { state.pendingPunchUp = true; input.punchDown = false; }
        if (btn === 'jump') state.pendingJump = true;
        if (btn === 'grab') state.pendingGrab = true;
        if (btn === 'interact') state.pendingInteract = true;
        if (btn === 'cycle') state.pendingCycle = true;
      };
    }
  });
}

// Called once per fixed step: fold pending edges + keyboard axes into `input`.
export function pollInput(dt) {
  if (input.textFocus) {
    input.moveX = 0; input.moveZ = 0;
    input.lookDX = 0; input.lookDY = 0;
    input.punchPressed = input.punchReleased = false;
    input.jumpPressed = input.grabPressed = input.interactPressed = false;
    input.weaponCycle = false;
    state.pendingPunchDown = state.pendingPunchUp = false;
    state.pendingJump = state.pendingGrab = state.pendingInteract = state.pendingCycle = false;
    // Typing cancels a held charge outright: no finger is on the button any
    // more, so leaving punchDown set would keep accruing chargeTime the instant
    // focus is released — and pin the player to 45% speed with it.
    input.punchDown = false;
    input.chargeTime = 0;
    return;
  }
  if (driveOverride) { input.moveX = driveOverride.x; input.moveZ = driveOverride.z; }
  // Releasing the scripted stick has to actually stop him. moveX/moveZ are
  // LATCHED by whoever last wrote them — the touch stick zeroes them when the
  // finger lifts — so `drive(null)` left the character sprinting for the rest of
  // the session, which silently walked every later assertion out of position.
  else if (driveCleared) { input.moveX = 0; input.moveZ = 0; driveCleared = false; }
  input.punchPressed = state.pendingPunchDown; state.pendingPunchDown = false;
  input.punchReleased = state.pendingPunchUp; state.pendingPunchUp = false;
  input.jumpPressed = state.pendingJump; state.pendingJump = false;
  input.grabPressed = state.pendingGrab; state.pendingGrab = false;
  input.interactPressed = state.pendingInteract; state.pendingInteract = false;
  input.weaponCycle = state.pendingCycle; state.pendingCycle = false;

  if (state.keys.size) {
    let kx = 0, kz = 0;
    if (state.keys.has('KeyA')) kx -= 1;
    if (state.keys.has('KeyD')) kx += 1;
    if (state.keys.has('KeyW')) kz -= 1;
    if (state.keys.has('KeyS')) kz += 1;
    if (state.keys.has('ArrowLeft')) input.lookDX -= 240 * dt;
    if (state.keys.has('ArrowRight')) input.lookDX += 240 * dt;
    if (state.keys.has('ArrowUp')) input.lookDY -= 160 * dt;
    if (state.keys.has('ArrowDown')) input.lookDY += 160 * dt;
    if (kx || kz) {
      const l = Math.hypot(kx, kz);
      input.moveX = kx / l; input.moveZ = kz / l;
    } else if (state.stickId === -1) {
      input.moveX = 0; input.moveZ = 0;
    }
  }

  input.chargeTime = input.punchDown ? input.chargeTime + dt : 0;
}

// Drop every held button, every pending edge and every axis. Called when the
// game leaves 'playing' for an overlay and again when it comes back, so nothing
// a finger was doing before the overlay fires the moment it closes.
export function resetInput() {
  for (const b of buttons) {
    b.el.classList.remove('held');
    b.up?.();
  }
  input.moveX = 0; input.moveZ = 0;
  input.lookDX = 0; input.lookDY = 0;
  input.punchDown = false; input.chargeTime = 0;
  input.punchPressed = input.punchReleased = false;
  input.jumpPressed = input.grabPressed = input.interactPressed = false;
  input.weaponCycle = false;
  state.pendingPunchDown = state.pendingPunchUp = false;
  state.pendingJump = state.pendingGrab = state.pendingInteract = state.pendingCycle = false;
  state.stickId = -1; state.lookId = -1;
  state.keys.clear();
  if (stickEl) stickEl.classList.remove('active');
}

// Look deltas are consumed by the camera each render frame.
export function consumeLook() {
  const dx = input.lookDX, dy = input.lookDY;
  input.lookDX = 0; input.lookDY = 0;
  return [dx, dy];
}
