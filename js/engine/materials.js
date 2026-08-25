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
  // Emissive at night. They look like their day-time cousins (LAMP shades like
  // METAL, WINDOW like GLASS) — the difference lives entirely in smNightGlow.
  LAMP: 11,
  WINDOW: 12,
};

// How many streetlamps light the world at once. engine/citylights.js keeps the
// nearest this many loaded, so the fragment loop is a fixed, small cost and the
// ones that drop out are past their pool radius anyway. 16 rather than 12
// because POOL_R doubled: a junction now has four lamps inside one pool radius
// of the player and the old list ran out mid-crossing.
export const LAMP_SLOTS = 16;
// Horizontal footprint of one lamp, in metres. 6.0 was a pool that never reached
// the asphalt — the head stands on the pavement 5.4m up and the road is 10m wide
// (world/city.js ROAD.half), so the light died at the kerb. 12 carries it across
// both lanes. LAMP_SOFT is the inverse-square softening radius; at roughly the
// head height it puts the knee of the falloff level with the ground under the
// lamp instead of below it, which is what keeps the core from blowing out.
export const POOL_R = 12.0;
const LAMP_SOFT = 5.5;
// Added straight to outgoingLight, so these are linear multiples of uLampCol.
// The ground gets twice what everything else does: it is the surface you steer
// by, and wet asphalt bounces sodium light back up. Both are more than double the
// old 0.17, but the number that really moved is the AREA — the old ramp was
// already at zero 6m out, where this still delivers a fifth of the core, and it
// delivers it to facades, benches, cars and people as well as to the tarmac.
// Masking every lamp slot off and re-shooting the same frame: a road pool core
// RGB(16, 34, 75) -> RGB(104, 84, 77), the facade beside the lamp
// RGB(0, 29, 106) -> RGB(38, 28, 100), the lamp's own post RGB(1, 7, 29) ->
// RGB(30, 15, 17). Pushed past ~0.6/0.3 the tails of neighbouring lamps stack
// and the whole street becomes one ochre sheet with the buildings washed pink.
const LAMP_GROUND = 0.38;
const LAMP_SIDE = 0.19;

// Shared uniform objects: onBeforeCompile hands the SAME object to every
// material, so engine/sky.js mutates one value and the whole world follows.
export const worldUniforms = {
  uInterior: { value: new THREE.Color(PAL.interiorDim) },
  uSkyTint: { value: new THREE.Color(PAL.skyLight) },
  // x = time of day 0..1, y = night 0..1, z = detail strength, w = spare
  uWorld: { value: new THREE.Vector4(0.78, 0, 1, 0) },
  // xyz = a streetlamp head, w = 1 when the slot is in use
  uLamps: { value: Array.from({ length: LAMP_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLampCol: { value: new THREE.Color(PAL.glassGlow) },
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
  if (id == 11) id = 7;                           // LAMP lens: brushed metal by day
  if (id == 12) id = 6;                           // WINDOW: ordinary glass by day
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

// Night lighting, such as it is: the city has no point lights and no emissive
// maps — there is exactly one HemisphereLight and one DirectionalLight in the
// whole scene, and adding real lights would cost a program per light count and a
// draw-call storm on the phone this is built for (see engine/quality.js). So the
// lamps, the windows and the pools of light they throw are all one additive term
// in the shared shader, scaled by uWorld.y — the 0..1 night factor engine/sky.js
// writes every frame.
//
// This half of it is surface-agnostic and lives on its own so the character
// material can reuse it: same GLSL, same uLamps array, no second copy and no
// second set of uniforms. See applyLampLighting below.
export const LAMP_GLSL = `
uniform vec4 uLamps[${LAMP_SLOTS}];
uniform vec3 uLampCol;

// One accumulated lamp term with a real N·L against each HEAD. uLamps[i].y — the
// 5.4m gooseneck height engine/citylights.js has always uploaded and that
// nothing read until now — is what makes this light instead of a decal: the road
// under a lamp takes a full dot, the facade beside it a grazing one, and a
// person walking through the pool is lit from above and to the side like
// everything around him. The old term was max(wn.y, 0.0), i.e. UPWARD-FACING
// GROUND ONLY, which is why a player standing directly under a streetlamp was
// shaded exactly as if it were switched off.
float smLampLight(vec3 wp, vec3 wn) {
  float k = 0.0;
  for (int i = 0; i < ${LAMP_SLOTS}; i++) {
    if (uLamps[i].w < 0.5) continue;
    vec3 d = uLamps[i].xyz - wp;
    float dd = max(dot(d, d), 1e-4);
    float nl = max(dot(wn, d) * inversesqrt(dd), 0.0);
    // A soft-windowed inverse square, not a ramp. The old squared LINEAR falloff
    // was fine at POOL_R 6; stretched to 12 it is nearly flat across the middle
    // 8m, and with the lamps ~18m apart the tails stack into exactly the
    // continuous orange carpet the earlier smoothstep-on-squared-distance
    // attempt produced. 1/(1 + d²/K²) keeps a bright core under the head and a
    // thin tail instead, and the (1 - r²/R²)³ window drives the value AND its
    // slope to zero at the rim, so a lamp leaving the slot list cannot pop.
    // Cubed, not squared: the far kerb is 10m out and the next lamp 18m, barely
    // a factor of two between "reaches the road" and "merges with the
    // neighbour". Squared washed the street flat; cubed holds 28% of the core
    // at the centre line and 2% by 9m. r is horizontal, so the pool's footprint
    // on the ground is exactly POOL_R whatever the head height.
    float w = max(0.0, 1.0 - dot(d.xz, d.xz) * ${(1 / (POOL_R * POOL_R)).toFixed(6)});
    k += nl * w * w * w / (1.0 + dd * ${(1 / (LAMP_SOFT * LAMP_SOFT)).toFixed(6)});
  }
  return min(k, 1.25);
}

// Everything that is not road, lens or window: walls, props, cars, trees,
// debris — and characters, through makeCharacterMaterial reusing this file.
vec3 smLampGlow(vec3 wp, vec3 wn) {
  return uLampCol * smLampLight(wp, wn) * ${LAMP_SIDE.toFixed(2)};
}
`;

// The world material's own share: the two emissive ids, and the hotter ground.
const NIGHT_GLSL = `
vec3 smNightGlow(int id, vec3 wp, vec3 wn) {
  if (id == 11) return uLampCol * 1.45;                    // the lens itself
  if (id == 12) {                                          // windows: some rooms lit
    float cell = smHash21(vec2(floor(wp.x / 2.0) * 3.7 + floor(wp.z / 2.0) * 11.3,
                               floor(wp.y / 3.0)));
    return uLampCol * step(0.44, cell) * (0.22 + cell * 0.38);
  }
  // the ground under the lamps — pools, not a wash, so the street still reads
  if (id == 1 || id == 3 || id == 2) return uLampCol * smLampLight(wp, wn) * ${LAMP_GROUND.toFixed(2)};
  return smLampGlow(wp, wn);
}
`;

// Attach the lamp pools to any material whose shader three is about to compile.
// It owns the vWPos/vWNormal varyings, the uniform bindings and the additive
// term, so the world material and the (separately authored) skinned character
// material differ only in the `glow` expression they hand in.
//
// CALL IT LAST. Both injection points prepend, so whatever is inserted last ends
// up FIRST in the fragment prelude — which is how smLampLight comes out declared
// above the world's smNightGlow that calls it — and LAST at opaque_fragment,
// after the interior override has had its say about outgoingLight.
//
// The vertex hook sits on project_vertex, which in every three vertex shader
// comes after the skinning chunks, so `transformed` and `objectNormal` are
// already posed by the time this reads them. instanceMatrix has to be applied by
// hand: worldpos_vertex is guarded on envmap/shadow defines, so three's own
// worldPosition cannot be relied on to exist.
export function applyLampLighting(shader, glow = 'smLampGlow(vWPos, normalize(vWNormal))') {
  shader.uniforms.uWorld = worldUniforms.uWorld;
  shader.uniforms.uLamps = worldUniforms.uLamps;
  shader.uniforms.uLampCol = worldUniforms.uLampCol;

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNormal;`)
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
uniform vec4 uWorld;
varying vec3 vWPos;
varying vec3 vWNormal;
${LAMP_GLSL}`)
    .replace('#include <opaque_fragment>', `outgoingLight += (${glow}) * uWorld.y;
#include <opaque_fragment>`);
}

export function makeWorldMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uInterior = worldUniforms.uInterior;
    shader.uniforms.uSkyTint = worldUniforms.uSkyTint;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aInterior;
attribute float aSurface;
varying float vInterior;
varying float vSurface;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vInterior = aInterior;
vSurface = aSurface;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uInterior;
uniform vec3 uSkyTint;
varying float vInterior;
varying float vSurface;
${NOISE_GLSL}${SURFACE_GLSL}${NIGHT_GLSL}`)
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
        `outgoingLight = mix( outgoingLight, diffuseColor.rgb * uInterior * 3.2, vInterior );
#include <opaque_fragment>`,
      );

    // last, per the ordering note on applyLampLighting. A revealed interior is
    // masked out of it: the lamp is on the far side of the wall, and now that
    // every surface id takes lamp light — not just the three ground ones — a
    // smashed-open room would otherwise glow orange from the street outside.
    applyLampLighting(shader,
      'smNightGlow( int( vSurface + 0.5 ), vWPos, normalize( vWNormal ) ) * ( 1.0 - vInterior )');
  };
  // one program for every world material
  mat.customProgramCacheKey = () => 'sm-world-v4';
  return mat;
}

// The characters — player, 48 townsfolk, monsters — are skinned GLB meshes and
// never went through makeWorldMaterial, so they missed everything it does. Most
// of that they should miss: they have no aSurface attribute and want no
// procedural brickwork. But two things they very much needed.
//
// The lamps: smNightGlow only ever ran on the world material, so a man standing
// directly under a streetlamp at midnight was shaded exactly as if it were off —
// which, with the old night keys, meant a black silhouette. applyLampLighting is
// factored for precisely this: same GLSL, same uLamps array, no second copy.
//
// And a specular lobe with a sky-tinted rim, at cloth/skin strength rather than
// the world's per-surface table. Lambert alone gives a figure no highlight and no
// silhouette separation from the wall behind it, which is most of why the models
// read as flat next to the buildings.
const CHAR_SPEC = 0.17, CHAR_POW = 26.0, CHAR_RIM = 0.55;

export function makeCharacterMaterial(src) {
  const mat = new THREE.MeshLambertMaterial({
    map: src?.map || null,
    color: src?.color ? src.color.clone() : new THREE.Color(1, 1, 1),
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSkyTint = worldUniforms.uSkyTint;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uSkyTint;`)
      // same trick the world material uses: Lambert's struct carries an unused
      // specularStrength, so it is free storage for the exponent
      .replace('#include <lights_lambert_fragment>', `#include <lights_lambert_fragment>
material.specularStrength = ${CHAR_POW.toFixed(1)};`)
      .replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        `reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	vec3 smHalf = normalize( directLight.direction + geometryViewDir );
	reflectedLight.directSpecular += directLight.color * dotNL *
		pow( saturate( dot( geometryNormal, smHalf ) ), material.specularStrength ) * ${CHAR_SPEC.toFixed(2)};`,
      )
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  float smFres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 4.0);
  reflectedLight.indirectDiffuse += uSkyTint * smFres * ${CHAR_RIM.toFixed(2)};
}`);
    applyLampLighting(shader);   // last, per the ordering note above
  };
  // one program for every character, skinned or not
  mat.customProgramCacheKey = () => 'sm-char-v1';
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
