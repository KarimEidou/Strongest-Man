// The City Gallery: an enterable, indestructible civic building holding four
// drawings by Inder, plus the proximity prompt that opens inspect mode.
//
// WHY THE PIECES SIT WHERE THEY DO
//
// The shell is not built here. The lot is reserved in world/city.js (MUSEUM) and
// the walls, door and roof come out of world/buildings.js exactly like any other
// building — which is the whole point: the wall-cell grid that world already
// collides against is watertight by construction, and physics/collide.js needs no
// special case for a wall that happens to belong to a gallery. This file adds
// only what the generator cannot: the floor, the partition, the hang, the
// dressing, the signage and the interaction.
//
// LIGHTING is baked, and the room is UNLIT — one MeshBasicMaterial with vertex
// colours, so what is authored here is what reaches the screen at every hour.
//
// Two things forced that. Real lights are out: every world surface in the city
// shares ONE Lambert program (engine/materials.js), so a light count is a program
// parameter — four spotlights for four paintings would recompile every material
// in town and then cost four extra per-pixel evaluations on every surface of the
// city, forever, to light 60 m² of interior. And the shared indoor constant is
// out too: it is tuned for a room torn open by a punch, sitting around sRGB 0.11
// on a stone floor, and it swings warm and five times brighter after dark. A
// gallery is the one interior in this city that has its own lighting and does not
// care what time it is.
//
// So the room is lit the way a gallery is: an even wall wash baked into the
// vertex colours, faceShade() for form, an additive gradient quad under each
// picture light, and MeshBasicMaterial canvases — which §8.4 allows and which
// makes "evenly lit, no hotspot, no corner falloff, no specular glare" true by
// construction rather than by tuning. The exterior pieces (forecourt, steps)
// stay on the shared world material, because they abut real pavement and must
// take the same sun.
//
// The shell's own inner faces are marked aInterior by world/buildings.js and are
// therefore dark navy. They are not the gallery's walls: a 60 mm LINING is built
// inside them, up to the clerestory sill, which is what a real exhibition wall is
// anyway and what every painting actually hangs on.
// Measured cost of the whole room is reported in docs/MUSEUM.md.
//
// ASPECT RATIO is read off the decoded image at load time (tex.image.width /
// height) and the plane is sized from it. Nothing here hardcodes a ratio, and the
// canvas height is the only fixed number — so a replacement artwork of any shape
// hangs correctly with no code change. See docs/MUSEUM.md for how to swap one.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeWorldMaterial, tagGeometry, faceShade, SURF } from '../engine/materials.js';
import { MUSEUM } from './city.js';
import { addStaticBox } from '../physics/collide.js';

const T = 0.3;                 // outer wall thickness, matches buildings.js
const HALF = T / 2;
// interior faces of the shell
const IN = {
  x0: MUSEUM.x0 + T, z0: MUSEUM.z0 + T,
  x1: MUSEUM.x1 - T, z1: MUSEUM.z1 - T,
};
const FLOOR_Y = 0.02;          // block-interior ground height (physics/heightfield.js)
const FLOOR_TOP = FLOOR_Y + 0.06;
const CEIL_Y = 5.72;

// The partition that makes the alcove. Runs along x at a fixed z, from the west
// wall to 6.6 m short of the east wall — the gap is the way through.
const PART_Z = 27.6, PART_T = 0.22, PART_X1 = -15.4;

// Hang geometry. Height is fixed and width is derived per artwork, never the
// other way round.
const CANVAS_H = 1.62;
const CANVAS_CY = 1.52;        // centre height — gallery standard
const FRAME_W = 0.075;         // border width on every side
const FRAME_D = 0.09;          // how far the frame stands off the wall
const PLAQUE_W = 0.46, PLAQUE_H = 0.30, PLAQUE_CY = 1.15;
const PLAQUE_GAP = 0.30;       // clear space between frame edge and plaque edge

const INTERACT_R = 3.4;        // metres at which the prompt appears

// Baked gallery palette. These are read as sRGB — the mesh is unlit, so what is
// written here is what lands on screen once tone mapping has rolled the top end.
const C_WALL = 0xdcd7cb;       // warm off-white exhibition wall
const C_WALL_LOW = 0xcbc5b7;   // same wall, a shade down, for the lower band
const C_FLOOR = 0x9a948a;      // pale stone
const C_MAT = 0x5c6270;        // threshold inlay
const C_SKIRT = 0x55524b;
const C_CORNICE = 0x8f8a7e;
const C_CEIL = 0xc2beb4;
const C_UPPER = 0xe6e2d8;   // upper register, above the picture rail
const C_WOOD = 0x8a7256;
const C_WOOD_DARK = 0x5d4a35;
const C_METAL = 0x6e6a63;
const C_FRAME = 0x3a332b;
const C_LEAF = 0x4f7f46;
const C_POT = 0x7a6a58;
const C_POT_RIM = 0x8d7d69;

const LINING_T = 0.06;         // exhibition wall lining thickness
const CORNICE_H = 0.16;
const CORNICE_Y = 3.05;        // picture rail height: where the wall's two tones meet

let group = null;
let works = [];                // {slug, title, year, medium, x, z, nx, nz, yaw, viewX, viewZ}
let disposables = [];
let nearest = null;

// ---------------------------------------------------------------------------
// small helpers

function box(w, h, d, color, interior, surf, shade = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  tagGeometry(g, color, interior, shade, surf);
  return g;
}

function addSolid(x0, z0, x1, z1, y0, y1) {
  addStaticBox({ x0, z0, x1, z1, y0, y1 });
}

// A wall direction, as a unit normal pointing INTO the room, plus the yaw that
// turns a +z-facing plane to match it.
const WALLS = {
  north: { nx: 0, nz: 1, yaw: 0 },            // wall at z0, faces +z
  south: { nx: 0, nz: -1, yaw: Math.PI },     // wall at z1, faces -z
  west: { nx: 1, nz: 0, yaw: Math.PI / 2 },   // wall at x0, faces +x
  east: { nx: -1, nz: 0, yaw: -Math.PI / 2 }, // wall at x1, faces -x
};

// Where on the shell each named hang surface lives. `alcove-south` is the south
// shell wall, reached only from inside the alcove.
function surfaceOf(name) {
  if (name === 'north') return { ...WALLS.north, x: null, z: IN.z0 };
  if (name === 'south' || name === 'alcove-south') return { ...WALLS.south, x: null, z: IN.z1 };
  if (name === 'west') return { ...WALLS.west, x: IN.x0, z: null };
  return { ...WALLS.east, x: IN.x1, z: null };
}

// ---------------------------------------------------------------------------
// canvas-drawn textures (plaques, signage, wall wash)

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  disposables.push(t);
  return t;
}

// A museum label: brushed plate, title, artist, year, medium. Drawn at 1024 px
// across for a 0.46 m plate — 2200 px per metre, which is well past what a
// 3x iPhone can resolve at reading distance, so the text stays crisp when the
// player walks right up to it.
function plaqueTexture(work, artist) {
  const W = 1024, H = Math.round(W * (PLAQUE_H / PLAQUE_W));
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');

  const plate = g.createLinearGradient(0, 0, 0, H);
  plate.addColorStop(0, '#f2efe6');
  plate.addColorStop(1, '#ddd8ca');
  g.fillStyle = plate;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#b3ab98';
  g.lineWidth = 8;
  g.strokeRect(4, 4, W - 8, H - 8);

  const pad = 54;
  let y = pad + 58;
  g.fillStyle = '#141821';
  g.textBaseline = 'alphabetic';
  g.font = '700 74px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(work.title, pad, y);

  y += 22;
  g.strokeStyle = '#c0b8a4';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke();

  y += 62;
  g.fillStyle = '#2a3040';
  g.font = '600 52px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(artist, pad, y);

  y += 50;
  g.fillStyle = '#4d5566';
  g.font = '400 42px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(work.year, pad, y);

  y += 46;
  g.fillText(work.medium, pad, y);

  return canvasTexture(c);
}

// Fascia lettering over the door. Dark plate, light letters, so it reads against
// the pale stone from across the road.
function signTexture(line1, line2) {
  const W = 1024, H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#20283c';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#c9b98d';
  g.lineWidth = 6;
  g.strokeRect(9, 9, W - 18, H - 18);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f2e6c8';
  g.font = '800 104px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(line1, W / 2, 96);
  g.fillStyle = '#c9b98d';
  g.font = '600 46px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(line2, W / 2, 182);
  return canvasTexture(c);
}

// The picture light, baked: a soft vertical falloff that is brightest just under
// the fixture and gone by the skirting. Added, not multiplied, so it lifts the
// wall without ever clipping it to white.
let washTex = null;
function wallWashTexture() {
  if (washTex) return washTex;
  const W = 64, H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, 'rgba(255,246,226,0.00)');
  grad.addColorStop(0.10, 'rgba(255,246,226,0.62)');
  grad.addColorStop(0.45, 'rgba(255,246,226,0.30)');
  grad.addColorStop(1.00, 'rgba(255,246,226,0.00)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // taper the sides so the pool has an edge instead of a seam
  const side = g.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, W, H);
  washTex = canvasTexture(c);
  return washTex;
}

// The contact shadow under a frame: a soft dark ellipse-ish blur, alpha only.
let shadowTex = null;
function frameShadowTexture() {
  if (shadowTex) return shadowTex;
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.00, 'rgba(0,0,0,0.42)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  grad.addColorStop(1.00, 'rgba(0,0,0,0.00)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  shadowTex = canvasTexture(c);
  return shadowTex;
}

// ---------------------------------------------------------------------------
// build

function loadArtwork(url, maxAnisotropy) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;              // albedo, so sRGB
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;    // no bleed at the edges
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = maxAnisotropy;
      t.needsUpdate = true;
      disposables.push(t);
      resolve({ tex: t, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => reject(new Error(`museum: could not load ${url}`));
    img.src = url;
  });
}

export async function initMuseum(scene, renderer) {
  group = new THREE.Group();
  group.name = 'museum';
  scene.add(group);

  const res = await fetch('./assets/art/plaques.json');
  if (!res.ok) throw new Error(`museum: plaques.json ${res.status}`);
  const data = await res.json();
  const artist = data.artist;

  // Two materials, two merged meshes: the room is unlit and self-lit, the
  // forecourt takes the city's sun. Two draw calls for the whole building.
  const galleryMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const worldMat = makeWorldMaterial();
  disposables.push(galleryMat, worldMat);
  const inParts = [];      // baked, unlit
  const outParts = [];     // world-lit

  const doorZ = MUSEUM.z0 + 1 + Math.floor((MUSEUM.z1 - MUSEUM.z0) / 2 / 2) * 2;
  const DOOR_HALF = 0.9;   // lining gap: wider than collide.js's 0.65 walkable gap

  // ---- floor, threshold inlay, ceiling --------------------------------------
  const floorW = IN.x1 - IN.x0, floorD = IN.z1 - IN.z0;
  const cx = (IN.x0 + IN.x1) / 2, cz = (IN.z0 + IN.z1) / 2;
  inParts.push(box(floorW, 0.06, floorD, C_FLOOR, 0, SURF.CONCRETE)
    .translate(cx, FLOOR_Y + 0.03, cz));
  inParts.push(box(2.4, 0.02, 3.0, C_MAT, 0, SURF.SIDEWALK)
    .translate(IN.x1 - 1.2, FLOOR_TOP, doorZ));
  // ceiling: the roof slab's underside belongs to the exterior-lit instance and
  // reads near-black from in here
  inParts.push(box(floorW, 0.05, floorD, C_CEIL, 0, SURF.CONCRETE)
    .translate(cx, CEIL_Y - 0.025, cz));

  // ---- exhibition wall lining ----------------------------------------------
  // A vertical two-tone: the lower band a shade down, so the wall has a base and
  // the eye is carried to the pictures rather than to the join with the floor.
  // The lining runs floor to ceiling. Below the picture rail it is the working
  // exhibition wall; above it a lighter upper register, with a rail moulding on
  // the join — the standard gallery section, and the reason nothing of the
  // shell's dark inner face is left showing anywhere in the room.
  const LOW_H = 0.95;
  const lining = (x0, z0, x1, z1) => {
    const w = x1 - x0, d = z1 - z0;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    inParts.push(box(w, LOW_H, d, C_WALL_LOW, 0, SURF.PLASTER)
      .translate(mx, FLOOR_TOP + LOW_H / 2, mz));
    const midH = CORNICE_Y - FLOOR_TOP - LOW_H;
    inParts.push(box(w, midH, d, C_WALL, 0, SURF.PLASTER)
      .translate(mx, FLOOR_TOP + LOW_H + midH / 2, mz));
    inParts.push(box(w + 0.04, CORNICE_H, d + 0.04, C_CORNICE, 0, SURF.CONCRETE)
      .translate(mx, CORNICE_Y + CORNICE_H / 2, mz));
    const upH = CEIL_Y - (CORNICE_Y + CORNICE_H);
    inParts.push(box(w, upH, d, C_UPPER, 0, SURF.PLASTER)
      .translate(mx, CORNICE_Y + CORNICE_H + upH / 2, mz));
  };
  // The four runs BUTT, they do not overlap: two lining boxes sharing a corner
  // put two coplanar faces in the same place and the corner z-fights. The east
  // and west runs own the full depth; the north and south runs stop short of them.
  const LX0 = IN.x0 + LINING_T, LX1 = IN.x1 - LINING_T;
  lining(LX0, IN.z0, LX1, IN.z0 + LINING_T);                          // north
  lining(LX0, IN.z1 - LINING_T, LX1, IN.z1);                          // south
  lining(IN.x0, IN.z0, IN.x0 + LINING_T, IN.z1);                      // west
  lining(IN.x1 - LINING_T, IN.z0, IN.x1, doorZ - DOOR_HALF);          // east, N of door
  lining(IN.x1 - LINING_T, doorZ + DOOR_HALF, IN.x1, IN.z1);          // east, S of door
  // door reveal: line the head of the opening so the shell's dark inner face is
  // not visible above the doorway from inside
  const headH = CEIL_Y - (FLOOR_TOP + 2.25);
  inParts.push(box(LINING_T, headH, DOOR_HALF * 2, C_WALL, 0, SURF.PLASTER)
    .translate(IN.x1 - LINING_T / 2, FLOOR_TOP + 2.25 + headH / 2, doorZ));

  // ---- partition ------------------------------------------------------------
  const partLen = PART_X1 - IN.x0;
  const partH = CEIL_Y - FLOOR_TOP;
  inParts.push(box(partLen, partH, PART_T, C_WALL, 0, SURF.PLASTER)
    .translate(IN.x0 + partLen / 2, FLOOR_TOP + partH / 2, PART_Z));
  // 3 mm proud was enough to see through at a grazing angle; 30 mm is not. The
  // ends are pulled in 20 mm so this box shares no face with the wall behind it.
  inParts.push(box(partLen - 0.04, LOW_H, PART_T + 0.06, C_WALL_LOW, 0, SURF.PLASTER)
    .translate(IN.x0 + partLen / 2, FLOOR_TOP + LOW_H / 2, PART_Z));
  inParts.push(box(partLen + 0.10, CORNICE_H, PART_T + 0.12, C_CORNICE, 0, SURF.CONCRETE)
    .translate(IN.x0 + partLen / 2 + 0.02, CORNICE_Y + CORNICE_H / 2, PART_Z));
  // reveal on the open end, so the gap reads as a doorway and not as a wall that
  // simply stops
  // The reveal STANDS PROUD of the partition's end rather than flush with it.
  // Flush, its x = PART_X1 face and the wall's were coincident, and the pair
  // z-fought into a 5 m ladder of stripes down the one edge you walk past.
  inParts.push(box(0.32, partH, PART_T + 0.10, C_CORNICE, 0, SURF.PLASTER)
    .translate(PART_X1 - 0.10, FLOOR_TOP + partH / 2, PART_Z));
  // the partition is full height for collision even though it is not full height
  // to look at: nothing may hop over it into the alcove
  addSolid(IN.x0, PART_Z - PART_T / 2 - 0.05, PART_X1, PART_Z + PART_T / 2 + 0.05, FLOOR_Y, CEIL_Y);

  // ---- skirting -------------------------------------------------------------
  const SK = 0.11, SKH = 0.16;
  const skirt = (x0, z0, x1, z1) => inParts.push(
    box(x1 - x0, SKH, z1 - z0, C_SKIRT, 0, SURF.CONCRETE)
      .translate((x0 + x1) / 2, FLOOR_TOP + SKH / 2, (z0 + z1) / 2),
  );
  const SX0 = IN.x0 + LINING_T + SK, SX1 = IN.x1 - LINING_T - SK;
  skirt(SX0, IN.z0, SX1, IN.z0 + LINING_T + SK);
  skirt(SX0, IN.z1 - LINING_T - SK, SX1, IN.z1);
  skirt(IN.x0, IN.z0, SX0, IN.z1);
  skirt(SX1, IN.z0, IN.x1, doorZ - DOOR_HALF);
  skirt(SX1, doorZ + DOOR_HALF, IN.x1, IN.z1);
  // the partition's own skirting stops short of the west lining for the same reason
  skirt(SX0, PART_Z - PART_T / 2 - SK, PART_X1 + 0.06, PART_Z + PART_T / 2 + SK);

  // ---- reception desk, right of the door as you come in ---------------------
  const deskX = IN.x1 - 1.6, deskZ = doorZ - 3.4;
  inParts.push(box(1.1, 1.05, 2.6, C_WOOD_DARK, 0, SURF.WOOD)
    .translate(deskX, FLOOR_TOP + 0.525, deskZ));
  inParts.push(box(1.34, 0.07, 2.84, C_WOOD, 0, SURF.WOOD)
    .translate(deskX, FLOOR_TOP + 1.09, deskZ));
  addSolid(deskX - 0.67, deskZ - 1.42, deskX + 0.67, deskZ + 1.42, FLOOR_Y, FLOOR_TOP + 1.13);

  // ---- benches: one per viewing station -------------------------------------
  const benches = [
    { x: -13.0, z: IN.z0 + 3.6, w: 1.8, d: 0.55 },
    { x: -19.6, z: IN.z0 + 3.6, w: 1.8, d: 0.55 },
    { x: IN.x0 + 3.6, z: 19.5, w: 0.55, d: 1.8 },
    { x: -20.0, z: IN.z1 - 3.6, w: 1.8, d: 0.55 },
  ];
  for (const b of benches) {
    inParts.push(box(b.w, 0.09, b.d, C_WOOD, 0, SURF.WOOD)
      .translate(b.x, FLOOR_TOP + 0.44, b.z));
    const lx = b.w > b.d ? 0.10 : b.w * 0.62, lz = b.w > b.d ? b.d * 0.62 : 0.10;
    for (const sgn of [-1, 1]) {
      inParts.push(box(lx, 0.40, lz, C_METAL, 0, SURF.METAL)
        .translate(b.x + (b.w > b.d ? sgn * (b.w / 2 - 0.22) : 0), FLOOR_TOP + 0.20,
          b.z + (b.w > b.d ? 0 : sgn * (b.d / 2 - 0.22))));
    }
    addSolid(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2, FLOOR_Y, FLOOR_TOP + 0.49);
  }

  // ---- a plant in the corner the paintings do not use -----------------------
  const potX = IN.x1 - 1.3, potZ = IN.z0 + 1.3;
  inParts.push(box(0.60, 0.46, 0.60, C_POT, 0, SURF.CONCRETE)
    .translate(potX, FLOOR_TOP + 0.23, potZ));
  inParts.push(box(0.68, 0.07, 0.68, C_POT_RIM, 0, SURF.CONCRETE)
    .translate(potX, FLOOR_TOP + 0.48, potZ));
  inParts.push(box(0.52, 0.05, 0.52, 0x3b3129, 0, SURF.CONCRETE)
    .translate(potX, FLOOR_TOP + 0.47, potZ));
  // Broad blades rather than sticks: each leaf is a thin slab, splayed outward
  // and rolled about its own length so it catches faceShade differently from
  // its neighbour and the clump reads as foliage.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4;
    const len = 0.72 + (i % 3) * 0.26;
    const g = box(0.015, len, 0.20 + (i % 2) * 0.05, C_LEAF, 0, SURF.FOLIAGE);
    g.translate(0, len / 2, 0);
    g.rotateZ((i % 2 ? 1 : -1) * 0.34);
    g.rotateY(a);
    inParts.push(g.translate(
      potX + Math.cos(a) * 0.10, FLOOR_TOP + 0.5, potZ + Math.sin(a) * 0.10,
    ));
  }
  addSolid(potX - 0.34, potZ - 0.34, potX + 0.34, potZ + 0.34, FLOOR_Y, FLOOR_TOP + 0.56);

  // ---- exterior: forecourt, steps, pilasters, entablature -------------------
  // The shell is blank stone by design (world/buildings.js), so the rhythm has to
  // come from relief. Six pilasters on the street front, a plinth they stand on
  // and a two-part entablature round all four sides: the same moves a real civic
  // gallery makes, and none of them puts a hole in the wall the pictures hang on.
  const H = MUSEUM.floors * 3;         // 6 m, shell height
  // Forecourt: a stone apron in front of the door, sitting 4 cm proud of the
  // 0.12 m pavement so its top is unambiguously above it. Coplanar with the
  // sidewalk it z-fought; 4 cm is enough to separate and low enough to walk over.
  outParts.push(box(3.4, 0.04, 6.8, 0xb0aa9c, 0, SURF.SIDEWALK)
    .translate(MUSEUM.x1 + 1.7, 0.14, doorZ));
  // Threshold landing: the plinth is cut away at the door, so the entrance needs
  // its own step up rather than two decorative 5 cm slivers that read as a decal.
  outParts.push(box(1.7, 0.10, 3.2, 0xc0b9a8, 0, SURF.CONCRETE)
    .translate(MUSEUM.x1 + 0.85, 0.16, doorZ));
  outParts.push(box(0.14, 0.04, 3.3, 0xd0c9b6, 0, SURF.CONCRETE)
    .translate(MUSEUM.x1 + 1.70 - 0.07, 0.19, doorZ));   // nosing
  const C_STONE = 0xd8cdb2, C_STONE_DK = 0xb8ad92;
  // A band round the outside is a RING of four bars, never one box: a box the
  // size of the footprint reaches all the way through the building, and a plinth
  // solid enough to look right outside would have laid a 0.38 m ledge across the
  // whole gallery floor, with the entablature slicing through the room at head
  // height. `proud` is how far the band stands off the wall face; the bars only
  // ever occupy that skin.
  //   proud  — how far the band stands off the wall face
  //   splitE — cut the east bar around the doorway (the plinth must not run
  //            across the threshold; the two steps outside climb to exactly its
  //            top, so it reads as the thing you step up onto)
  const band = (proud, y, h, color, surf, splitE = false) => {
    const x0 = MUSEUM.x0 - proud, x1 = MUSEUM.x1 + proud;
    const z0 = MUSEUM.z0 - proud, z1 = MUSEUM.z1 + proud;
    const t = proud + T;                      // reach in as far as the wall is thick
    const push = (w, d, cx2, cz2) => outParts.push(
      box(w, h, d, color, 0, surf).translate(cx2, y + h / 2, cz2),
    );
    push(x1 - x0, t, (x0 + x1) / 2, z0 + t / 2);                 // north
    push(x1 - x0, t, (x0 + x1) / 2, z1 - t / 2);                 // south
    push(t, (z1 - z0) - t * 2, x0 + t / 2, (z0 + z1) / 2);       // west
    if (!splitE) {
      push(t, (z1 - z0) - t * 2, x1 - t / 2, (z0 + z1) / 2);     // east, whole
    } else {
      for (const [from, to] of [[z0 + t, doorZ - 1.35], [doorZ + 1.35, z1 - t]]) {
        if (to - from > 0.01) push(t, to - from, x1 - t / 2, (from + to) / 2);
      }
    }
  };
  band(0.15, 0, 0.46, C_STONE_DK, SURF.CONCRETE, true);    // plinth
  band(0.11, H - 0.62, 0.34, C_STONE, SURF.CONCRETE);      // architrave
  band(0.24, H - 0.30, 0.30, C_STONE_DK, SURF.ROOF);       // cornice
  // pilasters on the street front, evenly either side of the door
  for (const dz of [-9.0, -6.0, -3.0, 3.0, 6.0, 9.0]) {
    outParts.push(box(0.26, H - 1.0, 0.90, C_STONE, 0, SURF.CONCRETE)
      .translate(MUSEUM.x1 + 0.13, 0.46 + (H - 1.0) / 2, doorZ + dz));
    // capital
    outParts.push(box(0.34, 0.16, 1.06, C_STONE_DK, 0, SURF.CONCRETE)
      .translate(MUSEUM.x1 + 0.17, H - 0.62, doorZ + dz));
  }
  // Door surround: two jambs and a lintel, never one slab. The opening between
  // them is 1.5 m clear, wider than the 1.3 m collide.js lets a capsule through,
  // so the surround can never be what stops someone getting in.
  for (const sgn of [-1, 1]) {
    outParts.push(box(0.20, 3.1, 0.70, C_STONE, 0, SURF.CONCRETE)
      .translate(MUSEUM.x1 + 0.10, 0.46 + 1.55, doorZ + sgn * 1.10));
  }
  outParts.push(box(0.24, 0.34, 2.9, C_STONE, 0, SURF.CONCRETE)
    .translate(MUSEUM.x1 + 0.12, 0.46 + 3.1 + 0.17, doorZ));

  // ---- the hang -------------------------------------------------------------
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const washT = wallWashTexture();
  const shadT = frameShadowTexture();
  // the lining stands LINING_T proud of the shell's inner face, so everything
  // mounted on a wall hangs off the lining, not off the shell
  const face = LINING_T;

  for (const w of data.works) {
    const surf = surfaceOf(w.wall);
    // `at` is the coordinate that runs ALONG the wall: x for the north/south
    // walls, z for the east/west ones.
    const alongX = surf.nz !== 0;
    const x = (alongX ? w.at : surf.x + surf.nx * face);
    const z = (alongX ? surf.z + surf.nz * face : w.at);

    const { tex, w: iw, h: ih } = await loadArtwork(`./assets/art/${w.slug}_512.webp`, maxAniso);
    // THE one place a size is decided. Height is fixed; width comes off the
    // decoded pixels. Nothing is cropped, letterboxed, stretched or squashed.
    const cw = CANVAS_H * (iw / ih);

    const node = new THREE.Group();
    node.position.set(x, 0, z);
    node.rotation.y = surf.yaw;
    group.add(node);

    // frame: four bars around the opening, real depth, plus a backing board
    const fw = cw + FRAME_W * 2, fh = CANVAS_H + FRAME_W * 2;
    const bars = [
      box(fw, FRAME_W, FRAME_D, C_FRAME, 0, SURF.WOOD).translate(0, fh / 2 - FRAME_W / 2, 0),
      box(fw, FRAME_W, FRAME_D, C_FRAME, 0, SURF.WOOD).translate(0, -fh / 2 + FRAME_W / 2, 0),
      box(FRAME_W, fh - FRAME_W * 2, FRAME_D, C_FRAME, 0, SURF.WOOD).translate(-fw / 2 + FRAME_W / 2, 0, 0),
      box(FRAME_W, fh - FRAME_W * 2, FRAME_D, C_FRAME, 0, SURF.WOOD).translate(fw / 2 - FRAME_W / 2, 0, 0),
      box(cw, CANVAS_H, 0.02, 0x1a1714, 0, SURF.WOOD).translate(0, 0, FRAME_D / 2 - 0.01),
      // picture light fixture, right above the frame
      box(0.30, 0.06, 0.10, 0xa39c90, 0, SURF.METAL).translate(0, fh / 2 + 0.17, 0.10),
      box(0.05, 0.05, 0.22, 0xa39c90, 0, SURF.METAL).translate(0, fh / 2 + 0.17, 0.03),
    ];
    const frameGeo = mergeGeometries(bars);
    for (const b of bars) b.dispose();
    const frame = new THREE.Mesh(faceShade(frameGeo), galleryMat);
    frame.position.set(0, CANVAS_CY, FRAME_D / 2 + 0.005);
    node.add(frame);
    disposables.push(frameGeo);

    // the artwork. Basic, so it is exactly as even as the source file, and a
    // touch under white so a near-white sheet of paper sits IN the room instead
    // of glowing out of it.
    const artGeo = new THREE.PlaneGeometry(cw, CANVAS_H);
    const artMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xece8de });
    const art = new THREE.Mesh(artGeo, artMat);
    art.position.set(0, CANVAS_CY, FRAME_D + 0.006);
    node.add(art);
    disposables.push(artGeo, artMat);

    // baked picture light: an additive pool on the lining behind the frame
    const washGeo = new THREE.PlaneGeometry(fw * 2.1, 3.0);
    const washMat = new THREE.MeshBasicMaterial({
      map: washT, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.55,
    });
    const wash = new THREE.Mesh(washGeo, washMat);
    wash.position.set(0, CANVAS_CY + 0.55, 0.012);
    wash.renderOrder = 1;
    node.add(wash);
    disposables.push(washGeo, washMat);

    // contact shadow on the wall under and around the frame
    const shGeo = new THREE.PlaneGeometry(fw * 1.5, fh * 1.3);
    const shMat = new THREE.MeshBasicMaterial({
      map: shadT, transparent: true, depthWrite: false, opacity: 0.85,
    });
    const sh = new THREE.Mesh(shGeo, shMat);
    sh.position.set(0.012, CANVAS_CY - 0.05, 0.008);
    node.add(sh);
    disposables.push(shGeo, shMat);

    // plaque, on the same wall, to the frame's right as the viewer faces it
    const plaqueGeo = new THREE.PlaneGeometry(PLAQUE_W, PLAQUE_H);
    const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTexture(w, artist) });
    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaque.position.set(fw / 2 + PLAQUE_GAP + PLAQUE_W / 2, PLAQUE_CY, 0.014);
    node.add(plaque);
    disposables.push(plaqueGeo, plaqueMat);

    // stanchions: two posts and a sagging rope, 1.15 m off the wall
    const standoff = 1.15;
    const ropeY = 0.72;
    for (const sgn of [-1, 1]) {
      const px = sgn * (fw / 2 + 0.35);
      const post = [
        box(0.09, 0.92, 0.09, 0x35322d, 0, SURF.METAL).translate(0, 0.46, 0),
        box(0.22, 0.04, 0.22, 0x35322d, 0, SURF.METAL).translate(0, 0.02, 0),
        box(0.13, 0.07, 0.13, 0xb59a5c, 0, SURF.METAL).translate(0, 0.95, 0),
      ];
      const pg = mergeGeometries(post);
      for (const q of post) q.dispose();
      const pm = new THREE.Mesh(faceShade(pg), galleryMat);
      pm.position.set(px, FLOOR_TOP, standoff);
      node.add(pm);
      disposables.push(pg);
      const wx = x + (alongX ? px : standoff * surf.nx);
      const wz = z + (alongX ? standoff * surf.nz : px);
      addSolid(wx - 0.14, wz - 0.14, wx + 0.14, wz + 0.14, FLOOR_Y, FLOOR_TOP + 1.0);
    }
    const segs = [];
    const span = fw + 0.70;
    for (let i = 0; i < 5; i++) {
      const t0 = i / 5, t1 = (i + 1) / 5;
      const y0 = ropeY - Math.sin(t0 * Math.PI) * 0.11;
      const y1 = ropeY - Math.sin(t1 * Math.PI) * 0.11;
      const ax = -span / 2 + span * t0, bx = -span / 2 + span * t1;
      const len = Math.hypot(bx - ax, y1 - y0);
      const seg = box(len, 0.035, 0.035, 0x8f3a3a, 0, SURF.WOOD);
      seg.rotateZ(Math.atan2(y1 - y0, bx - ax));
      segs.push(seg.translate((ax + bx) / 2, (y0 + y1) / 2, 0));
    }
    const ropeGeo = mergeGeometries(segs);
    for (const sg of segs) sg.dispose();
    const rope = new THREE.Mesh(faceShade(ropeGeo), galleryMat);
    rope.position.set(0, FLOOR_TOP, standoff);
    node.add(rope);
    disposables.push(ropeGeo);

    // viewing spot: straight out from the centre of the canvas, past the rope
    // The plaque hangs at +alongOffset from the frame centre in the node's local
    // frame; rotate that back into world space for the capture harness.
    const alongOffset = fw / 2 + PLAQUE_GAP + PLAQUE_W / 2;
    works.push({
      slug: w.slug, title: w.title, year: w.year, medium: w.medium, artist,
      x, z, nx: surf.nx, nz: surf.nz, yaw: surf.yaw,
      viewX: x + surf.nx * 2.1, viewZ: z + surf.nz * 2.1,
      plaqueX: x + Math.cos(surf.yaw) * alongOffset,
      plaqueZ: z - Math.sin(surf.yaw) * alongOffset,
      plaqueY: PLAQUE_CY,
    });
  }

  // ---- merge and add --------------------------------------------------------
  const inGeo = mergeGeometries(inParts);
  for (const p of inParts) p.dispose();
  const room = new THREE.Mesh(faceShade(inGeo), galleryMat);
  room.name = 'museum-room';
  room.receiveShadow = false;
  group.add(room);
  disposables.push(inGeo);

  const outGeo = mergeGeometries(outParts);
  for (const p of outParts) p.dispose();
  const forecourt = new THREE.Mesh(faceShade(outGeo), worldMat);
  forecourt.name = 'museum-forecourt';
  forecourt.receiveShadow = true;
  group.add(forecourt);
  disposables.push(outGeo);

  // fascia sign: unlit plate so it stays readable at every hour
  const signGeo = new THREE.PlaneGeometry(4.0, 1.0);
  const signMat = new THREE.MeshBasicMaterial({ map: signTexture('CITY GALLERY', 'FREE ADMISSION') });
  const sign = new THREE.Mesh(signGeo, signMat);
  // Above the door lintel (top at 3.73) and proud of the pilaster capitals, or
  // the stone eats the first line and only FREE ADMISSION survives.
  sign.position.set(MUSEUM.x1 + 0.40, 4.42, doorZ);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);
  disposables.push(signGeo, signMat);

  return {
    works,
    door: { x: MUSEUM.x1 + 1.6, z: doorZ },
    bounds: { ...IN },
  };
}

// ---------------------------------------------------------------------------
// interaction

// Nearest artwork the player is close enough to, and facing. Returns null when
// nothing qualifies. Facing matters: standing with your back to The Reader while
// inside the alcove should not offer to open it.
export function nearestWork(px, pz, yaw) {
  let best = null, bd = INTERACT_R * INTERACT_R;
  for (const w of works) {
    const dx = px - w.viewX, dz = pz - w.viewZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > bd) continue;
    // the player must be on the room side of the wall
    if ((px - w.x) * w.nx + (pz - w.z) * w.nz < 0.2) continue;
    if (yaw !== undefined) {
      // engine/camera.js puts the eye at look + (sin yaw, *, cos yaw) * dist, so
      // (sin yaw, cos yaw) is the BACKWARD direction and the view direction is
      // its negative. Facing the wall means viewDir points against the inward
      // normal, i.e. backward . n is positive.
      const bx = Math.sin(yaw), bz = Math.cos(yaw);
      if (bx * w.nx + bz * w.nz < 0.15) continue;
    }
    bd = d2; best = w;
  }
  nearest = best;
  return best;
}

export function currentNearest() { return nearest; }

export function disposeMuseum(scene) {
  if (!group) return;
  scene.remove(group);
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    }
  });
  for (const d of disposables) d.dispose?.();
  disposables = [];
  works = [];
  nearest = null;
  washTex = null;
  shadowTex = null;
  group = null;
}

export { MUSEUM, IN as MUSEUM_INTERIOR };
