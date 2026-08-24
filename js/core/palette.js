// Colour anchors sampled from the app icon; the whole game draws from these.
export const PAL = {
  blueDeep: 0x003090,
  blue: 0x1848c0,
  blueMid: 0x1878d8,
  blueBright: 0x3090f0,
  blueSky: 0x48a8f0,
  orange: 0xd89048,
  orangeBright: 0xf0a860,
  orangeDeep: 0xc07830,
  orangeShadow: 0x904818,
  navyBg: 0x0d1b3e,
  // derived world tints
  road: 0x2a2f45,
  roadLine: 0xcfd6e6,
  sidewalk: 0x8d93a8,
  sidewalkEdge: 0x767c92,
  concrete: 0x9aa3bd,
  interiorDim: 0x26283e,
  interiorLit: 0x6b5334,   // rooms with the lights on, after dark
  glassGlow: 0xffc878,
  fog: 0xa05a44,
  skyLight: 0x7a8dbf,
  groundBounce: 0xb3652f,
  sun: 0xffcf9e,
  blood: 0x8c1f1f,
};

export function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

// Night is a FLOOR, not a blackout. At hemiI 0.60 over a 0x0b0e18 ground bounce
// the streets came out around (0.03, 0.03, 0.06) linear — unplayable on a phone
// in daylight — and the only directional contribution came from a sun that was
// under the map (see engine/sky.js). The night stops are lifted to read clearly
// while staying unmistakably night; the streetlamps and lit windows
// (engine/materials.js, engine/citylights.js) carry the local detail.
// Time-of-day keyframes. `game.timeOfDay` runs 0..1 over a 24-minute day and
// engine/sky.js interpolates between these for the sky dome, the fog, both
// lights and the god-ray tint — one source of truth, so dusk stays coherent.
// The t = 0.70 stop reproduces the palette the game shipped with, and is the
// time of day it starts at.
export const SKY_KEYS = [
  { t: 0.00, zenith: 0x080f22, horizon: 0x1b2745, fog: 0x1e2a47, sun: 0x6b7aa5, sunI: 0.55, hemiSky: 0x33416e, hemiGround: 0x272c45, hemiI: 1.35, night: 1.00, cover: 0.44 },
  { t: 0.23, zenith: 0x1f3f80, horizon: 0xd9835a, fog: 0xa86a4e, sun: 0xffc79a, sunI: 1.60, hemiSky: 0x6d81b2, hemiGround: 0x8a5a3a, hemiI: 1.20, night: 0.30, cover: 0.42 },
  { t: 0.50, zenith: 0x1d5fc4, horizon: 0xa8c6ea, fog: 0xa9bdd8, sun: 0xfff4e4, sunI: 2.45, hemiSky: 0xa2bae2, hemiGround: 0x8d8a7c, hemiI: 1.55, night: 0.00, cover: 0.48 },
  { t: 0.70, zenith: 0x123a86, horizon: 0xa05a44, fog: 0xa05a44, sun: 0xffcf9e, sunI: 2.10, hemiSky: 0x7a8dbf, hemiGround: 0xb3652f, hemiI: 1.75, night: 0.14, cover: 0.43 },
  { t: 0.85, zenith: 0x0a1c4a, horizon: 0x6b3a52, fog: 0x4d2c40, sun: 0x9a6a8a, sunI: 0.85, hemiSky: 0x44548a, hemiGround: 0x4a2f2c, hemiI: 1.30, night: 0.60, cover: 0.40 },
  { t: 1.00, zenith: 0x080f22, horizon: 0x1b2745, fog: 0x1e2a47, sun: 0x6b7aa5, sunI: 0.55, hemiSky: 0x33416e, hemiGround: 0x272c45, hemiI: 1.35, night: 1.00, cover: 0.44 },
];
