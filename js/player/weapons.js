// Guns: the models, the shooting, and everything the shot leaves behind.
//
// Hitscan, not projectiles. At these ranges a projectile would arrive within one
// fixed step of the trigger anyway, and hitscan is what makes a touch-screen
// shooter feel connected: the frame you tap, the thing you were pointing at
// takes the hit. What sells the travel is the TRACER, which is drawn from the
// muzzle to wherever the ray stopped, and lives 55ms.
//
// The ray is resolved cheapest-first: entities are a few dozen capsule tests, so
// they run first and their nearest hit CLIPS the world march (physics/collide.js
// rayWorld), which is the expensive half. A shot that lands in a monster's chest
// never pays for the street behind him.
//
// Aim comes off the CAMERA, not off the character: the player is pointing with
// the view, and the body is turned to match. On a phone that is not enough on
// its own, so a shot that passes near a live target inside AIM_CONE is bent onto
// it — generous, because the alternative is a game where nothing is ever hit.
import * as THREE from 'three';
import { MODELS, staticGeometry } from '../engine/assets.js';
import { makeCharacterMaterial } from '../engine/materials.js';
import { input } from '../core/input.js';
import { game, save, persist } from '../core/state.js';
import { emit, EV } from '../core/events.js';
import { rayWorld } from '../physics/collide.js';
import { removeSphere, hitProp, craterAt } from '../world/destruction.js';
import { burstSparks, burstDust, burstBlood, burstSmoke } from '../engine/particles.js';
import { addTracer, addMuzzleFlash, addImpactFlash } from '../engine/tracers.js';
import { gunSound } from '../engine/audio.js';
import { clamp, damp, rand } from '../core/mathx.js';

// The roster. `dmg` is in the same units as melee (a jab is 10, a full charge
// 60, a monster has 120 hit points), so a pistol is four jabs a second and the
// sniper drops a monster in one — which is what 7,500 points should buy.
//
// `spread` is degrees of cone at the muzzle; `rpm` rounds per minute; `range`
// metres. `pierce` is how many bodies a round passes through before it stops.
export const GUNS = {
  pistol: {
    name: 'PISTOL', model: 'gun_pistol', price: 0,
    dmg: 14, rpm: 340, spread: 1.1, range: 60, mag: 14, reload: 1.0, grip: [0, -0.09, -0.07],
    auto: false, recoil: 0.020, tracer: 0xcfe8ff, flash: 0.42, twoHand: false,
    blurb: 'Sidearm. Free, because everyone starts somewhere.',
  },
  smg: {
    name: 'SMG', model: 'gun_smg', price: 1400,
    dmg: 11, rpm: 800, spread: 2.9, range: 45, mag: 34, reload: 1.4, grip: [0, -0.08, -0.175],
    auto: true, recoil: 0.013, tracer: 0xbfe4ff, flash: 0.40, twoHand: true,
    blurb: 'Hold it down. Aim is a suggestion.',
  },
  shotgun: {
    name: 'SHOTGUN', model: 'gun_shotgun', price: 3200,
    dmg: 11, pellets: 9, rpm: 80, spread: 7.5, range: 24, mag: 6, reload: 1.9, grip: [0, -0.10, -0.12],
    auto: false, recoil: 0.055, tracer: 0xffd9a8, flash: 0.85, twoHand: true, knock: 14,
    blurb: 'Nine pellets. Everything inside 24m goes over.',
  },
  rifle: {
    name: 'RIFLE', model: 'gun_rifle', price: 5200,
    dmg: 27, rpm: 520, spread: 1.4, range: 85, mag: 26, reload: 1.6, grip: [0, -0.08, -0.14],
    auto: true, recoil: 0.024, tracer: 0xd4f0ff, flash: 0.55, twoHand: true, pierce: 1,
    blurb: 'Automatic, accurate, and it goes through the first thing it hits.',
  },
  sniper: {
    name: 'SNIPER', model: 'gun_sniper', price: 9000,
    dmg: 130, rpm: 48, spread: 0.12, range: 220, mag: 5, reload: 2.4, grip: [0, -0.10, -0.72],
    auto: false, recoil: 0.09, tracer: 0xffffff, flash: 0.9, twoHand: true, pierce: 3,
    blurb: 'One monster, one round, through two more behind it.',
  },
  cannon: {
    name: 'CANNON', model: 'gun_cannon', price: 15000,
    dmg: 80, rpm: 105, spread: 2.0, range: 55, mag: 8, reload: 2.2, grip: [0, -0.11, -0.16],
    auto: true, recoil: 0.07, tracer: 0xffb463, flash: 1.05, twoHand: true,
    blast: 3.4, knock: 22,
    blurb: 'Explosive. Do not fire it at something you are standing next to.',
  },
};
export const GUN_IDS = Object.keys(GUNS);

// `grip` above is where the fist closes on each model, in gun-local metres: the
// low, narrow cluster behind the magazine, measured with
// `node tools/geom-probe.mjs assets/models/gun_<id>.glb`. It belongs in the
// table because it is a property of the model, and the pack put the origin
// wherever it liked — mid-receiver on most of them, at the muzzle on the sniper.

// How far off the aim a target may be and still be picked up, and how far in
// front of the player the assist starts caring. Wide, and unapologetic: this is
// a game played with a thumb on a sheet of glass.
const AIM_CONE = Math.cos(9 * Math.PI / 180);
const AIM_MIN_DIST = 2.0;

// The camera's pitch limits, repeated here because recoil writes to that value
// directly. engine/camera.js owns the same two numbers; they widened upward when
// guns arrived — a three-and-a-half metre monster standing three metres away has
// its head 34 degrees up, and the old -0.18 could not look at it.
const MIN_AIM_PITCH = -0.50, MAX_AIM_PITCH = 0.98;

// Seconds before a freshly-equipped weapon will fire.
const EQUIP_TIME = 0.25;

// Bodies are capsules for the purposes of being shot: a vertical cylinder capped
// by the ground and the top of the head. Exact enough at these radii.
const NPC_R = 0.36, NPC_H = 1.7;

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

// Ray vs upright cylinder (centre x/z, BASE y, radius r, height h). Returns the
// distance to the first point inside the solid, 0 if the origin is already
// inside it, or -1.
//
// Written as an interval intersection — clip [0, maxT] by the quadratic's roots,
// then by the two cap planes — rather than as "take the near root, or the far
// one if the near one is behind". That older shape overwrote the ENTRY root with
// the EXIT root whenever the origin sat inside the infinite cylinder in x/z, and
// then clipped that far-side value against the caps, so a shot taken from
// directly above a monster (inside its radius, past its head) missed it
// outright. A 40k-case fuzz against a brute-force sampler put the old form at
// 1108/1120 wrong for origins inside the solid and 297/1189 for origins inside
// the radius but beyond a cap; it was exact everywhere else, which is why it
// survived this long.
function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, h, maxT) {
  const mx = ox - cx, mz = oz - cz;
  const a = dx * dx + dz * dz;
  const b = mx * dx + mz * dz;
  const c = mx * mx + mz * mz - r * r;
  let t0 = 0, t1 = maxT;
  if (a < 1e-8) {
    if (c > 0) return -1;               // parallel to the axis and outside it
  } else {
    const disc = b * b - a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    const ta = (-b - sq) / a, tb = (-b + sq) / a;
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  if (Math.abs(dy) < 1e-8) {
    if (oy < cy || oy > cy + h) return -1;
  } else {
    let ta = (cy - oy) / dy, tb = (cy + h - oy) / dy;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0 <= maxT ? t0 : -1;
}

// Ray vs the car's own oriented box (centre x/z, BASE y, yaw, half-extents).
// Same interval clip, in the car's frame.
//
// A car is 1.76 x 4.4 x 1.7 m, so no single radius describes it: taking the
// LARGER half-axis, as one cylinder round the footprint did, wrapped a 1.39m
// bullet volume round a body 0.88m wide. collide.js pushes the player out to
// only hw + r = 1.28m laterally, so a man standing at the side of a parked car
// was always INSIDE its hit volume, and with pierce 0 every shot he fired down
// the street stopped in the paintwork of the car beside him.
function rayCarBox(ox, oy, oz, dx, dy, dz, c, maxT) {
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);   // +Z-forward convention
  const rx = fz, rz = -fx;
  const mx = ox - c.x, my = oy - (c.y + CAR_H * 0.5), mz = oz - c.z;
  const o = [mx * rx + mz * rz, my, mx * fx + mz * fz];
  const d = [dx * rx + dz * rz, dy, dx * fx + dz * fz];
  const half = [c.hw, CAR_H * 0.5, c.hl];
  let t0 = 0, t1 = maxT;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) { if (Math.abs(o[i]) > half[i]) return -1; continue; }
    let ta = (-half[i] - o[i]) / d[i], tb = (half[i] - o[i]) / d[i];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0 <= maxT ? t0 : -1;
}
const CAR_H = 1.7;

export function createWeapons(player, cam, combat) {
  const p = player.p;
  const pose = p.poseLayer;
  const hand = p.bones.rHand;

  const st = {
    equipped: save.equipped && GUNS[save.equipped] ? save.equipped : null,
    ammo: {},                 // id -> rounds in the magazine
    cool: 0,
    reloadT: 0,
    kick: 0,                  // 0..1 visual recoil, decays
    aimW: 0,                  // how far into the aim pose the body is
    firedT: 0,                // time since the last round left the barrel
    hooks: { npcs: null, monsters: null, cars: null },
    shotsFired: 0, shotsHit: 0,
  };
  for (const id of GUN_IDS) st.ammo[id] = GUNS[id].mag;

  // ---- models -------------------------------------------------------------
  // One mesh per gun, built once and hidden; equipping shows one and hides the
  // rest. They live under the RIGHT HAND BONE, so they inherit the whole
  // skeleton for free — no per-frame matrix chasing, no drift when the animation
  // and the pose layer disagree.
  const meshes = {};
  // How far past the wrist bone the fist actually closes, in metres. Same number
  // player/combat.js calls GRIP_REACH, and for the same reason.
  const FIST_Y = 0.07;
  function buildGun(id) {
    if (meshes[id] || !MODELS[GUNS[id].model]) return meshes[id] || null;
    const src = staticGeometry(GUNS[id].model);
    const mesh = new THREE.Mesh(src.geometry, makeCharacterMaterial(src.material));
    mesh.geometry.computeBoundingBox();   // the barrel tip, for the muzzle flash
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.name = `gun_${id}`;
    // The rig's bones are authored in centimetres under an Armature scaled by
    // 0.01, so a child of a hand bone is 100x too big — and its local positions
    // are in those same centimetres — unless it undoes that.
    const s = 1 / handScale();
    mesh.scale.setScalar(s);
    // Barrel down the hand: the imported guns point +Z (tools/import-models.mjs
    // turns the pack's -Z forward round) and a bone's local +Y runs along itself
    // toward its child, so -90° about X sends the barrel out through the
    // fingers. It also sends the gun's own +Y (its top) to the hand's -Z.
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    // ...and then slide it until the GRIP is in the fist rather than the model's
    // origin, which the pack put wherever it liked (mid-receiver on most, at the
    // muzzle on the sniper). That rotation maps a gun point (0, gy, gz) to
    // (0, gz, -gy), so the offset that lands the grip on (0, FIST_Y, 0) is:
    const [, gy, gz] = GUNS[id].grip;
    mesh.position.set(0, (FIST_Y - gz) * s, gy * s);
    // rest transform, so the recoil in frameUpdate has something to return to
    mesh.userData.restY = mesh.position.y;
    mesh.userData.restX = mesh.rotation.x;
    mesh.userData.unit = s;
    if (hand) hand.add(mesh); else p.root.add(mesh);
    meshes[id] = mesh;
    return mesh;
  }
  function handScale() {
    if (!hand) return 1;
    hand.updateWorldMatrix(true, false);
    _v.setFromMatrixScale(hand.matrixWorld);
    return _v.x || 1;
  }

  function ownedIds() {
    return GUN_IDS.filter((id) => save.owned.includes(id));
  }

  function equip(id) {
    if (id && (!GUNS[id] || !save.owned.includes(id))) return false;
    st.equipped = id || null;
    save.equipped = id || '';
    persist();
    for (const [k, m] of Object.entries(meshes)) m.visible = k === id;
    // Cancel any reload, on the way IN or OUT. Leaving it running while the
    // weapon changed meant fixedUpdate finished it against whatever was equipped
    // by then — and against nothing at all if that was bare hands, which is
    // GUNS[null].mag and a TypeError.
    st.reloadT = 0;
    // Raise time, not zero. A weapon change that reset the cooldown outright let
    // a 48rpm sniper fire as fast as the player could tap the rail, and a beat
    // between putting one thing away and firing the next is what switching
    // should cost anyway.
    st.cool = EQUIP_TIME;
    // buildGun returns null when the model failed to load. Dereferencing that
    // threw inside equip(), which left the weapon system half-switched: the id
    // set, the cooldown reset, and no WEAPON_CHANGED emitted, so the HUD went on
    // showing the previous gun.
    if (id) {
      const mesh = buildGun(id);
      if (!mesh) {
        console.error(`weapons: ${id} has no model; staying on bare hands`);
        st.equipped = null;
        emit(EV.WEAPON_CHANGED, { id: null, gun: null, ammo: 0 });
        return false;
      }
      mesh.visible = true;
    }
    emit(EV.WEAPON_CHANGED, { id, gun: id ? GUNS[id] : null, ammo: id ? st.ammo[id] : 0 });
    return true;
  }

  function cycle(dir = 1) {
    const list = [null, ...ownedIds()];
    const i = list.indexOf(st.equipped);
    equip(list[(i + dir + list.length) % list.length]);
  }

  // ---- aiming -------------------------------------------------------------
  // The camera looks from behind along -off (engine/camera.js), so the way the
  // player is pointing is the camera yaw turned round, with the pitch negated.
  // Scratch, like every other vector in this file: updateStance() asks twice per
  // fixed step and runs through the whole reload branch as well.
  const _aim = { yaw: 0, pitch: 0 };
  function aimAngles() {
    _aim.yaw = cam.st.curYaw + Math.PI;
    _aim.pitch = -cam.st.curPitch;
    return _aim;
  }

  function aimDir(out) {
    const { yaw, pitch } = aimAngles();
    const cp = Math.cos(pitch);
    return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
  }

  // Where the barrel actually is, so the tracer and the flash come off the gun
  // rather than out of the player's navel.
  function muzzle(out) {
    const m = st.equipped && meshes[st.equipped];
    if (m) {
      m.updateWorldMatrix(true, false);
      // Local +Z runs down the barrel and the geometry is in metres, so the
      // bounding box's far +Z face IS the muzzle.
      out.set(0, 0, m.geometry.boundingBox?.max.z ?? 0.2).applyMatrix4(m.matrixWorld);
      return out;
    }
    const a = aimAngles();
    return out.set(p.x + Math.sin(a.yaw) * 0.4, p.y + 1.42, p.z + Math.cos(a.yaw) * 0.4);
  }

  // The best thing to bend a shot onto: alive, in front, inside the cone, and
  // nearest. Monsters win ties over people — nobody aiming at a monster wants
  // the pedestrian behind it.
  function assistTarget(ox, oy, oz, dx, dy, dz, range) {
    let best = null, bestScore = -1;
    const consider = (x, y, z, bias) => {
      const vx = x - ox, vy = y - oy, vz = z - oz;
      const d = Math.hypot(vx, vy, vz);
      if (d < AIM_MIN_DIST || d > range) return;
      const dot = (vx * dx + vy * dy + vz * dz) / d;
      if (dot < AIM_CONE) return;
      const score = dot * bias - d / range * 0.15;
      if (score > bestScore) { bestScore = score; best = [x, y, z]; }
    };
    const ms = st.hooks.monsters?.list?.() || [];
    for (const m of ms) {
      if (m.dead) continue;
      consider(m.x, m.y + m.targetH * 0.55, m.z, 1.0);
    }
    const ns = st.hooks.npcs?.list?.() || [];
    for (const n of ns) {
      if (n.state === 'dead') continue;
      consider(n.x, n.y + 1.15, n.z, 0.86);
    }
    return best;
  }

  // ---- the shot -----------------------------------------------------------
  // Walks one ray, applying damage to everything it passes through, and writes
  // the point it stopped at into `endOut` — which is where the tracer ends.
  const hits = [];
  function castOne(ox, oy, oz, dx, dy, dz, gun, endOut) {
    const range = gun.range;
    hits.length = 0;

    const ms = st.hooks.monsters?.list?.() || [];
    for (const m of ms) {
      if (m.dead) continue;
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, m.x, m.y, m.z, 0.85, m.targetH, range);
      if (t >= 0) hits.push({ t, kind: 'monster', obj: m });
    }
    const ns = st.hooks.npcs?.list?.() || [];
    for (const n of ns) {
      if (n.state === 'dead' || n.state === 'carried') continue;
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, n.x, n.y, n.z, NPC_R, NPC_H, range);
      if (t >= 0) hits.push({ t, kind: 'npc', obj: n });
    }
    const cars = st.hooks.cars?.list || [];
    for (const c of cars) {
      if (!c.alive || c.mode === 'held') continue;
      const t = rayCarBox(ox, oy, oz, dx, dy, dz, c, range);
      if (t >= 0) hits.push({ t, kind: 'car', obj: c });
    }
    hits.sort(byT);

    // The world can only be hit up to the first body a round cannot pass, so
    // march no further than that.
    const pierce = gun.pierce || 0;
    const blocked = hits.length > pierce ? hits[pierce].t : range;
    const world = rayWorld(ox, oy, oz, dx, dy, dz, Math.min(blocked + 0.4, range));
    const wallT = world ? world.dist : Infinity;

    let used = 0, endT = Math.min(wallT, range);
    for (const h of hits) {
      if (h.t > endT) break;
      applyBodyHit(h, gun, dx, dy, dz, ox + dx * h.t, oy + dy * h.t, oz + dz * h.t);
      if (used++ >= pierce) { endT = h.t; break; }
    }
    // Only if nothing stopped it first: a round that ended in a body never
    // reached the wall behind it.
    if (endT === wallT && world) worldImpact(world, gun, dx, dz);
    endOut.set(ox + dx * endT, oy + dy * endT, oz + dz * endT);
  }

  function applyBodyHit(h, gun, dx, dy, dz, x, y, z) {
    st.shotsHit++;
    addImpactFlash(x, y, z, 0.3, 0xff8a6a);
    burstBlood(x, y - 0.55, z, h.kind === 'car' ? 0 : 7);
    if (h.kind === 'monster') {
      st.hooks.monsters.shoot(h.obj, gun.dmg, dx, dz, gun.knock || 6);
    } else if (h.kind === 'npc') {
      st.hooks.npcs.shoot(h.obj, gun.dmg, dx, dz);
    } else if (h.kind === 'car') {
      burstSparks(x, y, z, 6, 0xffd08a);
      st.hooks.cars.shoot(h.obj, gun.dmg, dx, dz);
    }
    if (gun.blast) blast(x, y, z, gun);
  }

  function worldImpact(world, gun, dx, dz) {
    const { x, y, z, kind } = world;
    addImpactFlash(x, y, z, 0.34, kind === 'ground' ? 0xffe0a8 : 0xdfe8ff);
    burstSparks(x, y, z, kind === 'ground' ? 4 : 7);
    burstDust(x, y, z, kind === 'ground' ? 5 : 3, 0x9aa3bd, 2.2);
    if (kind === 'prop' && world.prop) {
      hitProp(world.prop, dx, dz, gun.dmg * 0.35);   // emits PROP_DESTROYED itself
    } else if (kind === 'wall' && (gun.blast || gun.dmg >= 25)) {
      // Only a heavy round takes a cell out of a facade. A pistol leaves sparks
      // and dust, which is both what it would do and what stops an SMG held on a
      // wall from paying out chunk points thirteen times a second.
      const r = gun.blast ? 1.5 : gun.dmg > 60 ? 0.7 : 0.4;
      removeSphere(x, y, z, r, { impulse: 3 + gun.dmg * 0.08, fragMult: 0.6, byPlayer: true, silent: true });
    }
    if (gun.blast) blast(x, y, z, gun);
  }

  // Explosive rounds. Deliberately dangerous to the shooter: the splash does not
  // check who fired it, which is the whole reason the cannon's blurb says so.
  function blast(x, y, z, gun) {
    const r = gun.blast;
    removeSphere(x, y, z, r, { impulse: 16, fragMult: 2, byPlayer: true });
    craterAt(x, z, r * 0.7);
    burstFireball(x, y, z);
    st.hooks.npcs?.damageRadius?.(x, z, r * 1.3, 'player');
    const ms = st.hooks.monsters?.list?.() || [];
    for (const m of ms) {
      if (m.dead) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d > r * 1.6) continue;
      st.hooks.monsters.shoot(m, gun.dmg * 0.7 * (1 - d / (r * 1.6)), (m.x - x) / (d || 1), (m.z - z) / (d || 1), 16);
    }
    for (const c of (st.hooks.cars?.list || [])) {
      if (!c.alive) continue;
      if (Math.hypot(c.x - x, c.z - z) < r * 1.7) st.hooks.cars.shoot(c, gun.dmg, (c.x - x), (c.z - z));
    }
    const dp = Math.hypot(p.x - x, p.z - z);
    if (dp < r * 1.5) player.hurt?.(26 * (1 - dp / (r * 1.5)), 'blast', 0.8);
    cam.shake(0.5);
  }

  function burstFireball(x, y, z) {
    addImpactFlash(x, y, z, 2.6, 0xffb463);
    burstSparks(x, y, z, 18, 0xffc26a);
    burstSmoke(x, y, z, 8);
    burstDust(x, y, z, 10, 0x6a5f58, 5);
  }

  const _end = new THREE.Vector3();
  function fire() {
    const gun = GUNS[st.equipped];
    if (!gun) return;
    if (st.ammo[st.equipped] <= 0) { startReload(); return; }
    st.ammo[st.equipped]--;
    st.cool = 60 / gun.rpm;
    st.firedT = 0;
    st.kick = Math.min(1, st.kick + 0.55 + gun.recoil * 4);
    st.shotsFired++;

    muzzle(_muz);
    addMuzzleFlash(_muz.x, _muz.y, _muz.z, gun.flash, 0xffd08a);
    gunSound(gun);
    cam.shake(0.05 + gun.recoil * 1.6);
    // UP. Camera pitch is measured from the eye being above the look point, so
    // a bigger pitch aims DOWN — adding recoil to it walked every burst into the
    // pavement.
    cam.st.pitch = clamp(cam.st.pitch - gun.recoil, MIN_AIM_PITCH, MAX_AIM_PITCH);

    // face the way he is shooting — the body follows the gun, not the stick
    const a = aimAngles();
    p.yaw = a.yaw;

    aimDir(_dir);
    const snap = assistTarget(_muz.x, _muz.y, _muz.z, _dir.x, _dir.y, _dir.z, gun.range);
    if (snap) _dir.set(snap[0] - _muz.x, snap[1] - _muz.y, snap[2] - _muz.z).normalize();
    const baseYaw = Math.atan2(_dir.x, _dir.z);
    const basePitch = Math.asin(clamp(_dir.y, -1, 1));

    const shots = gun.pellets || 1;
    // The hit marker is for BODIES. `castOne` reports whether the round found
    // anything at all, walls included, and flashing a hit marker for a facade
    // teaches the player the wrong thing about where their shots are going.
    const hitsBefore = st.shotsHit;
    for (let i = 0; i < shots; i++) {
      const r = gun.spread * Math.PI / 180;
      const ang = rand() * Math.PI * 2, mag = Math.sqrt(rand()) * r * (shots > 1 ? 1 : 0.7);
      const yaw = baseYaw + Math.cos(ang) * mag;
      const pitch = clamp(basePitch + Math.sin(ang) * mag, -1.4, 1.4);
      const cp = Math.cos(pitch);
      const dx = Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(yaw) * cp;
      castOne(_muz.x, _muz.y, _muz.z, dx, dy, dz, gun, _end);
      // Only every other pellet draws: nine streaks from one barrel is a wall,
      // not a shotgun.
      if (shots === 1 || i % 2 === 0) {
        addTracer(_muz.x, _muz.y, _muz.z, _end.x, _end.y, _end.z, gun.tracer, shots > 1 ? 0.05 : 0.08);
      }
    }
    emit(EV.WEAPON_FIRED, {
      id: st.equipped, ammo: st.ammo[st.equipped], mag: gun.mag,
      hit: st.shotsHit > hitsBefore,
    });
    if (st.ammo[st.equipped] <= 0) startReload();
  }

  function startReload() {
    const gun = GUNS[st.equipped];
    if (!gun || st.reloadT > 0 || st.ammo[st.equipped] >= gun.mag) return;
    st.reloadT = gun.reload;
    emit(EV.WEAPON_RELOAD, { id: st.equipped, time: gun.reload });
  }

  // ---- update -------------------------------------------------------------
  // The aim stance is an authored pose (anim/poses.js), set here rather than in
  // frameUpdate because player/combat.js owns pose.update() and runs before us:
  // setting it on the fixed step means the very next frame draws it. combat's
  // carry poses win outright — a man with a car over his head is not aiming.
  const carrying = () => !!combat?.st?.carried
    || (combat?.st?.carry?.phase && combat.st.carry.phase !== 'idle');

  function updateStance() {
    const want = st.equipped && !p.dead && !carrying()
      ? (GUNS[st.equipped].twoHand ? 'aim_rifle' : 'aim_pistol')
      : null;
    // Which way the body faces while armed. The aim pose points the gun along
    // the character's own +Z, so if the body is not turned to the shot the
    // barrel points somewhere the rounds do not go.
    //   standing still, or just fired, or holding the trigger -> face the aim
    //   running                                               -> face the run
    // Facing the aim unconditionally would have him strafing sideways with a
    // walk cycle that has no idea, which looks far worse than a body that turns
    // when it matters.
    if (want && (p.speed < 0.35 || st.firedT < 1.2 || input.punchDown)) {
      p.yaw = aimAngles().yaw;
    }
    // A car over his head goes in front of the gun in both senses: the mesh is
    // parented to the hand that is holding the car, so it would be drawn inside
    // it, and firing a rifle one-handed past a taxi is not a thing this game is
    // going to try to animate.
    const m = st.equipped && meshes[st.equipped];
    if (m) m.visible = !!want;
    if (want) {
      pose.set(want, 1, 13);
      _e.set(-aimAngles().pitch, 0, 0);
      pose.setBias(_q.setFromEuler(_e));
    } else {
      pose.setBias(null);
      if (pose.pose && pose.pose.startsWith('aim')) pose.set(null, 0, 12);
    }
  }

  function fixedUpdate(dt) {
    st.cool -= dt;
    st.firedT += dt;
    // Before anything can return early: cycling has to work from bare hands and
    // from the middle of a reload, which are exactly the two states a player
    // reaches for the key in.
    if (input.weaponCycle) cycle(1);
    if (st.equipped && st.reloadT > 0) {
      st.reloadT -= dt;
      if (st.reloadT <= 0) {
        st.ammo[st.equipped] = GUNS[st.equipped].mag;
        emit(EV.WEAPON_CHANGED, { id: st.equipped, gun: GUNS[st.equipped], ammo: st.ammo[st.equipped] });
      }
      updateStance();
      return;
    }
    updateStance();
    if (!st.equipped || p.dead || carrying() || game.state !== 'playing') return;
    const gun = GUNS[st.equipped];
    const want = gun.auto ? input.punchDown : input.punchPressed;
    if (want && st.cool <= 0) fire();
  }

  // Runs AFTER combat's pose.update (see the frameSystems order in main.js), so
  // this recoil sits ON TOP of the aim stance rather than being slerped away by
  // it. Everything else about the stance — where the arms point, how far the
  // chest is turned, the pitch — is the pose plus its bias, set on the fixed
  // step above.
  function frameUpdate(dt) {
    const armed = !!st.equipped && !p.dead;
    st.aimW = damp(st.aimW, armed ? 1 : 0, 12, dt);
    st.kick = damp(st.kick, 0, 9, dt);
    const m = armed && meshes[st.equipped];
    if (!armed) return;
    const k = st.kick * st.aimW;
    // The gun's own kick, on top of the arms'. It is the part the eye actually
    // follows — the barrel jumping back and up out of the fist — and these
    // models have no moving parts, so this and the muzzle flash ARE the firing
    // animation. Hand-local: the barrel runs along +Y, so recoil is -Y, and
    // muzzle rise is a rotation about +X (see buildGun for why).
    if (m && m.visible) {
      m.position.y = m.userData.restY - k * 0.055 * m.userData.unit;
      m.rotation.x = m.userData.restX - k * 0.26;
    }
    if (k < 0.01) return;
    pose.twist('RightForeArm', 0.34 * k, 0, 0);
    pose.twist('RightArm', 0.20 * k, 0, 0.10 * k);
    pose.twist('Spine02', -0.12 * k, 0, 0);
    if (GUNS[st.equipped]?.twoHand) pose.twist('LeftForeArm', 0.26 * k, 0, 0);
  }

  // ---- wiring -------------------------------------------------------------
  for (const id of GUN_IDS) if (save.owned.includes(id)) buildGun(id);
  if (st.equipped) equip(st.equipped);

  window.__test.weapon = () => ({
    equipped: st.equipped,
    ammo: st.equipped ? st.ammo[st.equipped] : 0,
    mag: st.equipped ? GUNS[st.equipped].mag : 0,
    reloading: st.reloadT > 0,
    owned: [...save.owned],
    fired: st.shotsFired, hit: st.shotsHit,
  });
  window.__test.equip = (id) => equip(id === 'none' ? null : id);
  // Point the CAMERA at a world point, which is what aiming is: the shot comes
  // off cam.st.curYaw/curPitch, not off the character.
  window.__test.aimAt = (x, y, z) => {
    // A non-finite target used to flow straight into cam.st.pitch and stay
    // there: every later frame damped NaN toward NaN, the view matrix went
    // undefined and the canvas rendered black with nothing logged anywhere.
    if (![x, y, z].every(Number.isFinite)) throw new Error(`aimAt: bad target ${x},${y},${z}`);
    muzzle(_v);
    const dx = x - _v.x, dy = y - _v.y, dz = z - _v.z;
    const flat = Math.hypot(dx, dz) || 1e-6;
    cam.st.yaw = cam.st.curYaw = Math.atan2(dx, dz) - Math.PI;
    cam.st.pitch = cam.st.curPitch = -Math.atan2(dy, flat);
    p.yaw = p.visYaw = Math.atan2(dx, dz);
    return { yaw: +cam.st.curYaw.toFixed(3), pitch: +cam.st.curPitch.toFixed(3) };
  };
  // The reticle is a div pinned at 50%/50%, so the camera's forward direction
  // and the direction a round leaves in have to be the SAME vector — but they
  // are derived from opposite ends: the view from lookAt(eye, look), the shot
  // from cam.st.curPitch. Nothing except a measurement can prove they agree,
  // and when they silently stopped agreeing (engine/camera.js used to lift the
  // eye off the pavement without moving `look`) the crosshair pointed 16
  // degrees below where the bullets went at full elevation.
  window.__test.aimCheck = () => {
    const view = cam.camera.getWorldDirection(_v);
    const deg = (v) => +(Math.asin(clamp(v, -1, 1)) * 180 / Math.PI).toFixed(2);
    aimDir(_dir);
    return {
      pitch: +cam.st.curPitch.toFixed(3),
      dist: +cam.st.curDist.toFixed(2),
      eyeY: +cam.camera.position.y.toFixed(3),
      viewDeg: deg(view.y),
      aimDeg: deg(_dir.y),
      divergenceDeg: +(Math.acos(clamp(view.dot(_dir), -1, 1)) * 180 / Math.PI).toFixed(3),
    };
  };
  window.__test.fireOnce = () => { st.cool = 0; fire(); return st.ammo[st.equipped]; };
  window.__test.muzzle = () => { muzzle(_v); return [+_v.x.toFixed(2), +_v.y.toFixed(2), +_v.z.toFixed(2)]; };

  return { st, fixedUpdate, frameUpdate, equip, cycle, fire, startReload, ownedIds, buildGun, get armed() { return !!st.equipped; } };
}

const byT = (a, b) => a.t - b.t;
