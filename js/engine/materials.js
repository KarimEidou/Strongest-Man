// Shared world material. One Lambert serves every procedural surface (streets,
// building archetypes, props, cars, debris). On top of three's own lighting it
// carries three custom terms, all injected through onBeforeCompile so there is
// still exactly one shader program for the whole city:
//
//  aInterior — swaps outdoor lighting for a dim indoor constant, so rooms
//              revealed by destruction never read as sunlit.
//  aSurface  — a material id per vertex, driving procedural surface detail:
//              asphalt grain and wheel tracks, concrete mottle, pavement panel
//              joints, brick courses, roof gravel, wood grain, foliage clumps.
//              The detail is projected from WORLD SPACE on the dominant face
//              axis, because none of this geometry has usable UVs — procprops
//              deliberately deletes them before merging.
//  specular  — a Blinn-Phong lobe plus a sky-coloured fresnel rim, so glass,
//              car paint and wet asphalt read as materials rather than flat
//              colour. It is added inside RE_Direct_Lambert so it inherits the
//              shadow attenuation for free.
import * as THREE from 'three';
import { PAL } from '../core/palette.js';

// per-vertex material ids
export const SURF = {
  CONCRETE: 0,
  ASPHALT: 1,
  PAINT: 2,
  SIDEWALK: 3,
  PLASTER: 4,
  BRICK: 5,
  GLASS: 6,
  METAL: 7,
  FOLIAGE: 8,
  ROOF: 9,
  WOOD: 10,
};

// Shared uniform objects: onBeforeCompile hands the SAME object to every
// material, so engine/sky.js mutates one value and the whole world follows.
export const worldUniforms = {
  uInterior: { value: new THREE.Color(PAL.interiorDim) },
  uSkyTint: { value: new THREE.Color(PAL.skyLight) },
  // x = time of day 0..1, y = night 0..1, z = detail strength, w = spare
  uWorld: { value: new THREE.Vector4(0.78, 0, 1, 0) },
};

const NOISE_GLSL = `
float smHash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float smNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(smHash21(i), smHash21(i + vec2(1.0, 0.0)), f.x),
             mix(smHash21(i + vec2(0.0, 1.0)), smHash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float smFbm(vec2 p) { return smNoise(p) * 0.65 + smNoise(p * 2.13) * 0.35; }
// dominant-axis world projection: every surface here is an axis-aligned box,
// cylinder or ground quad, so one plane per face is seam-free and a third of
// the cost of a blended triplanar lookup
vec2 smProj(vec3 p, vec3 n) {
  vec3 a = abs(n);
  return (a.x > a.y && a.x > a.z) ? p.zy : (a.y > a.z ? p.xz : p.xy);
}
`;

const SURFACE_GLSL = `
vec3 smSurface(int id, vec3 wp, vec3 wn, float fade, out float sInt, out float sPow) {
  sInt = 0.0; sPow = 24.0;
  if (fade < 0.01) return vec3(1.0);
  vec2 uv = smProj(wp, wn);
  vec3 m = vec3(1.0);

  if (id == 1) {                                  // ASPHALT
    float g = smFbm(uv * 9.0);
    float blotch = smNoise(uv * 0.32);
    m *= 0.90 + g * 0.15 + blotch * 0.11;
    float track = abs(fract(uv.x * 0.5) - 0.5);   // worn wheel paths
    m *= 1.0 - smoothstep(0.33, 0.5, track) * 0.07;
    sInt = 0.09; sPow = 14.0;
  } else if (id == 3) {                           // SIDEWALK — cast panels
    float joint = max(abs(fract(uv.x / 1.2) - 0.5), abs(fract(uv.y / 1.2) - 0.5));
    m *= 1.0 - smoothstep(0.455, 0.5, joint) * 0.22;
    m *= 0.94 + smFbm(uv * 6.0) * 0.11;
    sInt = 0.04; sPow = 20.0;
  } else if (id == 4) {                           // PLASTER — mottle + rain streaks
    m *= 0.93 + smFbm(uv * 3.2) * 0.13;
    float streak = smNoise(vec2(uv.x * 26.0, uv.y * 0.45));
    m *= 1.0 - smoothstep(0.55, 1.0, streak) * 0.09;
    sInt = 0.03; sPow = 18.0;
  } else if (id == 5) {                           // BRICK — offset courses
    float row = floor(uv.y / 0.09);
    vec2 b = vec2(uv.x / 0.22 + mod(row, 2.0) * 0.5, uv.y / 0.09);
    vec2 f = abs(fract(b) - 0.5);
    float mortar = smoothstep(0.40, 0.47, max(f.x, f.y));
    m *= mix(0.93 + smHash21(floor(b)) * 0.12, 1.20, mortar);
    sInt = 0.03; sPow = 18.0;
  } else if (id == 6) {                           // GLASS — panes + sky reflection
    float pane = smHash21(floor(uv / vec2(1.05, 1.35)));
    m *= 0.72 + pane * 0.5;
    sInt = 0.55; sPow = 78.0;
  } else if (id == 7) {                           // METAL — brushed, glossy
    m *= 0.95 + smNoise(vec2(uv.x * 42.0, uv.y * 2.0)) * 0.10;
    sInt = 0.42; sPow = 56.0;
  } else if (id == 8) {                           // FOLIAGE — unprojected clumps
    m *= 0.88 + smFbm(wp.xz * 2.4 + wp.y * 0.7) * 0.24;
    sInt = 0.05; sPow = 12.0;
  } else if (id == 9) {                           // ROOF — gravel and patches
    m *= 0.90 + smNoise(uv * 24.0) * 0.13 + smNoise(uv * 1.4) * 0.09;
    sInt = 0.02; sPow = 14.0;
  } else if (id == 10) {                          // WOOD — grain along the run
    m *= 0.92 + smNoise(vec2(uv.x * 3.0, uv.y * 34.0)) * 0.15;
    sInt = 0.08; sPow = 26.0;
  } else if (id == 2) {                           // PAINT — road markings, wet sheen
    m *= 0.96 + smNoise(uv * 14.0) * 0.07;
    sInt = 0.22; sPow = 40.0;
  } else {                                        // CONCRETE, the default
    m *= 0.94 + smFbm(uv * 4.5) * 0.12;
    sInt = 0.05; sPow = 22.0;
  }
  return mix(vec3(1.0), m, fade);
}
`;

export function makeWorldMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uInterior = worldUniforms.uInterior;
    shader.uniforms.uSkyTint = worldUniforms.uSkyTint;
    shader.uniforms.uWorld = worldUniforms.uWorld;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aInterior;
attribute float aSurface;
varying float vInterior;
varying float vSurface;
varying vec3 vWPos;
varying vec3 vWNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vInterior = aInterior;
vSurface = aSurface;`)
      // objectNormal is still in scope here, and instanceMatrix has to be
      // applied by hand — worldpos_vertex is guarded on envmap/shadow defines
      // so we cannot rely on three's own worldPosition existing.
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 smWp = vec4(transformed, 1.0);
  vec3 smWn = objectNormal;
  #ifdef USE_INSTANCING
    smWp = instanceMatrix * smWp;
    smWn = mat3(instanceMatrix) * smWn;
  #endif
  vWPos = (modelMatrix * smWp).xyz;
  vWNormal = normalize(mat3(modelMatrix) * smWn);
}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uInterior;
uniform vec3 uSkyTint;
uniform vec4 uWorld;
varying float vInterior;
varying float vSurface;
varying vec3 vWPos;
varying vec3 vWNormal;
${NOISE_GLSL}${SURFACE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float smSpecInt = 0.0;
float smSpecPow = 24.0;
{
  // detail costs nothing past the fog line; the branch is coherent per triangle
  float smFade = uWorld.z * (1.0 - smoothstep(34.0, 78.0, length(vViewPosition)));
  diffuseColor.rgb *= smSurface(int(vSurface + 0.5), vWPos, normalize(vWNormal), smFade, smSpecInt, smSpecPow);
}`)
      // hijack the Lambert struct's unused specularStrength as the exponent
      .replace('#include <lights_lambert_fragment>', `#include <lights_lambert_fragment>
material.specularStrength = smSpecPow;`)
      .replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        `reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	vec3 smHalf = normalize( directLight.direction + geometryViewDir );
	reflectedLight.directSpecular += directLight.color * dotNL *
		pow( saturate( dot( geometryNormal, smHalf ) ), material.specularStrength );`,
      )
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.directSpecular *= smSpecInt;
{
  float smFres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 4.0);
  reflectedLight.indirectDiffuse += uSkyTint * smFres * smSpecInt * 0.6;
}`)
      .replace(
        '#include <opaque_fragment>',
        'outgoingLight = mix( outgoingLight, diffuseColor.rgb * uInterior * 3.2, vInterior );\n#include <opaque_fragment>',
      );
  };
  // one program for every world material
  mat.customProgramCacheKey = () => 'sm-world-v2';
  return mat;
}

// Geometry helpers -----------------------------------------------------------

// Ensure a geometry has COLOR + aInterior + aSurface attributes.
// EVERY geometry drawn with the world material must go through here: a missing
// aSurface would leave the shader reading an undefined generic vertex attribute.
export function tagGeometry(geo, color, interior = 0, shade = 1, surface = SURF.CONCRETE) {
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
  if (!geo.getAttribute('aSurface')) {
    const a = new Float32Array(n).fill(surface);
    geo.setAttribute('aSurface', new THREE.BufferAttribute(a, 1));
  }
  return geo;
}

// Retag an already-tagged geometry's surface id (used where a helper builds the
// geometry before the caller knows what it is made of).
export function setSurface(geo, surface) {
  const a = geo.getAttribute('aSurface');
  if (a) { a.array.fill(surface); a.needsUpdate = true; }
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
