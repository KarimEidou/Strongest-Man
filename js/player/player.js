// The player: capsule controller + skinned mesh + locomotion graph.
// He looks like a normal guy. He is not.
import * as THREE from 'three';
import { MODELS } from '../engine/assets.js';
import { createLocomotion } from '../anim/locomotion.js';
import { createPoseLayer } from '../anim/poselayer.js';
import { findBone, groundOffset } from '../anim/retarget.js';
import { input } from '../core/input.js';
import { groundHeight } from '../physics/heightfield.js';
import { capsuleVsWorld } from '../physics/collide.js';
import { damp, dampAngle, clamp } from '../core/mathx.js';

const R = 0.38;              // capsule radius
const WALK = 2.3, JOG = 4.3, SPRINT = 7.0;
const JUMP_V = 9.0;
// One number for overall build. Clip scale tracks are stripped in
// anim/retarget.js so nothing else can change his size at runtime.
export const PLAYER_SCALE = 1.0;

export function createPlayer(scene, cam) {
  const root = MODELS.player.scene;
  root.scale.setScalar(PLAYER_SCALE);
  scene.add(root);
  const footY = groundOffset(root);

  const p = {
    x: 2.5, y: 0, z: 20, yaw: 0,
    px: 2.5, py: 0, pz: 20,
    vx: 0, vy: 0, vz: 0,
    grounded: true,
    speed: 0,
    root,
    loco: createLocomotion(root),
    // built here, before any mixer update, so it captures the true bind pose
    poseLayer: createPoseLayer(root),
    bones: {
      hips: findBone(root, 'Hips'),
      spine2: findBone(root, 'Spine02') || findBone(root, 'Spine01') || findBone(root, 'Spine'),
      head: findBone(root, 'Head'),
      lFore: findBone(root, 'LeftForeArm'),
      rFore: findBone(root, 'RightForeArm'),
      lArm: findBone(root, 'LeftArm'),
      rArm: findBone(root, 'RightArm'),
      lHand: findBone(root, 'LeftHand'),
      rHand: findBone(root, 'RightHand'),
    },
    footY,
    carrySlow: 1,
    charge: 0,            // 0..1 punch charge (combat writes; outfit/anim read)
    tearStage: 0,
    dead: false,
    visYaw: 0,
  };

  function fixedUpdate(dt) {
    // camera-relative move intent
    const mx = input.moveX, mz = input.moveZ;
    const mag = Math.min(1, Math.hypot(mx, mz));
    let target = 0;
    if (mag > 0.02) {
      target = mag < 0.45 ? WALK * (mag / 0.45) : mag < 0.92 ? WALK + (JOG - WALK) * ((mag - 0.45) / 0.47) : SPRINT;
      const camYaw = cam.yaw;
      const dirX = Math.sin(camYaw) * mz + Math.cos(camYaw) * mx;
      const dirZ = Math.cos(camYaw) * mz - Math.sin(camYaw) * mx;
      const len = Math.hypot(dirX, dirZ) || 1;
      const chargeSlow = (p.charge > 0.05 ? 0.45 : 1) * p.carrySlow;
      p.vx = (dirX / len) * target * chargeSlow;
      p.vz = (dirZ / len) * target * chargeSlow;
      p.yaw = Math.atan2(dirX, dirZ);
    } else {
      p.vx = damp(p.vx, 0, 18, dt);
      p.vz = damp(p.vz, 0, 18, dt);
    }
    p.speed = Math.hypot(p.vx, p.vz);

    // vertical
    const g = groundHeight(p.x, p.z);
    if (input.jumpPressed && p.grounded) { p.vy = JUMP_V; p.grounded = false; }
    p.vy += -22 * dt;

    p.px = p.x; p.py = p.y; p.pz = p.z;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

    const gNow = groundHeight(p.x, p.z);
    // step up small ledges (curbs, rubble) only when falling/level
    if (p.y <= gNow) {
      if (gNow - g > 0.55 && p.vy <= 0.01 && p.grounded) {
        // too tall to step: slide back
        p.x = p.px; p.z = p.pz;
        p.y = g;
      } else {
        p.y = gNow;
      }
      p.vy = 0;
      p.grounded = true;
    } else if (p.y - gNow > 0.05) {
      p.grounded = false;
    }

    const [cx, cz] = capsuleVsWorld(p.x, p.z, p.y + 0.9, R);
    p.x = cx; p.z = cz;
  }

  function frameUpdate(dt, alpha) {
    // interpolate visual transform between fixed steps
    root.position.set(
      p.px + (p.x - p.px) * alpha,
      p.py + (p.y - p.py) * alpha + p.footY,
      p.pz + (p.z - p.pz) * alpha,
    );
    p.visYaw = dampAngle(p.visYaw, p.yaw, 16, dt);
    root.rotation.set(0, p.visYaw, 0);

    p.loco.update(dt, p.speed);

    // sleeper-build reveal: winding a charge swells forearms/shoulders — the
    // stretched sleeve IS the fabric-strain read. Permanent baseline rises
    // with tear stage.
    const base = 1 + p.tearStage * 0.06;
    const swell = base + p.charge * 0.38;
    const armSwell = base + p.charge * 0.22;
    for (const b of [p.bones.lFore, p.bones.rFore]) if (b) b.scale.setScalar(damp(b.scale.x, swell, 12, dt));
    for (const b of [p.bones.lArm, p.bones.rArm]) if (b) b.scale.setScalar(damp(b.scale.x, armSwell, 12, dt));
    if (p.bones.spine2) {
      const s = 1 + p.charge * 0.1 + p.tearStage * 0.03;
      p.bones.spine2.scale.x = damp(p.bones.spine2.scale.x, s, 12, dt);
    }

    // feed the camera (suspended while a test drives it)
    if (!cam.st.freeCam) cam.st.target.set(root.position.x, root.position.y - p.footY, root.position.z);
  }

  window.__test.teleport = (x, z) => { p.x = p.px = x; p.z = p.pz = z; p.y = p.py = groundHeight(x, z); };
  window.__test.faceTo = (x, z) => { p.yaw = p.visYaw = Math.atan2(x - p.x, z - p.z); };
  window.__test.playerStats = () => ({
    x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
    ground: +groundHeight(p.x, p.z).toFixed(2), speed: +p.speed.toFixed(2), grounded: p.grounded,
  });
  // #12 regression probe: world height must not change between animation states
  window.__test.playerHeight = () => {
    const b = new THREE.Box3().setFromObject(root);
    return +(b.max.y - b.min.y).toFixed(4);
  };

  return { ...pAccessors(p), p, fixedUpdate, frameUpdate };
}

function pAccessors(p) {
  return {
    get x() { return p.x; }, get y() { return p.y; }, get z() { return p.z; },
    get yaw() { return p.yaw; },
  };
}
