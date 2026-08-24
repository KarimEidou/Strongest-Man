// The sleeper build, sold in stages. Cumulative player-caused feat magnitude
// tears the disguise: sleeves strain, seams split, torn flaps appear, and the
// baseline muscle swell (in player.js) rises. Texture stays singular — flaps
// are tiny bone-parented meshes, tint shifts are material-level.
import * as THREE from 'three';
import { on, EV } from '../core/events.js';
import { findBone } from '../anim/retarget.js';
import { toast } from '../ui/overlays.js';

const STAGES = [120, 380, 800]; // cumulative feat magnitude thresholds

export function initOutfit(playerSys) {
  const p = playerSys.p;
  let total = 0;
  let mat = null;
  p.root.traverse((o) => { if (o.isMesh && !mat) mat = o.material; });
  const baseColor = mat ? mat.color.clone() : null;

  const flapMat = new THREE.MeshLambertMaterial({ color: 0x1c2f66, side: THREE.DoubleSide });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a06b });
  const flaps = [];

  function addFlap(boneName, w, h, out, material) {
    const bone = findBone(p.root, boneName);
    if (!bone) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(out, 0.02, 0);
    m.rotation.z = Math.random() * 0.8 - 0.4;
    m.visible = false;
    bone.add(m);
    flaps.push(m);
    return m;
  }
  // authored ahead, toggled per stage
  const s2 = [
    addFlap('LeftArm', 0.05, 0.09, 0.05, flapMat),
    addFlap('RightArm', 0.05, 0.09, -0.05, flapMat),
    addFlap('Spine2', 0.07, 0.1, 0.09, flapMat),
  ];
  const s3 = [
    addFlap('LeftForeArm', 0.04, 0.08, 0.045, skinMat),
    addFlap('RightForeArm', 0.04, 0.08, -0.045, skinMat),
    addFlap('Spine2', 0.08, 0.12, -0.09, skinMat),
    addFlap('LeftShoulder', 0.06, 0.08, 0.05, flapMat),
  ];

  on(EV.FEAT, ({ magnitude }) => {
    total += magnitude || 0;
    const stage = total >= STAGES[2] ? 3 : total >= STAGES[1] ? 2 : total >= STAGES[0] ? 1 : 0;
    if (stage !== p.tearStage) {
      p.tearStage = stage;
      if (mat && baseColor) {
        // fabric loses its crispness as it shreds
        mat.color.copy(baseColor).offsetHSL(0, -0.06 * stage, 0.015 * stage);
      }
      for (const f of s2) if (f) f.visible = stage >= 2;
      for (const f of s3) if (f) f.visible = stage >= 3;
      if (stage === 1) toast('Seams strain across your back.');
      if (stage === 2) toast('Your sleeves are giving up.');
      if (stage === 3) toast('The jacket is past saving. Everyone can see what you are.');
    }
  });
}
