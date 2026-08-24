// Streets: one merged vertex-colored mesh. Asphalt is built as non-overlapping
// cells (intersection squares + segments), sidewalks are real raised curbs,
// lane dashes and crosswalks are thin sub-quads 12mm above the asphalt inside
// the SAME mesh (no separate material or renderOrder → no flicker).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeWorldMaterial, tagGeometry } from '../engine/materials.js';
import { PAL } from '../core/palette.js';
import { ROAD, WALK, BLOCKS, MAP_EDGE } from './city.js';

const MARK_Y = 0.012;

export function buildStreets(scene) {
  const parts = [];
  const quad = (x0, z0, x1, z1, y, color, shade = 1) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    parts.push(tagGeometry(g, color, 0, shade));
  };
  const slab = (x0, z0, x1, z1, h, color) => {
    const g = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
    g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    parts.push(tagGeometry(g, color));
  };

  const C = ROAD.centers, R = ROAD.half, E = MAP_EDGE;

  // ground apron: under everything, out past the fog line
  quad(-240, -240, 240, 240, -0.03, 0x1c2438);

  // asphalt: 9 intersection squares + connecting segments (no overlaps)
  for (const cx of C) for (const cz of C) quad(cx - R, cz - R, cx + R, cz + R, 0, PAL.road);
  for (const cz of C) {
    for (let i = 0; i < C.length - 1; i++) quad(C[i] + R, cz - R, C[i + 1] - R, cz + R, 0, PAL.road);
  }
  for (const cx of C) {
    for (let i = 0; i < C.length - 1; i++) quad(cx - R, C[i] + R, cx + R, C[i + 1] - R, 0, PAL.road);
  }

  // block ground (courtyards under buildings)
  for (const b of BLOCKS) quad(b.x0, b.z0, b.x1, b.z1, 0.02, 0x39415c);

  // sidewalks: rings around each block (N/S full strips + E/W in between)
  for (const b of BLOCKS) {
    const o = WALK.outer - WALK.inner; // 3.5 band
    slab(b.x0 - o, b.z0 - o, b.x1 + o, b.z0, 0.12, PAL.sidewalk);        // north band
    slab(b.x0 - o, b.z1, b.x1 + o, b.z1 + o, 0.12, PAL.sidewalk);        // south band
    slab(b.x0 - o, b.z0, b.x0, b.z1, 0.12, PAL.sidewalk);                // west band
    slab(b.x1, b.z0, b.x1 + o, b.z1, 0.12, PAL.sidewalk);                // east band
  }
  // outer perimeter sidewalk ring
  slab(-E, -E, E, -E + 3.5, 0.12, PAL.sidewalk);
  slab(-E, E - 3.5, E, E, 0.12, PAL.sidewalk);
  slab(-E, -E + 3.5, -E + 3.5, E - 3.5, 0.12, PAL.sidewalk);
  slab(E - 3.5, -E + 3.5, E, E - 3.5, 0.12, PAL.sidewalk);

  // lane dashes between intersections
  for (const cz of C) {
    for (let i = 0; i < C.length - 1; i++) {
      for (let x = C[i] + R + 3; x < C[i + 1] - R - 3; x += 6) {
        quad(x, cz - 0.18, x + 2.6, cz + 0.18, MARK_Y, PAL.roadLine, 0.9);
      }
    }
  }
  for (const cx of C) {
    for (let i = 0; i < C.length - 1; i++) {
      for (let z = C[i] + R + 3; z < C[i + 1] - R - 3; z += 6) {
        quad(cx - 0.18, z, cx + 0.18, z + 2.6, MARK_Y, PAL.roadLine, 0.9);
      }
    }
  }

  // crosswalk stripes at every road entry of the 4-way intersections
  for (const cx of C) for (const cz of C) {
    // entries: ±x and ±z arms (skip arms that leave the map)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ax = cx + dx * (R + 1.2), az = cz + dz * (R + 1.2);
      if (Math.abs(ax) > E || Math.abs(az) > E) continue;
      for (let s = -3.4; s <= 3.4; s += 1.15) {
        if (dx !== 0) quad(ax - 0.75 * dx - 0.35, cz + s - 0.35, ax - 0.75 * dx + 0.35, cz + s + 0.35, MARK_Y, PAL.roadLine, 0.85);
        else quad(cx + s - 0.35, az - 0.75 * dz - 0.35, cx + s + 0.35, az - 0.75 * dz + 0.35, MARK_Y, PAL.roadLine, 0.85);
      }
    }
  }

  const geo = mergeGeometries(parts);
  const mesh = new THREE.Mesh(geo, makeWorldMaterial());
  mesh.frustumCulled = false;
  mesh.name = 'streets';
  scene.add(mesh);
  return mesh;
}
