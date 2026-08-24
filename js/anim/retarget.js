// Clip bank. Every Meshy rig in this project shares an IDENTICAL 24-bone
// skeleton (verified at generation time by tools/check-rig.mjs), so clips
// apply to any character directly — tracks resolve by bone name. We only:
//  - strip the Hips.position X/Z channels (the controller owns translation),
//  - scale the Hips Y bob when a clip plays on a different-height skeleton.
import * as THREE from 'three';
import { MODELS } from '../engine/assets.js';

export const CLIPS = {}; // name -> AnimationClip (reference-height space)
let refHipsY = 1;

export function buildClipBank() {
  const take = (model, name) => {
    const anims = MODELS[model]?.animations || [];
    if (!anims.length) return;
    const clip = anims[0].clone();
    stripRootXZ(clip);
    CLIPS[name] = clip;
  };
  take('player', 'idle');
  take('npc_a', 'walk');
  take('npc_b', 'quick');
  take('monster_a', 'monster_walk');
  take('monster_b', 'orc_walk');
  take('clip_run', 'run');
  take('clip_punch', 'punch');
  take('clip_die', 'die');

  // the boxing clip carries a long guard prep; trim to windup→strike→recover
  if (CLIPS.punch) {
    const fps = 30;
    const trimmed = THREE.AnimationUtils.subclip(CLIPS.punch, 'punch_core', Math.floor(1.15 * fps), Math.floor(2.9 * fps), fps);
    if (trimmed.duration > 0.3) CLIPS.punch = trimmed;
  }

  // reference hips height from the player rig's rest pose
  const hips = findBone(MODELS.player.scene, 'Hips');
  if (hips) refHipsY = hips.position.y || 1;
}

function stripRootXZ(clip) {
  for (const track of clip.tracks) {
    if (track.name.endsWith('Hips.position')) {
      const v = track.values;
      for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = 0; }
    }
  }
  return clip;
}

// Per-character clip instance with hips Y scaled to that skeleton's height.
export function clipFor(name, hipsY) {
  const src = CLIPS[name];
  if (!src) return null;
  const k = hipsY / refHipsY;
  if (Math.abs(k - 1) < 0.05) return src;
  const c = src.clone();
  for (const track of c.tracks) {
    if (track.name.endsWith('Hips.position')) {
      const v = track.values;
      for (let i = 1; i < v.length; i += 3) v[i] *= k;
    }
  }
  return c;
}

export function findBone(root, name) {
  let found = null;
  root.traverse((o) => { if (!found && o.isBone && o.name === name) found = o; });
  return found;
}
