// HUD: the joystick, the four action controls, the charge ring, the impact
// vignette.
//
// Geometry is fixed — nothing repositions or restyles between screens. The one
// thing that genuinely changes every frame (the charge ring) is written in
// hudFrame; everything else is driven off the event bus rather than polled.
import { on, EV } from '../core/events.js';
import { input, bindButtons, initInput, resetInput } from '../core/input.js';

const el = (id) => document.getElementById(id);

export function initHUD() {
  initInput(el('gl'), el('stick'), el('stick-nub'));
  bindButtons({
    punch: el('btn-punch'),
    jump: el('btn-jump'),
    grab: el('btn-grab'),
    interact: el('btn-interact'),
  });

  const vig = document.createElement('div');
  vig.id = 'vignette';
  document.body.appendChild(vig);

  // Every exit from and return to 'playing' drops whatever a finger was doing.
  // Without this a PUNCH released behind the pause panel stayed queued in
  // core/input.js — pollInput does not run while paused — and fired an attack
  // the player never asked for on the first step after RESUME. Same for a
  // thumb still on the joystick when the phone turns to portrait mid-sprint.
  on(EV.GAME_STATE, () => resetInput());
}

// Timed HUD affordances, on the FRAME clock rather than on setTimeout.
//
// Wall-clock timers do not belong in a HUD that sits over a pausable game: an
// affordance raised a moment before the player paused counted its seconds down
// behind the panel and was gone when they came back. It is also the last clock
// in the game a screenshot could not pin down.
//
// frame() hands this a zero dt while paused, so these hold.
let vigT = 0;

export function hudFrame(dt = 0) {
  if (vigT > 0 && (vigT -= dt) <= 0) el('vignette').style.opacity = 0;
  const c = Math.min(input.chargeTime / 1.1, 1);
  el('btn-punch').style.setProperty('--charge', input.punchDown ? c.toFixed(3) : 0);
}

// The grab button is a toggle in disguise: it throws whatever you are holding.
// Module-local guard means combat can call this every frame for free.
let grabMode = 'GRAB';
export function setGrabLabel(mode) {
  if (mode === grabMode) return;
  grabMode = mode;
  const b = el('btn-grab');
  if (!b) return;
  b.textContent = mode;
  b.classList.toggle('armed', mode === 'THROW');
  b.setAttribute('aria-label', mode === 'THROW' ? 'throw' : 'grab');
}

export function flashVignette(strength = 0.8) {
  el('vignette').style.opacity = strength;
  vigT = 0.18;
}

// The state the capture harness photographs to prove nothing overflows,
// collides or clips at 667x375. It used to drive eight readouts at their worst
// values; with the score, the health bar, the ammo and the weapon rail gone,
// what is left to stress is the controls themselves — every one of them in its
// widest label and its loudest state, plus the longest toast, all at once.
// Driven through the same paths the game uses, not by writing the DOM, so what
// the screenshot shows is what a player would actually see.
if (typeof window !== 'undefined') {
  addEventListener('load', () => {
    if (!window.__test) return;
    window.__test.hudStress = () => {
      setGrabLabel('THROW');
      el('btn-punch').style.setProperty('--charge', '1');
      el('btn-punch').classList.add('held');
      flashVignette(0.8);
      vigT = 60;
      import('./overlays.js').then((m) => m.toast(
        'This is the longest line the toast ever carries, and it has to fit.', 60000,
      ));
      return true;
    };
  });
}
