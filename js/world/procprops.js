// Procedural palette props. These replace generated lifts that failed visual
// QA (streetlamp, traffic light, sign, tree, kiosk, cars) — clean low-poly
// primitives in the icon palette, built for destruction: lamps bend, traffic
// lights carry per-instance lens state, cars have known crushable topology.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tagGeometry, faceShade } from '../engine/materials.js';
import { PAL } from '../core/palette.js';

// everything non-indexed so icosahedra and boxes merge cleanly
const box = (w, h, d, c, shade = 1) => tagGeometry(new THREE.BoxGeometry(w, h, d).toNonIndexed(), c, 0, shade);
const cyl = (rt, rb, h, seg, c) => tagGeometry(new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed(), c);

export function streetlampGeo() {
  const pole = cyl(0.07, 0.1, 4.6, 6, 0x2a3554).translate(0, 2.3, 0);
  const base = cyl(0.16, 0.2, 0.35, 6, 0x222c48).translate(0, 0.175, 0);
  const arm = box(0.09, 0.09, 1.5, 0x2a3554).translate(0, 4.62, 0.66);
  const head = box(0.26, 0.14, 0.7, 0x39456b).translate(0, 4.6, 1.28);
  const lens = box(0.2, 0.05, 0.55, 0xffd9a0, 1.35).translate(0, 4.52, 1.28);
  return faceShade(mergeGeometries([pole, base, arm, head, lens]));
}

export function trafficLightGeo() {
  const pole = cyl(0.08, 0.11, 4.1, 6, 0x222c48).translate(0, 2.05, 0);
  const arm = box(0.1, 0.1, 1.6, 0x222c48).translate(0, 4.05, 0.7);
  const head = box(0.34, 0.95, 0.3, 0x1a2340).translate(0, 3.72, 1.35);
  const visors = [];
  for (let i = 0; i < 3; i++) visors.push(box(0.3, 0.06, 0.36, 0x131a30).translate(0, 4.08 - i * 0.28, 1.38));
  return faceShade(mergeGeometries([pole, arm, head, ...visors]));
}

// separate tiny quad instanced per lens so intersections can switch colors
export function trafficLensGeo() {
  const g = new THREE.PlaneGeometry(0.17, 0.17).toNonIndexed();
  tagGeometry(g, 0xffffff, 0, 1.6);
  return g; // positioned per instance at head front
}

export function signGeo() {
  const pole = cyl(0.05, 0.07, 2.4, 6, 0x39456b).translate(0, 1.2, 0);
  const plate = box(0.85, 0.5, 0.05, PAL.blueBright, 1.1).translate(0, 2.15, 0);
  const rim = box(0.92, 0.57, 0.03, 0xd6dcf0).translate(0, 2.15, -0.012);
  return faceShade(mergeGeometries([pole, plate, rim]));
}

export function treeGeo() {
  const trunk = cyl(0.14, 0.2, 1.6, 5, 0x6b4a26).translate(0, 0.8, 0);
  const f1 = tagGeometry(new THREE.IcosahedronGeometry(1.35, 0), PAL.orange).translate(0, 2.6, 0);
  const f2 = tagGeometry(new THREE.IcosahedronGeometry(0.95, 0), PAL.orangeBright).translate(0.35, 3.5, 0.2);
  const f3 = tagGeometry(new THREE.IcosahedronGeometry(0.75, 0), PAL.orangeDeep).translate(-0.45, 3.3, -0.25);
  return faceShade(mergeGeometries([trunk, f1, f2, f3]));
}

export function kioskGeo() {
  const body = box(2.2, 2.0, 1.5, 0x2452b8).translate(0, 1.0, 0);
  const roof = box(2.5, 0.16, 1.8, 0x1a3a8a).translate(0, 2.1, 0);
  const awning = box(2.5, 0.08, 0.9, PAL.orangeBright).translate(0, 1.75, 1.05);
  const counter = box(1.7, 0.5, 0.28, 0xd6dcf0, 0.95).translate(0, 0.95, 0.82);
  const opening = box(1.7, 0.75, 0.06, 0x101a36).translate(0, 1.55, 0.76);
  return faceShade(mergeGeometries([body, roof, awning, counter, opening]));
}

// Cars: silhouette from a side profile extruded, wheels merged. `kind` drives
// proportions and colors; topology is fixed so P4 can crush vertices safely.
export function carGeo(kind = 'sedan') {
  const K = {
    sedan: { L: 4.4, W: 1.85, bodyH: 0.62, cabinH: 0.55, cabF: 0.32, cabB: 0.78, color: 0x2a63d4, glass: 0x152a55 },
    taxi: { L: 4.4, W: 1.85, bodyH: 0.62, cabinH: 0.55, cabF: 0.32, cabB: 0.78, color: PAL.orange, glass: 0x3a2a10 },
    van: { L: 4.9, W: 2.0, bodyH: 0.95, cabinH: 0.85, cabF: 0.22, cabB: 0.97, color: 0x1a3a8a, glass: 0x152a55 },
    wreck: { L: 4.4, W: 1.85, bodyH: 0.62, cabinH: 0.5, cabF: 0.32, cabB: 0.78, color: 0x3a3f52, glass: 0x22242e },
  }[kind];
  const parts = [];
  const clearance = 0.32;
  // lower body
  parts.push(box(K.W, K.bodyH, K.L, K.color).translate(0, clearance + K.bodyH / 2, 0));
  // cabin (tapered via scaled top: approximate with a narrower, shorter box + windshield wedges)
  const cabL = K.L * (K.cabB - K.cabF), cabZ = -K.L / 2 + K.L * (K.cabF + K.cabB) / 2;
  const cabin = box(K.W * 0.92, K.cabinH, cabL, K.color, 1.05).translate(0, clearance + K.bodyH + K.cabinH / 2, cabZ);
  parts.push(cabin);
  // glass band around cabin
  const glass = box(K.W * 0.94, K.cabinH * 0.55, cabL * 0.96, K.glass, 1).translate(0, clearance + K.bodyH + K.cabinH * 0.52, cabZ);
  parts.push(glass);
  if (kind === 'taxi') parts.push(box(0.7, 0.22, 0.34, 0xf5f0e0, 1.2).translate(0, clearance + K.bodyH + K.cabinH + 0.11, cabZ));
  // bumpers
  parts.push(box(K.W * 0.98, 0.18, 0.22, 0x1c2438).translate(0, clearance + 0.1, K.L / 2 - 0.08));
  parts.push(box(K.W * 0.98, 0.18, 0.22, 0x1c2438).translate(0, clearance + 0.1, -K.L / 2 + 0.08));
  // headlights / taillights
  parts.push(box(0.28, 0.12, 0.06, 0xffe9b8, 1.5).translate(K.W / 2 - 0.28, clearance + K.bodyH * 0.75, K.L / 2 + 0.01));
  parts.push(box(0.28, 0.12, 0.06, 0xffe9b8, 1.5).translate(-K.W / 2 + 0.28, clearance + K.bodyH * 0.75, K.L / 2 + 0.01));
  parts.push(box(0.24, 0.1, 0.06, 0xd23a2a, 1.2).translate(K.W / 2 - 0.26, clearance + K.bodyH * 0.75, -K.L / 2 - 0.01));
  parts.push(box(0.24, 0.1, 0.06, 0xd23a2a, 1.2).translate(-K.W / 2 + 0.26, clearance + K.bodyH * 0.75, -K.L / 2 - 0.01));
  // wheels
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const w = cyl(0.34, 0.34, 0.26, 8, 0x14181f);
    w.rotateZ(Math.PI / 2);
    w.translate(sx * (K.W / 2 - 0.1), 0.34, sz * (K.L / 2 - 0.85));
    parts.push(w);
  }
  return faceShade(mergeGeometries(parts));
}
