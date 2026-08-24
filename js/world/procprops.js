// Procedural palette props, built to match the approved prop-redesign sheets:
// clean low-poly primitives in the icon palette, with facet shading. All 3D,
// all instanced, all destruction-ready (lamps/signals tip over, cars crush,
// signal lenses are a separate live-colored layer).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tagGeometry, faceShade } from '../engine/materials.js';
import { PAL } from '../core/palette.js';

const box = (w, h, d, c, shade = 1) => tagGeometry(new THREE.BoxGeometry(w, h, d).toNonIndexed(), c, 0, shade);
const cyl = (rt, rb, h, seg, c, shade = 1) => tagGeometry(new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed(), c, 0, shade);

// merge helper: uv layouts differ between primitives and custom prisms — the
// shared material samples no textures, so drop uv everywhere before merging
function mergeParts(parts) {
  for (const p of parts) p.deleteAttribute('uv');
  return mergeGeometries(parts);
}

// tapered box: bottom rect (wB×dB) to top rect (wT×dT) over height h, top
// optionally shifted along z (raked windshields, swept cabins)
function prism(wB, dB, wT, dT, h, c, opts = {}) {
  const zo = opts.zOff || 0;
  const b = [[-wB / 2, 0, -dB / 2], [wB / 2, 0, -dB / 2], [wB / 2, 0, dB / 2], [-wB / 2, 0, dB / 2]];
  const t = [[-wT / 2, h, -dT / 2 + zo], [wT / 2, h, -dT / 2 + zo], [wT / 2, h, dT / 2 + zo], [-wT / 2, h, dT / 2 + zo]];
  const tri = [];
  const push = (...pts) => { for (const p of pts) tri.push(p[0], p[1], p[2]); };
  push(t[0], t[3], t[2]); push(t[0], t[2], t[1]);       // top (+y)
  push(b[0], b[1], b[2]); push(b[0], b[2], b[3]);       // bottom (−y)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    push(b[i], t[i], t[j]); push(b[i], t[j], b[j]);     // sides
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  g.computeVertexNormals();
  return tagGeometry(g, c, 0, opts.shade ?? 1);
}

// ---------------------------------------------------------------------------
// STREETLAMP — plinth, tapered pole with two collars, gooseneck, trapezoid
// head with a warm lens (5.6 m)
export function streetlampGeo() {
  const parts = [];
  parts.push(cyl(0.2, 0.24, 0.34, 6, 0x141a30).translate(0, 0.17, 0));
  parts.push(cyl(0.14, 0.17, 0.18, 6, 0x1c2440).translate(0, 0.43, 0));
  parts.push(cyl(0.065, 0.095, 4.4, 6, 0x1c2440).translate(0, 2.72, 0));
  parts.push(cyl(0.105, 0.105, 0.1, 6, 0x141a30).translate(0, 1.5, 0));   // collar
  parts.push(cyl(0.095, 0.095, 0.1, 6, 0x141a30).translate(0, 3.3, 0));   // collar
  // gooseneck: quarter torus from pole top (y 4.92) curving forward (+z)
  const R = 0.58;
  const neck = new THREE.TorusGeometry(R, 0.06, 5, 7, Math.PI / 2).toNonIndexed();
  neck.rotateY(-Math.PI / 2);          // arc spans +z → +y
  neck.rotateY(Math.PI);               // arc spans −z → +y
  neck.translate(0, 4.92, R);          // start joins the pole, end runs level at y 5.5
  parts.push(tagGeometry(neck, 0x1c2440, 0, 1));
  parts.push(box(0.09, 0.09, 0.55, 0x1c2440).translate(0, 5.5, R + 0.24));
  // head: trapezoid, wider at the top, lens plate beneath
  const head = prism(0.34, 0.42, 0.52, 0.62, 0.2, 0x39456b);
  head.translate(0, 5.42, R + 0.52);
  parts.push(head);
  parts.push(box(0.3, 0.045, 0.5, 0xffd9a0, 1.4).translate(0, 5.4, R + 0.52));
  return faceShade(mergeParts(parts));
}

// ---------------------------------------------------------------------------
// TRAFFIC SIGNAL — banded base, braced arm, hooded housing (4.6 m). The lens
// coordinates (y 4.08/3.80/3.52, z 1.395) are load-bearing: traffic.js places
// its live-colored lens instances there.
export function trafficLightGeo() {
  const parts = [];
  // hazard-banded base
  parts.push(box(0.3, 0.14, 0.3, 0x141a30).translate(0, 0.07, 0));
  parts.push(box(0.26, 0.12, 0.26, PAL.orange).translate(0, 0.2, 0));
  parts.push(box(0.24, 0.12, 0.24, 0x0d1b3e).translate(0, 0.32, 0));
  parts.push(box(0.22, 0.12, 0.22, PAL.orange).translate(0, 0.44, 0));
  parts.push(cyl(0.075, 0.1, 3.6, 6, 0x1c2440).translate(0, 2.3, 0));
  parts.push(box(0.09, 0.09, 1.28, 0x1c2440).translate(0, 4.05, 0.61));
  // diagonal brace strut pole → arm
  const strut = box(0.055, 0.055, 1.35, 0x1c2440);
  strut.rotateX(-0.62);
  strut.translate(0, 3.6, 0.52);
  parts.push(strut);
  // housing: back box + proud rim frame + face plate. The face sits at z 1.37
  // so the live lens quads (z 1.395) float just proud of it, never buried.
  parts.push(box(0.34, 0.95, 0.26, 0x0d1b3e).translate(0, 3.72, 1.13));
  parts.push(box(0.44, 1.05, 0.1, 0x1a2340).translate(0, 3.72, 1.31));
  parts.push(box(0.34, 0.95, 0.02, 0x131c38).translate(0, 3.72, 1.36));
  // lens hoods: half-cylinders arching over each lens, open to the ground
  for (let k = 0; k < 3; k++) {
    const hood = new THREE.CylinderGeometry(0.12, 0.12, 0.14, 6, 1, false, -Math.PI / 2, Math.PI).toNonIndexed();
    hood.rotateX(-Math.PI / 2);
    hood.translate(0, 4.08 - k * 0.28 + 0.09, 1.43);
    parts.push(tagGeometry(hood, 0x131a30, 0, 1));
  }
  return faceShade(mergeParts(parts));
}

// separate tiny quad instanced per lens so intersections can switch colors
export function trafficLensGeo() {
  const g = new THREE.PlaneGeometry(0.17, 0.17).toNonIndexed();
  tagGeometry(g, 0xffffff, 0, 1.6);
  return g; // positioned per instance at head front (z 1.395)
}

// ---------------------------------------------------------------------------
// STREET SIGN — blade with a white rim, finial cap, orange diamond (2.6 m)
export function signGeo() {
  const parts = [];
  parts.push(cyl(0.045, 0.06, 2.42, 6, 0x39456b).translate(0, 1.21, 0));
  const finial = new THREE.IcosahedronGeometry(0.07, 0).toNonIndexed();
  parts.push(tagGeometry(finial, 0x8d93a8, 0, 1).translate(0, 2.48, 0));
  // blade: white rim slightly larger behind the blue plate, mounted proud of
  // the pole face so the pole never pokes through it
  parts.push(box(0.98, 0.42, 0.03, 0xd6dcf0).translate(0.42, 2.2, 0.085));
  parts.push(box(0.9, 0.34, 0.06, PAL.blueBright, 1.05).translate(0.42, 2.2, 0.085));
  parts.push(box(0.9, 0.07, 0.062, 0x48a8f0, 1.1).translate(0.42, 2.33, 0.085));  // top-light facet
  // diamond plate below
  const dia = box(0.4, 0.4, 0.05, PAL.orange);
  dia.rotateZ(Math.PI / 4);
  dia.translate(0, 1.55, 0.08);
  parts.push(dia);
  parts.push(cyl(0.07, 0.07, 0.06, 6, 0x0d1b3e).rotateX(Math.PI / 2).translate(0, 1.55, 0.125));
  return faceShade(mergeParts(parts));
}

// ---------------------------------------------------------------------------
// TREE — one faceted canopy running light-to-dark through the four orange
// tokens (by facet direction vs the dusk sun), tapered two-tone trunk, root
// flares and branch stubs (6 m)
const CANOPY_TONES = [0xf0a860, 0xd89048, 0xc07830, 0x904818].map((h) => new THREE.Color(h));
const SUN = new THREE.Vector3(-0.6, 0.55, -0.35).normalize();

function canopyBall(r, squash) {
  const g = new THREE.IcosahedronGeometry(r, 1).toNonIndexed();
  g.scale(1, squash, 1);
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const N = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    N.set(
      (nor.getX(f) + nor.getX(f + 1) + nor.getX(f + 2)) / 3,
      (nor.getY(f) + nor.getY(f + 1) + nor.getY(f + 2)) / 3,
      (nor.getZ(f) + nor.getZ(f + 1) + nor.getZ(f + 2)) / 3,
    ).normalize();
    const lit = N.dot(SUN); // 1 sun-facing … −1 shade
    const tone = lit > 0.45 ? 0 : lit > -0.05 ? 1 : lit > -0.5 ? 2 : 3;
    const c = CANOPY_TONES[tone];
    for (let v = 0; v < 3; v++) { col[(f + v) * 3] = c.r; col[(f + v) * 3 + 1] = c.g; col[(f + v) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aInterior', new THREE.BufferAttribute(new Float32Array(pos.count).fill(0), 1));
  return g;
}

export function treeGeo() {
  const parts = [];
  parts.push(canopyBall(1.85, 0.94).translate(0, 3.85, 0));
  parts.push(canopyBall(0.85, 0.9).translate(0.75, 4.9, 0.35));       // asymmetric crown bump
  parts.push(cyl(0.15, 0.23, 2.7, 5, 0x6b4a26).translate(0, 1.35, 0));
  parts.push(box(0.1, 2.4, 0.08, 0x4a3118).translate(0.13, 1.3, 0.06)); // shade stripe
  // root flares
  parts.push(prism(0.5, 0.4, 0.16, 0.16, 0.4, 0x6b4a26).translate(0, 0, 0));
  parts.push(prism(0.2, 0.34, 0.1, 0.12, 0.3, 0x4a3118).translate(0.22, 0, 0.12));
  // branch stubs into the canopy
  const b1 = cyl(0.045, 0.065, 0.9, 4, 0x6b4a26); b1.rotateZ(0.7); b1.translate(-0.42, 2.85, 0.05);
  const b2 = cyl(0.04, 0.06, 0.8, 4, 0x4a3118); b2.rotateZ(-0.6); b2.rotateY(0.5); b2.translate(0.4, 2.95, -0.1);
  parts.push(b1, b2);
  return mergeParts(parts); // canopy tones are authored — no faceShade pass
}

// ---------------------------------------------------------------------------
// NEWS KIOSK — scalloped awning, cream signboard, lit/shade corner posts,
// stocked open front over a counter, poster frame on the blind side (2.6 m)
const RACK_COLORS = [0x3090f0, 0xf0a860, 0x48a8f0, 0xd89048, 0xf5f0e0, 0x1878d8];

export function kioskGeo() {
  const parts = [];
  // body + corner posts
  parts.push(box(2.2, 1.9, 1.5, 0x1848c0).translate(0, 0.95, 0));
  parts.push(box(0.1, 1.9, 0.1, PAL.blueBright).translate(-1.08, 0.95, 0.73));
  parts.push(box(0.1, 1.9, 0.1, PAL.blueDeep).translate(1.08, 0.95, 0.73));
  parts.push(box(2.3, 0.12, 1.6, 0x0d1b3e).translate(0, 0.06, 0));       // plinth
  // signboard
  parts.push(box(2.34, 0.34, 0.16, 0xf5f0e0, 1.05).translate(0, 2.12, 0));
  parts.push(box(0.7, 0.14, 0.17, 0x0d1b3e).translate(0, 2.12, 0));      // abstract lettering band
  // awning: straight band + scallops along the front
  parts.push(box(2.4, 0.1, 0.34, PAL.orange).translate(0, 1.9, 0.72));
  for (let i = 0; i < 6; i++) {
    const sc = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 7, 1, false, Math.PI, Math.PI).toNonIndexed();
    sc.rotateX(Math.PI / 2);
    sc.rotateZ(Math.PI / 2);
    sc.translate(-0.99 + i * 0.397, 1.85, 0.82);
    parts.push(tagGeometry(sc, i % 2 ? 0xf5f0e0 : PAL.orangeBright, 0, 1.05));
  }
  // open front: dark opening, magazine facets, counter slab
  parts.push(box(1.5, 1.15, 0.1, 0x0d1b3e).translate(-0.25, 1.08, 0.72));
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++) {
      parts.push(box(0.2, 0.26, 0.05, RACK_COLORS[(i + row * 3) % RACK_COLORS.length], 1.05)
        .translate(-0.79 + i * 0.27, 1.42 - row * 0.34, 0.76));
    }
  }
  parts.push(box(1.56, 0.12, 0.24, 0x8d93a8).translate(-0.25, 0.85, 0.78));
  parts.push(box(1.56, 0.05, 0.22, 0x5b6178).translate(-0.25, 0.77, 0.77));
  // poster frame on the right flank
  parts.push(box(0.06, 0.85, 0.6, 0xf5f0e0).translate(1.11, 1.25, -0.1));
  parts.push(box(0.065, 0.5, 0.44, 0x1848c0).translate(1.115, 1.4, -0.1));
  parts.push(cyl(0.12, 0.12, 0.07, 8, 0xf0a860).rotateZ(Math.PI / 2).translate(1.12, 1.4, -0.1));
  return faceShade(mergeParts(parts));
}

// ---------------------------------------------------------------------------
// CARS — sedan / taxi / van per the vehicle sheet. Fixed topology so the
// crush/deform path stays safe; wrecks reuse the sedan shell.
export function carGeo(kind = 'sedan') {
  const K = {
    sedan: { L: 4.4, W: 1.85, bodyH: 0.6, cabinH: 0.52, color: 0x2a63d4, lit: 0x3090f0, dark: 0x003090, glass: 0x2c4a7e },
    taxi: { L: 4.4, W: 1.85, bodyH: 0.62, cabinH: 0.55, color: PAL.orange, lit: 0xe09c54, dark: PAL.orangeDeep, glass: 0x2c4a7e },
    van: { L: 4.9, W: 2.0, bodyH: 1.5, cabinH: 0, color: 0x1848c0, lit: 0x1878d8, dark: 0x003090, glass: 0x2c4a7e },
    wreck: { L: 4.4, W: 1.85, bodyH: 0.6, cabinH: 0.5, color: 0x3a3f52, lit: 0x474d63, dark: 0x22242e, glass: 0x22242e },
  }[kind];
  const parts = [];
  const cl = 0.32; // ground clearance
  const front = K.L / 2; // +z is the nose

  if (kind === 'van') {
    // tall box, raked windshield, cab glazing, sliding-door seam, deep sill
    const boxL = K.L - 0.75;
    parts.push(box(K.W, K.bodyH, boxL, K.color).translate(0, cl + K.bodyH / 2, -(K.L - boxL) / 2));
    parts.push(box(K.W, 0.75, 0.8, K.color).translate(0, cl + 0.375, front - 0.42));
    const rake = prism(K.W, 0.82, K.W, 0.3, K.bodyH - 0.75, K.color, { zOff: -0.26 });
    rake.translate(0, cl + 0.75, front - 0.43);
    parts.push(rake);
    // windshield glass proud on the raked face
    const ws = box(K.W * 0.86, 0.5, 0.06, K.glass);
    ws.rotateX(-0.6);
    ws.translate(0, cl + 1.08, front - 0.22);
    parts.push(ws);
    parts.push(box(0.06, 0.34, 0.5, K.glass).translate(K.W / 2, cl + 1.05, front - 0.75));   // cab side windows
    parts.push(box(0.06, 0.34, 0.5, K.glass).translate(-K.W / 2, cl + 1.05, front - 0.75));
    parts.push(box(K.W + 0.02, 0.34, 2.9, K.dark).translate(0, cl + 0.17, -0.5));            // deep sill band
    parts.push(box(K.W + 0.02, 0.9, 0.05, K.dark).translate(0, cl + 0.62, -0.6));            // sliding-door seam
  } else {
    // sedan / taxi / wreck: hull + shoulder light-band + tapered cabin
    parts.push(box(K.W, K.bodyH, K.L, K.color).translate(0, cl + K.bodyH / 2, 0));
    parts.push(box(K.W + 0.02, 0.09, K.L - 0.5, K.lit, 1.06).translate(0, cl + K.bodyH - 0.05, 0));
    parts.push(box(K.W + 0.02, 0.1, K.L - 0.3, K.dark).translate(0, cl + 0.05, 0));
    const cabL = K.L * 0.46;
    const cabZ = -K.L * 0.06;
    const cab = prism(K.W * 0.92, cabL, K.W * 0.8, cabL * 0.52, K.cabinH, K.color, { zOff: -cabL * 0.06 });
    cab.translate(0, cl + K.bodyH, cabZ);
    parts.push(cab);
    // glass band wraps the cabin, a touch proud of its slopes
    const glass = prism(K.W * 0.98, cabL * 0.9, K.W * 0.72, cabL * 0.42, K.cabinH * 0.62, K.glass, { zOff: -cabL * 0.05, shade: 1.12 });
    glass.translate(0, cl + K.bodyH + 0.07, cabZ);
    parts.push(glass);
    if (kind === 'taxi') {
      // cream roof sign with checker dots + checker beltline both flanks
      parts.push(box(0.72, 0.2, 0.34, 0xf5f0e0, 1.15).translate(0, cl + K.bodyH + K.cabinH + 0.1, cabZ));
      for (let i = 0; i < 3; i++) parts.push(box(0.1, 0.21, 0.1, 0x0d1b3e).translate(-0.2 + i * 0.2, cl + K.bodyH + K.cabinH + 0.1, cabZ + 0.13));
      for (let i = 0; i < 10; i++) {
        const zc = -K.L / 2 + 0.5 + i * 0.38;
        const tone = i % 2 ? 0x0d1b3e : 0xf5f0e0;
        parts.push(box(0.03, 0.17, 0.19, tone).translate(K.W / 2 + 0.005, cl + K.bodyH * 0.55, zc));
        parts.push(box(0.03, 0.17, 0.19, i % 2 ? 0xf5f0e0 : 0x0d1b3e).translate(-K.W / 2 - 0.005, cl + K.bodyH * 0.55, zc));
      }
    }
  }

  // bumpers, lights (shared)
  parts.push(box(K.W * 0.98, 0.18, 0.22, 0x1c2438).translate(0, cl + 0.1, front - 0.08));
  parts.push(box(K.W * 0.98, 0.18, 0.22, 0x1c2438).translate(0, cl + 0.1, -front + 0.08));
  const lightY = cl + (kind === 'van' ? 0.62 : K.bodyH * 0.75);
  parts.push(box(0.28, 0.12, 0.06, 0xffe9b8, 1.5).translate(K.W / 2 - 0.28, lightY, front + 0.01));
  parts.push(box(0.28, 0.12, 0.06, 0xffe9b8, 1.5).translate(-K.W / 2 + 0.28, lightY, front + 0.01));
  parts.push(box(0.24, 0.1, 0.06, 0xd23a2a, 1.2).translate(K.W / 2 - 0.26, lightY, -front - 0.01));
  parts.push(box(0.24, 0.1, 0.06, 0xd23a2a, 1.2).translate(-K.W / 2 + 0.26, lightY, -front - 0.01));
  // wheels + hubs
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const w = cyl(0.34, 0.34, 0.26, 8, 0x14181f);
    w.rotateZ(Math.PI / 2);
    w.translate(sx * (K.W / 2 - 0.1), 0.34, sz * (K.L / 2 - 0.85));
    parts.push(w);
    const hub = cyl(0.13, 0.13, 0.28, 8, 0x8d93a8);
    hub.rotateZ(Math.PI / 2);
    hub.translate(sx * (K.W / 2 - 0.1), 0.34, sz * (K.L / 2 - 0.85));
    parts.push(hub);
  }
  return faceShade(mergeParts(parts));
}
