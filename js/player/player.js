// The player: capsule controller + skinned mesh + locomotion graph.
// He looks like a normal guy. He is not.
import * as THREE from 'three';
import { MODELS } from '../engine/assets.js';
import { createLocomotion } from '../anim/locomotion.js';
import { createPoseLayer } from '../anim/poselayer.js';
import { findBone, groundOffset } from '../anim/retarget.js';
import { input } from '../core/input.js';
import { game } from '../core/state.js';
import { groundHeight } from '../physics/heightfield.js';
import { capsuleVsWorld } from '../physics/collide.js';
import { damp, dampAngle, clamp } from '../core/mathx.js';

const R = 0.38;              // capsule radius
const WALK = 2.3, JOG = 4.3, SPRINT = 7.0;
// The slowest the stick will ask for.
//
// It used to map any deflection over the 0.02 dead zone linearly onto 0..WALK,
// so a small push produced a crawl of a few tenths of a metre a second. Nothing
// in the clip bank covers that: anim/locomotion.js's walk clip is authored at
// 1.4 m/s and its timeScale is floored, so below about 1 m/s the feet plant and
// slide backwards — there is no root motion and no foot IK. Worse, that band is
// where the graph sits mostly on `idle`: at a tenth of a deflection the blend is
// two thirds idle, so the stride amplitude drops to a third while the cadence
// stays up. Small mincing steps with full hip sway is the catwalk.
//
// Any INTENTIONAL input now lands at or above the walk clip's usable speed. The
// dead zone is untouched, so standing still still means standing still.
const WALK_MIN = 1.2;
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
  // Before createLocomotion, which is before any mixer update: this is the only
  // moment the rig is at its bind pose. __test.skinTwist measures against it.
  const bindQ = new Map();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => { if (o.isBone) bindQ.set(o.name, o.getWorldQuaternion(new THREE.Quaternion())); });

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
    visYaw: 0,
  };

  function fixedUpdate(dt) {
    // camera-relative move intent. None of it while he is on the floor: the
    // death clip is playing and the controller sliding him around under it is
    // the difference between "knocked down" and "bug".
    const mx = input.moveX, mz = input.moveZ;
    const mag = Math.min(1, Math.hypot(mx, mz));
    let target = 0;
    if (mag > 0.02) {
      target = mag < 0.45 ? WALK_MIN + (WALK - WALK_MIN) * (mag / 0.45) : mag < 0.92 ? WALK + (JOG - WALK) * ((mag - 0.45) / 0.47) : SPRINT;
      const camYaw = cam.yaw;
      const dirX = Math.sin(camYaw) * mz + Math.cos(camYaw) * mx;
      const dirZ = Math.cos(camYaw) * mz - Math.sin(camYaw) * mx;
      const len = Math.hypot(dirX, dirZ) || 1;
      // A charged advance is a deliberate walk, not a slowed sprint. The flat
      // 0.45 used to be applied to velocity and to nothing else, so a full-stick
      // sprint became 3.15 m/s — which the locomotion graph reads as 89% of the
      // quick clip blended with 11% of run, two clips on different foot
      // schedules. Clamping the charged speed into the walk band instead means
      // the graph resolves to one clip doing one thing.
      const chargeSlow = (p.charge > 0.05 ? 0.45 : 1) * p.carrySlow;
      const want = p.charge > 0.05
        ? Math.min(target * chargeSlow, WALK)
        : target * chargeSlow;
      p.vx = (dirX / len) * want;
      p.vz = (dirZ / len) * want;
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

    // Frozen with the simulation. main.js keeps frameSystems running while
    // 'paused' so the world stays rendered behind an overlay, but the animation
    // mixer is not scenery: player/combat.js schedules a strike at a fixed offset
    // into the punch clip, and letting the clip advance across a pause moved the
    // hit away from the frame it was supposed to land on.
    p.loco.update(game.state === 'playing' ? dt : 0, p.speed);

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

  // How far each bone's SKINNED geometry is rotated away from where the bind
  // pose put it, in degrees, for whatever is playing right now.
  //
  // This is the probe for the waist knot. A clip authored on another rig used to
  // rotate the pelvis 125 degrees at every frame, and nothing measured it: the
  // pose-error probe in anim/poselayer.js only checks bones the POSE table
  // drives, and the locomotion clip drives all 24. Reported as the angle between
  // adjacent bones' deformations, because that is what creases a mesh — a whole
  // body rotated together is a body facing a different way, but a pelvis rotated
  // against the chest above it is a knot.
  const _bq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
  window.__test.skinTwist = () => {
    root.updateWorldMatrix(true, true);
    const deform = new Map();
    root.traverse((o) => {
      if (!o.isBone || !bindQ.has(o.name)) return;
      deform.set(o.name, o.getWorldQuaternion(_bq.clone()).multiply(bindQ.get(o.name).clone().invert()));
    });
    let worst = 0, at = '';
    const pairs = [['Hips', 'Spine02'], ['Spine02', 'Spine01'], ['Spine01', 'Spine'], ['Spine', 'neck'],
      ['Hips', 'LeftUpLeg'], ['Hips', 'RightUpLeg']];
    const out = {};
    for (const [a, b] of pairs) {
      const da = deform.get(a), db = deform.get(b);
      if (!da || !db) continue;
      _pq.copy(da).invert().multiply(db);
      const deg = +(2 * Math.acos(Math.min(1, Math.abs(_pq.w))) * 180 / Math.PI).toFixed(1);
      out[`${a}-${b}`] = deg;
      if (deg > worst) { worst = deg; at = `${a}-${b}`; }
    }
    // The ABSOLUTE deformation matters too, and independently: a body whose
    // bones are all rotated together by the same wrong amount has small
    // pair angles and is still facing the wrong way. Reported for the spine
    // chain, where a walk should barely move anything.
    const abs = {};
    for (const n of ['Hips', 'Spine02', 'Spine01', 'Spine']) {
      const d = deform.get(n);
      if (d) abs[n] = +(2 * Math.acos(Math.min(1, Math.abs(d.w))) * 180 / Math.PI).toFixed(1);
    }
    return { worst, at, pairs: out, abs };
  };

  return { ...pAccessors(p), p, fixedUpdate, frameUpdate };
}

function pAccessors(p) {
  return {
    get x() { return p.x; }, get y() { return p.y; }, get z() { return p.z; },
    get yaw() { return p.yaw; },
  };
}
