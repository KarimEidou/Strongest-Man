// Title, pause, rotate-device, loading and toast overlays. iOS cannot lock
// orientation for installed web apps, so portrait shows a blocking overlay.
import { game, setGameState, settings, persist } from '../core/state.js';
import { input } from '../core/input.js';
import { openSettings } from './settings.js';
import { VERSION } from '../core/version.js';

const el = (id) => document.getElementById(id);

export function initOverlays() {
  const title = el('title-screen'), pause = el('pause-screen'), rotate = el('rotate-overlay');
  el('title-version').textContent = `v${VERSION}`;

  el('btn-play').addEventListener('click', () => {
    // unlock audio on this real user gesture — initAudio's own listener is
    // registered at the END of boot and a fast tap can beat it, which meant the
    // 1.2s noise buffer got built mid-combat instead
    import('../engine/audio.js').then((m) => m.unlockAudio?.()).catch(() => {});
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
  let pausedByRotate = false;
  const check = () => {
    const portrait = innerHeight > innerWidth;
    rotate.hidden = !portrait;
    // #rotate-overlay is opaque, covers the canvas AND the whole button cluster,
    // and takes pointer events — so it is a hard input block. It was also the
    // only full-screen overlay in this file that left game.state alone, which was
    // harmless for exactly as long as nothing in town could hurt him. Now a
    // monster carries on swinging at a man who cannot move, fire, or reach PAUSE:
    // measured, one took him 40hp to 0 in 4.6 seconds behind it, and charged him
    // a tenth of his points for going down somewhere he never chose to stand.
    //
    // 'paused' is the right state and not a bespoke one: main.js keeps
    // frameSystems and the camera running for it, so the world stays rendered
    // behind the overlay, and stops fixedSystems, which is the whole mechanism.
    // The flag is so rotating back never clobbers a real pause, shop or title.
    if (portrait) {
      if (game.state === 'playing') { pausedByRotate = true; setGameState('paused'); }
    } else if (pausedByRotate) {
      pausedByRotate = false;
      setGameState('playing');
    }
    // A thumb already on the joystick when the phone turns gets its pointerup
    // delivered to the overlay instead of the surface, so the stick never ends
    // and he resumes at a dead sprint. core/input.js latches these until someone
    // writes them again, so clear them here.
    if (portrait) { input.moveX = 0; input.moveZ = 0; input.punchDown = false; }
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
