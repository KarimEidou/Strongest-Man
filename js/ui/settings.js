// Settings screen: look sensitivity, invert, audio, Groq API key.
// The key lives in localStorage only; the input never echoes it back out.
import { settings, persist, setGameState } from '../core/state.js';
import { testKey } from '../dialogue/groq.js';
import { emit, EV } from '../core/events.js';
import { backToPause } from './overlays.js';

const el = (id) => document.getElementById(id);
const SENTINEL = '•••saved•••';   // what a stored key looks like; never the key
let returnTo = 'title';

export function initSettings() {
  const sens = el('set-sens'), sensVal = el('set-sens-val');
  const invy = el('set-invy'), audio = el('set-audio'), groq = el('set-groq');
  const quality = el('set-quality');

  el('btn-settings-done').addEventListener('click', () => {
    settings.lookSensitivity = parseFloat(sens.value);
    settings.invertY = invy.checked;
    settings.audio = audio.checked;
    if (quality.value !== settings.quality) {
      settings.quality = quality.value;
      // Shadow and tone-mapping state are three PROGRAM parameters, so this
      // recompiles every material. The game is paused behind this panel, which
      // is the only place that is acceptable.
      window.__quality?.(quality.value === 'auto' ? (settings.qualityResolved || 'high') : quality.value);
    }
    const v = groq.value.trim();
    if (v !== SENTINEL) settings.groqKey = v;
    persist();
    emit(EV.SETTINGS_CHANGED, { settings });
    el('settings-screen').hidden = true;
    backToPause(returnTo);
  });

  sens.addEventListener('input', () => { sensVal.textContent = `${parseFloat(sens.value).toFixed(2)}×`; });

  // The owner's key cannot be reproduced anywhere else, so this is the only
  // instrument that can tell a typo from a revoked key from a blocked network:
  // one real round trip, and whatever the server said printed verbatim.
  const test = el('btn-groq-test');
  test.addEventListener('click', async () => {
    const typed = groq.value.trim();
    // The field shows a sentinel rather than the secret, so testing an untouched
    // field has to mean testing the SAVED key — never wiping it.
    const key = typed === SENTINEL ? settings.groqKey : typed;
    const status = el('groq-status');
    if (!key) { status.textContent = 'Nothing to test — paste a key into the field first.'; return; }
    test.disabled = true;
    status.textContent = 'Testing against api.groq.com…';
    try {
      status.textContent = (await testKey(key)).text;
    } finally {
      test.disabled = false;
    }
  });
}

export function openSettings(from) {
  returnTo = from;
  el('title-screen').hidden = true;
  el('settings-screen').hidden = false;
  setGameState('settings');
  el('set-sens').value = settings.lookSensitivity;
  el('set-sens-val').textContent = `${settings.lookSensitivity.toFixed(2)}×`;
  el('set-invy').checked = settings.invertY;
  el('set-quality').value = settings.quality;
  el('set-audio').checked = settings.audio;
  el('set-groq').value = settings.groqKey ? SENTINEL : '';
  el('groq-status').textContent = settings.groqKey
    ? 'Key saved on this device. Clear the field to remove it.'
    : 'No key set — NPCs use built-in dialogue.';
}
