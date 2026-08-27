// Third-person follow camera: swipe orbits (yaw/pitch), spring-damped follow,
// camera pulls in when geometry blocks the view, trauma-based shake.
import * as THREE from 'three';
import { clamp, damp, dampAngle, shortAngle } from '../core/mathx.js';
import { consumeLook } from '../core/input.js';
import { groundHeight } from '../physics/heightfield.js';
import { flags } from '../core/debug.js';

const DIST = 6.2;
// -0.18 was fine while the only reach was a fist. A gun has to be able to point
// at the head of a 3.4m monster standing three metres away, which is 34 degrees
// up, and at the top of a building. Going this far up swings the eye BELOW the
// look point, so the ground constraint below the occlusion query is what makes
// it safe. player/weapons.js repeats these two numbers, because recoil writes
// the pitch directly.
const MIN_PITCH = -0.50, MAX_PITCH = 0.98;
const EYE_CLEAR = 0.35;         // how far the camera stays off the pavement
const MIN_DIST = 1.6;           // closest the ground may pull the boom in
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
    // two-shot framing during a conversation: {a, b} live objects with x/z
    framing: null,
    framingW: 0,
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

    // Conversation two-shot: ease the camera round to a side-on view of the
    // pair and pull in, then hand control back when the chat ends.
    st.framingW = damp(st.framingW, st.framing ? 1 : 0, 3.2, dt);
    if (st.framingW > 0.002 && st.framing) {
      const { a, b } = st.framing;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      st.target.set(mx, st.target.y, mz);
      // perpendicular to the line between them, on whichever side the camera
      // is already closest to, so it never swings through their faces
      const axis = Math.atan2(b.x - a.x, b.z - a.z);
      let want = axis + Math.PI / 2;
      if (Math.abs(shortAngle(want - st.yaw)) > Math.PI / 2) want -= Math.PI;
      st.yaw = dampAngle(st.yaw, want, 2.4 * st.framingW, dt);
      st.pitch = damp(st.pitch, 0.16, 2.4 * st.framingW, dt);
      st.dist = damp(st.dist, 4.4, 2.4 * st.framingW, dt);
    }
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
    // Aiming up swings the eye down and, past about -0.20, under the street. The
    // occlusion query only knows about walls, so the floor needs saying — and it
    // has to be said as a DISTANCE, not as a height.
    //
    // Raising eye.y on its own moves the eye without moving `look`, which tilts
    // what lookAt() produces away from st.curPitch. The SHOT is built purely from
    // st.curPitch (player/weapons.js aimAngles) and the reticle is a div pinned
    // at 50%/50%, so the two have to agree or the crosshair lies: with the height
    // clamp, aiming 29 degrees up put the screen centre at 12 and the round at
    // 29, and a 9-degree assist cone cannot cover a 16-degree error.
    // Shortening the boom instead slides the eye along the very same ray, so the
    // view direction IS the aim direction at every pitch and the camera simply
    // dollies in when he looks up — which is what a shoulder camera should do.
    const gy = Math.max(groundHeight(look.x, look.z), groundHeight(eye.x, eye.z));
    if (sp < -1e-3) allowed = Math.min(allowed, Math.max(MIN_DIST, (gy + EYE_CLEAR - look.y) / sp));
    st.curDist = damp(st.curDist, allowed, allowed < st.curDist ? 60 : 6, dt);
    eye.copy(look).addScaledVector(off, st.curDist / wanted);
    // Last resort, on ground steep enough that even MIN_DIST does not clear it:
    // lift the eye AND the look point by the same amount. Translating both ends
    // leaves look-eye — and therefore the aim — exactly as it was; it only pans.
    const under = groundHeight(eye.x, eye.z) + EYE_CLEAR - eye.y;
    if (under > 0) { eye.y += under; look.y += under; }

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
    // Trauma is time-and-noise driven (performance.now() inside frameUpdate), so
    // it is the one thing in the camera that cannot be made reproducible. In
    // capture mode it is simply off.
    shake(amount) { if (!flags.capture) st.trauma = Math.min(1, st.trauma + amount); },
    frameTwoShot(a, b) {
      if (!st.framing) st.framingPrevDist = st.dist;   // combat may own dist (carrying)
      st.framing = { a, b };
    },
    clearFraming() {
      if (st.framing) st.dist = st.framingPrevDist ?? DIST;
      st.framing = null;
    },
    realizePushIn() { st.pushIn = 1; },
    get yaw() { return st.curYaw; },
  };
}
