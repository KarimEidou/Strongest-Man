// Title, pause, rotate-device, loading and toast overlays. iOS cannot lock
// orientation for installed web apps, so portrait shows a blocking overlay.
import { game, setGameState, settings, persist } from '../core/state.js';
import { input, resetInput } from '../core/input.js';
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
    //
    // resetInput(), not a hand-rolled three-field clear. That version left PUNCH
    // lit orange with input.punchDown false — a charge that looks alive and is
    // dead — and left pendingPunchUp queued, so the finger lifting later fired a
    // phantom jab on resume. It also drops the pointer ids, so the stick is not
    // still claimed by a finger whose pointerup went to the overlay.
    if (portrait) resetInput();
  };
  const debounced = () => { clearTimeout(t); t = setTimeout(check, 250); check(); };
  addEventListener('resize', debounced);
  addEventListener('orientationchange', debounced);
  check();
}

// main.js's boot watchdog registers here so it can measure "no progress" rather
// than "too long". See the note beside BOOT_STALL_MS.
let onProgress = null;
export function setBootProgressHook(fn) { onProgress = fn; }

export function loadingProgress(frac, msg) {
  el('loading-fill').style.width = `${Math.round(frac * 100)}%`;
  if (msg) el('loading-msg').textContent = msg;
  onProgress?.();
}

// Take the loading screen down when there is something behind it, and not one
// millisecond earlier.
//
// It used to hide 150ms after the bar reached 100%, which is when boot FINISHES
// — not when the first frame is on screen. Those are different moments and the
// gap between them is the single most expensive frame the app ever runs: every
// remaining shader link, every first texture upload, the first shadow map and
// the first god-ray pass, all in one. Measured here at 5.2 seconds under
// software rasterisation, and it is not free on a phone either. The player
// spent all of it looking at an unpainted canvas, which reads as a crash.
//
// main.js calls this from render(), after the frame has been drawn.
let loadingDone = false;
export function loadingComplete() {
  if (loadingDone) return;
  loadingDone = true;
  el('loading').hidden = true;
}

// Boot threw, rejected, or simply never finished. #loading is opaque, covers
// everything and takes pointer events, so without this the player is left
// looking at a frozen progress bar with no error, no retry and no way back —
// and on an installed PWA there is not even a URL bar to reload from.
let bootFailed = false;
export function loadingFailed(reason) {
  if (bootFailed) return;
  bootFailed = true;
  const box = el('loading');
  box.hidden = false;
  el('loading-msg').textContent = 'could not start';
  el('loading-bar').style.opacity = '0.25';
  const err = el('loading-error');
  err.hidden = false;
  el('loading-error-msg').textContent = String(reason || 'Unknown error').slice(0, 220);
  const retry = el('btn-retry');
  retry.addEventListener('click', () => {
    retry.disabled = true;
    retry.textContent = 'RELOADING…';
    location.reload();
  }, { once: true });
}

// On the frame clock, like every other timed thing in the HUD (see ui/hud.js):
// a toast raised a moment before the player paused used to spend its life behind
// the pause panel and be gone when they came back.
let toastT = 0;
export function toast(text, ms = 2200) {
  const t = el('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  toastT = ms / 1000;
}
export function toastFrame(dt) {
  if (toastT > 0 && (toastT -= dt) <= 0) el('toast').classList.add('hidden');
}

// A new build is installed and waiting. The worker deliberately did not take
// over on its own (see the note in js/main.js), so this is the only way the
// player gets it — one tap, one reload, and nothing is pulled out from under a
// session that is mid-fight. Idempotent: a second updatefound while the banner
// is already up does not stack another one.
let updateShown = false;
export function showUpdate(accept) {
  if (updateShown) return;
  updateShown = true;
  const b = el('update-banner');
  const x = el('update-dismiss');
  b.hidden = false;
  x.hidden = false;
  // has-update steps the top-centre stack down, so the karma meter is not
  // covered for as long as the banner is up.
  document.body.classList.add('has-update');
  const close = () => {
    b.hidden = true;
    x.hidden = true;
    document.body.classList.remove('has-update');
  };
  x.addEventListener('click', (e) => { e.preventDefault(); close(); }, { once: true });
  b.addEventListener('click', (e) => {
    e.preventDefault();
    b.disabled = true;
    b.textContent = 'UPDATING…';
    x.hidden = true;
    accept();
  }, { once: true });
}

export function backToPause(from) {
  if (from === 'pause') { el('pause-screen').hidden = false; setGameState('paused'); }
  else { el('title-screen').hidden = false; setGameState('title'); }
}
