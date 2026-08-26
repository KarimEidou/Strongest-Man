// Street props: instanced pools built from the generated GLBs. Placement is
// deterministic from the world seed. Each instance carries physics/destruction
// state (P4 swaps an instance to a dynamic body by zero-scaling it here and
// spawning a clone).
import * as THREE from 'three';
import { staticGeometry } from '../engine/assets.js';
import { makeWorldMaterial, tagGeometry, faceShade, SURF } from '../engine/materials.js';
import { ROAD, WALK, BLOCKS, MAP_EDGE } from './city.js';
import { baseHeight } from '../physics/heightfield.js';
import { createGrid } from '../physics/spatialgrid.js';
import { rand, pick } from '../core/mathx.js';

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), V2 = new THREE.Vector3(), S = new THREE.Vector3();

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
const NUDGE_MAX = 6.0;

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
    // The base must stand on pavement, not asphalt (overhanging arms and
    // canopies are fine and wanted — only the footing is tested). Roads run along
    // BOTH axes, so a point is asphalt when x is in a road band OR z is — which is
    // what physics/heightfield.js:baseHeight has always said. This test used to be
    // an AND, which rejects only the nine intersection squares and passes every
    // other square metre of road: 25 of 130 props stood on tarmac at the shipped
    // seed, seven of them on painted crosswalks.
    if (!offRoad(x, r + KERB_MARGIN) || !offRoad(z, r + KERB_MARGIN)) return false;
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

  // Junction guard, applied to every EMITTED position rather than only to the loop
  // variable. The +9 / +4.5 / +13.5 offsets below step straight over a guard that
  // tested `x` alone, which is how a lamp was emitted at x = -0.5 (the centre line
  // of the x = 0 carriageway) and a tree at x = 4.0 (its far lane, on the painted
  // crosswalk). canPlace now rejects those too, but rejecting them here means the
  // nudge search is not spent trying to rescue a candidate 4m out into traffic.
  const clearOfJunction = (v) => C.every((c) => Math.abs(v - c) >= 8);

  // Snap a coordinate onto the middle of the pavement band it is nearest to —
  // just clear of the kerb test (ROAD.half + r + KERB_MARGIN) and just inside the
  // building line. For the widest props that band is the only place they fit.
  const kerbBand = (v) => {
    for (const c of C) if (Math.abs(v - c) < 12) return c + Math.sign(v - c || 1) * (ROAD.half + 1.7);
    return v;
  };

  // streetlamps + trees alternate along each road, both sides
  for (const cz of C) {
    for (let x = -MAP_EDGE + 8; x < MAP_EDGE - 8; x += 18) {
      if (!clearOfJunction(x)) continue;
      add('prop_streetlamp', x, cz - curb, 0, 1, 'x');
      if (clearOfJunction(x + 9)) add('prop_streetlamp', x + 9, cz + curb, Math.PI, 1, 'x');
      // the roll is drawn before the guard so the world stays identical from one
      // seed whether or not a given slot is skipped
      const a = { p: rand(), yaw: rand() * Math.PI, s: 0.8 + rand() * 0.4 };
      if (a.p < 0.75 && clearOfJunction(x + 4.5)) add('prop_tree', x + 4.5, cz - curb - 0.7, a.yaw, a.s, 'x');
      const b = { p: rand(), yaw: rand() * Math.PI, s: 0.8 + rand() * 0.4 };
      if (b.p < 0.75 && clearOfJunction(x + 13.5)) add('prop_tree', x + 13.5, cz + curb + 0.7, b.yaw, b.s, 'x');
    }
  }
  for (const cx of C) {
    for (let z = -MAP_EDGE + 12; z < MAP_EDGE - 12; z += 18) {
      if (!clearOfJunction(z)) continue;
      add('prop_streetlamp', cx - curb, z, Math.PI / 2, 1, 'z');
      if (clearOfJunction(z + 9)) add('prop_streetlamp', cx + curb, z + 9, -Math.PI / 2, 1, 'z');
      const a = { p: rand(), yaw: rand() * Math.PI, s: 0.8 + rand() * 0.4 };
      if (a.p < 0.6 && clearOfJunction(z + 4.5)) add('prop_tree', cx - curb - 0.7, z + 4.5, a.yaw, a.s, 'z');
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
      // Beside the door and along the pavement, the way the bench above is
      // placed — not "3m in x and 1.5m in z" regardless of which way the door
      // faces, which put a 2.8m-wide kiosk in the carriageway as often as not.
      // And `kiosks++` used to run whether or not the prop was actually placed,
      // so once the road test started rejecting those the counter burned all
      // three slots on candidates that were never built and the city ended up
      // with no kiosks at all.
      const ox = d.outX - d.x, oz = d.outZ - d.z;
      const ol = Math.hypot(ox, oz) || 1;
      const ux = ox / ol, uz = oz / ol;
      // A kiosk is 2.8m across and the pavement is 3.5m (city.js WALK 5 -> 8.5),
      // so once the kerb test works there is only a ~15cm band where one fits at
      // all — its own centreline. Aim at that rather than at a fixed offset from
      // the door, and hand the nudge the ALONG-street axis so it can walk into
      // one of the 3.7m gaps between pedestrian-lattice nodes (7.15m apart).
      const kx = Math.abs(ux) > 0.5 ? kerbBand(d.outX) : d.outX;
      const kz = Math.abs(uz) > 0.5 ? kerbBand(d.outZ) : d.outZ;
      const placed = add('prop_kiosk', kx, kz, Math.atan2(ux, uz), 1,
        Math.abs(ux) > 0.5 ? 'z' : 'x');
      if (placed) kiosks++;
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

  // Every prop ships its own baked palette texture, and every one goes through the
  // shared world material rather than the plain Lambert engine/assets.js hands a
  // GLB — otherwise a bench gets none of the procedural surface detail, none of
  // the specular, and, after dark, none of the streetlamp light that everything
  // around it is catching. The surface id is per TYPE, which is as fine-grained
  // as a single-material model allows and is enough for the shader to tell a
  // steel post from a tree.
  const GLB_SURF = {
    prop_hydrant: SURF.METAL,
    prop_bench: SURF.WOOD,
    prop_dumpster: SURF.METAL,
    prop_streetlamp: SURF.METAL,
    prop_trafficlight: SURF.METAL,
    prop_sign: SURF.METAL,
    prop_tree: SURF.FOLIAGE,
    prop_kiosk: SURF.ROOF,
  };

  // ---- build instanced meshes
  const reg = { types: {}, all: [] };
  const texMat = new Map();     // one material per baked texture, not one per prop
  for (const [type, list] of Object.entries(placements)) {
    const { geometry, material } = (() => {
      const g = staticGeometry(type);
      // Not every lift ships normals — prop_hydrant.glb has position and uv only,
      // which left it Lambert-shaded off an undefined attribute (flat, and the
      // one prop the face-shading pass below could not touch).
      if (!g.geometry.getAttribute('normal')) g.geometry.computeVertexNormals();
      tagGeometry(g.geometry, 0xffffff, 0, 1, GLB_SURF[type] ?? SURF.CONCRETE);
      // The palette atlas is flat colour with no shading baked in, so the same
      // per-face darkening the city's own geometry gets keeps an imported prop
      // from reading as a sticker beside it.
      faceShade(g.geometry);
      let m = texMat.get(g.material.map);
      if (!m) { m = makeWorldMaterial({ map: g.material.map || null }); texMat.set(g.material.map, m); }
      return { geometry: g.geometry, material: m };
    })();
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
  // physics/collide.js installs onRetire/onRestore so a prop leaving or rejoining
  // the world is added to / removed from the spatial grid
  reg.onRetire = null;
  reg.onRestore = null;
  reg.hide = (p) => {
    const t = reg.types[p.type];
    t.mesh.setMatrixAt(p.idx, ZERO);
    t.mesh.instanceMatrix.needsUpdate = true;
    reg.onRetire?.(p);
  };
  // props that stay visible but stop colliding (a felled lamp lies where it fell)
  reg.retire = (p) => reg.onRetire?.(p);

  // Drive one live instance's matrix — used by the carry system and by the
  // tip-over animation in world/destruction.js. Same compose as the build pass
  // above, so a prop in your hands is the instance that was standing there: no
  // stand-in mesh, no second copy, no state to keep in sync.
  reg.setMatrix = (p, pos, quat, scale) => {
    const t = reg.types[p.type];
    if (!t) return;
    const k = scale ?? (p.s || 1);
    M.compose(pos, quat, S.set(k, k, k));
    t.mesh.setMatrixAt(p.idx, M);
    t.mesh.instanceMatrix.needsUpdate = true;
  };
  // Picked up: stops colliding and stops being placeable, but keeps its slot and
  // stays drawn — whoever detached it now owns the matrix.
  reg.detach = (p) => {
    if (!p.alive) return false;
    p.alive = false;
    reg.onRetire?.(p);
    return true;
  };
  // Comes back to rest somewhere: upright at (x, z), sitting on the ground there.
  reg.reattach = (p, x, z, yaw) => {
    p.x = x; p.z = z;
    p.y = baseHeight(x, z);
    if (yaw !== undefined) p.yaw = yaw;
    p.felled = false;
    p.restQ = null;
    Q.setFromAxisAngle(V.set(0, 1, 0), p.yaw);
    reg.setMatrix(p, V2.set(p.x, p.y, p.z), Q);
    p.alive = true;
    reg.onRestore?.(p);
  };
  // Comes to rest IN THE POSE IT LANDED IN. reattach above rebuilds the matrix
  // from a pure Y rotation, which is why a thrown tree snapped bolt upright the
  // instant its body went to sleep: the pitch and roll that had it lying across
  // the road were simply thrown away. A felled prop keeps its orientation, keeps
  // its slot, and stays a real prop — it can be picked up and thrown again, and it
  // still blocks at its base, it just is not standing any more.
  reg.rest = (p, x, y, z, quat) => {
    p.x = x; p.z = z; p.y = y;
    p.felled = true;
    p.restQ = (p.restQ || new THREE.Quaternion()).copy(quat);
    reg.setMatrix(p, V2.set(x, y, z), quat);
    p.alive = true;
    reg.onRestore?.(p);
  };
  reg.dropped = dropped;

  // #1 regression probe: nothing may stand on the road or inside another prop
  window.__test.propPlacement = () => {
    const live = reg.all.filter((p) => p.alive);
    let onRoad = 0, overlap = 0;
    for (const p of live) {
      const r = PROP_TYPES[p.type].r * (p.s || 1);
      if (!offRoad(p.x, r) || !offRoad(p.z, r)) onRoad++;
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

  // #7 regression probe: a prop that came to rest after a throw must not be
  // standing up again. Reports how far each felled prop's own up-axis has been
  // knocked off vertical, in degrees.
  window.__test.restingProps = () => reg.all
    .filter((p) => p.felled)
    .map((p) => {
      V.set(0, 1, 0).applyQuaternion(p.restQ || Q.identity());
      return { type: p.type, tiltDeg: +(Math.acos(Math.min(1, Math.max(-1, V.y))) * 180 / Math.PI).toFixed(1) };
    });
  return reg;
}


