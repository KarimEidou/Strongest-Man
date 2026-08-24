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
};

export const save = {
  karma: 0,
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
