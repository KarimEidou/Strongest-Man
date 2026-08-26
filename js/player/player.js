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
  root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  // Locomotion first: the sole offset is measured against the clips that will
  // actually play (see anim/retarget.js groundOffset), not against a bind pose
  // Box3 that reports the same rest geometry however the character is posed.
  // Building the graph does not move a bone — nothing calls mixer.update until
  // the first frame — so the rig is still at rest for the measurement and for
  // the pose layer built below it.
  const loco = createLocomotion(root);
  const footY = groundOffset(root, loco.clips);

  const p = {
    x: 2.5, y: 0, z: 20, yaw: 0,
    px: 2.5, py: 0, pz: 20,
    vx: 0, vy: 0, vz: 0,
    grounded: true,
    speed: 0,
    root,
    loco,
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
    // camera-relative move intent. None of it while he is on the floor: the
    // death clip is playing and the controller sliding him around under it is
    // the difference between "knocked down" and "bug".
    const mx = p.dead ? 0 : input.moveX, mz = p.dead ? 0 : input.moveZ;
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
    if (input.jumpPressed && p.grounded && !p.dead) { p.vy = JUMP_V; p.grounded = false; }
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

    // The sleeper-build reveal used to SCALE bones — forearms to 1.38, upper arms
    // to 1.22, Spine02.x to 1.10, all driven by p.charge. It is gone. Charge is
    // zeroed the frame the button releases (player/combat.js) and cannot be held
    // while sprinting, so the man visibly deflated the instant you ran: "my arms
    // grow when I load a punch" and "my whole body shrinks when I sprint" were one
    // bug, not two. Overall size is PLAYER_SCALE and nothing else touches it.
    //
    // The strain read is a POSE instead: shoulders rolling back, elbows flaring,
    // chest lifting, with a fine tremor at full wind. Twists rather than an
    // authored pose because combat.js owns pose.set() for the carry styles and
    // runs after this — an additive twist layers under that instead of fighting
    // it, and is zero-cost at charge 0.
    if (p.charge > 0.02) {
      const c = p.charge;
      const tremor = Math.sin(performance.now() * 0.031) * 0.012 * c * c;
      p.poseLayer.twist('RightArm', -0.12 * c + tremor, 0, -0.24 * c);
      p.poseLayer.twist('LeftArm', -0.12 * c - tremor, 0, 0.24 * c);
      p.poseLayer.twist('RightForeArm', -0.38 * c, 0, 0);
      p.poseLayer.twist('LeftForeArm', -0.38 * c, 0, 0);
      p.poseLayer.twist('Spine02', -0.09 * c, 0, 0);
      p.poseLayer.twist('neck', -0.05 * c, 0, 0);
    }

    // feed the camera (suspended while a test drives it)
    if (!cam.st.freeCam) cam.st.target.set(root.position.x, root.position.y - p.footY, root.position.z);
  }

  window.__test.teleport = (x, z) => { p.x = p.px = x; p.z = p.pz = z; p.y = p.py = groundHeight(x, z); };
  window.__test.faceTo = (x, z) => { p.yaw = p.visYaw = Math.atan2(x - p.x, z - p.z); };
  // #3 regression probe: sprinting must actually reach the run clip. A one-shot
  // that never retires pins every weight at 15% and the run never plays.
  window.__test.locoWeights = () => p.loco.weights();
  window.__test.playerStats = () => ({
    x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3),
    ground: +groundHeight(p.x, p.z).toFixed(2), speed: +p.speed.toFixed(2), grounded: p.grounded,
    charge: +p.charge.toFixed(3), carrySlow: p.carrySlow,
  });
  // #12 regression probe: world size must not change between animation states.
  // Height alone was not enough — the charge swell was 38% on the forearms and 10%
  // on the chest, none of which moves the top of the head, so it measured clean
  // through the whole bug. All three axes now.
  window.__test.playerHeight = () => {
    const b = new THREE.Box3().setFromObject(root);
    return +(b.max.y - b.min.y).toFixed(4);
  };
  window.__test.playerBounds = () => {
    const b = new THREE.Box3().setFromObject(root);
    return {
      w: +(b.max.x - b.min.x).toFixed(4),
      h: +(b.max.y - b.min.y).toFixed(4),
      d: +(b.max.z - b.min.z).toFixed(4),
    };
  };
  // Bone scale is the thing that must never move. Report the largest deviation
  // from 1 anywhere in the skeleton, so a probe can assert it outright.
  window.__test.boneScaleDrift = () => {
    let worst = 0, name = '';
    root.traverse((o) => {
      if (!o.isBone) return;
      const d = Math.max(Math.abs(o.scale.x - 1), Math.abs(o.scale.y - 1), Math.abs(o.scale.z - 1));
      if (d > worst) { worst = d; name = o.name; }
    });
    return { worst: +worst.toFixed(5), bone: name };
  };

  return { ...pAccessors(p), p, fixedUpdate, frameUpdate };
}

function pAccessors(p) {
  return {
    get x() { return p.x; }, get y() { return p.y; }, get z() { return p.z; },
    get yaw() { return p.yaw; },
  };
}
