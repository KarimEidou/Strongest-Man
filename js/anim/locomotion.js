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

export const LOCO_NAMES = LOCO.map((l) => l.name);

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
  // A HELD one-shot is never retired. Death needs this: `clampWhenFinished` makes
  // three pause the action on its last frame — and then fire 'finished', which the
  // listener below turned into a fadeOut(0.12). The die pose bled away, the ducked
  // locomotion weights damped back to idle = 1, and the corpse stood up about a
  // second after it hit the ground. Holding pins the clip at weight 1 and drives
  // every locomotion weight to zero instead of 15%, so nothing underneath it can
  // surface. reset() is the only way out.
  let oneshotHeld = false;

  // A LoopOnce action ends by setting `enabled = false` — it only PAUSES when
  // clampWhenFinished is on. Watching for `paused` alone therefore never retired
  // an unclamped one-shot (every punch and every throw), and a one-shot that is
  // never retired pins all locomotion weights at 15% below, permanently, so
  // sprinting can no longer reach the run clip. The mixer's own event is exact.
  mixer.addEventListener('finished', (e) => { if (e.action === oneshot && !oneshotHeld) finishOneshot(); });

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
      if (oneshot) target *= oneshotHeld ? 0 : 0.15; // locomotion ducks under a one-shot
      a.action.setEffectiveWeight(damp(a.action.getEffectiveWeight(), target, 14, dt));
      if (a.native) a.action.setEffectiveTimeScale(clamp(speed / a.native, 0.75, 1.5));
    }
    mixer.update(dt);
    // belt-and-braces: the 'finished' listener above is the real retirement path
    if (oneshot && !oneshotHeld && (oneshot.paused || !oneshot.enabled)) finishOneshot();
  }

  function playOneshot(name, { timeScale = 1, clamp: clampEnd = false, fade = 0.09, hold = false, onDone } = {}) {
    const clip = clipFor(name, hipsY);
    if (!clip) return null;
    if (oneshot) { oneshot.fadeOut(0.08); }
    oneshotHeld = hold;
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
    oneshot = null; oneshotDone = null; oneshotHeld = false;
    cb?.();
  }

  // Drop any one-shot and snap the blend back to rest, for callers that need a
  // known-good animation state after something ended abnormally.
  function reset() {
    if (oneshot) oneshot.stop();
    oneshot = null; oneshotDone = null; oneshotHeld = false;
    for (const a of actions) a.action.setEffectiveWeight(a.speed === 0 ? 1 : 0);
  }

  // diagnostics: a stuck one-shot shows up here as every weight pinned near 0.15
  function weights() {
    const out = {};
    for (const a of actions) out[a.name] = +a.action.getEffectiveWeight().toFixed(3);
    out.oneshot = !!oneshot;
    out.held = oneshotHeld;
    return out;
  }

  return {
    mixer, update, playOneshot, reset, weights,
    // the retargeted clips this graph actually plays — anim/retarget.js
    // groundOffset() measures the sole against these, not against the bind pose
    clips: actions.map((a) => a.action.getClip()),
    get busy() { return !!oneshot; },
    get held() { return oneshotHeld; },
    // Duration of the clip a held one-shot is sitting on, so a caller can tell when
    // the pose has finished settling and it can stop paying for the mixer at all.
    get oneshotDuration() { return oneshot ? oneshot.getClip().duration / Math.max(Math.abs(oneshot.getEffectiveTimeScale()), 0.01) : 0; },
    cancelOneshot: finishOneshot,
    hipsY,
  };
}
