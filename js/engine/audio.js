// Procedural WebAudio SFX — no audio assets, no credits, a few oscillators
// and filtered noise bursts. iOS unlocks the context on the first touch.
import { on, EV } from '../core/events.js';
import { settings, game } from '../core/state.js';

let ctx = null;
let noiseBuf = null;
let bus = null;      // master gain -> limiter -> destination

// Everything in this file is a one-shot, and a collapse fires a dozen of them in
// the same step. Summed straight into destination they clipped hard — measured
// at five times full scale on a building coming down, which on a phone speaker
// is a crackle, not a bang. One master gain into a compressor set as a limiter
// costs two nodes for the whole session and puts a ceiling on it.
function buildBus(a) {
  const g = a.createGain();
  g.gain.value = 0.85;
  const lim = a.createDynamicsCompressor();
  lim.threshold.value = -8;
  lim.knee.value = 6;
  lim.ratio.value = 12;
  lim.attack.value = 0.003;
  lim.release.value = 0.15;
  g.connect(lim).connect(a.destination);
  return g;
}

// CREATES, never resumes. Resuming here was a hole straight through every
// suspend in this file: suspendAudio() would stop the context, and the very next
// thud() or noise() — a hydrant still hissing, a monster still walking — called
// ac(), which resumed it again. Audio carried on through the pause panel and
// after the app went to the background. Resuming is the job of unlockAudio() and
// resumeAudio(), which are the two paths that know a gesture or a state change
// justifies it.
function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 1.2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    bus = buildBus(ctx);
  }
  return ctx;
}

// A sound is worth building only if it can actually be heard now. Scheduling
// into a suspended context does not silence it — it queues it, and the whole
// backlog fires the instant the context resumes.
function live() {
  if (!settings.audio) return null;
  if (!ctx) return null;
  return ctx.state === 'running' ? ctx : null;
}

// Re-armed, not once-only. The original listener was {once:true}, so after iOS
// interrupted the context — a call, a background, a Siri invocation — there was
// nothing left to unlock it and the game was silent for the rest of the session.
let unlockArmed = false;
function armUnlock() {
  if (unlockArmed) return;
  unlockArmed = true;
  const go = () => {
    unlockArmed = false;
    removeEventListener('pointerdown', go, true);
    removeEventListener('touchend', go, true);
    removeEventListener('keydown', go, true);
    unlockAudio();
  };
  addEventListener('pointerdown', go, true);
  addEventListener('touchend', go, true);
  addEventListener('keydown', go, true);
}

function thud(freq = 80, dur = 0.18, gain = 0.5) {
  const a = live();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.4, 24), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + dur);
}

function noise(dur = 0.4, gain = 0.3, freq = 800, q = 0.6) {
  const a = live();
  if (!a) return;
  const t = a.currentTime;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.2, 60), t + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t); src.stop(t + dur);
}

export function unlockAudio() {
  // Sound switched off means no AudioContext at all — building one, filling a
  // 1.2s noise buffer and asking iOS to start audio hardware is not something to
  // do for a player who has turned it off.
  if (!settings.audio) return;
  try {
    const a = ac();
    if (a.state !== 'running') a.resume().catch(armUnlock);
  } catch { /* no audio on this device */ }
}

// Every voice here is a source node with an explicit stop() time. Once it has
// ended, nothing holds a reference to it and the graph below it goes with it —
// so there is nothing to disconnect by hand, and "stop the audio" is one suspend
// on the context. What suspend does NOT do is cancel voices already scheduled,
// which is why live() refuses to schedule into a context that is not running.
export function suspendAudio() {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}
export function resumeAudio() {
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume().catch(armUnlock);
}

// A collapse kills a lot of people at once; each death used to allocate its own
// oscillator and gain node in the same step.
let lastDeathThud = 0;

export function initAudio() {
  armUnlock();

  // Silence on the way out and on the way back in. iOS will interrupt the
  // context itself when the app is backgrounded, but not when the player merely
  // pauses, and a hydrant hissing behind the pause panel is a bug.
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') suspendAudio();
    else if (settings.audio && game.state === 'playing') resumeAudio();
  });
  addEventListener('pagehide', suspendAudio);
  on(EV.GAME_STATE, ({ state }) => {
    if (state === 'playing') { if (settings.audio) resumeAudio(); } else suspendAudio();
  });
  on(EV.SETTINGS_CHANGED, () => { if (settings.audio) resumeAudio(); else suspendAudio(); });

  on(EV.CHUNK_DESTROYED, ({ count }) => { thud(70, 0.2, Math.min(0.25 + count * 0.03, 0.6)); noise(0.35, 0.25, 900); });
  on(EV.BUILDING_COLLAPSED, () => { thud(46, 1.1, 0.85); noise(1.6, 0.5, 400, 0.4); });
  on(EV.CAR_EXPLODED, () => { thud(60, 0.5, 0.7); noise(0.9, 0.55, 1400); });
  on(EV.HYDRANT_BURST, () => noise(1.2, 0.3, 2600, 1.2));
  on(EV.NPC_DIED, () => {
    const t = performance.now();
    if (t - lastDeathThud < 90) return;
    lastDeathThud = t;
    thud(220, 0.1, 0.15);
  });
  on(EV.MONSTER_SPAWNED, () => { thud(38, 1.4, 0.6); });
  on(EV.MONSTER_REALIZED, () => { thud(180, 0.5, 0.4); thud(90, 0.7, 0.5); });
  on(EV.MONSTER_DIED, () => { thud(50, 0.9, 0.8); noise(1, 0.4, 700); });
  on(EV.PLAYER_THREW, () => noise(0.25, 0.3, 2000));
  on(EV.PLAYER_HURT, ({ amount }) => { thud(140, 0.16, Math.min(0.15 + amount * 0.012, 0.5)); });
  on(EV.PLAYER_DOWN, () => { thud(40, 1.3, 0.9); noise(1.1, 0.4, 500, 0.4); });
  on(EV.WEAPON_RELOAD, () => reloadSound());
  on(EV.WEAPON_BOUGHT, () => { thud(320, 0.1, 0.2); setTimeout(() => thud(480, 0.14, 0.22), 90); });
}

// One report per shot, shaped by the weapon rather than by a sample: a crack
// (short filtered noise) over a body thump, with the pistol bright and short and
// the cannon long and low. The rate limit matters — an 800rpm SMG would
// otherwise build thirteen oscillator graphs a second and audibly clip.
let lastShot = 0;
export function gunSound(gun) {
  const t = performance.now();
  if (t - lastShot < 34) return;
  lastShot = t;
  const heavy = gun.dmg >= 60 || gun.pellets;
  thud(heavy ? 62 : 130, heavy ? 0.26 : 0.09, heavy ? 0.55 : 0.28);
  noise(heavy ? 0.34 : 0.13, heavy ? 0.42 : 0.26, heavy ? 1500 : 3400, 0.8);
}

export function reloadSound() {
  noise(0.09, 0.16, 2600, 1.6);
  setTimeout(() => noise(0.07, 0.14, 1800, 1.4), 140);
}

export function punchSound(charge) {
  thud(charge > 0.5 ? 52 : 90, 0.18 + charge * 0.3, 0.45 + charge * 0.4);
  if (charge > 0.5) noise(0.5, 0.4, 600);
}
