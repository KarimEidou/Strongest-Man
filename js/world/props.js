// Street props: instanced pools built from the generated GLBs. Placement is
// deterministic from the world seed. Each instance carries physics/destruction
// state (P4 swaps an instance to a dynamic body by zero-scaling it here and
// spawning a clone).
import * as THREE from 'three';
import { staticGeometry } from '../engine/assets.js';
import { makeWorldMaterial } from '../engine/materials.js';
import { streetlampGeo, trafficLightGeo, signGeo, treeGeo, kioskGeo } from './procprops.js';
import { ROAD, WALK, BLOCKS, MAP_EDGE } from './city.js';
import { baseHeight } from '../physics/heightfield.js';
import { createGrid } from '../physics/spatialgrid.js';
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

// Per-type config. `r` is the physical collision radius (the pole, the trunk);
// `clear` is the VISUAL footprint used to keep props from growing through each
// other — a tree's canopy is five times its trunk, which is how a traffic signal
// ended up buried inside one.
export const PROP_TYPES = {
  prop_hydrant: { mass: 60, r: 0.35, h: 0.85, clear: 0.5 },
  prop_bench: { mass: 90, r: 0.9, h: 0.9, clear: 1.1 },
  prop_streetlamp: { mass: 220, r: 0.3, h: 5.6, tall: true, clear: 1.4 },
  prop_trafficlight: { mass: 260, r: 0.35, h: 4.6, tall: true, clear: 1.7 },
  prop_sign: { mass: 40, r: 0.25, h: 2.6, tall: true, clear: 0.8 },
  prop_dumpster: { mass: 320, r: 1.1, h: 1.35, clear: 1.3 },
  prop_kiosk: { mass: 500, r: 1.4, h: 2.6, clear: 1.7 },
  prop_tree: { mass: 400, r: 0.5, h: 6.0, tall: true, clear: 2.6 },
};

const KERB_MARGIN = 0.25;    // how far onto the pavement a base must sit
const NODE_MARGIN = 0.3;     // keep the pedestrian lattice walkable
const NUDGE_STEP = 0.75;
const NUDGE_MAX = 3.0;

export function buildProps(scene, city) {
  const placements = {};
  for (const t of Object.keys(PROP_TYPES)) placements[t] = [];

  // ---- placement validation
  // Nothing here was checked before: candidates were emitted from open-loop
  // arithmetic, and the offsets that step past a junction guard (`x + 9`,
  // `x + 4.5`, `x + 13.5`) dropped lamps and trees into the middle of the road.
  const nodeGrid = createGrid();
  for (const n of city.nav.nodes) nodeGrid.insertPoint(n, n.x, n.z, 0);
  const propGrid = createGrid();
  const nearNodes = [], nearProps = [];

  const offRoad = (v, m) => {
    for (const c of ROAD.centers) if (Math.abs(v - c) <= ROAD.half + m) return false;
    return true;
  };

  function canPlace(type, x, z, s) {
    const cfg = PROP_TYPES[type];
    const r = cfg.r * s, clear = cfg.clear * s;
    if (Math.abs(x) > MAP_EDGE - r || Math.abs(z) > MAP_EDGE - r) return false;
    // the base must stand on pavement, not asphalt (overhanging arms and
    // canopies are fine and wanted — only the footing is tested)
    if (!offRoad(x, r + KERB_MARGIN) && !offRoad(z, r + KERB_MARGIN)) return false;
    // clear of buildings
    for (const b of city.buildings) {
      if (x > b.x0 - clear && x < b.x1 + clear && z > b.z0 - clear && z < b.z1 + clear) return false;
    }
    // not sitting on a pedestrian lattice node
    nodeGrid.query(x, z, r + NODE_MARGIN, nearNodes);
    for (const n of nearNodes) {
      const dx = n.x - x, dz = n.z - z, m = r + NODE_MARGIN;
      if (dx * dx + dz * dz < m * m) return false;
    }
    // not growing through another prop
    propGrid.query(x, z, clear + 3, nearProps);
    for (const o of nearProps) {
      const dx = o.x - x, dz = o.z - z, m = clear + o.clear;
      if (dx * dx + dz * dz < m * m) return false;
    }
    return true;
  }

  let dropped = 0;
  // `axis` nudges along the pavement the prop belongs to; without one we spiral.
  const add = (type, x, z, yaw = 0, s = 1, axis = null) => {
    let px = x, pz = z;
    if (!canPlace(type, px, pz, s)) {
      let found = false;
      for (let d = NUDGE_STEP; d <= NUDGE_MAX && !found; d += NUDGE_STEP) {
        const tries = axis === 'x' ? [[d, 0], [-d, 0]]
          : axis === 'z' ? [[0, d], [0, -d]]
            : [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]];
        for (const [ox, oz] of tries) {
          if (canPlace(type, x + ox, z + oz, s)) { px = x + ox; pz = z + oz; found = true; break; }
        }
      }
      if (!found) { dropped++; return null; }
    }
    const p = { type, x: px, z: pz, yaw, s, clear: PROP_TYPES[type].clear * s, alive: true, idx: -1 };
    propGrid.insertPoint(p, px, pz, p.clear);
    placements[type].push(p);
    return p;
  };

  // the furniture zone: between the kerb and the pedestrian lattice centreline
  const curb = WALK.inner + 0.95;
  const C = ROAD.centers;

  // streetlamps + trees alternate along each road, both sides
  for (const cz of C) {
    for (let x = -MAP_EDGE + 8; x < MAP_EDGE - 8; x += 18) {
      if (C.some((cx) => Math.abs(x - cx) < 8)) continue;   // keep junctions clear
      add('prop_streetlamp', x, cz - curb, 0, 1, 'x');
      add('prop_streetlamp', x + 9, cz + curb, Math.PI, 1, 'x');
      if (rand() < 0.75) add('prop_tree', x + 4.5, cz - curb - 0.7, rand() * Math.PI, 0.8 + rand() * 0.4, 'x');
      if (rand() < 0.75) add('prop_tree', x + 13.5, cz + curb + 0.7, rand() * Math.PI, 0.8 + rand() * 0.4, 'x');
    }
  }
  for (const cx of C) {
    for (let z = -MAP_EDGE + 12; z < MAP_EDGE - 12; z += 18) {
      if (C.some((cz) => Math.abs(z - cz) < 8)) continue;
      add('prop_streetlamp', cx - curb, z, Math.PI / 2, 1, 'z');
      add('prop_streetlamp', cx + curb, z + 9, -Math.PI / 2, 1, 'z');
      if (rand() < 0.6) add('prop_tree', cx - curb - 0.7, z + 4.5, rand() * Math.PI, 0.8 + rand() * 0.4, 'z');
    }
  }

  // traffic lights: two diagonal corners of each interior 4-way intersection
  for (const cx of C) for (const cz of C) {
    if (Math.abs(cx) > 60 && Math.abs(cz) > 60) continue;   // skip far corners
    add('prop_trafficlight', cx - ROAD.half - 1.0, cz - ROAD.half - 1.0, 0, 1, 'x');
    add('prop_trafficlight', cx + ROAD.half + 1.0, cz + ROAD.half + 1.0, Math.PI, 1, 'x');
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
      add('prop_tree', x, z, rand() * Math.PI, 0.9 + rand() * 0.5);
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
    im.receiveShadow = true;
    im.name = type;
    list.forEach((p, i) => {
      p.idx = i;
      const y = baseHeight(p.x, p.z);   // authoritative kerb/courtyard height
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
  // physics/collide.js installs onRetire so a dead prop leaves the spatial grid
  reg.onRetire = null;
  reg.hide = (p) => {
    const t = reg.types[p.type];
    t.mesh.setMatrixAt(p.idx, ZERO);
    t.mesh.instanceMatrix.needsUpdate = true;
    reg.onRetire?.(p);
  };
  // props that stay visible but stop colliding (a felled lamp lies where it fell)
  reg.retire = (p) => reg.onRetire?.(p);
  reg.dropped = dropped;

  // #1 regression probe: nothing may stand on the road or inside another prop
  window.__test.propPlacement = () => {
    const live = reg.all.filter((p) => p.alive);
    let onRoad = 0, overlap = 0;
    for (const p of live) {
      const r = PROP_TYPES[p.type].r * (p.s || 1);
      if (!offRoad(p.x, r) && !offRoad(p.z, r)) onRoad++;
    }
    for (let i = 0; i < live.length; i++) {
      for (let k = i + 1; k < live.length; k++) {
        const a = live[i], b = live[k];
        const m = a.clear + b.clear;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < m * m) overlap++;
      }
    }
    return { total: live.length, onRoad, overlap, dropped };
  };
  return reg;
}


