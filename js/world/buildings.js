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
import { buildSamosaShell } from './samosa.js';
import { pickShellModel, buildModelShell } from './shell.js';
import { flags } from '../core/debug.js';

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
  // The opening is OPEN, and there is no leaf in it.
  //
  // physics/collide.js gives EVERY floor-0 door cell a walkable gap — that is
  // how you get inside any of the thirty buildings that have an interior — so a
  // solid door drawn across it was geometry contradicting the collision. The
  // player walked through visible wood, and the gallery, which has FREE
  // ADMISSION lettered over its door, read as shut.
  //
  // Nothing has to be added to replace it: the two jambs and the head are full
  // wall thickness, so removing the leaf leaves a real 0.3 m reveal and you see
  // into the building. That is the whole point of a door you can walk through.
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
  const shells = new Map();   // landmark spec id -> samosa shell

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

    // Landmarks swap the flat facade for a sliced GLB shell. The cell grid stays
    // stock — cells simply aren't created where the shell has no crust, and
    // collide.js/destruction.js already treat a missing cell as open air.
    let shell = null, crustKind = null;
    if (s.landmark === 'samosa') {
      shell = buildSamosaShell(s, s.floors);
    } else if (!s.landmark && !flags.noshells) {
      // An ordinary lot wears a downloaded building when one fits it without
      // being distorted past what its windows survive; otherwise it keeps the
      // procedural facade. A mixed city is identical to a fully converted one
      // except on the lots that fell back, so this is a real answer rather than
      // a compromise — see pickShellModel.
      const pick = pickShellModel(s);
      if (pick) shell = buildModelShell(s, s.floors, pick);
    }
    if (shell) {
      shell.chunkKeys = [];
      crustKind = `crust:${s.id}`;
      placements[crustKind] = [];
      shells.set(s.id, shell);
    }

    for (const side of SIDES) {
      const n = sideCols[side];
      for (let col = 0; col < n; col++) {
        for (let floor = 0; floor < s.floors; floor++) {
          const key = `${side}:${col}:${floor}`;
          const plain = s.material === 'brick' ? 'wallBrick' : 'wall';
          let kind = plain;
          // The window rolls, taken on exactly the lots that took them before and
          // in exactly the same order.
          //
          // They are two conditional draws from the seeded stream that
          // buildBuildings shares with props, traffic and the townspeople, and
          // they run thousands of times, so the draw COUNT is load-bearing:
          // change it and every prop, every car and every person moves, and all
          // 622 screenshots become unreviewable. Measured — taking them on the
          // samosa lots too, which never used to, shifted the props from 126 to
          // 120 and moved everything else with them.
          //
          // So: an ordinary lot rolls whether or not it ends up wearing a model,
          // and a landmark rolls not at all. What was a facade decision on a
          // shelled lot becomes `cell.glass`, which is what world/destruction.js
          // spawns shards from — dead computation turned into the flag.
          let procKind = null;
          if (!s.landmark) {
            const storefront = floor === 0 && (s.type === 'shop' || s.type === 'diner') && side === s.front;
            procKind = plain;
            if (floor === 0 && col === doorCol[side]) procKind = 'door';
            else if (storefront) procKind = 'window';
            else if (floor > 0 && col > 0 && col < n - 1 && rand() < 0.62) procKind = 'window';
            else if (floor > 0 && rand() < 0.25) procKind = 'window';
          }

          if (shell) {
            // No door archetype on a shell. On the samosa the frame is an
            // instance placed on the flat lot-rectangle face plane by
            // positionCell(), which a cone only touches at a tangent — so it
            // floated in mid-air beside the pastry, and the hideKey() that
            // punched a doorway for it left a hole in a crust nobody can walk
            // into anyway. On a fitted model the footprint IS the lot, so a
            // frame would sit flush — but the model already has its own doors
            // and shopfronts, and two doorways in one facade is worse than none.
            if (!shell.ranges.has(key)) {
              // The shell has no geometry for this column. On the samosa that
              // means open air outside the cone and the cell simply does not
              // exist. On a fitted model it means a recess, a setback or a
              // parapet the radial binning sent to a neighbouring column — a
              // HOLE in an otherwise closed facade, and what shows through it is
              // the interior, which reads as a black panel on the wall. Measured
              // across the seventeen shelled lots it is 0 to 20 percent of the
              // cells.
              //
              // So a landmark keeps the hole and an ordinary lot gets an
              // ordinary wall chunk. A patch of plain wall against a modelled
              // facade is a compromise; a black rectangle is a bug.
              if (s.landmark) continue;
              kind = plain;
            } else {
              kind = crustKind;
              shell.chunkKeys.push(key);
            }
          } else if (s.landmark === 'museum') {
            // Solid stone, top to bottom, with one door and no glazing at all.
            // A clerestory was tried and cost more than it bought: the shell's
            // inner faces are aInterior, so any wall band the gallery lining
            // could not cover read as a 2.7 m strip of near-black above the
            // pictures. Blank walls let the lining run to the ceiling, and
            // world/museum.js gives the outside its rhythm with pilasters and an
            // entablature instead of holes — which is what civic stone actually
            // looks like.
            if (floor === 0 && col === doorCol[side]) kind = 'door';
          } else {
            kind = procKind;
          }

          const cell = {
            bId: s.id, side, col, floor, kind,
            // What breaks when this cell does. It used to be inferred from
            // `kind === 'window'`, which a shelled cell never is.
            glass: procKind === 'window',
            alive: true,
            idx: placements[kind].length,
            x: 0, y: floor * CELL_H + CELL_H / 2, z: 0, yaw: 0,
          };
          positionCell(s, side, col, cell);
          placements[kind].push(cell);
          b.idx.set(key, cell);
          (b.byFloor[floor] || (b.byFloor[floor] = [])).push(cell);
          reg.cells.push(cell);
          b.aliveCount++;
          if (floor === 0) { b.groundTotal++; b.groundAlive++; }
        }
      }
    }

    // Carry the crust's own per-floor cross-section onto the building record, in
    // the same key names the lot rectangle uses, so physics/collide.js can
    // collide against the shape you can see instead of the lot it is inscribed
    // in. Sparse on purpose: above the tip there is no band, which is open air.
    //
    // LANDMARKS ONLY. A landmark is INSCRIBED in its lot and genuinely is a
    // different shape from it. An ordinary lot's model is fitted to the lot, so
    // its footprint IS the rectangle — and its cell grid is on that rectangle,
    // as positionCell puts it, and the wall chunks that fill the shell's gaps
    // are on it too. Giving one a band would put the collision somewhere the
    // cells are not: measured, a model with a setback upper storey moved the
    // band inside the lot and sealed three of the twenty-three spine-wall
    // doorways, which final.mjs section 9 catches.
    if (shell && s.landmark) {
      b.floorSpan = shell.floorSpan.map((fs) => fs && {
        x0: fs.minX, x1: fs.maxX, z0: fs.minZ, z1: fs.maxZ,
      });
    }

    // A samosa gets no slabs. The cross-section is a lens and a slab is a
    // rectangle, sized from an axis-aligned box over triangles that are metres
    // tall after the 33x vertical stretch — so however hard it was pulled in,
    // its corners speared out through the pastry, and the result was ten gold
    // discs stacked up each landmark from y = 2.86 to 29.86. Nobody stands
    // inside a fried pastry, so there is nothing for a floor to hold up.
    // `b.slabIds` simply stays empty; destruction.js iterates it and copes.
    //
    // slabs: one per floor 1..F-1 plus roof at F.
    for (let f = 1; s.landmark !== 'samosa' && f <= s.floors; f++) {
      // The gallery is one 6 m room, not two 3 m ones: skip every slab but the
      // roof. world/museum.js lays its own stone floor over the ground plane.
      if (s.landmark === 'museum' && f < s.floors) continue;
      let px = (s.x0 + s.x1) / 2, pz = (s.z0 + s.z1) / 2, sx = w - 0.5, sz = d - 0.5;
      if (shell) {
        // A slab sits on the boundary between bands f-1 and f. Below the samosa's
        // waist the shape widens with height and below-band is the tighter fit; above
        // it narrows and above-band is. Taking the narrower of the two is exactly the
        // crust's cross-section at that height either way — anything looser and the
        // slab spears out through the pastry.
        const lo = shell.floorSpan[f - 1], hi = shell.floorSpan[f];
        if (!hi) continue;                       // above the tip — and no flat roof on a samosa
        const minX = Math.max(lo ? lo.minX : hi.minX, hi.minX);
        const maxX = Math.min(lo ? lo.maxX : hi.maxX, hi.maxX);
        const minZ = Math.max(lo ? lo.minZ : hi.minZ, hi.minZ);
        const maxZ = Math.min(lo ? lo.maxZ : hi.maxZ, hi.maxZ);
        px = (minX + maxX) / 2; pz = (minZ + maxZ) / 2;
        // the cross-section is a lens, not a rectangle: pull in hard so the corners
        // stay buried in the crust
        sx = Math.max(0.5, (maxX - minX) * 0.62);
        sz = Math.max(0.5, (maxZ - minZ) * 0.62);
      }
      slabPlace.push({
        bId: s.id, floor: f, alive: true,
        x: px, y: f * CELL_H - 0.14, z: pz,
        sx, sy: 0.28, sz,
        roof: f === s.floors,
      });
    }
    // No spine walls or office furniture inside a samosa — it is solid pastry.
    // Keyed on the landmark, not on `shell`: an ordinary lot wearing a model
    // shell is still a building with rooms in it, and the spine walls and desks
    // are what make a punched hole read as a room.
    if (s.landmark === 'samosa') continue;
    // The museum furnishes itself (world/museum.js): a randomly-placed office
    // desk in the middle of a gallery, or a spine wall cutting a painting in
    // half, is exactly what the bespoke layout exists to avoid.
    if (s.landmark === 'museum') continue;
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
    // punching into a samosa should show spiced potato, not office carpet
    (p, c) => c.setHex(specs[p.bId].landmark ? 0xc9a03e : 0x7d735c),
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

  // landmark shells: one plain mesh each, keyed like an instanced archetype so
  // destroyCell -> hideInstance(cell.kind, cell.idx) needs no special case
  for (const [id, sh] of shells) {
    sh.mesh.userData.hideChunk = (idx) => sh.hideKey(sh.chunkKeys[idx]);
    scene.add(sh.mesh);
    reg.meshes[`crust:${id}`] = sh.mesh;
  }

  // ---- mutation API (used by destruction in P4)
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  reg.hideInstance = (meshName, idx) => {
    const im = reg.meshes[meshName];
    if (!im) return;
    if (im.isInstancedMesh) {
      im.setMatrixAt(idx, ZERO);
      im.instanceMatrix.needsUpdate = true;
    } else {
      im.userData.hideChunk(idx);   // landmark crust: collapse one cell's triangles
    }
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
