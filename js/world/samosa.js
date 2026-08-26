// Landmark samosa shell. The GLB is the visible exterior; the destruction cell grid
// underneath is completely stock, so this file only has to answer one question:
// which 2m×3m cell does each crust triangle belong to? Triangles are binned by
// centroid, then the geometry is rebuilt with each cell's triangles contiguous, so
// destroying a cell is a single write over one vertex range.
import * as THREE from 'three';
import { staticGeometry } from '../engine/assets.js';
import { FLOOR_H } from './city.js';

const CELL_W = 2;

// The asset pipeline ships quantised attributes (Int16, normalized). Transforming such a
// geometry writes the results straight back into the integer array, which clamps every
// coordinate to [-1,1] — so take a float copy before scaling anything. getX/getY/getZ
// denormalise on read, so this is lossless.
function toFloatGeometry(src) {
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
function cellKeyAt(lx, y, lz, halfW, halfD, cols, floors) {
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

// Build the shell for one landmark spec. Geometry comes out in world space so the
// mesh sits at the origin, like every other world mesh in the game.
export function buildSamosaShell(spec, floors) {
  const src = staticGeometry('landmark_samosa');
  const geo = toFloatGeometry(src.geometry.clone().toNonIndexed());

  // The pipeline ships it standing, grounded at y=0 and centred in XZ; fit it to the
  // lot footprint, then stretch to the requested floor count.
  geo.computeBoundingBox();
  const size = new THREE.Vector3(), ctr = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  geo.boundingBox.getCenter(ctr);
  geo.translate(-ctr.x, -geo.boundingBox.min.y, -ctr.z);
  const lotW = spec.x1 - spec.x0, lotD = spec.z1 - spec.z0;
  const sXZ = Math.min(lotW / size.x, lotD / size.z);
  geo.scale(sXZ, (floors * FLOOR_H) / size.y, sXZ);

  const cx = (spec.x0 + spec.x1) / 2, cz = (spec.z0 + spec.z1) / 2;
  const halfW = lotW / 2, halfD = lotD / 2;
  const cols = {
    north: Math.round(lotW / CELL_W), south: Math.round(lotW / CELL_W),
    east: Math.round(lotD / CELL_W), west: Math.round(lotD / CELL_W),
  };

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

  // rebuild with each cell's triangles contiguous
  const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3);
  const U = uv ? new Float32Array(pos.count * 2) : null;
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
        if (U) { U[v * 2] = uv.getX(i); U[v * 2 + 1] = uv.getY(i); }
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
  if (U) out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.computeBoundingSphere();
  out.getAttribute('position').setUsage(THREE.DynamicDrawUsage);

  const mesh = new THREE.Mesh(out, src.material);
  mesh.name = `samosa_${spec.id}`;

  // Destroying a cell collapses its triangles onto their own first vertex: zero-area,
  // so nothing rasterises, and the degenerate stays inside the samosa rather than
  // snapping to the world origin.
  const attr = out.getAttribute('position');
  const hideKey = (key) => {
    const r = ranges.get(key);
    if (!r || r.count === 0) return;
    const ax = P[r.start * 3], ay = P[r.start * 3 + 1], az = P[r.start * 3 + 2];
    for (let i = r.start; i < r.start + r.count; i++) { P[i * 3] = ax; P[i * 3 + 1] = ay; P[i * 3 + 2] = az; }
    attr.addUpdateRange(r.start * 3, r.count * 3);
    attr.needsUpdate = true;
  };

  return { mesh, ranges, floorSpan, cols, hideKey };
}
