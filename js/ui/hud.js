// HUD: karma meter, health, points, weapon rail, ammo, reticle, charge ring,
// reputation hint, damage vignette.
//
// Geometry is fixed — nothing repositions or restyles between screens. Every
// live readout is driven off the event bus rather than polled, except the two
// things that genuinely change every frame (the charge ring and the reticle
// spread), which are written in hudFrame.
import { on, EV } from '../core/events.js';
import { save, settings, persist } from '../core/state.js';
import { input, bindButtons, initInput, resetInput } from '../core/input.js';

const el = (id) => document.getElementById(id);

// installed by main.js once the weapon system exists; the HUD owns the rail's
// markup, the weapon system owns what happens when a chip is tapped
let weapons = null;

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

  on(EV.PLAYER_HEALTH, setHealth);
  on(EV.POINTS, ({ total, delta, label: what }) => setPoints(total, delta, what));
  on(EV.WEAPON_CHANGED, ({ id, gun, ammo }) => {
    setAmmo(id ? ammo : -1, gun ? gun.mag : 0, '');
    markRail(id);
    el('reticle').classList.toggle('hidden', !id);
    setPunchLabel(id ? 'FIRE' : 'PUNCH');
  });
  on(EV.WEAPON_FIRED, ({ ammo, mag, hit }) => {
    setAmmo(ammo, mag, '');
    if (hit) hitMarker();
  });
  on(EV.WEAPON_RELOAD, () => setAmmo(null, null, 'RELOADING'));
  on(EV.WEAPON_BOUGHT, () => buildRail());
  on(EV.PLAYER_DOWN, ({ lostPoints }) => {
    const b = el('down-banner');
    el('down-sub').textContent = lostPoints > 0 ? `−${lostPoints} POINTS` : 'GET UP';
    b.classList.remove('hidden');
  });
  on(EV.PLAYER_REVIVED, () => el('down-banner').classList.add('hidden'));

  // Every exit from and return to 'playing' drops whatever a finger was doing.
  // Without this a PUNCH released behind the pause panel stayed queued in
  // core/input.js — pollInput does not run while paused — and fired an attack
  // the player never asked for on the first step after RESUME. Same for a
  // thumb still on the joystick when the shop opens, or when the phone turns
  // to portrait mid-sprint.
  on(EV.GAME_STATE, () => resetInput());

  setPoints(save.points, 0, null);
  buildRail();
}

// main.js hands the weapon system over once it exists; until then the rail is
// just bare hands and nothing happens when it is tapped.
export function bindWeapons(sys) {
  weapons = sys;
  buildRail();
}

// ---- health ---------------------------------------------------------------
function setHealth({ hp, max }) {
  const k = Math.max(0, Math.min(1, hp / max));
  const bar = el('hp-bar');
  el('hp-fill').style.width = `${k * 100}%`;
  el('hp-ghost').style.width = `${k * 100}%`;
  el('hp-num').textContent = Math.ceil(hp);
  bar.classList.toggle('hurt', k <= 0.6 && k > 0.28);
  bar.classList.toggle('critical', k <= 0.28);
}

// ---- points ---------------------------------------------------------------
let popTimer = 0;
function setPoints(total, delta, what) {
  el('points-val').textContent = total.toLocaleString('en-US');
  if (!delta) return;
  // The first time the city pays him, say once what the number is for. The SHOP
  // button and the weapon strip are both on screen from the start, but nothing
  // connects them until something has actually been earned.
  if (delta > 0 && !settings.seenArmoury) {
    settings.seenArmoury = true;
    persist();
    // dynamic, to keep the HUD out of the overlays<->settings import cycle
    import('./overlays.js').then((m) => m.toast('Points buy guns. SHOP, top right.', 4200));
  }
  const pop = el('points-pop');
  pop.textContent = `${delta > 0 ? '+' : ''}${delta}${what ? ` ${what}` : ''}`;
  pop.classList.toggle('gain', delta > 0);
  pop.classList.toggle('loss', delta < 0);
  pop.classList.add('show');
  clearTimeout(popTimer);
  popTimer = setTimeout(() => pop.classList.remove('show'), delta > 0 ? 900 : 1400);
}

// ---- ammo -----------------------------------------------------------------
function setAmmo(n, mag, state) {
  const box = el('ammo');
  if (n === -1) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  if (n !== null) {
    el('ammo-n').textContent = n;
    el('ammo-mag').textContent = `/${mag}`;
    box.classList.toggle('empty', n === 0);
  }
  el('ammo-state').textContent = state || '';
}

// ---- weapon rail ----------------------------------------------------------
function buildRail() {
  const rail = el('weapons');
  if (!rail) return;
  // The strip scrolls, so it has to take pointer events — and core/input.js must
  // therefore be told not to read a scroll drag on it as joystick input.
  rail.setAttribute('data-ui', '');
  rail.textContent = '';
  const ids = ['', ...(weapons ? weapons.ownedIds() : [])];
  for (const id of ids) {
    const b = document.createElement('button');
    b.className = 'wchip';
    b.dataset.id = id;
    b.textContent = id ? id.toUpperCase() : 'FISTS';
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      weapons?.equip(id || null);
    }, { passive: false });
    rail.appendChild(b);
  }
  markRail(weapons?.st?.equipped ?? null);
}

function markRail(id) {
  for (const b of document.querySelectorAll('#weapons .wchip')) {
    b.classList.toggle('on', b.dataset.id === (id || ''));
  }
}

let hitTimer = 0;
function hitMarker() {
  const r = el('reticle');
  r.classList.remove('hit');
  void r.offsetWidth;               // restart the animation
  r.classList.add('hit');
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => r.classList.remove('hit'), 200);
}

// called every render frame
export function hudFrame() {
  const punchBtn = el('btn-punch');
  // The ring is a CHARGE meter, and a trigger does not charge: with a gun out
  // the same held button is firing, and a ring filling behind it reads as a
  // second thing being wound up that never goes off.
  const armed = !!weapons?.st?.equipped;
  const c = Math.min(input.chargeTime / 1.1, 1);
  punchBtn.style.setProperty('--charge', !armed && input.punchDown ? c.toFixed(3) : 0);
  // the reticle opens up with recoil, which is the only feedback a thumb gets
  // about how wild the weapon in its hand currently is
  if (weapons?.st?.equipped) {
    const k = weapons.st.kick || 0;
    el('reticle').style.transform = `scale(${(1 + k * 0.55).toFixed(3)})`;
  }
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

// PUNCH becomes FIRE with something loaded. The charge ring stays — it just has
// nothing to fill while a gun is out, since the trigger is not a charge.
let punchLabel = 'PUNCH';
function setPunchLabel(text) {
  if (text === punchLabel) return;
  punchLabel = text;
  const b = el('btn-punch');
  if (!b) return;
  const ring = el('charge-ring');
  b.textContent = text;
  if (ring) b.prepend(ring);
  b.setAttribute('aria-label', text === 'FIRE' ? 'fire' : 'punch, hold to charge');
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

// Every readout at once, at the worst value it can hold: the state the capture
// harness photographs to prove nothing overflows, collides or clips at 667x375.
// Driven through the same event handlers the game uses, not by writing the DOM,
// so what the screenshot shows is what a player would actually see.
if (typeof window !== 'undefined') {
  addEventListener('load', () => {
    if (!window.__test) return;
    window.__test.hudStress = () => {
      setHealth({ hp: 1, max: 200 });
      // eight digits and a loss pop, which is the longest this row ever gets
      setPoints(99999999, -12500, 'CIVILIAN DOWN');
      setAmmo(0, 200, 'RELOADING');
      // a full armoury: six chips plus FISTS, which is what wraps the rail
      if (weapons) {
        for (const id of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'cannon']) {
          if (!save.owned.includes(id)) save.owned.push(id);
        }
        buildRail();
        markRail('cannon');
      }
      el('reticle').classList.remove('hidden');
      repHint('THE WHOLE CITY KNOWS WHAT YOU DID TO THAT BUILDING');
      import('./overlays.js').then((m) => m.toast(
        'Points buy guns. SHOP, top right. This is the longest line the toast ever carries.', 60000,
      ));
      return true;
    };
  });
}
