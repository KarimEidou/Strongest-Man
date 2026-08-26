// Clip bank. Every Meshy rig in this project shares an IDENTICAL 24-bone
// skeleton (verified at generation time by tools/check-rig.mjs), so clips
// apply to any character directly — tracks resolve by bone name. We only:
//  - strip the Hips.position X/Z channels (the controller owns translation),
//  - strip every .scale track (see normalizeClip),
//  - scale the Hips Y bob when a clip plays on a different-height skeleton.
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
// assumption that the whole bank lived in the player's height space. Four of the
// eight clips do not: walk is npc_a's own animation, quick is npc_b's,
// monster_walk is monster_a's and orc_walk is monster_b's. Playing monster_a's
// walk back on monster_a therefore multiplied its hips by 134.3/97.4 = 1.379,
// lifting the hips 52 bone units — 0.63 m once the 1.2 body scale is applied —
// and taking the legs, and the feet, straight up with them. That is the report
// of monsters floating above the street: measured, monster_a's toes sat 0.84 m
// off the ground and monster_b's 1.32 m.
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
    normalizeClip(clip);
    CLIPS[name] = clip;
    CLIP_HIPS[name] = hipsOf(rig) || refHipsY;
  };
  take('player', 'idle');
  take('npc_a', 'walk');
  take('npc_b', 'quick');
  take('monster_a', 'monster_walk');
  take('monster_b', 'orc_walk');
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
function normalizeClip(clip) {
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
  for (const track of clip.tracks) {
    if (track.name.endsWith('Hips.position')) {
      const v = track.values;
      for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = 0; }
    }
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
      const v = track.values;
      for (let i = 1; i < v.length; i += 3) v[i] *= k;
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
