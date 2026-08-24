// Procedural sky, fog and the two scene lights, all driven by one time-of-day
// value. The dome is a shader sphere: horizon-to-zenith gradient, sun disc with
// halo and bloom, and two FBM cloud layers projected onto a flat plane so they
// foreshorten correctly toward the horizon. Its bottom band fades into
// scene.fog's colour, so the sky and the fogged geometry meet by construction
// instead of by eye.
//
// It renders last (renderOrder 999) with depth testing on, so early-Z rejects
// most of its pixels — which is what makes a multi-octave sky affordable.
import * as THREE from 'three';
import { PAL, SKY_KEYS } from '../core/palette.js';
import { worldUniforms } from './materials.js';

export const FOG_NEAR = 90;
export const FOG_FAR = 210;
const SKY_R = 290;              // inside the camera's 300 far plane

const VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform vec3 uZenith, uHorizon, uFog, uSunCol;
uniform vec3 uSunDir;
uniform vec2 uWind;
uniform float uCover, uNight;
varying vec3 vDir;

// three already prefixes ShaderMaterial fragments with the tonemapping and
// colorspace pars chunks; including them again redefines their functions.
#include <common>

float skHash(vec2 p) {
  p = fract(p * vec2(127.31, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float skNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skHash(i), skHash(i + vec2(1.0, 0.0)), f.x),
             mix(skHash(i + vec2(0.0, 1.0)), skHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float skFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < FBM_OCTAVES; i++) { v += a * skNoise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 sky = mix(uHorizon, uZenith, pow(max(d.y, 0.0), 0.42));

  // sun: hard disc, tight halo, wide bloom
  float sd = max(dot(d, uSunDir), 0.0);
  sky += uSunCol * (pow(sd, 900.0) * 7.0 + pow(sd, 14.0) * 0.38 + pow(sd, 3.0) * 0.11);

  // Clouds live on a plane above the camera; dividing by d.y gives the correct
  // perspective flattening toward the horizon. The plane sits ~1 unit up, so cp
  // is ~1 overhead and grows without bound toward the horizon, and the frequency
  // has to make that span several cells.
  //
  // Everything below the horizon band is masked out anyway, so gate the whole
  // FBM on it — that is half the screen's worth of multi-octave noise skipped,
  // and the branch is perfectly coherent (it is a horizontal split).
  float band = smoothstep(0.015, 0.16, d.y);
  if (band > 0.002) {
    vec2 cp = d.xz / max(d.y, 0.045);
    float c = smoothstep(uCover, uCover + 0.16, skFbm(cp * 1.15 + uWind));
    #if CLOUD_LAYERS > 1
      c = max(c, smoothstep(uCover + 0.10, uCover + 0.26, skFbm(cp * 0.42 + uWind * 0.45 + 31.7)) * 0.7);
    #endif
    float lit = 0.52 + 0.48 * pow(max(dot(normalize(vec3(cp.x, 42.0, cp.y)), uSunDir), 0.0), 2.0);
    vec3 cloudCol = mix(uFog * 0.82, uSunCol, lit) * (1.0 - 0.42 * uNight);
    sky = mix(sky, cloudCol, c * band);
  }

  // fuse the bottom band into the scene fog
  sky = mix(sky, uFog, smoothstep(0.16, -0.03, d.y));

  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const A = new THREE.Color(), B = new THREE.Color();
const sample = {
  zenith: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(),
  sun: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
  sunI: 1, hemiI: 1, night: 0, cover: 0.5,
};

// linear interpolation across the keyframe table
export function sampleSky(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].t < t) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const k = Math.min(Math.max((t - a.t) / Math.max(b.t - a.t, 1e-5), 0), 1);
  const col = (name) => sample[name].copy(A.setHex(a[name])).lerp(B.setHex(b[name]), k);
  col('zenith'); col('horizon'); col('fog'); col('sun'); col('hemiSky'); col('hemiGround');
  sample.sunI = a.sunI + (b.sunI - a.sunI) * k;
  sample.hemiI = a.hemiI + (b.hemiI - a.hemiI) * k;
  sample.night = a.night + (b.night - a.night) * k;
  sample.cover = a.cover + (b.cover - a.cover) * k;
  return sample;
}

export async function initSky(scene, renderer, tier = {}) {
  const uniforms = {
    uZenith: { value: new THREE.Color(PAL.navyBg) },
    uHorizon: { value: new THREE.Color(PAL.fog) },
    uFog: { value: new THREE.Color(PAL.fog) },
    uSunCol: { value: new THREE.Color(PAL.sun) },
    uSunDir: { value: new THREE.Vector3(-0.6, 0.35, -0.35).normalize() },
    uWind: { value: new THREE.Vector2() },
    uCover: { value: 0.5 },
    uNight: { value: 0.14 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    defines: {
      FBM_OCTAVES: tier.fbm ?? 4,
      CLOUD_LAYERS: tier.cloudLayers ?? 2,
    },
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 32, 16), material);
  dome.frustumCulled = false;
  dome.renderOrder = 999;      // last in the opaque pass: early-Z kills most of it
  dome.name = 'sky';
  scene.add(dome);
  scene.background = null;

  scene.fog = new THREE.Fog(PAL.fog, FOG_NEAR, FOG_FAR);

  const hemi = new THREE.HemisphereLight(PAL.skyLight, PAL.groundBounce, 1.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PAL.sun, 2.1);
  sun.position.set(-60, 46, -35);
  scene.add(sun);
  // a light's target must be in the scene and have its matrix updated by hand
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);

  const sunDir = new THREE.Vector3(-0.6, 0.35, -0.35).normalize();
  const wind = new THREE.Vector2();

  function frameUpdate(dt, timeOfDay, camera) {
    const s = sampleSky(timeOfDay);

    // sun sweeps the sky over the day; at t = 0.70 this reproduces the low warm
    // dusk sun the art was authored around
    const sinE = Math.sin((timeOfDay - 0.25) * Math.PI * 2) * 0.9;   // sine of elevation
    const cosE = Math.sqrt(Math.max(0, 1 - sinE * sinE));
    const azim = (timeOfDay - 0.70) * Math.PI * 2 - 2.10;
    sunDir.set(Math.sin(azim) * cosE, Math.max(sinE, -0.35), Math.cos(azim) * cosE).normalize();

    wind.x += dt * 0.010;
    wind.y += dt * 0.006;

    uniforms.uZenith.value.copy(s.zenith);
    uniforms.uHorizon.value.copy(s.horizon);
    uniforms.uFog.value.copy(s.fog);
    uniforms.uSunCol.value.copy(s.sun);
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uWind.value.copy(wind);
    uniforms.uCover.value = s.cover;
    uniforms.uNight.value = s.night;

    scene.fog.color.copy(s.fog);
    hemi.color.copy(s.hemiSky);
    hemi.groundColor.copy(s.hemiGround);
    hemi.intensity = s.hemiI;
    sun.color.copy(s.sun);
    sun.intensity = s.sunI;

    // the shared world material tints its fresnel rim with the sky
    worldUniforms.uSkyTint.value.copy(s.hemiSky);
    worldUniforms.uWorld.value.x = timeOfDay;
    worldUniforms.uWorld.value.y = s.night;

    if (camera) dome.position.copy(camera.position);
  }

  function setTier(t) {
    material.defines.FBM_OCTAVES = t.fbm;
    material.defines.CLOUD_LAYERS = t.cloudLayers;
    material.needsUpdate = true;
  }

  return { sun, hemi, sunDir, dome, frameUpdate, setTier, sample: () => sample };
}
