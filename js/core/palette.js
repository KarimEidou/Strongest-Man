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

// Night is a FLOOR, not a blackout, and the floor lives in these COLOURS rather
// than in the intensity scalars beside them. hemiI at midnight was already 1.35,
// above dawn's 1.20 — the darkness came from hemiSky 0x33416e / hemiGround
// 0x272c45 / sun 0x6b7aa5, which is near-black once it is decoded to linear. A
// flat road (PAL.road) measured RGB(0, 3, 22) out of the renderer and a
// pedestrian RGB(0, 1, 16): a silhouette, unplayable.
// The tone mapper makes that worse than it looks. NeutralToneMapping subtracts
// the MIN channel below 0.08 (offset = x - 6.25x²), so a night lit only in blue
// has its red eaten completely and all that survives is the spread BETWEEN
// channels — which scales with the light, not with a multiplier on an almost
// black colour. So the three night stops are lifted bodily and warmed a little
// (the city's own sodium haze bouncing back up), hemiI 1.35 -> 1.90 and
// sunI 0.55 -> 0.80. Measured the same way, with the streetlamps masked off so
// this is the floor alone: road RGB(0, 3, 22) -> RGB(0, 11, 41), pavement
// RGB(2, 17, 54) -> RGB(11, 38, 87), facade RGB(0, 7, 37) -> RGB(2, 29, 97) —
// against a zenith/horizon/fog left exactly where they were, so the dome stays
// near-black overhead and it is a moonlit city, not blue daylight. The
// streetlamps and lit windows (engine/materials.js, engine/citylights.js) still
// carry the local detail, and now throw it onto facades, props and people
// instead of only the ground.
//
// Time-of-day keyframes. `game.timeOfDay` runs 0..1 over a 24-minute day and
// engine/sky.js interpolates between these for the sky dome, the fog, both
// lights and the god-ray tint — one source of truth, so dusk stays coherent.
// The t = 0.70 stop reproduces the palette the game shipped with, and is the
// time of day it starts at.
export const SKY_KEYS = [
  { t: 0.00, zenith: 0x080f22, horizon: 0x1b2745, fog: 0x1e2a47, sun: 0x7a8ab6, sunI: 0.80, hemiSky: 0x536a9e, hemiGround: 0x413d58, hemiI: 1.90, night: 1.00, cover: 0.44 },
  { t: 0.23, zenith: 0x1f3f80, horizon: 0xd9835a, fog: 0xa86a4e, sun: 0xffc79a, sunI: 1.60, hemiSky: 0x6d81b2, hemiGround: 0x8a5a3a, hemiI: 1.20, night: 0.30, cover: 0.42 },
  { t: 0.50, zenith: 0x1d5fc4, horizon: 0xa8c6ea, fog: 0xa9bdd8, sun: 0xfff4e4, sunI: 2.45, hemiSky: 0xa2bae2, hemiGround: 0x8d8a7c, hemiI: 1.55, night: 0.00, cover: 0.48 },
  { t: 0.70, zenith: 0x123a86, horizon: 0xa05a44, fog: 0xa05a44, sun: 0xffcf9e, sunI: 2.10, hemiSky: 0x7a8dbf, hemiGround: 0xb3652f, hemiI: 1.75, night: 0.14, cover: 0.43 },
  { t: 0.85, zenith: 0x0a1c4a, horizon: 0x6b3a52, fog: 0x4d2c40, sun: 0xa87c95, sunI: 1.05, hemiSky: 0x5f72a2, hemiGround: 0x5f4340, hemiI: 1.65, night: 0.60, cover: 0.40 },
  { t: 1.00, zenith: 0x080f22, horizon: 0x1b2745, fog: 0x1e2a47, sun: 0x7a8ab6, sunI: 0.80, hemiSky: 0x536a9e, hemiGround: 0x413d58, hemiI: 1.90, night: 1.00, cover: 0.44 },
];
