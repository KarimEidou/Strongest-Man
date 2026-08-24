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
  glassGlow: 0xffc878,
  fog: 0xa05a44,
  skyLight: 0x7a8dbf,
  groundBounce: 0xb3652f,
  sun: 0xffcf9e,
  blood: 0x8c1f1f,
};

export function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
