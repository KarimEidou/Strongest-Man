// Additive bone-pose layer, applied after the mixer has written its frame.
//
//   set(pose, weight)          — blends toward an authored pose. Two authoring
//                                styles, below.
//   twist(bone, x, y, z)       — multiplies a small local rotation onto whatever
//                                the mixer produced. Rig-agnostic, good for
//                                gestures and struggle wobble on any character.
//
// AUTHORING STYLE 1 — EULER OFFSETS (`[x, y, z]` radians, applied as
// restQ * offsetQ). Cheap, but doubly relative: to the rig's bind rotations,
// which differ between the player and the two townsfolk bodies, AND to whatever
// the mixer wrote this frame. Fine for a small nudge on a known rig.
//
// AUTHORING STYLE 2 — TARGET DIRECTIONS (`{ dir: [x, y, z], twist?, w? }`). The
// bone declares where its axis should POINT, in character space: +Z is the way
// the character faces, +Y up, +X its left (checked against the rigs — the
// `headfront` helper sits at z +13.7 and the toes at z +6.3, and every bone's
// local +Y runs along itself toward its child). This is resolved against the
// bone's LIVE parent every frame, not against the bind pose, which is what makes
// it absolute: it lands in the same place whether the mixer underneath is playing
// idle, a walk cycle, or a death clip baked on somebody else's skeleton. That
// matters here because the clip bank is shared across rigs whose bind poses are
// nothing like each other, so "rest-relative" means something different on every
// body — and a pose that has to hold a hanging man off the pavement cannot drift
// by 50° depending on what his legs were doing when you grabbed him.
//
// Order the table parents-first-ish and it stays cheap: one quaternion multiply
// and a slerp per bone, and the parent chain is memoised per update.
import * as THREE from 'three';
import { POSES, BONE_WEIGHT } from './poses.js';
import { damp } from '../core/mathx.js';

const _e = new THREE.Euler(), _q = new THREE.Quaternion();
const _inv = new THREE.Quaternion(), _tw = new THREE.Quaternion();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const EMPTY = [];

export function createPoseLayer(root, table = POSES, weights = BONE_WEIGHT) {
  const bones = new Map();
  root.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  const rest = new Map();
  for (const [n, b] of bones) rest.set(n, b.quaternion.clone());

  const depth = (b) => { let d = 0, o = b; while (o) { d++; o = o.parent; } return d; };

  const cache = new Map();
  function build(name) {
    let list = cache.get(name);
    if (list) return list;
    list = [];
    const def = table[name];
    if (def) {
      const first = def[Object.keys(def)[0]];
      if (Array.isArray(first)) {
        for (const bn of Object.keys(def)) {
          const b = bones.get(bn);
          if (!b) continue;
          const e = def[bn];
          _e.set(e[0], e[1], e[2]);
          const q = new THREE.Quaternion().setFromEuler(_e);
          q.premultiply(rest.get(bn));           // restQ * offsetQ
          list.push({ bone: b, q, w: weights[bn] ?? 1 });
        }
      } else {
        const picked = Object.keys(def).map((n) => bones.get(n)).filter(Boolean);
        picked.sort((a, b) => depth(a) - depth(b));   // parents resolve before children
        for (const b of picked) {
          const spec = def[b.name];
          list.push({
            bone: b,
            dir: new THREE.Vector3().fromArray(spec.dir).normalize(),
            twist: spec.twist || 0,
            w: spec.w ?? weights[b.name] ?? 1,
            q: new THREE.Quaternion(),        // this frame's target, recomputed
            world: new THREE.Quaternion(),    // and where it ended up
          });
        }
      }
    }
    cache.set(name, list);
    return list;
  }

  // Live world rotation of a bone's parent chain, memoised for the current update.
  const chain = new Map();
  const posed = new Map();
  const _rootQ = new THREE.Quaternion();
  function parentWorld(node) {
    if (!node) return _rootQ;
    const hit = posed.get(node) || chain.get(node);
    if (hit) return hit;
    let q;
    if (node.isBone) {
      q = new THREE.Quaternion().copy(parentWorld(node.parent)).multiply(node.quaternion);
    } else {
      q = node.getWorldQuaternion(new THREE.Quaternion());
    }
    chain.set(node, q);
    return q;
  }

  function applyList(list, factor) {
    for (const e of list) {
      if (!e.dir) { e.bone.quaternion.slerp(e.q, factor * e.w); continue; }
      const pw = parentWorld(e.bone.parent);
      _v.copy(e.dir).applyQuaternion(_rootQ).applyQuaternion(_inv.copy(pw).invert());
      e.q.setFromUnitVectors(UP, _v);
      if (e.twist) e.q.multiply(_tw.setFromAxisAngle(UP, e.twist));
      e.bone.quaternion.slerp(e.q, factor * e.w);
      posed.set(e.bone, e.world.copy(pw).multiply(e.bone.quaternion));
    }
  }

  let cur = null, curList = EMPTY, prevList = EMPTY;
  let target = 0, weight = 0, blend = 1, lambda = 12;

  // An extra rotation folded into the character frame every posed direction is
  // resolved against. Aiming needs it: an authored pose is a fixed set of
  // directions in character space, and a gun has to point wherever the camera
  // does — which is a continuous angle, not one of three tables. Biasing the
  // frame instead pitches the arms, the gun, the chest and the head together,
  // for one quaternion multiply, and leaves the legs walking.
  const _bias = new THREE.Quaternion();
  let biased = false;

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
    // q === null clears it. Applied in the ROOT's own frame, so its X axis is
    // the character's left and a rotation about it is pitch.
    setBias(q) {
      if (q) { _bias.copy(q); biased = true; } else biased = false;
    },
    update(dt) {
      weight = damp(weight, target, lambda, dt);
      if (weight < 0.002) { prevList = EMPTY; return; }
      blend = damp(blend, 1, 16, dt);
      chain.clear(); posed.clear();
      root.getWorldQuaternion(_rootQ);
      if (biased) _rootQ.multiply(_bias);
      if (prevList.length && blend < 0.99) applyList(prevList, weight * (1 - blend));
      applyList(curList, weight * blend);
    },
    // rig-agnostic: a small extra rotation on top of this frame's pose
    twist(name, x, y, z) {
      const b = bones.get(name);
      if (!b) return;
      _e.set(x, y, z);
      b.quaternion.multiply(_q.setFromEuler(_e));
    },
    bone(name) { return bones.get(name); },
    // diagnostics: where each posed bone's axis actually ended up this frame, in
    // character space, against what the table asked for
    poseError() {
      if (!curList.length || !curList[0].dir) return null;
      root.getWorldQuaternion(_rootQ);
      if (biased) _rootQ.multiply(_bias);   // measure against what was ASKED for
      _inv.copy(_rootQ).invert();
      let worst = 0, at = '';
      const out = curList.map((e) => {
        e.bone.updateWorldMatrix(true, false);
        _v.set(0, 1, 0).applyQuaternion(e.bone.getWorldQuaternion(_q)).applyQuaternion(_inv);
        const err = +(Math.acos(Math.min(1, Math.max(-1, _v.dot(e.dir)))) * 180 / Math.PI).toFixed(1);
        if (err > worst) { worst = err; at = e.bone.name; }
        return { bone: e.bone.name, err };
      });
      return { worst, at, bones: out };
    },
    get weight() { return weight; },
    get pose() { return cur; },
  };
}
