// Destructible buildings: every facade is a grid of 2m×3m chunk cells rendered
// through three InstancedMeshes (wall / window / door). Chunks are closed boxes
// inset 15mm per side, so adjacent chunks never share a surface (no z-fighting,
// no backface holes — the 30mm grooves read as panel lines). Interiors (slabs,
// spine walls, furniture) are pre-built and lit by the aInterior shader term.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeWorldMaterial, tagGeometry, faceShade, SURF } from '../engine/materials.js';
import { PAL } from '../core/palette.js';
import { FLOOR_H } from './city.js';
import { rand, randRange } from '../core/mathx.js';

// Panels are exactly cell-sized: adjacent chunks butt with coincident hidden
// side faces (opposite normals → always backface-culled, never visible), so
// the facade is gap-free AND z-fight-free by construction; removing any chunk
// exposes only finished box faces.
const CELL_W = 2, CELL_H = FLOOR_H;
const INSET = 0;
const T = 0.3;             // wall thickness
const IWALL_T = 0.16;      // interior wall thickness
const IWALL_GAP = 1.6;     // walkable doorway left at each end of a spine wall

export const SIDES = ['north', 'east', 'south', 'west'];

// ---- archetype geometries ---------------------------------------------------

function boxTagged(w, h, d, color, interior = 0, shade = 1, surf = SURF.PLASTER) {
  const g = new THREE.BoxGeometry(w, h, d);
  tagGeometry(g, color, interior, shade, surf);
  return g;
}

function wallGeo(surf = SURF.PLASTER) {
  const g = boxTagged(CELL_W - INSET * 2, CELL_H - INSET * 2, T - INSET * 2, 0xffffff, 0, 1, surf);
  markInnerFaces(g);
  return faceShade(g);
}

function windowGeo() {
  const parts = [];
  const fw = CELL_W - INSET * 2, fh = CELL_H - INSET * 2, fd = T - INSET * 2;
  const gw = 1.3, gh = 1.6;
  const bottomH = 0.9; // sill height
  // frame: bottom, top, left, right
  parts.push(boxTagged(fw, bottomH, fd, 0xffffff).translate(0, -fh / 2 + bottomH / 2, 0));
  const topH = fh - bottomH - gh;
  parts.push(boxTagged(fw, topH, fd, 0xffffff).translate(0, fh / 2 - topH / 2, 0));
  const sideW = (fw - gw) / 2;
  parts.push(boxTagged(sideW, gh, fd, 0xffffff).translate(-fw / 2 + sideW / 2, -fh / 2 + bottomH + gh / 2, 0));
  parts.push(boxTagged(sideW, gh, fd, 0xffffff).translate(fw / 2 - sideW / 2, -fh / 2 + bottomH + gh / 2, 0));
  // glass: slightly recessed, fixed dark-blue tint (doesn't take instance tint well but reads as glass)
  const glass = boxTagged(gw, gh, fd - 0.12, 0x3f6fc4, 0, 1, SURF.WINDOW);
  glass.translate(0, -fh / 2 + bottomH + gh / 2, 0);
  parts.push(glass);
  const g = mergeGeometries(parts);
  markInnerFaces(g);
  return faceShade(g);
}

function doorGeo() {
  const parts = [];
  const fw = CELL_W - INSET * 2, fh = CELL_H - INSET * 2, fd = T - INSET * 2;
  const dw = 1.2, dh = 2.2;
  const sideW = (fw - dw) / 2, topH = fh - dh;
  parts.push(boxTagged(sideW, fh, fd, 0xffffff).translate(-fw / 2 + sideW / 2, 0, 0));
  parts.push(boxTagged(sideW, fh, fd, 0xffffff).translate(fw / 2 - sideW / 2, 0, 0));
  parts.push(boxTagged(dw, topH, fd, 0xffffff).translate(0, fh / 2 - topH / 2, 0));
  const door = boxTagged(dw, dh, fd - 0.14, 0x5a3a20, 0, 1, SURF.WOOD);
  door.translate(0, -fh / 2 + dh / 2, 0);
  parts.push(door);
  const g = mergeGeometries(parts);
  markInnerFaces(g);
  return faceShade(g);
}

// faces pointing +z are "inside the building" for facade chunks (rotation puts
// -z toward the street); tag them interior so exposed wall backs read indoor.
function markInnerFaces(g) {
  const nor = g.getAttribute('normal'), a = g.getAttribute('aInterior');
  for (let i = 0; i < nor.count; i++) {
    if (nor.getZ(i) > 0.5) a.setX(i, 1);
  }
  return g;
}

// unit cube used (scaled per instance) for slabs / roofs / interior walls
function unitGeo(color, interior, surf = SURF.CONCRETE) {
  const g = boxTagged(1, 1, 1, color, interior, 1, surf);
  return g;
}

// ---- build --------------------------------------------------------------------

export function buildBuildings(scene, specs) {
  // registry consumed by physics/destruction/AI
  const reg = {
    specs,
    cells: [],            // flat cell records
    buildings: [],        // per building: {spec, sideCols, cellIndex(side,col,floor), aliveCount, groundAlive, groundTotal, slabIds, collapsed}
    meshes: {},
    slabs: [],            // {bId, floor, idx} instance records (slab archetype)
    destroyCell: null,    // set below
  };

  // count cells per mesh type first
  const placements = { wall: [], wallBrick: [], window: [], door: [] };
  const slabPlace = [], iwallPlace = [], furnPlace = [];

  for (const s of specs) {
    const w = s.x1 - s.x0, d = s.z1 - s.z0;
    const sideCols = { north: Math.round(w / CELL_W), south: Math.round(w / CELL_W), east: Math.round(d / CELL_W), west: Math.round(d / CELL_W) };
    const b = {
      spec: s, sideCols,
      idx: new Map(),          // `${side}:${col}:${floor}` -> cell record
      byFloor: [],             // floor -> cell records (removeSphere's Y reject)
      aliveCount: 0, groundAlive: 0, groundTotal: 0,
      slabIds: [], furnIds: [], iwallIds: [],
      collapsed: false,
    };
    reg.buildings.push(b);
    const doorCol = { north: -1, south: -1, east: -1, west: -1 };
    doorCol[s.front] = Math.floor(sideCols[s.front] / 2);

    for (const side of SIDES) {
      const n = sideCols[side];
      for (let col = 0; col < n; col++) {
        for (let floor = 0; floor < s.floors; floor++) {
          const plain = s.material === 'brick' ? 'wallBrick' : 'wall';
          let kind = plain;
          const storefront = floor === 0 && (s.type === 'shop' || s.type === 'diner') && side === s.front;
          if (floor === 0 && col === doorCol[side]) kind = 'door';
          else if (storefront) kind = 'window';
          else if (floor > 0 && col > 0 && col < n - 1 && rand() < 0.62) kind = 'window';
          else if (floor > 0 && rand() < 0.25) kind = 'window';

          const cell = {
            bId: s.id, side, col, floor, kind,
            alive: true,
            idx: placements[kind].length,
            x: 0, y: floor * CELL_H + CELL_H / 2, z: 0, yaw: 0,
          };
          positionCell(s, side, col, cell);
          placements[kind].push(cell);
          b.idx.set(`${side}:${col}:${floor}`, cell);
          (b.byFloor[floor] || (b.byFloor[floor] = [])).push(cell);
          reg.cells.push(cell);
          b.aliveCount++;
          if (floor === 0) { b.groundTotal++; b.groundAlive++; }
        }
      }
    }

    // slabs: one per floor 1..F-1 plus roof at F
    for (let f = 1; f <= s.floors; f++) {
      slabPlace.push({
        bId: s.id, floor: f, alive: true,
        x: (s.x0 + s.x1) / 2, y: f * CELL_H - 0.14, z: (s.z0 + s.z1) / 2,
        sx: w - 0.5, sy: 0.28, sz: d - 0.5,
        roof: f === s.floors,
      });
    }
    // Interior spine wall per floor (along the long axis), stopping IWALL_GAP
    // short of each end so the two halves of the floor stay connected. It used to
    // stop 0.6m short, which was fine while it was scenery; now that it collides
    // (physics/collide.js) that gap is a doorway, and 0.6m minus the outer wall's
    // half-thickness is narrower than the player capsule — it would have sealed
    // whoever walked in into one half of the room.
    for (let f = 0; f < s.floors; f++) {
      const along = w >= d ? 'x' : 'z';
      const span = (along === 'x' ? w : d) - IWALL_GAP * 2;
      if (span < 1) continue;                       // too narrow to divide at all
      iwallPlace.push({
        bId: s.id, floor: f,
        x: (s.x0 + s.x1) / 2 + (along === 'z' ? (rand() - 0.5) * w * 0.3 : 0),
        y: f * CELL_H + CELL_H / 2,
        z: (s.z0 + s.z1) / 2 + (along === 'x' ? (rand() - 0.5) * d * 0.3 : 0),
        sx: along === 'x' ? span : IWALL_T, sy: CELL_H - 0.3, sz: along === 'x' ? IWALL_T : span,
      });
    }
    // furniture: a few boxes per floor near the front facade
    for (let f = 0; f < s.floors; f++) {
      const count = 2 + (rand() < 0.5 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const desk = rand() < 0.6;
        furnPlace.push({
          bId: s.id, floor: f, desk,
          x: randRange(s.x0 + 1.2, s.x1 - 1.2),
          y: f * CELL_H + (desk ? 0.38 : 0.9),
          z: randRange(s.z0 + 1.2, s.z1 - 1.2),
          yaw: Math.floor(rand() * 4) * Math.PI / 2,
        });
      }
    }
  }

  // ---- instanced meshes
  const mat = makeWorldMaterial();
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  const C = new THREE.Color();

  function makeInstanced(geo, list, name, colorFn, matrixFn) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(list.length, 1));
    im.frustumCulled = false;
    im.receiveShadow = true;
    im.name = name;
    list.forEach((p, i) => {
      matrixFn(p, i);
      im.setMatrixAt(i, M);
      colorFn(p, C);
      im.setColorAt(i, C);
    });
    im.count = list.length;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
    return im;
  }

  const specOf = (p) => specs[p.bId];
  const facadeColor = (p, c) => {
    c.setHex(specOf(p).tint);
    const shade = p.floor === 0 ? 0.86 : 1.0 + 0.025 * p.floor;
    c.multiplyScalar(Math.min(shade, 1.18) * (0.97 + ((p.col * 7 + p.floor * 13) % 5) * 0.012));
  };
  const facadeMatrix = (p) => {
    Q.setFromAxisAngle(V.set(0, 1, 0), p.yaw);
    M.compose(V.set(p.x, p.y, p.z), Q, S.set(1, 1, 1));
  };

  reg.meshes.wall = makeInstanced(wallGeo(SURF.PLASTER), placements.wall, 'walls', facadeColor, facadeMatrix);
  reg.meshes.wallBrick = makeInstanced(wallGeo(SURF.BRICK), placements.wallBrick, 'wallsBrick', facadeColor, facadeMatrix);
  reg.meshes.window = makeInstanced(windowGeo(), placements.window, 'windows', facadeColor, facadeMatrix);
  reg.meshes.door = makeInstanced(doorGeo(), placements.door, 'doors', facadeColor, facadeMatrix);

  reg.meshes.slab = makeInstanced(
    faceShade(unitGeo(0xffffff, 1, SURF.CONCRETE)), slabPlace, 'slabs',
    (p, c) => { c.setHex(p.roof ? 0x424a63 : 0x6b6350); if (p.roof) c.multiplyScalar(1.0); },
    (p) => { Q.identity(); M.compose(V.set(p.x, p.y, p.z), Q, S.set(p.sx, p.sy, p.sz)); },
  );
  // roofs use exterior lighting; floor slabs are interior — split by aInterior can't
  // vary per instance, so slabs use interior=1 archetype and roofs get their own
  // exterior-lit archetype below.
  const roofPlace = slabPlace.filter((p) => p.roof);
  const floorSlabPlace = slabPlace.filter((p) => !p.roof);
  scene.remove(reg.meshes.slab);
  reg.meshes.slab = makeInstanced(
    faceShade(unitGeo(0xffffff, 1, SURF.CONCRETE)), floorSlabPlace, 'floorSlabs',
    (p, c) => c.setHex(0x7d735c),
    (p) => { Q.identity(); M.compose(V.set(p.x, p.y, p.z), Q, S.set(p.sx, p.sy, p.sz)); },
  );
  reg.meshes.roof = makeInstanced(
    faceShade(unitGeo(0xffffff, 0, SURF.ROOF)), roofPlace, 'roofs',
    (p, c) => { c.setHex(specs[p.bId].tint); c.multiplyScalar(0.55); },
    (p) => { Q.identity(); M.compose(V.set(p.x, p.y + 0.1, p.z), Q, S.set(p.sx + 0.5, p.sy, p.sz + 0.5)); },
  );
  slabPlace.length = 0; slabPlace.push(...floorSlabPlace); // registry keeps floor slabs
  reg.slabs = floorSlabPlace.map((p, i) => ({ ...p, idx: i }));
  reg.roofs = roofPlace.map((p, i) => ({ ...p, idx: i }));
  for (const r of reg.roofs) reg.buildings[r.bId].slabIds.push(r);
  for (const sl of reg.slabs) reg.buildings[sl.bId].slabIds.push(sl);

  reg.meshes.iwall = makeInstanced(
    unitGeo(0xffffff, 1, SURF.PLASTER), iwallPlace, 'iwalls',
    (p, c) => c.setHex(0x8a8298),
    (p) => { Q.identity(); M.compose(V.set(p.x, p.y, p.z), Q, S.set(p.sx, p.sy, p.sz)); },
  );
  reg.iwalls = iwallPlace.map((p, i) => ({ ...p, idx: i }));
  for (const iw of reg.iwalls) reg.buildings[iw.bId].iwallIds.push(iw);

  reg.meshes.furn = makeInstanced(
    faceShade(furnGeo()), furnPlace, 'furniture',
    (p, c) => c.setHex(p.desk ? 0xa8772f : 0x2c4f9e),
    (p) => { Q.setFromAxisAngle(V.set(0, 1, 0), p.yaw); M.compose(V.set(p.x, p.y, p.z), Q, S.set(1, 1, 1)); },
  );
  reg.furns = furnPlace.map((p, i) => ({ ...p, idx: i }));
  for (const fu of reg.furns) reg.buildings[fu.bId].furnIds.push(fu);

  // ---- mutation API (used by destruction in P4)
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  reg.hideInstance = (meshName, idx) => {
    const im = reg.meshes[meshName];
    im.setMatrixAt(idx, ZERO);
    im.instanceMatrix.needsUpdate = true;
  };
  reg.destroyCell = (cell) => {
    if (!cell.alive) return false;
    cell.alive = false;
    const b = reg.buildings[cell.bId];
    b.aliveCount--;
    if (cell.floor === 0) b.groundAlive--;
    reg.hideInstance(cell.kind, cell.idx);
    return true;
  };
  reg.cellAt = (bId, side, col, floor) => reg.buildings[bId].idx.get(`${side}:${col}:${floor}`);

  return reg;
}

function furnGeo() {
  // desk-ish box cluster (single archetype; color varies desk/shelf)
  const top = tagGeometry(new THREE.BoxGeometry(1.5, 0.1, 0.8), 0xffffff, 1, 1, SURF.WOOD).translate(0, 0.35, 0);
  const legs = tagGeometry(new THREE.BoxGeometry(1.3, 0.7, 0.6), 0xffffff, 1, 1, SURF.WOOD).translate(0, 0, 0);
  return mergeGeometries([top, legs]);
}

function positionCell(s, side, col, cell) {
  const half = T / 2;
  if (side === 'north') { cell.x = s.x0 + CELL_W / 2 + col * CELL_W; cell.z = s.z0 + half; cell.yaw = 0; }
  else if (side === 'south') { cell.x = s.x0 + CELL_W / 2 + col * CELL_W; cell.z = s.z1 - half; cell.yaw = Math.PI; }
  else if (side === 'west') { cell.x = s.x0 + half; cell.z = s.z0 + CELL_W / 2 + col * CELL_W; cell.yaw = Math.PI / 2; }
  else { cell.x = s.x1 - half; cell.z = s.z0 + CELL_W / 2 + col * CELL_W; cell.yaw = -Math.PI / 2; }
}
