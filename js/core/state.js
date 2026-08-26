// Persistent settings + save data (localStorage), and the coarse game state.
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
  seenArmoury: false,     // the one-time "points buy guns" hint
};

export const save = {
  karma: 0,
  points: 0,              // spendable
  earned: 0,              // lifetime, never spent down — the only real score
  owned: ['pistol'],      // gun ids unlocked in the shop; the sidearm is free
  equipped: '',           // '' = bare hands
};

export const game = {
  state: 'title',         // title | playing | paused | settings
  timeOfDay: 0.70,        // 0..1, game day = 24 real minutes; 0.70 is the low
                          // warm dusk the palette was authored around
  slowmo: 1,              // global timescale (charged-punch hit-stop)
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      Object.assign(settings, d.settings || {});
      Object.assign(save, d.save || {});
      // An old save has no gun fields at all, and a corrupted one can have the
      // wrong types; either way the shop must not start from undefined.
      if (!Array.isArray(save.owned) || !save.owned.length) save.owned = ['pistol'];
      if (typeof save.points !== 'number' || !isFinite(save.points)) save.points = 0;
      if (typeof save.earned !== 'number' || !isFinite(save.earned)) save.earned = 0;
    }
    settings.groqKey = localStorage.getItem('sm_groq_key') || '';
  } catch { /* first run / private mode */ }
}

export function persist() {
  try {
    const { groqKey, ...rest } = settings;
    localStorage.setItem(KEY, JSON.stringify({ settings: rest, save }));
    if (groqKey) localStorage.setItem('sm_groq_key', groqKey);
    else localStorage.removeItem('sm_groq_key');
  } catch { /* storage may be unavailable; the game keeps running */ }
}

export function setGameState(s) {
  if (game.state === s) return;
  game.state = s;
  emit(EV.GAME_STATE, { state: s });
}
