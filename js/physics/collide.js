// Static-world collision queries: capsules vs building wall cells (only ALIVE
// cells collide — collision automatically matches the destruction state),
// static props, and map bounds. Also the camera occlusion probe.
//
// Buildings and props live in uniform grids (physics/spatialgrid.js) so a query
// touches a handful of candidates instead of the whole city. Cars are few and
// move every step, so they stay a linear scan.
import { MAP_EDGE, FLOOR_H } from '../world/city.js';
import { groundHeight } from './heightfield.js';
import { PROP_TYPES } from '../world/props.js';
import { createGrid } from './spatialgrid.js';

const T = 0.3;              // wall thickness (matches buildings.js)
const DOOR_HALF = 0.65;     // walkable opening half-width on door cells

let B = null, P = null, CARS = null;
let buildGrid = null, propGrid = null, iwallGrid = null;
const nearB = [], nearP = [], nearI = [];

// Static axis-aligned solids that are not building cells, not spine walls and
// not props: the museum's partition, its plinths, benches, desk and stanchion
// posts. They never move, never break and never sleep, so they get a plain grid
// and a slab test rather than a place in any of the destructible registries.
// Each is {x0, z0, x1, z1, y0, y1}.
let solidGrid = null;
const solids = [];
const nearS = [];

export function addStaticBox(box) {
  solids.push(box);
  if (!solidGrid) solidGrid = createGrid();
  solidGrid.insertBox(box, box.x0, box.z0, box.x1, box.z1, 1.0);
  return box;
}

export function staticBoxCount() { return solids.length; }

export function initCollide(buildingsReg, propsReg) {
  B = buildingsReg; P = propsReg;
  buildGrid = createGrid();
  propGrid = createGrid();
  for (const b of B.buildings) {
    const s = b.spec;
    buildGrid.insertBox(b, s.x0, s.z0, s.x1, s.z1, T + 1.2);
  }
  // Interior spine walls. The four-band test below only knows about a building's
  // OUTER shell, so once you were through the door nothing inside collided and you
  // walked straight through the room divider and out the far wall. These are
  // axis-aligned boxes with their own grid, one per floor per building.
  iwallGrid = createGrid();
  for (const w of B.iwalls) {
    iwallGrid.insertBox(w, w.x - w.sx / 2, w.z - w.sz / 2, w.x + w.sx / 2, w.z + w.sz / 2, 1.0);
  }
  for (const p of P.all) propGrid.insertPoint(p, p.x, p.z, PROP_TYPES[p.type].r + 1.2);
  // props leave the world through propsReg.hide()/detach() and come back through
  // reattach(); keep the buckets honest either way
  P.onRetire = (p) => propGrid.remove(p);
  P.onRestore = (p) => propGrid.insertPoint(p, p.x, p.z, PROP_TYPES[p.type].r + 1.2);
}

export function setCars(carsReg) { CARS = carsReg; }

// Props near a point — shared by combat's grab probe and destruction's
// nearestProp so neither has to walk the full prop list.
export function queryProps(x, z, r, out) {
  if (!propGrid) { out.length = 0; return out; }
  return propGrid.query(x, z, r, out);
}

export function gridStats() {
  return { buildings: buildGrid?.stats(), props: propGrid?.stats() };
}

// The four wall bands a building collides on, at this height.
//
// For an ordinary lot they ARE the lot rectangle, and this is one property read
// and a return — which matters, because the three functions below are the
// most-called static-world queries in the game: every NPC every fixed step, the
// camera probe every 0.15 m of its march, and every hitscan sample.
//
// A landmark shell is a cone INSCRIBED in its lot, so the lot rectangle is not
// its shape. `world/samosa.js` bins every crust triangle by floor and records
// the band's own world-space cross-section while it does it; `world/buildings.js`
// copies that onto the building record. Colliding against that instead is the
// difference between touching the pastry and walking into a ~24x14 m invisible
// fence around a cone that has visibly curved away.
//
// Returns null above the tip, where there is no crust and no collision.
function bandOf(b, y) {
  if (!b.floorSpan) return b.spec;
  const f = Math.max(0, Math.min(b.spec.floors - 1, Math.floor(y / FLOOR_H)));
  return b.floorSpan[f] || null;
}

// returns true if the wall cell at this world position is solid.
// `along` is measured from the BAND's own origin, not the lot's.
function wallSolid(b, band, side, along, y, forWalking) {
  const s = b.spec;
  const floor = Math.max(0, Math.min(s.floors - 1, Math.floor(y / FLOOR_H)));
  const n = b.sideCols[side];
  // The lot rectangle is exactly n cells of CELL_W across, so `along / 2` is the
  // column. A shell band is not — it shrinks with height — so its columns are
  // mapped PROPORTIONALLY over its own span. For a uniform taper that is
  // identical to cellKeyAt()'s radial projection in world/samosa.js, which is
  // what decided which cells exist in the first place, so the collider and the
  // crust agree by construction rather than by a fudge factor.
  let col;
  if (band === s) {
    col = Math.max(0, Math.min(n - 1, Math.floor(along / 2)));
  } else {
    const span = side === 'north' || side === 'south' ? band.x1 - band.x0 : band.z1 - band.z0;
    col = span > 1e-6 ? Math.max(0, Math.min(n - 1, Math.floor((along / span) * n))) : 0;
  }
  const cell = b.idx.get(`${side}:${col}:${floor}`);
  if (!cell || !cell.alive) return false;
  if (forWalking && cell.kind === 'door' && floor === 0) {
    const center = col * 2 + 1;
    if (Math.abs(along - center) < DOOR_HALF) return false; // doorway gap
  }
  return true;
}

// capsule pushout; mutates and returns [x, z]
export function capsuleVsWorld(x, z, y, r, opts) {
  const skipProps = opts === false || opts?.props === false;
  const skipCars = opts === false || opts?.cars === false;

  // map bounds
  const lim = MAP_EDGE + 14;
  if (x < -lim) x = -lim; else if (x > lim) x = lim;
  if (z < -lim) z = -lim; else if (z > lim) z = lim;

  if (buildGrid) {
    buildGrid.query(x, z, r + T, nearB);
    for (const b of nearB) {
      if (b.collapsed) continue;
      const s = b.spec;
      if (x < s.x0 - r - T || x > s.x1 + r + T || z < s.z0 - r - T || z > s.z1 + r + T) continue;
      // four wall bands; push out along the band normal toward current side.
      // The lot rectangle is the broad-phase reject; the BAND is what collides.
      const w = bandOf(b, y);
      if (!w) continue;                        // above a landmark's tip: open air
      if (x > w.x0 - r && x < w.x1 + r) {
        if (Math.abs(z - w.z0) < r + T / 2 && wallSolid(b, w, 'north', x - w.x0, y, true)) {
          z = z < w.z0 ? w.z0 - (r + T / 2) : w.z0 + (r + T / 2);
        }
        if (Math.abs(z - w.z1) < r + T / 2 && wallSolid(b, w, 'south', x - w.x0, y, true)) {
          z = z < w.z1 ? w.z1 - (r + T / 2) : w.z1 + (r + T / 2);
        }
      }
      if (z > w.z0 - r && z < w.z1 + r) {
        if (Math.abs(x - w.x0) < r + T / 2 && wallSolid(b, w, 'west', z - w.z0, y, true)) {
          x = x < w.x0 ? w.x0 - (r + T / 2) : w.x0 + (r + T / 2);
        }
        if (Math.abs(x - w.x1) < r + T / 2 && wallSolid(b, w, 'east', z - w.z0, y, true)) {
          x = x < w.x1 ? w.x1 - (r + T / 2) : w.x1 + (r + T / 2);
        }
      }
    }
  }

  if (iwallGrid) {
    iwallGrid.query(x, z, r, nearI);
    const floor = Math.floor(y / FLOOR_H);
    for (const iw of nearI) {
      if (iw.gone || iw.floor !== floor) continue;
      if (B.buildings[iw.bId]?.collapsed) continue;
      const hx = iw.sx / 2 + r, hz = iw.sz / 2 + r;
      const dx = x - iw.x, dz = z - iw.z;
      if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
      // out along whichever face is nearer — these walls are long and thin, so
      // that is almost always the thin one
      if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = iw.x + Math.sign(dx || 1) * hx;
      else z = iw.z + Math.sign(dz || 1) * hz;
    }
  }

  if (solidGrid) {
    solidGrid.query(x, z, r, nearS);
    for (const b of nearS) {
      // A capsule standing on top of a plinth or a bench is not inside it: the
      // vertical band has to gate the pushout, or walking over a 0.45 m bench
      // would shove him sideways off it. `y` is the capsule's foot.
      if (y + 1.7 <= b.y0 || y >= b.y1 - 0.05) continue;
      const hx = (b.x1 - b.x0) / 2 + r, hz = (b.z1 - b.z0) / 2 + r;
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const dx = x - cx, dz = z - cz;
      if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
      if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = cx + Math.sign(dx || 1) * hx;
      else z = cz + Math.sign(dz || 1) * hz;
    }
  }

  if (propGrid && !skipProps) {
    propGrid.query(x, z, r + 1.5, nearP);
    for (const p of nearP) {
      if (!p.alive) continue;
      const pr = PROP_TYPES[p.type].r;
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz, min = pr + r;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = p.x + (dx / d) * min; z = p.z + (dz / d) * min;
      }
    }
  }

  if (CARS && !skipCars) {
    for (const c of CARS.list) {
      // a car held over someone's head, or in mid-air, is not a wall
      if (!c.alive || c.mode === 'held' || c.mode === 'flying') continue;
      // oriented box → transform into car space (yaw only)
      const dx = x - c.x, dz = z - c.z;
      const cos = Math.cos(-c.yaw), sin = Math.sin(-c.yaw);
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      const hw = c.hw + r, hl = c.hl + r;
      if (Math.abs(lx) < hw && Math.abs(lz) < hl) {
        const pushX = hw - Math.abs(lx), pushZ = hl - Math.abs(lz);
        let nlx = lx, nlz = lz;
        if (pushX < pushZ) nlx = Math.sign(lx || 1) * hw; else nlz = Math.sign(lz || 1) * hl;
        const wx = nlx * Math.cos(c.yaw) - nlz * Math.sin(c.yaw);
        const wz = nlx * Math.sin(c.yaw) + nlz * Math.cos(c.yaw);
        x = c.x + wx; z = c.z + wz;
      }
    }
  }
  return [x, z];
}

// Is this spot blocked for a walker? Used by NPC whisker steering, which wants
// to know *whether* something is in the way without paying for a pushout.
export function blockedAt(x, z, y, r) {
  if (buildGrid) {
    buildGrid.query(x, z, r + T, nearB);
    for (const b of nearB) {
      if (b.collapsed) continue;
      const s = b.spec;
      if (x < s.x0 - r - T || x > s.x1 + r + T || z < s.z0 - r - T || z > s.z1 + r + T) continue;
      const w = bandOf(b, y);
      if (!w) continue;                        // above a landmark's tip: open air
      if (x > w.x0 - r && x < w.x1 + r) {
        if (Math.abs(z - w.z0) < r + T / 2 && wallSolid(b, w, 'north', x - w.x0, y, true)) return true;
        if (Math.abs(z - w.z1) < r + T / 2 && wallSolid(b, w, 'south', x - w.x0, y, true)) return true;
      }
      if (z > w.z0 - r && z < w.z1 + r) {
        if (Math.abs(x - w.x0) < r + T / 2 && wallSolid(b, w, 'west', z - w.z0, y, true)) return true;
        if (Math.abs(x - w.x1) < r + T / 2 && wallSolid(b, w, 'east', z - w.z0, y, true)) return true;
      }
      // Inside the footprint entirely (walked in through a hole). Lot rectangles
      // only: a landmark shell has no interior to be inside, and its lot is
      // mostly open pavement the cone has curved away from — blanket-rejecting
      // it is the invisible wall this test exists to avoid, not to create.
      if (w === s && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return true;
    }
  }
  if (solidGrid) {
    solidGrid.query(x, z, r, nearS);
    for (const b of nearS) {
      if (y + 1.7 <= b.y0 || y >= b.y1 - 0.05) continue;
      if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    }
  }
  if (propGrid) {
    propGrid.query(x, z, r + 1.5, nearP);
    for (const p of nearP) {
      if (!p.alive) continue;
      const min = PROP_TYPES[p.type].r + r;
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < min * min) return true;
    }
  }
  return false;
}

// Static solids as an occluder, for the camera probe and for hitscan. Same
// boxes, point sample — they are all at least 0.16 m thick, which is the same
// margin pointInWall() already relies on for a facade cell.
function pointInSolid(x, y, z) {
  if (!solidGrid) return false;
  solidGrid.query(x, z, 0, nearS);
  for (const b of nearS) {
    if (y < b.y0 || y > b.y1) continue;
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  }
  return false;
}

// camera occlusion: march from `look` toward `eye`; return allowed distance
export function cameraAllowed(look, eye, wanted) {
  const steps = Math.ceil(wanted / 0.15);
  for (let i = 2; i <= steps; i++) {
    const t = i / steps;
    const x = look.x + (eye.x - look.x) * t;
    const y = look.y + (eye.y - look.y) * t;
    const z = look.z + (eye.z - look.z) * t;
    if (pointInWall(x, y, z) || pointInSolid(x, y, z)) return Math.max(0.6, t * wanted - 0.35);
  }
  return wanted;
}

const nearCam = [];
// `walkable` picks which semantics the door cells get. The camera occlusion
// probe wants a doorway to read SOLID — pushing the camera through a door gap is
// exactly the shot nobody wants — while a bullet has to go through the same
// doorway the player can walk through, or hitscan and movement disagree about
// the same square metre of wall.
function pointInWall(x, y, z, walkable = false) {
  if (!buildGrid) return false;
  buildGrid.query(x, z, T, nearCam);
  for (const b of nearCam) {
    if (b.collapsed) continue;
    const s = b.spec;
    if (x < s.x0 - T || x > s.x1 + T || z < s.z0 - T || z > s.z1 + T) continue;
    if (y > s.floors * FLOOR_H) continue;
    const w = bandOf(b, y);
    if (!w) continue;                          // above a landmark's tip: open air
    if (x > w.x0 && x < w.x1) {
      if (Math.abs(z - w.z0) <= T / 2 && wallSolid(b, w, 'north', x - w.x0, y, walkable)) return true;
      if (Math.abs(z - w.z1) <= T / 2 && wallSolid(b, w, 'south', x - w.x0, y, walkable)) return true;
    }
    if (z > w.z0 && z < w.z1) {
      if (Math.abs(x - w.x0) <= T / 2 && wallSolid(b, w, 'west', z - w.z0, y, walkable)) return true;
      if (Math.abs(x - w.x1) <= T / 2 && wallSolid(b, w, 'east', z - w.z0, y, walkable)) return true;
    }
  }
  return false;
}

// Interior spine walls, which capsuleVsWorld pushes out of but the shell test
// above knows nothing about. Without this a round fired indoors passed clean
// through a wall the player cannot walk through.
//
// This one canNOT be a point sample the way the shell test is. A spine wall is
// 0.16m thick and RAY_STEP is 0.28, so a march steps straight over it: measured,
// one wall was missed because the only sample that came close landed at exactly
// its 0.08m half-width, which `< sx/2` rejects. So test the box itself — they
// are axis-aligned, the slab clip is six compares, and it returns the exact
// entry distance instead of a sample position. The vertical extent is the floor
// band, which is the same thing capsuleVsWorld means by `iw.floor !== floor`.
//
// Measured cost of adding it to the march: 43us on a 220m sniper ray fired down
// an empty street with nothing to clip it, 6us on a 24m shotgun pellet. A full
// nine-pellet blast is 0.32ms, about 2% of a 60fps frame, and every real shot is
// shorter than that because player/weapons.js clips maxDist to the nearest body
// before it ever gets here.
const nearRay = [];
function rayIWall(ox, oy, oz, dx, dy, dz, x, z, maxT) {
  if (!iwallGrid) return -1;
  // Radius covers a whole step plus half a wall, so a box the march has already
  // stepped past is still a candidate at the sample that follows it.
  iwallGrid.query(x, z, 0.6, nearRay);
  let best = -1;
  for (const iw of nearRay) {
    if (iw.gone) continue;
    if (B.buildings[iw.bId]?.collapsed) continue;
    const c = [iw.x, (iw.floor + 0.5) * FLOOR_H, iw.z];
    const half = [iw.sx / 2, FLOOR_H / 2, iw.sz / 2];
    const o = [ox - c[0], oy - c[1], oz - c[2]];
    const d = [dx, dy, dz];
    let t0 = 0, t1 = best >= 0 ? best : maxT;
    let miss = false;
    for (let i = 0; i < 3 && !miss; i++) {
      if (Math.abs(d[i]) < 1e-8) { if (Math.abs(o[i]) > half[i]) miss = true; continue; }
      let ta = (-half[i] - o[i]) / d[i], tb = (half[i] - o[i]) / d[i];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) miss = true;
    }
    if (!miss) best = t0;
  }
  return best;
}

// Static-world ray march, for hitscan weapons.
//
// Coarse on purpose. The city is 2m wall cells, cylindrical props and an
// analytic terrain, and a bullet does not need a triangle-exact intersection
// against any of that — it needs to stop at the right surface and report what it
// was. The march is also always bounded: player/weapons.js clips maxDist to the
// nearest ENTITY hit first, so a shot that lands in a monster's chest never pays
// for the eighty metres of street behind him.
//
// STEP is a wall thickness (T = 0.3) rather than something finer because the
// thinnest thing here is a wall, and stepping finer than the thinnest occluder
// only buys precision the caller throws away.
const RAY_STEP = 0.28;
export function rayWorld(ox, oy, oz, dx, dy, dz, maxDist) {
  const steps = Math.min(900, Math.ceil(maxDist / RAY_STEP));
  let py = oy;
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(i * RAY_STEP, maxDist);
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    const g = groundHeight(x, z);
    if (y <= g) {
      // Report the CROSSING, not the sample: a shallow shot can be 28cm past
      // where it actually met the tarmac by the time the sample notices, and an
      // impact effect that far out reads as a miss.
      const f = Math.min(Math.max((py - g) / ((py - y) || 1e-6), 0), 1);
      const hit = t - RAY_STEP * (1 - f);
      return { dist: hit, kind: 'ground', x: ox + dx * hit, y: g, z: oz + dz * hit, prop: null };
    }
    if (pointInWall(x, y, z, true)) return { dist: t, kind: 'wall', x, y, z, prop: null };
    if (pointInSolid(x, y, z)) return { dist: t, kind: 'wall', x, y, z, prop: null };
    const iwT = rayIWall(ox, oy, oz, dx, dy, dz, x, z, t);
    if (iwT >= 0) {
      return { dist: iwT, kind: 'wall', x: ox + dx * iwT, y: oy + dy * iwT, z: oz + dz * iwT, prop: null };
    }
    if (propGrid) {
      propGrid.query(x, z, 1.6, nearP);
      for (const p of nearP) {
        if (!p.alive) continue;
        const cfg = PROP_TYPES[p.type];
        const s = p.s || 1;
        if (y > (p.y || 0) + cfg.h * s || y < (p.y || 0) - 0.2) continue;
        const r = cfg.r * s;
        const ddx = x - p.x, ddz = z - p.z;
        if (ddx * ddx + ddz * ddz < r * r) return { dist: t, kind: 'prop', x, y, z, prop: p };
      }
    }
    py = y;
  }
  return null;
}

// debris pushout vs walls (installed into pworld): coarse sphere test
export function debrisVsWorld(body) {
  if (!buildGrid) return;
  const r = body.half;
  const [nx, nz] = capsuleVsWorld(body.x, body.z, body.y, r, false);
  if (nx !== body.x) { body.vx *= -0.3; body.x = nx; }
  if (nz !== body.z) { body.vz *= -0.3; body.z = nz; }
}
