// Street props: instanced pools built from the generated GLBs. Placement is
// deterministic from the world seed. Each instance carries physics/destruction
// state (P4 swaps an instance to a dynamic body by zero-scaling it here and
// spawning a clone).
import * as THREE from 'three';
import { staticGeometry } from '../engine/assets.js';
import { makeWorldMaterial } from '../engine/materials.js';
import { streetlampGeo, trafficLightGeo, signGeo, treeGeo, kioskGeo } from './procprops.js';
import { ROAD, WALK, BLOCKS, MAP_EDGE } from './city.js';
import { rand, pick } from '../core/mathx.js';

// generated lifts that passed visual QA use their GLB; the rest are procedural
const PROC_GEO = {
  prop_streetlamp: streetlampGeo,
  prop_trafficlight: trafficLightGeo,
  prop_sign: signGeo,
  prop_tree: treeGeo,
  prop_kiosk: kioskGeo,
};

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();

// per-type config: extra yaw to face "forward", uniform scale jitter, mass
export const PROP_TYPES = {
  prop_hydrant: { mass: 60, r: 0.35, h: 0.85 },
  prop_bench: { mass: 90, r: 0.9, h: 0.9 },
  prop_streetlamp: { mass: 220, r: 0.3, h: 5.6, tall: true },
  prop_trafficlight: { mass: 260, r: 0.35, h: 4.6, tall: true },
  prop_sign: { mass: 40, r: 0.25, h: 2.6, tall: true },
  prop_dumpster: { mass: 320, r: 1.1, h: 1.35 },
  prop_kiosk: { mass: 500, r: 1.4, h: 2.6 },
  prop_tree: { mass: 400, r: 0.5, h: 6.0, tall: true },
};

export function buildProps(scene, city) {
  const placements = {};
  for (const t of Object.keys(PROP_TYPES)) placements[t] = [];
  const add = (type, x, z, yaw = 0, s = 1) => placements[type].push({ type, x, z, yaw, s, alive: true, idx: -1 });

  const curb = WALK.inner + 1.1;      // just inside the sidewalk from the road
  const C = ROAD.centers;

  // streetlamps + trees alternate along each road, both sides
  for (const cz of C) {
    for (let x = -MAP_EDGE + 8; x < MAP_EDGE - 8; x += 18) {
      if (C.some((cx) => Math.abs(x - cx) < 8)) continue;   // keep junctions clear
      add('prop_streetlamp', x, cz - curb, 0);
      add('prop_streetlamp', x + 9, cz + curb, Math.PI);
      if (rand() < 0.75) add('prop_tree', x + 4.5, cz - curb - 0.9, rand() * Math.PI, 0.8 + rand() * 0.4);
      if (rand() < 0.75) add('prop_tree', x + 13.5, cz + curb + 0.9, rand() * Math.PI, 0.8 + rand() * 0.4);
    }
  }
  for (const cx of C) {
    for (let z = -MAP_EDGE + 12; z < MAP_EDGE - 12; z += 18) {
      if (C.some((cz) => Math.abs(z - cz) < 8)) continue;
      add('prop_streetlamp', cx - curb, z, Math.PI / 2);
      add('prop_streetlamp', cx + curb, z + 9, -Math.PI / 2);
      if (rand() < 0.6) add('prop_tree', cx - curb - 0.9, z + 4.5, rand() * Math.PI, 0.8 + rand() * 0.4);
    }
  }

  // traffic lights: two diagonal corners of each interior 4-way intersection
  for (const cx of C) for (const cz of C) {
    if (Math.abs(cx) > 60 && Math.abs(cz) > 60) continue;   // skip far corners
    add('prop_trafficlight', cx - ROAD.half - 1.0, cz - ROAD.half - 1.0, Math.PI * 0.25);
    add('prop_trafficlight', cx + ROAD.half + 1.0, cz + ROAD.half + 1.0, Math.PI * 1.25);
  }

  // hydrants near block corners; signs near crossings
  for (const b of BLOCKS) {
    add('prop_hydrant', b.x0 - 1.6, b.z0 - 1.6, rand() * Math.PI * 2);
    add('prop_hydrant', b.x1 + 1.6, b.z1 + 1.6, rand() * Math.PI * 2);
    add('prop_sign', b.x1 + 1.4, b.z0 - 1.4, Math.PI / 2);
    add('prop_sign', b.x0 - 1.4, b.z1 + 1.4, -Math.PI / 2);
  }

  // benches + dumpsters + kiosks near appropriate buildings
  let kiosks = 0;
  for (const s of city.buildings) {
    const d = s.door;
    if ((s.type === 'shop' || s.type === 'diner' || s.type === 'library') && rand() < 0.8) {
      const ox = d.outX - d.x, oz = d.outZ - d.z;   // outward dir
      add('prop_bench', d.outX + oz * 1.2 + ox * 0.4, d.outZ + ox * 1.2 + oz * 0.4, Math.atan2(-ox, -oz));
    }
    if (s.type === 'diner' && kiosks < 3 && rand() < 0.5) {
      add('prop_kiosk', d.outX - (d.outZ > d.z ? 3 : -3), d.outZ + 1.5, Math.atan2(d.outX - d.x, d.outZ - d.z));
      kiosks++;
    }
    if ((s.type === 'apartment' || s.type === 'office') && rand() < 0.3) {
      // dumpster tucked at the building's back corner (courtyard side)
      const bx = s.front === 'west' ? s.x1 + 1 : s.front === 'east' ? s.x0 - 1 : s.x1 - 1.4;
      const bz = s.front === 'north' ? s.z1 + 1 : s.front === 'south' ? s.z0 - 1 : s.z1 - 1.4;
      const inBlock = BLOCKS.some((bl) => bx > bl.x0 && bx < bl.x1 && bz > bl.z0 && bz < bl.z1);
      if (inBlock) add('prop_dumpster', bx, bz, rand() * Math.PI);
    }
  }

  // courtyard trees
  for (const b of BLOCKS) {
    for (let i = 0; i < 3; i++) {
      const x = b.x0 + 6 + rand() * (b.x1 - b.x0 - 12), z = b.z0 + 6 + rand() * (b.z1 - b.z0 - 12);
      const clear = city.buildings.every((s) => x < s.x0 - 2 || x > s.x1 + 2 || z < s.z0 - 2 || z > s.z1 + 2);
      if (clear) add('prop_tree', x, z, rand() * Math.PI, 0.9 + rand() * 0.5);
    }
  }

  // ---- build instanced meshes
  const reg = { types: {}, all: [] };
  const worldMat = makeWorldMaterial();
  for (const [type, list] of Object.entries(placements)) {
    const { geometry, material } = PROC_GEO[type]
      ? { geometry: PROC_GEO[type](), material: worldMat }
      : staticGeometry(type);
    const im = new THREE.InstancedMesh(geometry, material, Math.max(list.length, 1));
    im.frustumCulled = false;
    im.name = type;
    list.forEach((p, i) => {
      p.idx = i;
      const y = type === 'prop_bench' || type === 'prop_hydrant' || type === 'prop_sign' ? 0.12 : (onSidewalk(p.x, p.z) ? 0.12 : 0);
      Q.setFromAxisAngle(V.set(0, 1, 0), p.yaw);
      M.compose(V.set(p.x, y, p.z), Q, S.set(p.s || 1, p.s || 1, p.s || 1));
      im.setMatrixAt(i, M);
      p.y = y;
    });
    im.count = list.length;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im);
    reg.types[type] = { mesh: im, list };
    for (const p of list) reg.all.push(p);
  }

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  reg.hide = (p) => {
    const t = reg.types[p.type];
    t.mesh.setMatrixAt(p.idx, ZERO);
    t.mesh.instanceMatrix.needsUpdate = true;
  };
  return reg;
}

function onSidewalk(x, z) {
  const inRoad = (v) => ROAD.centers.some((c) => Math.abs(v - c) <= ROAD.half + 0.2);
  return !(inRoad(x) || inRoad(z));
}
