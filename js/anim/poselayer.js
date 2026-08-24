// Additive bone-pose layer, applied after the mixer has written its frame.
//
// Two modes, because the rigs are only half-compatible:
//   set(pose, weight)          — blends toward an authored pose (anim/poses.js).
//                                Poses are rest-relative, so they are rig
//                                SPECIFIC; only use them on the player.
//   twist(bone, x, y, z)       — multiplies a small local rotation onto whatever
//                                the mixer produced. Rig-agnostic, good for
//                                gestures and struggle wobble on any character.
//
// Rest quaternions are captured at construction, so a layer must be built while
// its rig is still in bind pose — i.e. during setup, never lazily mid-animation.
import * as THREE from 'three';
import { POSES, BONE_WEIGHT } from './poses.js';
import { damp } from '../core/mathx.js';

const _e = new THREE.Euler(), _q = new THREE.Quaternion();
const EMPTY = [];

export function createPoseLayer(root) {
  const bones = new Map();
  root.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  const rest = new Map();
  for (const [n, b] of bones) rest.set(n, b.quaternion.clone());

  const cache = new Map();
  function build(name) {
    let list = cache.get(name);
    if (list) return list;
    list = [];
    const def = POSES[name];
    if (def) {
      for (const bn of Object.keys(def)) {
        const b = bones.get(bn);
        if (!b) continue;
        const e = def[bn];
        _e.set(e[0], e[1], e[2]);
        const q = new THREE.Quaternion().setFromEuler(_e);
        q.premultiply(rest.get(bn));           // restQ * offsetQ
        list.push({ bone: b, q, w: BONE_WEIGHT[bn] ?? 1 });
      }
    }
    cache.set(name, list);
    return list;
  }

  let cur = null, curList = EMPTY, prevList = EMPTY;
  let target = 0, weight = 0, blend = 1, lambda = 12;

  return {
    // name === null fades the layer out
    set(name, w = 1, lam = 12) {
      if (name !== cur) {
        prevList = weight > 0.01 ? curList : EMPTY;
        cur = name;
        curList = name ? build(name) : EMPTY;
        blend = 0;
      }
      target = name ? w : 0;
      lambda = lam;
    },
    update(dt) {
      weight = damp(weight, target, lambda, dt);
      if (weight < 0.002) { prevList = EMPTY; return; }
      blend = damp(blend, 1, 16, dt);
      if (prevList.length && blend < 0.99) {
        for (const e of prevList) e.bone.quaternion.slerp(e.q, weight * e.w * (1 - blend));
      }
      for (const e of curList) e.bone.quaternion.slerp(e.q, weight * e.w * blend);
    },
    // rig-agnostic: a small extra rotation on top of this frame's pose
    twist(name, x, y, z) {
      const b = bones.get(name);
      if (!b) return;
      _e.set(x, y, z);
      b.quaternion.multiply(_q.setFromEuler(_e));
    },
    bone(name) { return bones.get(name); },
    get weight() { return weight; },
    get pose() { return cur; },
  };
}
