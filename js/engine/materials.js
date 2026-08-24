// Shared world material. One Lambert serves every procedural surface (streets,
// building archetypes, debris): vertex colors × instance colors, plus an
// `aInterior` vertex attribute that swaps outdoor lighting for a dim indoor
// constant — rooms revealed by destruction never read as sunlit.
import * as THREE from 'three';
import { PAL } from '../core/palette.js';

const interiorColor = new THREE.Color(PAL.interiorDim);

export function makeWorldMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uInterior = { value: interiorColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aInterior;\nvarying float vInterior;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInterior = aInterior;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uInterior;\nvarying float vInterior;')
      .replace(
        '#include <opaque_fragment>',
        'outgoingLight = mix( outgoingLight, diffuseColor.rgb * uInterior * 3.2, vInterior );\n#include <opaque_fragment>',
      );
  };
  // distinct program per aInterior-using material
  mat.customProgramCacheKey = () => 'world-interior';
  return mat;
}

// Geometry helpers -----------------------------------------------------------

// Ensure a geometry has COLOR + aInterior attributes (fill with defaults).
export function tagGeometry(geo, color, interior = 0, shade = 1) {
  const n = geo.getAttribute('position').count;
  if (!geo.getAttribute('color')) {
    const c = new Float32Array(n * 3);
    const col = new THREE.Color(color);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r * shade; c[i * 3 + 1] = col.g * shade; c[i * 3 + 2] = col.b * shade; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (!geo.getAttribute('aInterior')) {
    const a = new Float32Array(n).fill(interior);
    geo.setAttribute('aInterior', new THREE.BufferAttribute(a, 1));
  }
  return geo;
}

// Per-face shading for low-poly pop: darken faces by normal direction
// (side faces slightly darker, bottom darkest) and optional sun-side tint.
export function faceShade(geo, sunDir = new THREE.Vector3(-0.6, 0.5, -0.35).normalize()) {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  const N = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    N.fromBufferAttribute(nor, i);
    let m = 1;
    if (N.y < -0.5) m = 0.62;
    else if (Math.abs(N.y) < 0.5) {
      const sun = N.dot(sunDir);                 // -1..1
      m = 0.82 + 0.14 * sun;                     // shade vs lit side
    }
    col.setXYZ(i, col.getX(i) * m, col.getY(i) * m, col.getZ(i) * m);
  }
  return geo;
}
