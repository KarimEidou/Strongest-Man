// Clip bank.
//
// Every Meshy rig in this project has the same 24 bones in the same order, so a
// track resolves by name on any of them — but they do NOT share a bind pose, and
// the comment here used to claim they did. Run
//   node tools/check-rig.mjs assets/models/player.glb assets/models/npc_a.glb \
//        assets/models/npc_b.glb
// and it prints the table: against the player's rig, npc_a's Hips bind sits
// 120.4 degrees away, its hands 46 and 38, its forearms 22; npc_b is 104.4 at
// the Hips and 59 / 57 at the hands. That tool compared bone names and order
// only, which is why it used to report a clean match.
//
// That difference is real and it is measurable in play — `__test.skinTwist()`
// reports the player's waist sitting 122 degrees from its own bind through the
// whole 0.3..3.4 m/s band, where the walk and quick clips (npc_a's and npc_b's)
// carry the weight, and under 14 degrees at a standstill and at a sprint, where
// the clips are the player's own.
//
// It is NOT corrected here, and that is a decision rather than an omission. A
// full bind-space retarget was built and measured: it collapses that 122 degrees
// to 9 across the whole band, and it makes the player visibly hunch. Both are
// true at once because the 125 degrees is very largely bone ROLL — a rotation
// about each bone's own axis, which the clip's own downstream rotations already
// compensate for, so the composed pose was already right and re-basing it
// applies the correction twice. See ASSUMPTIONS.md.
//
// So this file does three things:
//  - centres the Hips.position X/Z channels rather than deleting them (the
//    controller owns travel; the pelvis still owns its sway — see normalizeClip),
//  - strips every .scale track (see normalizeClip),
//  - scales the Hips bob and sway when a clip plays on a different-height rig.
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MODELS } from '../engine/assets.js';

export const CLIPS = {}; // name -> AnimationClip

// Bind hips height of the rig each clip was AUTHORED on. This is the whole
// correctness of the retarget: a Hips.position track is an absolute height in
// its own rig's units, so moving it to a different-sized skeleton means scaling
// it by the ratio of the two rigs' hips — and leaving it alone when the clip is
// played back on the very rig it came off.
//
// It used to be scaled by (targetHips / PLAYER hips) for every clip, on the
// assumption that the whole bank lived in the player's height space. Two of them
// do not: `walk` is npc_a's own animation and `quick` is npc_b's. Playing a
// character's own walk back on it therefore multiplied its hips by the ratio of
// two different rigs, lifting the hips and taking the legs and the feet straight
// up with them — the report of characters floating above the street.
const CLIP_HIPS = {};
let refHipsY = 1;

export function buildClipBank() {
  // Reference height first, and from the REST pose: player/player.js drives
  // MODELS.player.scene itself (it is not cloned), so once a mixer has touched it
  // this bone is wherever the idle clip last put it — 105.6 rather than the 97.4
  // it rests at. Reading it here, before createPlayer, is the only moment it is
  // still the bind value.
  refHipsY = hipsOf('player') || 1;

  // `rig` names the model whose skeleton the clip was authored on; the
  // animation-only GLBs (clip_run/punch/die) carry no skeleton at all — they are
  // Meshy library takes on the shared 24-bone rig, i.e. player space.
  const take = (model, name, rig = model) => {
    const anims = MODELS[model]?.animations || [];
    if (!anims.length) return;
    const clip = anims[0].clone();
    normalizeClip(clip, name);
    CLIPS[name] = clip;
    CLIP_HIPS[name] = hipsOf(rig) || refHipsY;
  };
  take('player', 'idle');
  take('npc_a', 'walk');
  take('npc_b', 'quick');
  take('clip_run', 'run', 'player');
  take('clip_punch', 'punch', 'player');
  take('clip_die', 'die', 'player');

  // the boxing clip carries a long guard prep; trim to windup→strike→recover
  if (CLIPS.punch) {
    const fps = 30;
    const trimmed = THREE.AnimationUtils.subclip(CLIPS.punch, 'punch_core', Math.floor(1.15 * fps), Math.floor(2.9 * fps), fps);
    if (trimmed.duration > 0.3) CLIPS.punch = trimmed;
  }
}

function hipsOf(model) {
  const scene = MODELS[model]?.scene;
  if (!scene) return 0;
  const h = findBone(scene, 'Hips');
  return h ? h.position.y : 0;
}

// Every exported clip carries a .scale track for all 24 bones. In all of them
// but one those tracks are identity — but the player's idle animates
// Hips.scale = 1.1765, and Hips is the skeleton root, so the whole character was
// 17% larger standing still than running and visibly shrank the moment he moved
// (and stood with his feet ~17cm through the pavement). Dropping the scale
// channels outright gives one constant, correctly-grounded size in every state;
// overall build is PLAYER_SCALE in player/player.js if it ever wants tuning.
//
// The Hips.position X/Z channels used to be set to zero outright, on the
// reasoning that the controller owns translation. Zero is the wrong constant.
// Measured over the looping clips, none of them has any root-motion drift to
// strip — first key to last is 0.00 on both axes — so what that assignment
// actually deleted was the PELVIC SWAY, and then shoved the body off its own
// centre line by however far the sway was offset. npc_a's walk swings the hips
// 7.8 cm peak to peak about a mean 3.8 cm off centre; the player's idle 3.5 cm.
// A body that glides down a rail with no weight shift is half of the catwalk.
//
// So: subtract the MEAN rather than the value. Real travel would survive that,
// which is why `die` — the one clip with genuine X/Z travel, 5.5 and -81.8 units
// of it — keeps being zeroed outright.
const TRAVELS = new Set(['die']);
function normalizeClip(clip, name) {
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
  for (const track of clip.tracks) {
    if (!track.name.endsWith('Hips.position')) continue;
    const v = track.values;
    if (TRAVELS.has(name)) {
      for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = 0; }
      continue;
    }
    let mx = 0, mz = 0;
    const n = v.length / 3;
    for (let i = 0; i < v.length; i += 3) { mx += v[i]; mz += v[i + 2]; }
    mx /= n; mz /= n;
    for (let i = 0; i < v.length; i += 3) { v[i] -= mx; v[i + 2] -= mz; }
  }
  return clip;
}

// Per-character clip instance with hips Y scaled to that skeleton's height.
// Retargets are cached by rounded ratio: 48 townsfolk share two rigs, so this is
// two clones per clip instead of forty-eight, and an AnimationClip is safe to
// share across mixers (three keys its actions by clip AND root).
const retargetCache = new Map();
export function clipFor(name, hipsY) {
  const src = CLIPS[name];
  if (!src) return null;
  const k = hipsY / (CLIP_HIPS[name] || refHipsY);
  // 2% of hips height is ~2cm on a person and ~3cm on a monster: below that the
  // clone costs more than it corrects.
  if (Math.abs(k - 1) < 0.02) return src;
  const key = `${name}:${k.toFixed(3)}`;
  const hit = retargetCache.get(key);
  if (hit) return hit;
  const c = src.clone();
  for (const track of c.tracks) {
    if (track.name.endsWith('Hips.position')) {
      // All three axes: the sway normalizeClip preserved is in the SOURCE rig's
      // units, the same as the bob, so it scales by the same ratio. Scaling only
      // Y would leave a 7.8 cm sway authored on npc_a reading as 7.8 cm on a
      // rig a third taller.
      const v = track.values;
      for (let i = 0; i < v.length; i += 3) { v[i] *= k; v[i + 1] *= k; v[i + 2] *= k; }
    }
  }
  retargetCache.set(key, c);
  return c;
}

export function findBone(root, name) {
  let found = null;
  root.traverse((o) => { if (!found && o.isBone && o.name === name) found = o; });
  return found;
}

// ---------------------------------------------------------------------------
// Grounding.
//
// Distance from a character root's origin down to the soles. Rig origins are not
// reliably at the feet, and planting a root at ground height without this is
// exactly why the monsters hovered.
//
// The bind pose alone is not enough to measure it, because Box3 does not skin:
// setFromObject on a SkinnedMesh reports the REST geometry however the character
// is actually posed. So an offset taken from the bind pose says nothing about
// where the feet end up once a clip is playing, and the old #13 probe — which
// measured the same rest box the offset came from — was tautological and read a
// perfect 0.000 gap through the entire float.
//
// Pass the locomotion clips and the offset is measured off the animation
// instead: one full cycle of each, on a throwaway clone, keeping the LOWEST sole
// the character ever reaches. Erring low means a stride can never punch through
// the pavement; erring high would be the hover all over again.
const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const FOOT_BONES = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'];

// World Y of the lowest foot BONE right now — the one thing that does track the
// pose, since bones are real objects with real world matrices.
export function footBoneY(root) {
  let lowest = Infinity;
  root.traverse((o) => {
    if (!o.isBone || !FOOT_BONES.includes(o.name)) return;
    o.updateWorldMatrix(true, false);
    _v.setFromMatrixPosition(o.matrixWorld);
    if (_v.y < lowest) lowest = _v.y;
  });
  return lowest;
}

// How far the sole sits below that bone. Feet are rigid, so this is a constant
// of the rig and can be measured once, in the bind pose, then subtracted from
// footBoneY() to get the sole at any point in any animation.
export function soleDropOf(root) {
  root.updateWorldMatrix(true, true);
  _box.setFromObject(root);
  const bone = footBoneY(root);
  if (!isFinite(bone) || !isFinite(_box.min.y)) return 0;
  return bone - _box.min.y;
}

export function groundOffset(root, clips = null) {
  root.updateWorldMatrix(true, true);
  _box.setFromObject(root);
  if (!isFinite(_box.min.y)) return 0;
  const bind = root.position.y - _box.min.y;
  const list = (clips || []).filter(Boolean);
  if (!list.length) return bind;

  // Measured on a copy: the player's root is the shared MODELS.player.scene and
  // anim/poselayer.js captures its bind pose immediately after this call, so the
  // one thing this must not do is leave a skeleton mid-stride.
  let probe;
  try { probe = cloneSkeleton(root); } catch { return bind; }
  probe.position.set(0, 0, 0);
  probe.quaternion.identity();
  probe.scale.copy(root.scale);
  const soleDrop = soleDropOf(probe);

  const mixer = new THREE.AnimationMixer(probe);
  let lowest = Infinity;
  const STEPS = 30;
  for (const clip of list) {
    const a = mixer.clipAction(clip);
    a.reset();
    a.setEffectiveWeight(1);
    a.play();
    const step = clip.duration / STEPS;
    for (let i = 0; i <= STEPS; i++) {
      mixer.update(i === 0 ? 0 : step);
      probe.updateWorldMatrix(true, true);
      const y = footBoneY(probe) - soleDrop;
      if (y < lowest) lowest = y;
    }
    a.stop();
  }
  mixer.uncacheRoot(probe);
  if (!isFinite(lowest)) return bind;
  return -lowest;
}

// What the locomotion set actually plays, retargeted for a given rig — so a
// caller can hand exactly those clips to groundOffset above.
export function locoClipsFor(names, hipsY) {
  return names.map((n) => clipFor(n, hipsY)).filter(Boolean);
}
