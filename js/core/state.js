// Persistent settings (localStorage) and the coarse game state.
import { emit, EV } from './events.js';

const KEY = 'sm_save_v1';

export const settings = {
  lookSensitivity: 1.0,   // 0.4 .. 2.0
  invertY: false,
  audio: true,
  quality: 'high',        // 'high' | 'medium' | 'low' | 'auto' — see engine/quality.js
  qualityResolved: '',    // what 'auto' measured on this device
  groqKey: '',            // stays on-device; never sent anywhere but api.groq.com
  seenIntro: false,
};

// Nothing is scored and nothing is bought any more, so there is nothing left to
// save but settings — and `save` is therefore gone rather than kept as an empty
// object nobody imports. It was still being read out of localStorage, stripped
// of five legacy keys and written straight back on every settings change, which
// round-tripped whatever an old blob happened to carry, forever. The key stays
// `sm_save_v1` so a returning player keeps their settings rather than getting a
// fresh install; the old `save` sub-object is simply not read and not rewritten,
// so it disappears the first time anything is persisted.

export const game = {
  state: 'title',         // title | playing | paused | settings
  // The SIMULATION clock. 0..1, one game day per 24 real minutes. It drives the
  // townspeople's daily needs (ai/schedule.js) and the hour a conversation
  // reports (dialogue/conversation.js) — and nothing visual. The sky is pinned
  // to noon; see `skyTime` below.
  timeOfDay: 0.70,
  // The VISUAL clock, sampled by engine/sky.js. The city is always daytime, so
  // this sits on the one true-noon key in SKY_KEYS (t = 0.50: night 0.00,
  // sunI 2.45, sun ~64 degrees up). Pinning `timeOfDay` itself would also freeze
  // pickGoal's need curves, so pedestrians would head for diners forever and
  // never go home — hence two clocks rather than one.
  skyTime: 0.50,
  slowmo: 1,              // global timescale (charged-punch hit-stop)
};

export function loadState() {
  // The key is read FIRST, in its own try. It used to be read after the save
  // blob, inside the same try — so a single corrupt character in sm_save_v1
  // threw before the key was ever loaded, groqKey stayed '', and the next
  // persist() saw an empty string and called removeItem. One bad byte in an
  // unrelated key permanently deleted the owner's API key, silently.
  try {
    settings.groqKey = localStorage.getItem('sm_groq_key') || '';
  } catch { /* private mode: storage throws on read */ }

  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return; }
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    Object.assign(settings, d.settings || {});
  } catch {
    // Keep the bad blob under a different name rather than throwing it away or
    // leaving it in place to fail again on every launch. It costs a few hundred
    // bytes and it is the only evidence of what went wrong.
    try {
      localStorage.setItem(`${KEY}_corrupt`, raw);
      localStorage.removeItem(KEY);
    } catch { /* nothing more to do */ }
  }
  // Migration. A save written before points, karma, guns and the shop came out
  // carries settings.seenArmoury; its `save` sub-object carried karma, points,
  // earned, owned and equipped. The sub-object is no longer read at all, so it
  // needs no per-key deletion — it is dropped wholesale by the next persist().
  delete settings.seenArmoury;

  // A corrupted save can have the wrong types, and nothing downstream may start
  // from undefined. One bad value used to crash openSettings half way through
  // filling the panel, and DONE then wrote the half-read state back.
  const sens = Number(settings.lookSensitivity);
  settings.lookSensitivity = isFinite(sens) ? Math.min(2, Math.max(0.4, sens)) : 1.0;
  settings.invertY = !!settings.invertY;
  settings.audio = settings.audio !== false;
  if (!['high', 'medium', 'low', 'auto'].includes(settings.quality)) settings.quality = 'high';
  if (!['high', 'medium', 'low', ''].includes(settings.qualityResolved)) settings.qualityResolved = '';
  settings.seenIntro = !!settings.seenIntro;
}

export function persist() {
  try {
    const { groqKey, ...rest } = settings;
    localStorage.setItem(KEY, JSON.stringify({ settings: rest }));
    if (groqKey) localStorage.setItem('sm_groq_key', groqKey);
    else localStorage.removeItem('sm_groq_key');
  } catch { /* storage may be unavailable; the game keeps running */ }
}

export function setGameState(s) {
  if (game.state === s) return;
  game.state = s;
  // Hit-stop is cleared by combat.fixedUpdate, which only runs while 'playing'.
  // Pausing inside the 0.45s of a charged hit therefore latched a 0.25x
  // timescale onto everything that DOES keep running behind the panel.
  if (s !== 'playing') game.slowmo = 1;
  emit(EV.GAME_STATE, { state: s });
}
