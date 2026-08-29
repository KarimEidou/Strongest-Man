// A destructible SHELL: a downloaded model standing in for a building's facade,
// sliced into the same cell grid the procedural facades use.
//
// The cell grid underneath is completely stock, so this file only has to answer
// one question — which 2 m x 3 m cell does each triangle belong to? Triangles
// are binned by centroid, then the geometry is rebuilt with each cell's
// triangles contiguous, so destroying a cell is a single write over one vertex
// range and the whole shell stays one draw call.
//
// This was world/samosa.js's private machinery. It is here because it is not
// about samosas: any model can wear a lot this way. samosa.js keeps the parts
// that ARE about samosas — the fit, and the sign band painted onto the crust.
import * as THREE from 'three';
import { FLOOR_H } from './city.js';
import { staticGeometry } from '../engine/assets.js';
import { makeWorldMaterial, tagGeometry, faceShade, SURF } from '../engine/materials.js';

export const CELL_W = 2;

// The asset pipeline ships quantised attributes (Int16, normalized). Transforming
// such a geometry writes the results straight back into the integer array, which
// clamps every coordinate to [-1,1] — so take a float copy before scaling
// anything. getX/getY/getZ denormalise on read, so this is lossless.
export function toFloatGeometry(src) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const n = a.itemSize;
    const arr = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) {
      arr[i * n] = a.getX(i);
      if (n > 1) arr[i * n + 1] = a.getY(i);
      if (n > 2) arr[i * n + 2] = a.getZ(i);
    }
    out.setAttribute(name, new THREE.Float32BufferAttribute(arr, n));
  }
  return out;
}

// Radially project a lot-local point onto the lot AABB — the inverse of
// positionCell() in buildings.js. Returns the facade cell it lands on.
//
// Radial rather than nearest-face on purpose. For a footprint that fills its lot
// the two are the same thing. For one that does not — a cone, or a setback
// storey — radial fans that storey's triangles proportionally across the floor's
// columns, so every column that exists gets geometry. A nearest-face projection
// would leave the outer columns of a setback floor with nothing binned to them,
// which is a hole you cannot see until you punch beside it.
export function cellKeyAt(lx, y, lz, halfW, halfD, cols, floors) {
  const floor = Math.max(0, Math.min(floors - 1, Math.floor(y / FLOOR_H)));
  const tx = Math.abs(lx) > 1e-6 ? halfW / Math.abs(lx) : Infinity;
  const tz = Math.abs(lz) > 1e-6 ? halfD / Math.abs(lz) : Infinity;
  let side, along, span;
  if (tx < tz) { side = lx < 0 ? 'west' : 'east'; along = lz * tx + halfD; span = halfD * 2; }
  else { side = lz < 0 ? 'north' : 'south'; along = lx * tz + halfW; span = halfW * 2; }
  const n = cols[side];
  const col = Math.max(0, Math.min(n - 1, Math.floor((along / span) * n)));
  return `${side}:${col}:${floor}`;
}

// The column counts a lot's four sides are divided into. One place, because
// buildings.js, the shell and the collider all have to agree.
export function colsFor(lotW, lotD) {
  return {
    north: Math.round(lotW / CELL_W), south: Math.round(lotW / CELL_W),
    east: Math.round(lotD / CELL_W), west: Math.round(lotD / CELL_W),
  };
}

// Slice a world-space geometry into the lot's cells.
//
// `geo` must already be fitted and positioned about the lot centre in XZ, with
// its base at y = 0 — this does the binning and the rebuild, and nothing about
// how the model got there. Returns the mesh, the per-cell vertex ranges, each
// floor's own world-space cross-section, and the hide call destruction uses.
export function sliceIntoCells(geo, material, spec, floors, name) {
  const lotW = spec.x1 - spec.x0, lotD = spec.z1 - spec.z0;
  const cx = (spec.x0 + spec.x1) / 2, cz = (spec.z0 + spec.z1) / 2;
  const halfW = lotW / 2, halfD = lotD / 2;
  const cols = colsFor(lotW, lotD);

  // bin triangles by centroid
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
  const triCount = pos.count / 3;
  const bins = new Map();
  for (let t = 0; t < triCount; t++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { const i = t * 3 + k; x += pos.getX(i); y += pos.getY(i); z += pos.getZ(i); }
    const key = cellKeyAt(x / 3, y / 3, z / 3, halfW, halfD, cols, floors);
    let list = bins.get(key);
    if (!list) bins.set(key, (list = []));
    list.push(t);
  }

  // Rebuild with each cell's triangles contiguous.
  //
  // EVERY attribute is permuted, not just position/normal/uv. This used to copy
  // those three by name, which was fine while the only shell was the samosa and
  // it drew with the GLB's own plain Lambert — and silently dropped `color`,
  // `aInterior` and `aSurface` the moment a shell wanted the world material.
  // A geometry with `vertexColors: true` and no colour attribute renders black,
  // which is what the first shelled city looked like.
  const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3);
  const extra = [];
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (name === 'position' || name === 'normal') continue;
    extra.push({ name, src: a, n: a.itemSize, dst: new Float32Array(pos.count * a.itemSize) });
  }
  const ranges = new Map();
  const floorSpan = [];
  let v = 0;
  for (const [key, tris] of bins) {
    const start = v;
    const f = +key.slice(key.lastIndexOf(':') + 1);
    const fs = floorSpan[f] || (floorSpan[f] = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        const px = pos.getX(i) + cx, py = pos.getY(i), pz = pos.getZ(i) + cz;
        P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz;
        N[v * 3] = nor.getX(i); N[v * 3 + 1] = nor.getY(i); N[v * 3 + 2] = nor.getZ(i);
        for (const e of extra) {
          e.dst[v * e.n] = e.src.getX(i);
          if (e.n > 1) e.dst[v * e.n + 1] = e.src.getY(i);
          if (e.n > 2) e.dst[v * e.n + 2] = e.src.getZ(i);
        }
        if (px < fs.minX) fs.minX = px; if (px > fs.maxX) fs.maxX = px;
        if (pz < fs.minZ) fs.minZ = pz; if (pz > fs.maxZ) fs.maxZ = pz;
        v++;
      }
    }
    ranges.set(key, { start, count: v - start });
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  for (const e of extra) out.setAttribute(e.name, new THREE.BufferAttribute(e.dst, e.n));
  out.computeBoundingSphere();
  out.getAttribute('position').setUsage(THREE.DynamicDrawUsage);

  const mesh = new THREE.Mesh(out, material);
  mesh.name = name;

  // Destroying a cell collapses its triangles onto their own first vertex:
  // zero-area, so nothing rasterises, and the degenerate stays inside the shell
  // rather than snapping to the world origin.
  const attr = out.getAttribute('position');
  const hideCrust = (key) => {
    const r = ranges.get(key);
    if (!r || r.count === 0) return;
    const ax = P[r.start * 3], ay = P[r.start * 3 + 1], az = P[r.start * 3 + 2];
    for (let i = r.start; i < r.start + r.count; i++) { P[i * 3] = ax; P[i * 3 + 1] = ay; P[i * 3 + 2] = az; }
    attr.addUpdateRange(r.start * 3, r.count * 3);
    attr.needsUpdate = true;
  };

  return { mesh, ranges, floorSpan, cols, hideCrust, cx, cz, halfW, halfD };
}

// ---------------------------------------------------------------------------
// A downloaded building worn by an ordinary lot.

// The eight shapes. The two ratios that decide which lot each suits are
// MEASURED, not written down.
//
// They used to be a hand-copied table, and half of it was wrong: `ar` is
// consumed below as a SIGNED width:depth, but the numbers had been recorded as
// the unsigned max/min. Four of the eight models are deeper than they are wide,
// so their stored ratio was the reciprocal of the real one — which inverts the
// rot90 choice and makes MAX_ANISO gate on a number that is not the distortion.
// Measured: bld_low_b is 9.90 x 12.20, a true 0.81, recorded as 1.23.
//
// A table that restates what the geometry already says cannot be kept true by
// discipline — re-run the importer with a different `size` or swap a source GLB
// and it silently becomes fiction. So it is read off the bounding box once per
// model and cached.
const SHELLS = ['bld_low_a', 'bld_low_b', 'bld_mid_a', 'bld_mid_b',
  'bld_mid_c', 'bld_tall_a', 'bld_tall_b', 'bld_tower'];

const dimCache = new Map();
function shellDims(name) {
  let d = dimCache.get(name);
  if (d) return d;
  const geo = staticGeometry(name).geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  d = { name, hr: size.y / Math.min(size.x, size.z), ar: size.x / size.z };
  dimCache.set(name, d);
  return d;
}

// How far a model may be distorted before its fenestration stops reading.
//
// The fit is an INDEPENDENT scale per axis, so the footprint comes out exactly
// the lot rectangle — which is the whole reason the existing four-band collider
// and the game's own door archetype still line up. The cost is anisotropy: a
// square model on an oblong lot has its windows stretched one way. These are the
// two numbers that decide when to stop and let a lot keep its procedural facade
// instead.
const MAX_ANISO = 1.8;        // widest : narrowest, after choosing the rotation
const MAX_STRETCH = 1.7;      // vertical scale against the horizontal mean
const MIN_STRETCH = 1 / MAX_STRETCH;

// Pick the model that fits this lot with the least distortion, or null.
//
// Returning null is a first-class outcome, not a failure: a mixed city is
// identical to a fully converted one except on the lots that fell back, and 20
// of 26 wearing models reads as variety. Forcing a fit instead would mean either
// a uniform inscribe — which is what leaves a gap between the model and its lot,
// and is exactly the shape of the samosa's invisible wall — or a model squashed
// past what its windows survive.
export function pickShellModel(spec) {
  const lotW = spec.x1 - spec.x0, lotD = spec.z1 - spec.z0;
  const lotHr = (spec.floors * FLOOR_H) / Math.min(lotW, lotD);
  let best = null, bestCost = Infinity;
  for (const name of SHELLS) {
    const m = shellDims(name);
    // Either way round: a 90-degree pre-rotation is free and doubles the aspect
    // ratios each model can serve.
    for (const rot90 of [false, true]) {
      const ar = rot90 ? 1 / m.ar : m.ar;          // model width : depth, signed by the lot's own order
      const lotSigned = lotW / lotD;
      const aniso = Math.max(Math.abs(lotSigned / ar), Math.abs(ar / lotSigned));
      // hr is relative to the model's smaller side, and the fit maps that side
      // onto the lot's corresponding side, so the vertical stretch is the ratio
      // of the two height ratios.
      const stretch = lotHr / m.hr;
      if (aniso > MAX_ANISO || stretch > MAX_STRETCH || stretch < MIN_STRETCH) continue;
      // Distortion in both directions costs the same; log so 1.5x and 1/1.5x
      // score alike.
      const cost = Math.abs(Math.log(aniso)) + Math.abs(Math.log(stretch));
      if (cost < bestCost) { bestCost = cost; best = { name: m.name, rot90, aniso: +aniso.toFixed(2), stretch: +stretch.toFixed(2) }; }
    }
  }
  return best;
}

// Build a lot's shell: fit it, line the inside, slice it into cells.
//
// NO EMISSIVE TAGGING, and that is a finding rather than an omission. Lit
// windows come from `aSurface == SURF.WINDOW`, so a shell would need its glazing
// triangles picked out — and on these models they cannot be, because the atlas
// does not separate them. It is a grid of gradient swatches, and measured across
// three of the eight models EVERY blue-dominant texel the geometry samples is a
// desaturated blue-grey between saturation 0.19 and 0.23: the walls and the
// windows are the same family, and the saturated blue swatch in the atlas is
// never used. A first attempt at a luminance rule tagged 85% of the exterior and
// lit whole buildings like lanterns at night.
//
// The cost is that a shelled building has no lit windows after dark. That state
// is unreachable in play — the city is always daytime (core/state.js) and only
// the tooling-only `?skytime=` flag gets there — so it is a gap in a picture
// nobody sees, and the streetlamps still light these facades because they are on
// the world material. Recorded in ASSUMPTIONS.md.
export function buildModelShell(spec, floors, pick) {
  const src = staticGeometry(pick.name);
  const geo = toFloatGeometry(src.geometry.clone().toNonIndexed());

  // Rotate BEFORE measuring, so the bounding box is the one the fit uses.
  if (pick.rot90) geo.rotateY(Math.PI / 2);

  geo.computeBoundingBox();
  const size = new THREE.Vector3(), ctr = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  geo.boundingBox.getCenter(ctr);
  geo.translate(-ctr.x, -geo.boundingBox.min.y, -ctr.z);

  // An INDEPENDENT scale per axis, not a uniform inscribe. That is the whole
  // difference between this and the samosa: the footprint comes out exactly the
  // lot rectangle, so the four-band collider is already right, the game's door
  // archetype sits flush in the facade, and there is no gap between the model
  // and the lot for an invisible wall to live in.
  const lotW = spec.x1 - spec.x0, lotD = spec.z1 - spec.z0;
  geo.scale(lotW / size.x, (floors * FLOOR_H) / size.y, lotD / size.z);

  const lined = addInteriorLiner(geo);

  tagGeometry(lined.geo, 0xffffff, 0, 1, SURF.PLASTER);
  const aS = lined.geo.getAttribute('aSurface');
  const aI = lined.geo.getAttribute('aInterior');
  for (let i = 0; i < lined.surf.length; i++) { aS.setX(i, lined.surf[i]); aI.setX(i, lined.interior[i]); }
  aS.needsUpdate = true; aI.needsUpdate = true;
  faceShade(lined.geo);

  const shell = sliceIntoCells(lined.geo, shellMaterial(src.material.map), spec, floors, `shell_${spec.id}`);
  return { ...shell, hideKey: shell.hideCrust };
}

// One world material per atlas. The GLB arrives with a plain Lambert, which
// misses everything the world material does — the procedural surface detail, the
// specular lobe, and the streetlamp pools after dark, so a shelled building would
// be the one thing on the street a lamp did not light.
const matCache = new Map();
function shellMaterial(map) {
  if (matCache.has(map)) return matCache.get(map);
  const m = makeWorldMaterial({ map });
  matCache.set(map, m);
  return m;
}

// A Kenney building is a hollow single-sided box: punch a hole in the facade and
// you see straight through it and out the far side, because the back of every
// wall is culled.
//
// So every triangle is emitted twice — once as authored, once wound backwards
// with aInterior = 1, which is the same treatment markInnerFaces() gives the
// back of a procedural wall chunk. An exposed wall back is then lit like every
// other interior in the city instead of vanishing.
//
// Not DoubleSide, which would do this in one attribute: it doubles overdraw on
// every facade in the city whether or not it is broken, and it lights the inside
// with the sun.
const INSET = 0.06;   // metres the liner sits behind the face it lines
function addInteriorLiner(geo) {
  const src = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
  const n = src.count;
  const P = new Float32Array(n * 2 * 3), N = new Float32Array(n * 2 * 3);
  const U = uv ? new Float32Array(n * 2 * 2) : null;
  const S = new Float32Array(n * 2), I = new Float32Array(n * 2);
  for (let t = 0; t < n / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k, o = i;
      P[o * 3] = src.getX(i); P[o * 3 + 1] = src.getY(i); P[o * 3 + 2] = src.getZ(i);
      N[o * 3] = nor.getX(i); N[o * 3 + 1] = nor.getY(i); N[o * 3 + 2] = nor.getZ(i);
      if (U) { U[o * 2] = uv.getX(i); U[o * 2 + 1] = uv.getY(i); }
      S[o] = SURF.PLASTER; I[o] = 0;
      // The reversed copy, winding 0,2,1, pushed INSET metres back along its own
      // normal. Coincident would be correct in principle — the reversed copy is
      // backfacing from outside and gets culled — but a Kenney building has
      // plenty of surfaces whose authored normal points inward (the inner face
      // of a roof parapet, the underside of a balcony), and their liner then
      // faces OUT and paints a dark interior panel over the facade. Set back, the
      // original always wins from outside, and from inside a punched hole the
      // liner is still the first thing behind it.
      const j = t * 3 + (k === 0 ? 0 : 3 - k), o2 = n + i;
      const bx = nor.getX(j), by = nor.getY(j), bz = nor.getZ(j);
      P[o2 * 3] = src.getX(j) - bx * INSET;
      P[o2 * 3 + 1] = src.getY(j) - by * INSET;
      P[o2 * 3 + 2] = src.getZ(j) - bz * INSET;
      N[o2 * 3] = -bx; N[o2 * 3 + 1] = -by; N[o2 * 3 + 2] = -bz;
      if (U) { U[o2 * 2] = uv.getX(j); U[o2 * 2 + 1] = uv.getY(j); }
      // An interior face is never glazing: a lit window seen from inside the
      // room it lights is a hole in the wall that glows.
      S[o2] = SURF.PLASTER; I[o2] = 1;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (U) out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  return { geo: out, surf: S, interior: I };
}
