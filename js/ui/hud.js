// HUD: karma meter, charge ring, reputation hint, damage vignette.
// Geometry is fixed — nothing repositions or restyles between screens.
import { on, EV } from '../core/events.js';
import { input, bindButtons, initInput } from '../core/input.js';

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

  const fill = el('karma-fill'), label = el('karma-label');
  on(EV.KARMA_CHANGED, ({ value, band }) => {
    const pct = Math.abs(value) / 2; // -100..100 -> 0..50% width from center
    fill.style.width = `${pct}%`;
    if (value >= 0) {
      fill.style.left = '50%';
      fill.style.background = 'var(--blue-bright)';
    } else {
      fill.style.left = `${50 - pct}%`;
      fill.style.background = 'var(--orange-deep)';
    }
    label.textContent = band.toUpperCase();
  });
}

// called every render frame
export function hudFrame() {
  const punchBtn = el('btn-punch');
  const c = Math.min(input.chargeTime / 1.1, 1);
  punchBtn.style.setProperty('--charge', input.punchDown ? c.toFixed(3) : 0);
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

export function repHint(text) {
  const h = el('rep-hint');
  h.textContent = text;
  h.classList.remove('hidden');
  clearTimeout(repHint._t);
  repHint._t = setTimeout(() => h.classList.add('hidden'), 3000);
}

export function flashVignette(strength = 0.8) {
  const v = document.getElementById('vignette');
  v.style.opacity = strength;
  clearTimeout(flashVignette._t);
  flashVignette._t = setTimeout(() => { v.style.opacity = 0; }, 180);
}
