// Ground model. The BASE terrain is analytic (roads 0, sidewalks 0.12, block
// interiors 0.02 — exactly matching the street mesh), the PILE layer is a 1m
// grid raised by sleeping debris so new debris stacks and feet walk over
// rubble with zero pairwise contacts. Craters dent the base via a small grid.
import { ROAD, BLOCKS, MAP_EDGE } from '../world/city.js';

const SIZE = 176;                 // grid spans [-88, +88]
const HALF = SIZE / 2;
const pile = new Float32Array(SIZE * SIZE);
const dent = new Float32Array(SIZE * SIZE);   // craters lower the base

const idx = (x, z) => {
  const gx = Math.min(SIZE - 1, Math.max(0, Math.floor(x + HALF)));
  const gz = Math.min(SIZE - 1, Math.max(0, Math.floor(z + HALF)));
  return gz * SIZE + gx;
};

// Flattened road/block tables. baseHeight is called ~25k times a second (every
// rigid body, every NPC, every blob shadow, every step) so it must not allocate:
// the closures this used to build per call were a steady stream of garbage and a
// matching stream of GC pauses — the "smooth, then it stutters" report.
const RC = ROAD.centers.slice();
const RHALF = ROAD.half;
const BOX = new Float32Array(BLOCKS.length * 4);
BLOCKS.forEach((b, i) => { BOX[i * 4] = b.x0; BOX[i * 4 + 1] = b.z0; BOX[i * 4 + 2] = b.x1; BOX[i * 4 + 3] = b.z1; });

function inRoad(v) {
  for (let i = 0; i < RC.length; i++) {
    const d = v - RC[i];
    if (d <= RHALF && d >= -RHALF) return true;
  }
  return false;
}

export function baseHeight(x, z) {
  if (inRoad(x) || inRoad(z)) return 0 - dent[idx(x, z)];
  for (let i = 0; i < BOX.length; i += 4) {
    if (x >= BOX[i] && x <= BOX[i + 2] && z >= BOX[i + 1] && z <= BOX[i + 3]) return 0.02 - dent[idx(x, z)];
  }
  if (x > MAP_EDGE || x < -MAP_EDGE || z > MAP_EDGE || z < -MAP_EDGE) return 0;
  return 0.12 - dent[idx(x, z)]; // sidewalk band
}

export function groundHeight(x, z) {
  return baseHeight(x, z) + pile[idx(x, z)];
}

// Returns the cell AND the amount actually applied. The cell clamps at 1.6 m,
// so a caller that stores what it asked for and subtracts that later takes out
// more than it ever put in — and the ground under a cleared rubble stack ends up
// lower than the street around it.
export function addPile(x, z, amount) {
  const i = idx(x, z);
  const before = pile[i];
  pile[i] = Math.min(before + amount, 1.6);
  return { cell: i, applied: pile[i] - before };
}
export function removePile(i, amount) {
  pile[i] = Math.max(0, pile[i] - amount);
}
export function pileAt(x, z) { return pile[idx(x, z)]; }

export function addDent(x, z, radius, depth) {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const i = idx(x + dx, z + dz);
      dent[i] = Math.min(0.3, Math.max(dent[i], depth * (1 - d / radius)));
    }
  }
}
