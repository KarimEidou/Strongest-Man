// The last two pieces of procedural prop geometry.
//
// Everything else that used to live here — streetlamp, signal, sign, tree,
// kiosk, cars — is now a real model: Kenney CC0 packs brought in by
// tools/import-models.mjs and drawn straight out of the instanced pools in
// world/props.js and world/traffic.js. What is left is the two things a static
// model cannot be, because they are live state rather than shape.
import * as THREE from 'three';
import { tagGeometry, SURF } from '../engine/materials.js';

// Ground clearance of the imported cars: the height of the chassis underside
// above the wheel-contact plane, which is the face a pair of hands actually
// grips when a car goes overhead (player/combat.js reads it as gripDrop).
// Measured on assets/models/car_sedan.glb, whose sills sit at y 0.26 over a
// wheel plane at y 0.
export const CAR_CLEARANCE = 0.26;

// One tiny quad per signal lens, instanced, so every intersection can switch
// colour without touching the signal MODEL — which is one merged mesh shared by
// every traffic light in the city and has its lenses painted into the atlas.
// world/traffic.js positions these on the head's lens face.
export function trafficLensGeo() {
  const g = new THREE.PlaneGeometry(0.19, 0.19).toNonIndexed();
  tagGeometry(g, 0xffffff, 0, 1.6, SURF.GLASS);
  return g;
}
