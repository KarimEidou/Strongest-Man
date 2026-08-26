// Landmark samosa shell. The GLB is the visible exterior; the destruction cell grid
// underneath is completely stock, so this file only has to answer one question:
// which 2m×3m cell does each crust triangle belong to? Triangles are binned by
// centroid, then the geometry is rebuilt with each cell's triangles contiguous, so
// destroying a cell is a single write over one vertex range.
import * as THREE from 'three';
import { staticGeometry } from '../engine/assets.js';
import { PAL, hex } from '../core/palette.js';
import { FLOOR_H } from './city.js';

const CELL_W = 2;

// ---- signage ----------------------------------------------------------------
// The label is painted onto the pastry rather than bolted in front of it: a band
// of quads snapped to the cell grid, each corner raycast onto the crust and pushed
// out along the street axis, so it wraps the bulge the way a fascia sign wraps a
// curved facade. Because the band is sliced into the same cells as the crust, a
// punch takes the lettering with it.
const SIGN_LINES = ['INDER\u2019S', 'BIG SAMOSA'];
const SIGN_COLS = 13;        // cell columns wide (26 m)
const SIGN_FLOOR = 3;        // bottom cell floor — y = 9 m
const SIGN_FLOORS = 2;       // cell floors tall (6 m)
const SIGN_SUB = 3;          // sub-quads per cell edge; more = smoother wrap
const SIGN_STANDOFF = 0.3;   // metres proud of the crust
const SIGN_FACING = 0.12;    // drop quads whose surface has turned this far from the street

// cached per canvas size: both landmarks normally share one texture, but a seed
// that gives them different band aspects must not reuse a stretched one
const signTexCache = new Map();
function signTexture(wPx, hPx) {
  const cacheKey = `${wPx}x${hPx}`;
  if (signTexCache.has(cacheKey)) return signTexCache.get(cacheKey);
  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  const x = c.getContext('2d');
  x.fillStyle = hex(PAL.navyBg);
  x.fillRect(0, 0, wPx, hPx);
  // same white rim, proud of a coloured plate, that the street-sign blade uses
  const pad = Math.round(hPx * 0.055);
  x.strokeStyle = '#d6dcf0';
  x.lineWidth = Math.round(hPx * 0.04);
  x.strokeRect(pad, pad, wPx - pad * 2, hPx - pad * 2);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const safe = wPx - pad * 4;
  // fit each line to the safe width, then cap it by its share of the height
  const draw = (text, cy, maxH) => {
    const font = (px) => `900 ${px}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    let px = maxH;
    x.font = font(px);
    const w = x.measureText(text).width;
    if (w > safe) { px = Math.floor(px * safe / w); x.font = font(px); }
    x.lineJoin = 'round';
    x.strokeStyle = hex(PAL.orangeShadow);
    x.lineWidth = Math.max(2, Math.round(px * 0.08));
    x.strokeText(text, wPx / 2, cy);
    x.fillStyle = hex(PAL.orangeBright);
    x.fillText(text, wPx / 2, cy);
  };
  draw(SIGN_LINES[0], hPx * 0.33, hPx * 0.30);
  draw(SIGN_LINES[1], hPx * 0.70, hPx * 0.42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signTexCache.set(cacheKey, tex);
  return tex;
}

// Build the label band for one landmark. Returns null if the crust never faced the
// street where the band would go (no valid quads), so callers can just skip it.
function buildSignBand(crustMesh, spec, keyOf) {
  const horiz = spec.front === 'north' || spec.front === 'south';
  const alongSpan = horiz ? spec.x1 - spec.x0 : spec.z1 - spec.z0;
  const nCols = Math.round(alongSpan / CELL_W);
  const cols = Math.max(4, Math.min(SIGN_COLS, nCols - 2));
  const col0 = Math.floor((nCols - cols) / 2);
  const along0 = (horiz ? spec.x0 : spec.z0) + col0 * CELL_W;
  const W = cols * CELL_W, H = SIGN_FLOORS * FLOOR_H, y0 = SIGN_FLOOR * FLOOR_H;

  // fire parallel rays inward from well outside the street face
  const dir = new THREE.Vector3();
  let castFrom, uFlip;
  // uFlip: with the camera out in the street, screen-right is -x on a north face and
  // +x on a south face (three.js orients on eye-minus-target), so u has to run the
  // other way on two of the four sides or the label reads backwards.
  if (spec.front === 'north') { dir.set(0, 0, 1); castFrom = spec.z0 - 40; uFlip = true; }
  else if (spec.front === 'south') { dir.set(0, 0, -1); castFrom = spec.z1 + 40; uFlip = false; }
  else if (spec.front === 'west') { dir.set(1, 0, 0); castFrom = spec.x0 - 40; uFlip = false; }
  else { dir.set(-1, 0, 0); castFrom = spec.x1 + 40; uFlip = true; }
  const out = dir.clone().negate();

  const ray = new THREE.Raycaster();
  ray.far = 300;
  const origin = new THREE.Vector3();
  const gx = cols * SIGN_SUB, gy = SIGN_FLOORS * SIGN_SUB;
  const grid = [];
  for (let j = 0; j <= gy; j++) {
    for (let i = 0; i <= gx; i++) {
      const a = along0 + (i / gx) * W, y = y0 + (j / gy) * H;
      origin.set(horiz ? a : castFrom, y, horiz ? castFrom : a);
      ray.set(origin, dir);
      const hit = ray.intersectObject(crustMesh, false)[0];
      grid.push(hit ? { p: hit.point.clone().addScaledVector(out, SIGN_STANDOFF), f: hit.face.normal.dot(out) } : null);
    }
  }

  const at = (i, j) => grid[j * (gx + 1) + i];
  const P = [], U = [];
  const push = (v, u, vv) => { P.push(v.p.x, v.p.y, v.p.z); U.push(uFlip ? 1 - u : u, vv); };
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      if (!a || !b || !c || !d) continue;                       // ray missed the silhouette
      if ((a.f + b.f + c.f + d.f) / 4 < SIGN_FACING) continue;  // surface has turned away
      const u0 = i / gx, u1 = (i + 1) / gx, v0 = j / gy, v1 = (j + 1) / gy;
      push(a, u0, v0); push(b, u1, v0); push(c, u1, v1);
      push(a, u0, v0); push(c, u1, v1); push(d, u0, v1);
    }
  }
  if (!P.length) return null;

  // slice into the same cells as the crust so one hideKey call takes out both
  const bins = new Map();
  for (let t = 0; t < P.length / 9; t++) {
    const cx = (P[t * 9] + P[t * 9 + 3] + P[t * 9 + 6]) / 3;
    const cy = (P[t * 9 + 1] + P[t * 9 + 4] + P[t * 9 + 7]) / 3;
    const cz = (P[t * 9 + 2] + P[t * 9 + 5] + P[t * 9 + 8]) / 3;
    const key = keyOf(cx, cy, cz);
    let l = bins.get(key);
    if (!l) bins.set(key, (l = []));
    l.push(t);
  }
  const SP = new Float32Array(P.length), SU = new Float32Array(U.length);
  const ranges = new Map();
  let v = 0;
  for (const [key, tris] of bins) {
    const start = v;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        SP[v * 3] = P[t * 9 + k * 3]; SP[v * 3 + 1] = P[t * 9 + k * 3 + 1]; SP[v * 3 + 2] = P[t * 9 + k * 3 + 2];
        SU[v * 2] = U[t * 6 + k * 2]; SU[v * 2 + 1] = U[t * 6 + k * 2 + 1];
        v++;
      }
    }
    ranges.set(key, { start, count: v - start });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(SP, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(SU, 2));
  geo.computeBoundingSphere();
  geo.getAttribute('position').setUsage(THREE.DynamicDrawUsage);

  // unlit: a sign reads as lit signage, and stays legible whatever the sun is doing
  const CW = 2048, CH = Math.round(CW * H / W);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: signTexture(CW, CH), side: THREE.DoubleSide }));
  mesh.name = `samosa_sign_${spec.id}`;
  mesh.renderOrder = 1;

  const attr = geo.getAttribute('position');
  const hideKey = (key) => {
    const r = ranges.get(key);
    if (!r) return;
    const ax = SP[r.start * 3], ay = SP[r.start * 3 + 1], az = SP[r.start * 3 + 2];
    for (let i = r.start; i < r.start + r.count; i++) { SP[i * 3] = ax; SP[i * 3 + 1] = ay; SP[i * 3 + 2] = az; }
    attr.addUpdateRange(r.start * 3, r.count * 3);
    attr.needsUpdate = true;
  };
  return { mesh, ranges, hideKey };
}

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
  const hideCrust = (key) => {
    const r = ranges.get(key);
    if (!r || r.count === 0) return;
    const ax = P[r.start * 3], ay = P[r.start * 3 + 1], az = P[r.start * 3 + 2];
    for (let i = r.start; i < r.start + r.count; i++) { P[i * 3] = ax; P[i * 3 + 1] = ay; P[i * 3 + 2] = az; }
    attr.addUpdateRange(r.start * 3, r.count * 3);
    attr.needsUpdate = true;
  };

  // The label rides on the crust: same cell keys, same hide call, so punching the
  // pastry takes the lettering with it and a collapse carries it down.
  mesh.updateMatrixWorld();
  const sign = buildSignBand(mesh, spec, (x, y, z) => cellKeyAt(x - cx, y, z - cz, halfW, halfD, cols, floors));
  if (sign) mesh.add(sign.mesh);

  const hideKey = (key) => { hideCrust(key); sign?.hideKey(key); };

  return { mesh, ranges, floorSpan, cols, hideKey, sign };
}
