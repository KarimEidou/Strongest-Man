// Lightweight rigid-body world for debris, thrown objects and launched bodies.
// Structural no-jitter guarantee: a sleeping body is REMOVED from the active
// list, its final matrix written once, its footprint added to the pile layer.
// Contacts can never wake it — only wakeRadius() (explosions, charged punches)
// can, and that removes the pile contribution first.
import { groundHeight, addPile } from './heightfield.js';
import { FIXED_DT } from '../core/loop.js';

export const GRAVITY = -22;
const SLEEP_LIN2 = 0.05, SLEEP_ANG2 = 0.09, SLEEP_STEPS = 18;
const ACTIVE_CAP = 250;

let nextId = 1;
export const active = [];      // awake bodies
export const sleeping = [];    // settled bodies (matrices frozen)
export const counters = { created: 0, slept: 0, fellOut: 0, forced: 0 };

export function createBody(opts) {
  const b = {
    id: nextId++,
    kind: opts.kind || 'debris',            // debris | prop | car | corpse | thrown
    x: opts.x, y: opts.y, z: opts.z,
    px: opts.x, py: opts.y, pz: opts.z,     // previous (render interpolation)
    vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0,
    // orientation as Euler-ish spin (debris tumbles; exact orientation is cosmetic)
    rx: opts.rx || 0, ry: opts.ry || 0, rz: opts.rz || 0,
    prx: opts.rx || 0, pry: opts.ry || 0, prz: opts.rz || 0,
    wx: opts.wx || 0, wy: opts.wy || 0, wz: opts.wz || 0,
    half: opts.half || 0.3,                 // collision half-extent (sphere-ish)
    mass: opts.mass || 20,
    restitution: opts.restitution ?? 0.22,
    friction: opts.friction ?? 0.72,
    quiet: 0,
    onSleep: opts.onSleep || null,          // (body) -> void; write final visual
    onMove: opts.onMove || null,
    userData: opts.userData || null,
    pileCell: -1, pileAmount: 0,
  };
  if (active.length >= ACTIVE_CAP) { counters.forced++; forceSleep(oldestSmallest()); }
  active.push(b);
  counters.created++;
  return b;
}

// Approximate LRU: sample a rotating window instead of scanning all 250 active
// bodies. This runs on EVERY createBody once the cap is reached — i.e. dozens of
// times inside the single step where a building's rubble spawns.
let evictCursor = 0;
const EVICT_SAMPLE = 32;
function oldestSmallest() {
  let best = active[0];
  const n = Math.min(EVICT_SAMPLE, active.length);
  for (let i = 0; i < n; i++) {
    const b = active[(evictCursor + i) % active.length];
    if (b.half < best.half || (b.half === best.half && b.id < best.id)) best = b;
  }
  evictCursor = (evictCursor + n) % Math.max(active.length, 1);
  return best;
}

export function step(dt) {
  stepping = true;
  for (let i = active.length - 1; i >= 0; i--) {
    const b = active[i];
    // slept or removed earlier in THIS walk, by something re-entrant
    if (b.asleep || b.dead) continue;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    b.prx = b.rx; b.pry = b.ry; b.prz = b.rz;

    b.vy += GRAVITY * dt;
    b.vx *= 0.999; b.vz *= 0.999;
    b.wx *= 0.985; b.wy *= 0.985; b.wz *= 0.985;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;

    // ground (base + debris piles)
    const g = groundHeight(b.x, b.z);
    if (b.y - b.half < g) {
      b.y = g + b.half;
      if (b.vy < 0) {
        const bounce = -b.vy * b.restitution;
        b.vy = bounce > 0.6 ? bounce : 0;
      }
    }
    // rolling/sliding friction every grounded step — bodies must come to rest
    if (b.y - b.half <= g + 0.02) {
      b.vx *= b.friction ** (dt * 60) * 0.98;
      b.vz *= b.friction ** (dt * 60) * 0.98;
      b.wx *= 0.86; b.wy *= 0.9; b.wz *= 0.86;
    }

    // building walls: coarse — push out of alive wall cells
    if (collideWorld) collideWorld(b, dt);

    // sleep bookkeeping
    const lin2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
    const ang2 = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
    const onGround = b.y - b.half <= g + 0.02;
    if (onGround && lin2 < SLEEP_LIN2 && ang2 < SLEEP_ANG2) b.quiet++;
    else b.quiet = 0;
    if (b.quiet >= SLEEP_STEPS) {
      sleepBody(b, i);
      continue;
    }
    if (b.onMove) b.onMove(b);
    if (!(b.y > -20)) { counters.fellOut++; b.dead = true; dropFromActive(b, i); b.onSleep?.(b); }
  }
  stepping = false;
  flushRemovals();
}

// `active` must not be spliced while step() is walking it.
//
// step() iterates backwards, which makes ITS own splice-at-i safe. What is not
// safe is the re-entrant one: a thrown body's onMove calls removeSphere, which
// spawns debris, which calls createBody, which force-sleeps the smallest active
// body to stay under the cap — and THAT splice lands at an arbitrary index. Any
// index below the cursor shifts every remaining body down one, so one body is
// skipped for the whole step and another is stepped twice. It is invisible
// until a collapse, which is exactly when it happens most.
//
// Removals are deferred to the end of the step instead. A body slept mid-walk
// keeps its slot until then and is skipped by the `asleep` guard when the
// cursor reaches it.
let stepping = false;
const deferredRemoval = [];

function dropFromActive(b, i) {
  if (stepping) { deferredRemoval.push(b); return; }
  const k = (i !== undefined && active[i] === b) ? i : active.indexOf(b);
  if (k >= 0) active.splice(k, 1);
}

function flushRemovals() {
  if (!deferredRemoval.length) return;
  for (const b of deferredRemoval) {
    const k = active.indexOf(b);
    if (k >= 0) active.splice(k, 1);
  }
  deferredRemoval.length = 0;
}

function sleepBody(b, i) {
  // snap to rest & freeze
  b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0;
  const g = groundHeight(b.x, b.z);
  b.y = g + b.half;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  b.prx = b.rx; b.pry = b.ry; b.prz = b.rz;
  dropFromActive(b, i);
  sleeping.push(b);
  counters.slept++;
  b.asleep = true;
  // raise the pile so future debris stacks on top of this one
  // addPile clamps the CELL at 1.6 m, so what it applies can be less than what
  // it was asked for. Storing the request and subtracting it later dug the
  // ground down under a stack of rubble every time one was cleared away.
  const want = Math.min(b.half * 1.2, 0.5);
  const put = addPile(b.x, b.z, want);
  b.pileCell = put.cell;
  b.pileAmount = put.applied;
  b.onMove?.(b);
  b.onSleep?.(b);
}

export function forceSleep(b) {
  // rubble is force-slept immediately after being pushed, so check the tail first
  const last = active.length - 1;
  const i = last >= 0 && active[last] === b ? last : active.indexOf(b);
  if (i >= 0) sleepBody(b, i);
}

import { removePile } from './heightfield.js';
export function wakeRadius(x, z, r, impulse) {
  for (let i = sleeping.length - 1; i >= 0; i--) {
    const b = sleeping[i];
    const dx = b.x - x, dz = b.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    sleeping.splice(i, 1);
    b.asleep = false;
    if (b.pileCell >= 0) { removePile(b.pileCell, b.pileAmount); b.pileCell = -1; }
    const d = Math.sqrt(d2) || 0.5;
    const s = impulse * (1 - d / r);
    b.vx = (dx / d) * s; b.vy = s * 0.75; b.vz = (dz / d) * s;
    b.wx = (Math.random() - 0.5) * 6; b.wy = (Math.random() - 0.5) * 6; b.wz = (Math.random() - 0.5) * 6;
    b.quiet = 0;
    active.push(b);
  }
}

// installed by world/destruction.js so debris pushes out of intact wall cells
export let collideWorld = null;
export function setWorldCollider(fn) { collideWorld = fn; }

export function bodyStats() {
  return { active: active.length, sleeping: sleeping.length };
}

export { FIXED_DT };
