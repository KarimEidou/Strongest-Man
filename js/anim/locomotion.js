// Locomotion mixer graph. Looping locomotion actions play continuously with
// speed-driven crossfade weights; one-shots (punch, die) override via a
// fade layer. timeScale tracks actual speed so feet don't slide.
import * as THREE from 'three';
import { clipFor, findBone } from './retarget.js';
import { damp, clamp } from '../core/mathx.js';

// speed (m/s) breakpoints per locomotion action
const LOCO = [
  { name: 'idle', speed: 0 },
  { name: 'walk', speed: 1.5, native: 1.4 },
  { name: 'quick', speed: 2.9, native: 2.4 },
  { name: 'run', speed: 5.2, native: 5.0 },
];

export function createLocomotion(root, opts = {}) {
  const mixer = new THREE.AnimationMixer(root);
  const hips = findBone(root, 'Hips');
  const hipsY = hips ? hips.position.y : 1;
  const set = opts.set || LOCO;
  const actions = [];
  for (const l of set) {
    const clip = clipFor(l.name, hipsY);
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    a.play();
    a.setEffectiveWeight(l.speed === 0 ? 1 : 0);
    actions.push({ ...l, action: a });
  }

  let oneshot = null;
  let oneshotDone = null;

  // A LoopOnce action ends by setting `enabled = false` — it only PAUSES when
  // clampWhenFinished is on. Watching for `paused` alone therefore never retired
  // an unclamped one-shot (every punch and every throw), and a one-shot that is
  // never retired pins all locomotion weights at 15% below, permanently, so
  // sprinting can no longer reach the run clip. The mixer's own event is exact.
  mixer.addEventListener('finished', (e) => { if (e.action === oneshot) finishOneshot(); });

  function update(dt, speed) {
    // pick surrounding pair, crossfade by position between breakpoints
    let lo = actions[0], hi = actions[actions.length - 1];
    for (let i = 0; i < actions.length - 1; i++) {
      if (speed >= actions[i].speed && speed <= actions[i + 1].speed) {
        lo = actions[i]; hi = actions[i + 1];
        break;
      }
    }
    const span = Math.max(hi.speed - lo.speed, 0.001);
    const t = clamp((speed - lo.speed) / span, 0, 1);
    for (const a of actions) {
      let target = 0;
      if (a === lo) target = 1 - t;
      if (a === hi) target = Math.max(target, t);
      if (oneshot) target *= 0.15; // locomotion ducks under a one-shot
      a.action.setEffectiveWeight(damp(a.action.getEffectiveWeight(), target, 14, dt));
      if (a.native) a.action.setEffectiveTimeScale(clamp(speed / a.native, 0.75, 1.5));
    }
    mixer.update(dt);
    // belt-and-braces: the 'finished' listener above is the real retirement path
    if (oneshot && (oneshot.paused || !oneshot.enabled)) finishOneshot();
  }

  function playOneshot(name, { timeScale = 1, clamp: clampEnd = false, fade = 0.09, onDone } = {}) {
    const clip = clipFor(name, hipsY);
    if (!clip) return null;
    if (oneshot) { oneshot.fadeOut(0.08); }
    const a = mixer.clipAction(clip);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = clampEnd;
    a.setEffectiveTimeScale(timeScale);
    a.setEffectiveWeight(1);
    a.fadeIn(fade);
    a.play();
    oneshot = a;
    oneshotDone = onDone || null;
    return a;
  }

  function finishOneshot() {
    const cb = oneshotDone;
    if (oneshot) { oneshot.fadeOut(0.12); }
    oneshot = null; oneshotDone = null;
    cb?.();
  }

  // Drop any one-shot and snap the blend back to rest, for callers that need a
  // known-good animation state after something ended abnormally.
  function reset() {
    if (oneshot) oneshot.stop();
    oneshot = null; oneshotDone = null;
    for (const a of actions) a.action.setEffectiveWeight(a.speed === 0 ? 1 : 0);
  }

  // diagnostics: a stuck one-shot shows up here as every weight pinned near 0.15
  function weights() {
    const out = {};
    for (const a of actions) out[a.name] = +a.action.getEffectiveWeight().toFixed(3);
    out.oneshot = !!oneshot;
    return out;
  }

  return {
    mixer, update, playOneshot, reset, weights,
    get busy() { return !!oneshot; },
    cancelOneshot: finishOneshot,
    hipsY,
  };
}
