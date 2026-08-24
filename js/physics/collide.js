// Static-world collision queries: capsules vs building wall cells (only ALIVE
// cells collide — collision automatically matches the destruction state),
// static props, and map bounds. Also the camera occlusion probe.
import { MAP_EDGE, FLOOR_H } from '../world/city.js';
import { PROP_TYPES } from '../world/props.js';

const T = 0.3;              // wall thickness (matches buildings.js)
const DOOR_HALF = 0.65;     // walkable opening half-width on door cells

let B = null, P = null, CARS = null;
export function initCollide(buildingsReg, propsReg) { B = buildingsReg; P = propsReg; }
export function setCars(carsReg) { CARS = carsReg; }

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
export function capsuleVsWorld(x, z, y, r) {
  // map bounds
  const lim = MAP_EDGE + 14;
  if (x < -lim) x = -lim; else if (x > lim) x = lim;
  if (z < -lim) z = -lim; else if (z > lim) z = lim;

  if (B) {
    for (const b of B.buildings) {
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

  if (P) {
    for (const p of P.all) {
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

  if (CARS) {
    for (const c of CARS.list) {
      if (!c.alive) continue;
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

function pointInWall(x, y, z) {
  if (!B) return false;
  for (const b of B.buildings) {
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
  if (!B) return;
  const r = body.half;
  const [nx, nz] = capsuleVsWorldNoProps(body.x, body.z, body.y, r);
  if (nx !== body.x) { body.vx *= -0.3; body.x = nx; }
  if (nz !== body.z) { body.vz *= -0.3; body.z = nz; }
}

function capsuleVsWorldNoProps(x, z, y, r) {
  const savedP = P, savedC = CARS;
  P = null; CARS = null;
  const out = capsuleVsWorld(x, z, y, r);
  P = savedP; CARS = savedC;
  return out;
}
