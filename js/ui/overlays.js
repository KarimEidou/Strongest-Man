// Title, pause, rotate-device, loading and toast overlays. iOS cannot lock
// orientation for installed web apps, so portrait shows a blocking overlay.
import { game, setGameState, settings, persist } from '../core/state.js';
import { openSettings } from './settings.js';

const el = (id) => document.getElementById(id);

export function initOverlays() {
  const title = el('title-screen'), pause = el('pause-screen'), rotate = el('rotate-overlay');

  el('btn-play').addEventListener('click', () => {
    title.hidden = true;
    el('hud').hidden = false;
    setGameState('playing');
    if (!settings.seenIntro) {
      settings.seenIntro = true; persist();
      toast('You are the strongest man in the universe. Nobody knows.', 4200);
    }
  });
  el('btn-settings').addEventListener('click', () => openSettings('title'));
  el('btn-pause').addEventListener('click', () => {
    if (game.state !== 'playing') return;
    pause.hidden = false;
    setGameState('paused');
  });
  el('btn-resume').addEventListener('click', resume);
  el('btn-pause-settings').addEventListener('click', () => { pause.hidden = true; openSettings('pause'); });

  function resume() {
    pause.hidden = true;
    setGameState('playing');
  }

  // rotate overlay — checked on resize/orientationchange with a debounce
  // (iOS fires these before the new dimensions settle)
  let t = 0;
  const check = () => {
    const portrait = innerHeight > innerWidth;
    rotate.hidden = !portrait;
  };
  const debounced = () => { clearTimeout(t); t = setTimeout(check, 250); check(); };
  addEventListener('resize', debounced);
  addEventListener('orientationchange', debounced);
  check();
}

export function loadingProgress(frac, msg) {
  el('loading-fill').style.width = `${Math.round(frac * 100)}%`;
  if (msg) el('loading-msg').textContent = msg;
  if (frac >= 1) setTimeout(() => { el('loading').hidden = true; }, 150);
}

let toastTimer = 0;
export function toast(text, ms = 2200) {
  const t = el('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

export function backToPause(from) {
  if (from === 'pause') { el('pause-screen').hidden = false; setGameState('paused'); }
  else { el('title-screen').hidden = false; setGameState('title'); }
}
