// Static-world collision queries: capsules vs building wall cells (only ALIVE
// cells collide — collision automatically matches the destruction state),
// static props, and map bounds. Also the camera occlusion probe.
//
// Buildings and props live in uniform grids (physics/spatialgrid.js) so a query
// touches a handful of candidates instead of the whole city. Cars are few and
// move every step, so they stay a linear scan.
import { MAP_EDGE, FLOOR_H } from '../world/city.js';
import { PROP_TYPES } from '../world/props.js';
import { createGrid } from './spatialgrid.js';

const T = 0.3;              // wall thickness (matches buildings.js)
const DOOR_HALF = 0.65;     // walkable opening half-width on door cells

let B = null, P = null, CARS = null;
let buildGrid = null, propGrid = null;
const nearB = [], nearP = [];

export function initCollide(buildingsReg, propsReg) {
  B = buildingsReg; P = propsReg;
  buildGrid = createGrid();
  propGrid = createGrid();
  for (const b of B.buildings) {
    const s = b.spec;
    buildGrid.insertBox(b, s.x0, s.z0, s.x1, s.z1, T + 1.2);
  }
  for (const p of P.all) propGrid.insertPoint(p, p.x, p.z, PROP_TYPES[p.type].r + 1.2);
  // props leave the world through propsReg.hide(); keep the buckets honest
  P.onRetire = (p) => propGrid.remove(p);
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

// returns true if the wall cell at this world position is solid
function wallSolid(b, side, along, y, forWalking) {
  const s = b.spec;
  const floor = Math.max(0, Math.min(s.floors - 1, Math.floor(y / FLOOR_H)));
  const n = b.sideCols[side];
  const col = Math.max(0, Math.min(n - 1, Math.floor(along / 2)));
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
      // four wall bands; push out along the band normal toward current side
      // north band: z ≈ s.z0
      if (x > s.x0 - r && x < s.x1 + r) {
        if (Math.abs(z - s.z0) < r + T / 2 && wallSolid(b, 'north', x - s.x0, y, true)) {
          z = z < s.z0 ? s.z0 - (r + T / 2) : s.z0 + (r + T / 2);
        }
        if (Math.abs(z - s.z1) < r + T / 2 && wallSolid(b, 'south', x - s.x0, y, true)) {
          z = z < s.z1 ? s.z1 - (r + T / 2) : s.z1 + (r + T / 2);
        }
      }
      if (z > s.z0 - r && z < s.z1 + r) {
        if (Math.abs(x - s.x0) < r + T / 2 && wallSolid(b, 'west', z - s.z0, y, true)) {
          x = x < s.x0 ? s.x0 - (r + T / 2) : s.x0 + (r + T / 2);
        }
        if (Math.abs(x - s.x1) < r + T / 2 && wallSolid(b, 'east', z - s.z0, y, true)) {
          x = x < s.x1 ? s.x1 - (r + T / 2) : s.x1 + (r + T / 2);
        }
      }
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
      if (x > s.x0 - r && x < s.x1 + r) {
        if (Math.abs(z - s.z0) < r + T / 2 && wallSolid(b, 'north', x - s.x0, y, true)) return true;
        if (Math.abs(z - s.z1) < r + T / 2 && wallSolid(b, 'south', x - s.x0, y, true)) return true;
      }
      if (z > s.z0 - r && z < s.z1 + r) {
        if (Math.abs(x - s.x0) < r + T / 2 && wallSolid(b, 'west', z - s.z0, y, true)) return true;
        if (Math.abs(x - s.x1) < r + T / 2 && wallSolid(b, 'east', z - s.z0, y, true)) return true;
      }
      // inside the footprint entirely (walked in through a hole)
      if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return true;
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

// camera occlusion: march from `look` toward `eye`; return allowed distance
export function cameraAllowed(look, eye, wanted) {
  const steps = Math.ceil(wanted / 0.15);
  for (let i = 2; i <= steps; i++) {
    const t = i / steps;
    const x = look.x + (eye.x - look.x) * t;
    const y = look.y + (eye.y - look.y) * t;
    const z = look.z + (eye.z - look.z) * t;
    if (pointInWall(x, y, z)) return Math.max(0.6, t * wanted - 0.35);
  }
  return wanted;
}

const nearCam = [];
function pointInWall(x, y, z) {
  if (!buildGrid) return false;
  buildGrid.query(x, z, T, nearCam);
  for (const b of nearCam) {
    if (b.collapsed) continue;
    const s = b.spec;
    if (x < s.x0 - T || x > s.x1 + T || z < s.z0 - T || z > s.z1 + T) continue;
    if (y > s.floors * FLOOR_H) continue;
    if (x > s.x0 && x < s.x1) {
      if (Math.abs(z - s.z0) <= T / 2 && wallSolid(b, 'north', x - s.x0, y, false)) return true;
      if (Math.abs(z - s.z1) <= T / 2 && wallSolid(b, 'south', x - s.x0, y, false)) return true;
    }
    if (z > s.z0 && z < s.z1) {
      if (Math.abs(x - s.x0) <= T / 2 && wallSolid(b, 'west', z - s.z0, y, false)) return true;
      if (Math.abs(x - s.x1) <= T / 2 && wallSolid(b, 'east', z - s.z0, y, false)) return true;
    }
  }
  return false;
}

// debris pushout vs walls (installed into pworld): coarse sphere test
export function debrisVsWorld(body) {
  if (!buildGrid) return;
  const r = body.half;
  const [nx, nz] = capsuleVsWorld(body.x, body.z, body.y, r, false);
  if (nx !== body.x) { body.vx *= -0.3; body.x = nx; }
  if (nz !== body.z) { body.vz *= -0.3; body.z = nz; }
}
