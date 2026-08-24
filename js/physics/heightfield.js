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

export function baseHeight(x, z) {
  const inRoad = (v) => ROAD.centers.some((c) => Math.abs(v - c) <= ROAD.half);
  if (inRoad(x) || inRoad(z)) return 0 - dent[idx(x, z)];
  for (const b of BLOCKS) {
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return 0.02 - dent[idx(x, z)];
  }
  if (Math.abs(x) > MAP_EDGE || Math.abs(z) > MAP_EDGE) return 0;
  return 0.12 - dent[idx(x, z)]; // sidewalk band
}

export function groundHeight(x, z) {
  return baseHeight(x, z) + pile[idx(x, z)];
}

export function addPile(x, z, amount) {
  const i = idx(x, z);
  pile[i] = Math.min(pile[i] + amount, 1.6);
  return i;
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
