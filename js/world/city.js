// City layout: a dense 2×2-block downtown. Deterministic from the world seed.
// Roads run along x=0/z=0 and the perimeter (±63); four 46m blocks between
// them hold ~30 buildings facing the sidewalks. Everything else (buildings,
// streets, props, nav, traffic) is generated from the specs produced here.
import { rand, randRange, randInt, pick } from '../core/mathx.js';

export const ROAD = { centers: [-63, 0, 63], half: 5 };      // asphalt half-width
export const WALK = { inner: 5, outer: 8.5 };                 // sidewalk band from road center
export const BLOCKS = [
  { x0: -54.5, z0: -54.5, x1: -8.5, z1: -8.5, district: 0, name: 'Old Quarter' },
  { x0: 8.5, z0: -54.5, x1: 54.5, z1: -8.5, district: 1, name: 'Finance Row' },
  { x0: -54.5, z0: 8.5, x1: -8.5, z1: 54.5, district: 2, name: 'Market Side' },
  { x0: 8.5, z0: 8.5, x1: 54.5, z1: 54.5, district: 3, name: 'Harbor End' },
];
export const MAP_EDGE = 71.5;      // outer sidewalk edge; apron beyond fades into fog
export const FLOOR_H = 3;

export const BUILDING_TYPES = ['apartment', 'office', 'shop', 'diner', 'library', 'school'];

// Landmarks: two lots per city become giant samosas (world/samosa.js). A single lot
// tops out around 18m of samosa before the shape has to be stretched into a spire, so
// a landmark swallows its neighbour and reaches back into the empty block interior.
export const LANDMARK_DISTRICTS = [0, 3];   // Old Quarter and Harbor End — diagonally opposite
const LANDMARK_FLOORS = 11;                 // 33m; 10 is stouter, 12 starts to look like a fin
const LANDMARK_DEPTH = 14;                  // metres, clamped to keep a 1m gap to neighbours
const LANDMARK_TINT = 0xd08a3c;             // fried-pastry gold; also tints the crumb debris

export function districtOf(x, z) {
  return (x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0);
}

export function buildCitySpec() {
  const buildings = [];
  let id = 0;

  for (const b of BLOCKS) {
    const placed = [];
    const tryPlace = (x0, z0, w, d, front) => {
      const x1 = x0 + w, z1 = z0 + d;
      if (x0 < b.x0 - 0.01 || z0 < b.z0 - 0.01 || x1 > b.x1 + 0.01 || z1 > b.z1 + 0.01) return false;
      for (const p of placed) {
        if (x0 < p.x1 + 1 && x1 > p.x0 - 1 && z0 < p.z1 + 1 && z1 > p.z0 - 1) return false;
      }
      const type = pickType();
      const spec = {
        id: id++, x0, z0, x1, z1, w, d,
        floors: type === 'shop' || type === 'diner' ? randInt(2, 3) : randInt(3, 8),
        type, front, district: b.district,
        tint: pick([0x2c5fd1, 0x2452b8, 0x3a6fe0, 0x9aa6c8, 0xb98a54, 0x8896bb, 0x33549e]),
        alive: true,
      };
      placed.push(spec); buildings.push(spec);
      return true;
    };

    // north & south rows (fronts face outward to the sidewalks)
    for (const [zEdge, front] of [[b.z0, 'north'], [b.z1, 'south']]) {
      let x = b.x0;
      while (x < b.x1 - 10) {
        const w = 2 * randInt(6, 10);            // 12..20
        const d = 2 * randInt(5, 7);             // 10..14
        const z0 = front === 'north' ? zEdge : zEdge - d;
        if (!tryPlace(x, z0, Math.min(w, b.x1 - x), d, front)) x += 2;
        else x += w + (rand() < 0.4 ? 2 : 0);    // occasional alley gap
      }
    }
    // east & west middle fills
    for (const [xEdge, front] of [[b.x0, 'west'], [b.x1, 'east']]) {
      let z = b.z0 + 15;
      while (z < b.z1 - 15) {
        const d = 2 * randInt(6, 8);
        const w = 2 * randInt(5, 6);
        const x0 = front === 'west' ? xEdge : xEdge - w;
        if (!tryPlace(x0, z, w, Math.min(d, b.z1 - 15 - z), front)) z += 2;
        else z += d + 2;
      }
    }
  }

  applyLandmarks(buildings);

  // nav lattice: nodes along sidewalk centerlines + crosswalk links
  const SIDE = [-56.75, -6.75, 6.75, 56.75];    // sidewalk centerlines
  const nodes = [];
  const edges = [];                              // [a, b, {cross: intersectionId|null}]
  const key = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
  const nodeAt = new Map();
  const addNode = (x, z) => {
    const k = key(x, z);
    if (nodeAt.has(k)) return nodeAt.get(k);
    const n = { id: nodes.length, x, z, adj: [] };
    nodes.push(n); nodeAt.set(k, n);
    return n;
  };
  const link = (a, b, cross = null) => {
    a.adj.push({ n: b.id, cross }); b.adj.push({ n: a.id, cross });
    edges.push([a.id, b.id, cross]);
  };

  const SPAN = [];
  for (let v = -56.75; v <= 56.76; v += 7.15) SPAN.push(+v.toFixed(2));
  // lines parallel to x (z fixed) and parallel to z (x fixed)
  for (const z of SIDE) {
    let prev = null;
    for (const x of SPAN) {
      const n = addNode(x, z);
      if (prev) link(prev, n);
      prev = n;
    }
  }
  for (const x of SIDE) {
    let prev = null;
    for (const z of SPAN) {
      const n = addNode(x, z);
      if (prev && prev.id !== n.id) {
        const already = prev.adj.some((a) => a.n === n.id);
        if (!already) link(prev, n);
      }
      prev = n;
    }
  }
  // crosswalks over the centre roads (x≈0 and z≈0) and gaps in SPAN across them
  const crossings = [];
  let crossId = 0;
  for (const z of SIDE) {
    const a = nodeAt.get(key(-6.75, z)), b = nodeAt.get(key(6.75, z));
    if (a && b) { const cid = crossId++; link(a, b, cid); crossings.push({ id: cid, x: 0, z, axis: 'x' }); }
  }
  for (const x of SIDE) {
    const a = nodeAt.get(key(x, -6.75)), b = nodeAt.get(key(x, 6.75));
    if (a && b) { const cid = crossId++; link(a, b, cid); crossings.push({ id: cid, x, z: 0, axis: 'z' }); }
  }

  // POIs: door per building (front centre), plus plaza benches added by props
  const pois = [];
  for (const s of buildings) {
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    let dx = cx, dz = cz, nx = cx, nz = cz;
    if (s.front === 'north') { dz = s.z0; nz = s.z0 - 2.2; }
    if (s.front === 'south') { dz = s.z1; nz = s.z1 + 2.2; }
    if (s.front === 'west') { dx = s.x0; nx = s.x0 - 2.2; }
    if (s.front === 'east') { dx = s.x1; nx = s.x1 + 2.2; }
    s.door = { x: dx, z: dz, outX: nx, outZ: nz };
    pois.push({ type: s.type, building: s.id, x: nx, z: nz, district: s.district });
  }

  return { buildings, nav: { nodes, edges, crossings }, pois };
}

// Merge one adjacent pair of street-front lots per landmark district into a single big
// lot. Deterministic and RNG-free on purpose: buildCitySpec's rand() stream must be
// untouched so the rest of the city generates exactly as before.
function applyLandmarks(buildings) {
  for (const district of LANDMARK_DISTRICTS) {
    const pool = buildings.filter((s) => s.district === district && !s.landmark && !s.absorbed);
    // widest neighbouring pair sharing a block edge; ties go to the lower id
    let best = null;
    for (const a of pool) {
      for (const b of pool) {
        if (b.id <= a.id || a.front !== b.front) continue;
        const horiz = a.front === 'north' || a.front === 'south';
        const edge = a.front === 'north' ? 'z0' : a.front === 'south' ? 'z1' : a.front === 'west' ? 'x0' : 'x1';
        if (Math.abs(a[edge] - b[edge]) > 0.01) continue;
        const gap = horiz ? Math.max(b.x0 - a.x1, a.x0 - b.x1) : Math.max(b.z0 - a.z1, a.z0 - b.z1);
        if (gap < -0.01 || gap > 4) continue;   // neighbours, not opposite ends of the block
        const span = horiz ? Math.max(a.x1, b.x1) - Math.min(a.x0, b.x0) : Math.max(a.z1, b.z1) - Math.min(a.z0, b.z0);
        if (!best || span > best.span + 0.01) best = { a, b, span };
      }
    }
    if (!best) continue;                        // no pair in this district: leave it alone
    const { a, b } = best;
    a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1);
    a.z0 = Math.min(a.z0, b.z0); a.z1 = Math.max(a.z1, b.z1);
    b.absorbed = true;

    // reach back from the street into the block interior, stopping 1m short of anyone else
    const others = buildings.filter((s) => s !== a && s !== b && !s.absorbed);
    const room = (limit, grow) => {
      let v = limit;
      for (const s of others) {
        const clash = grow === 'z1' ? (a.x0 < s.x1 && a.x1 > s.x0) && s.z0 >= a.z1
          : grow === 'z0' ? (a.x0 < s.x1 && a.x1 > s.x0) && s.z1 <= a.z0
            : grow === 'x1' ? (a.z0 < s.z1 && a.z1 > s.z0) && s.x0 >= a.x1
              : (a.z0 < s.z1 && a.z1 > s.z0) && s.x1 <= a.x0;
        if (!clash) continue;
        const reach = grow === 'z1' ? s.z0 - 1 - a.z0 : grow === 'z0' ? a.z1 - (s.z1 + 1)
          : grow === 'x1' ? s.x0 - 1 - a.x0 : a.x1 - (s.x1 + 1);
        v = Math.min(v, reach);
      }
      return Math.max(2, 2 * Math.floor(v / 2));   // cells are 2m wide; keep the grid aligned
    };
    if (a.front === 'north') a.z1 = a.z0 + room(LANDMARK_DEPTH, 'z1');
    else if (a.front === 'south') a.z0 = a.z1 - room(LANDMARK_DEPTH, 'z0');
    else if (a.front === 'west') a.x1 = a.x0 + room(LANDMARK_DEPTH, 'x1');
    else a.x0 = a.x1 - room(LANDMARK_DEPTH, 'x0');

    a.w = a.x1 - a.x0; a.d = a.z1 - a.z0;
    a.landmark = 'samosa';
    a.floors = LANDMARK_FLOORS;
    a.tint = LANDMARK_TINT;
  }

  // Drop the absorbed lots and renumber: buildings.js indexes specs by spec.id
  // (specOf, reg.buildings[cell.bId]), so id must stay equal to the array index.
  for (let i = buildings.length - 1; i >= 0; i--) if (buildings[i].absorbed) buildings.splice(i, 1);
  buildings.forEach((s, i) => { s.id = i; });
}

function pickType() {
  const r = rand();
  if (r < 0.34) return 'apartment';
  if (r < 0.55) return 'office';
  if (r < 0.72) return 'shop';
  if (r < 0.86) return 'diner';
  if (r < 0.93) return 'library';
  return 'school';
}

// nearest nav node — used by NPC routing
export function nearestNode(nav, x, z) {
  let best = null, bd = Infinity;
  for (const n of nav.nodes) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
