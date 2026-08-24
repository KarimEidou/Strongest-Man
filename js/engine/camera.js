// Third-person follow camera: swipe orbits (yaw/pitch), spring-damped follow,
// camera pulls in when geometry blocks the view, trauma-based shake.
import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/mathx.js';
import { consumeLook } from '../core/input.js';

const DIST = 6.2;
const MIN_PITCH = -0.18, MAX_PITCH = 0.98;
const SHOULDER = 0.55;
const HEAD = 1.55;

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 300);
  const st = {
    yaw: Math.PI, pitch: 0.34,
    curYaw: Math.PI, curPitch: 0.34,
    target: new THREE.Vector3(0, 0, 0),   // player feet pos, fed each frame
    smoothed: new THREE.Vector3(0, 0, 0),
    trauma: 0,
    dist: DIST, curDist: DIST,
    // occlusionQuery(from, to) -> allowed distance; installed by world in P3+
    occlusionQuery: null,
    pushIn: 0, // monster-realization dolly (0..1)
  };

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const eye = new THREE.Vector3(), look = new THREE.Vector3(), off = new THREE.Vector3();

  function frameUpdate(dt) {
    const [ldx, ldy] = consumeLook();
    st.yaw -= ldx * 0.0038;
    st.pitch = clamp(st.pitch + ldy * 0.0030, MIN_PITCH, MAX_PITCH);
    st.curYaw = dampAngle(st.curYaw, st.yaw, 22, dt);
    st.curPitch = damp(st.curPitch, st.pitch, 22, dt);

    st.smoothed.x = damp(st.smoothed.x, st.target.x, 14, dt);
    st.smoothed.y = damp(st.smoothed.y, st.target.y, 10, dt);
    st.smoothed.z = damp(st.smoothed.z, st.target.z, 14, dt);

    const wanted = st.dist * (1 - 0.35 * st.pushIn);
    const cp = Math.cos(st.curPitch), sp = Math.sin(st.curPitch);
    const cy = Math.cos(st.curYaw), sy = Math.sin(st.curYaw);

    look.set(st.smoothed.x, st.smoothed.y + HEAD, st.smoothed.z);
    // shoulder offset perpendicular to view
    look.x += cy * SHOULDER; look.z -= sy * SHOULDER;

    off.set(sy * cp, sp, cy * cp).multiplyScalar(wanted);
    eye.copy(look).add(off);

    let allowed = wanted;
    if (st.occlusionQuery && !st.noOcclusion) allowed = st.occlusionQuery(look, eye, wanted);
    st.curDist = damp(st.curDist, allowed, allowed < st.curDist ? 60 : 6, dt);
    eye.copy(look).addScaledVector(off, st.curDist / wanted);

    // trauma shake (decays, squared falloff feels right)
    if (st.trauma > 0) {
      st.trauma = Math.max(0, st.trauma - dt * 1.4);
      const s = st.trauma * st.trauma;
      const t = performance.now() * 0.001;
      eye.x += Math.sin(t * 91.7) * 0.35 * s;
      eye.y += Math.cos(t * 113.1) * 0.28 * s;
      look.y += Math.sin(t * 127.3) * 0.2 * s;
    }

    camera.position.copy(eye);
    camera.lookAt(look);
    st.pushIn = Math.max(0, st.pushIn - dt * 1.2);
  }

  return {
    camera, st, frameUpdate,
    shake(amount) { st.trauma = Math.min(1, st.trauma + amount); },
    realizePushIn() { st.pushIn = 1; },
    get yaw() { return st.curYaw; },
  };
}
