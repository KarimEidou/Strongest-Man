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

  // Crosswalks: a proper zebra. Each stripe is a long rectangle running ALONG
  // the direction of travel and they march across the full road width — the old
  // loop drew 0.7×0.7 squares on both axes, which read as a row of little cubes.
  const STRIPE_LEN = 2.6;     // along the direction cars travel
  const STRIPE_W = 0.45;      // across it
  const PITCH = 0.9;          // stripe centre to stripe centre
  const BAND = R + 1.5;       // crosswalk centre, measured out from the junction
  const SPAN = R - 0.45;      // half the painted width, inset off the kerb

  for (const cx of C) for (const cz of C) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ax = cx + dx * BAND, az = cz + dz * BAND;
      if (Math.abs(ax) > E || Math.abs(az) > E) continue;
      for (let t = -SPAN; t <= SPAN + 1e-6; t += PITCH) {
        if (dx !== 0) {
          quad(ax - STRIPE_LEN / 2, cz + t - STRIPE_W / 2,
            ax + STRIPE_LEN / 2, cz + t + STRIPE_W / 2, MARK_Y, PAL.roadLine, 0.85);
        } else {
          quad(cx + t - STRIPE_W / 2, az - STRIPE_LEN / 2,
            cx + t + STRIPE_W / 2, az + STRIPE_LEN / 2, MARK_Y, PAL.roadLine, 0.85);
        }
      }
      // stop bar just outside the crossing, on the approaching lane only
      const bx = cx + dx * (BAND + STRIPE_LEN / 2 + 0.5);
      const bz = cz + dz * (BAND + STRIPE_LEN / 2 + 0.5);
      if (dx !== 0) {
        const z0 = dx > 0 ? cz : cz - R, z1 = dx > 0 ? cz + R : cz;
        quad(bx - 0.2, z0 + 0.2, bx + 0.2, z1 - 0.2, MARK_Y, PAL.roadLine, 0.8);
      } else {
        const x0 = dz > 0 ? cx - R : cx, x1 = dz > 0 ? cx : cx + R;
        quad(x0 + 0.2, bz - 0.2, x1 - 0.2, bz + 0.2, MARK_Y, PAL.roadLine, 0.8);
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
