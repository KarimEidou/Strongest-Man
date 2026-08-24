// Settings screen: look sensitivity, invert, audio, Groq API key.
// The key lives in localStorage only; the input never echoes it back out.
import { settings, persist, setGameState } from '../core/state.js';
import { emit, EV } from '../core/events.js';
import { backToPause } from './overlays.js';

const el = (id) => document.getElementById(id);
let returnTo = 'title';

export function initSettings() {
  const sens = el('set-sens'), sensVal = el('set-sens-val');
  const invy = el('set-invy'), audio = el('set-audio'), groq = el('set-groq');

  el('btn-settings-done').addEventListener('click', () => {
    settings.lookSensitivity = parseFloat(sens.value);
    settings.invertY = invy.checked;
    settings.audio = audio.checked;
    const v = groq.value.trim();
    if (v !== '•••saved•••') settings.groqKey = v;
    persist();
    emit(EV.SETTINGS_CHANGED, { settings });
    el('settings-screen').hidden = true;
    backToPause(returnTo);
  });

  sens.addEventListener('input', () => { sensVal.textContent = `${parseFloat(sens.value).toFixed(2)}×`; });
}

export function openSettings(from) {
  returnTo = from;
  el('title-screen').hidden = true;
  el('settings-screen').hidden = false;
  setGameState('settings');
  el('set-sens').value = settings.lookSensitivity;
  el('set-sens-val').textContent = `${settings.lookSensitivity.toFixed(2)}×`;
  el('set-invy').checked = settings.invertY;
  el('set-audio').checked = settings.audio;
  el('set-groq').value = settings.groqKey ? '•••saved•••' : '';
  el('groq-status').textContent = settings.groqKey
    ? 'Key saved on this device. Clear the field to remove it.'
    : 'No key set — NPCs use built-in dialogue.';
}
