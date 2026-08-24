// Sun shafts, hand-rolled — no post-processing addon is vendored, and pulling
// EffectComposer in for one effect is not worth the bytes.
//
// The expensive part of a god-ray pass is normally the occlusion mask: a second
// full scene render. Here it is nearly free, because the shadow rig already
// maintains an InstancedMesh of black building/car boxes, and it also lives on
// layer 3. Rendering the scene through a camera restricted to layer 3 draws
// exactly two things at quarter resolution: those boxes and a white sun disc.
//
//   1. mask   — sun disc (white) occluded by layer-3 proxies (black), ¼ res
//   2. blur   — 12-tap radial blur away from the sun's screen position
//   3. compos — additive fullscreen quad over the main render
import * as THREE from 'three';
import { LAYER_OCCLUDER } from './shadows.js';

const BLUR_FRAG = `
uniform sampler2D tMask;
uniform vec2 uSun;
uniform float uDensity, uDecay, uWeight;
varying vec2 vUv;
void main() {
  vec2 delta = (vUv - uSun) * (uDensity / 12.0);
  vec2 uv = vUv;
  float illum = 1.0, acc = 0.0;
  for (int i = 0; i < 12; i++) {
    uv -= delta;
    acc += texture2D(tMask, clamp(uv, 0.0, 1.0)).r * illum * uWeight;
    illum *= uDecay;
  }
  gl_FragColor = vec4(vec3(acc), 1.0);
}`;

const COMPOSITE_FRAG = `
uniform sampler2D tRays;
uniform vec3 uTint;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float r = texture2D(tRays, vUv).r;
  gl_FragColor = vec4(uTint * r * uStrength, 1.0);
}`;

const QUAD_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NDC = new THREE.Vector3();

export function initGodrays(renderer, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const rtOpts = { depthBuffer: true, stencilBuffer: false };
  let maskRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  let rayRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });

  // white disc, parked along the sun direction, camera-facing
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
  );
  sunDisc.frustumCulled = false;
  sunDisc.layers.set(LAYER_OCCLUDER);
  sunDisc.scale.setScalar(22);
  sunDisc.name = 'sunDisc';

  const maskCam = new THREE.PerspectiveCamera();

  const blurMat = new THREE.ShaderMaterial({
    uniforms: {
      tMask: { value: null },
      uSun: { value: new THREE.Vector2(0.5, 0.5) },
      uDensity: { value: 0.85 },
      uDecay: { value: 0.94 },
      uWeight: { value: 0.09 },
    },
    vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG,
    depthTest: false, depthWrite: false,
  });
  const compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      tRays: { value: rayRT.texture },
      uTint: { value: new THREE.Color(0xffd7a8) },
      uStrength: { value: 0 },
    },
    vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG,
    transparent: true, blending: THREE.AdditiveBlending,
    depthTest: false, depthWrite: false,
  });

  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quadScene = new THREE.Scene();
  const blurQuad = new THREE.Mesh(quad, blurMat);
  blurQuad.frustumCulled = false;
  quadScene.add(blurQuad);
  const quadCam = new THREE.Camera();

  const compScene = new THREE.Scene();
  const compQuad = new THREE.Mesh(quad, compositeMat);
  compQuad.frustumCulled = false;
  compScene.add(compQuad);

  let enabled = false, scale = 1, strength = 0;

  function resize() {
    renderer.getSize(size);
    const w = Math.max(2, Math.floor(size.x / 4));
    const h = Math.max(2, Math.floor(size.y / 4));
    maskRT.setSize(w, h);
    rayRT.setSize(w, h);
  }
  resize();
  addEventListener('resize', () => setTimeout(resize, 60));

  // false when the sun is behind, below the horizon, or well off screen
  function prepare(cam, sunDir, tint) {
    if (!enabled) return false;
    if (sunDir.y < 0.02) return false;

    sunDisc.position.copy(cam.position).addScaledVector(sunDir, 260);
    sunDisc.quaternion.copy(cam.quaternion);
    sunDisc.updateMatrixWorld();

    NDC.copy(sunDisc.position).project(cam);
    if (NDC.z > 1) return false;                        // behind the camera

    blurMat.uniforms.uSun.value.set((NDC.x + 1) / 2, (NDC.y + 1) / 2);
    // ease out as the sun leaves the frame, and as it sets
    const off = Math.max(Math.abs(NDC.x), Math.abs(NDC.y));
    const edge = 1 - Math.min(1, Math.max(0, (off - 0.7) / 1.1));
    const alt = Math.min(1, (sunDir.y - 0.02) / 0.22);
    strength = edge * alt * scale;
    if (strength <= 0.002) return false;
    compositeMat.uniforms.uStrength.value = strength;
    if (tint) compositeMat.uniforms.uTint.value.copy(tint);

    maskCam.copy(cam);
    maskCam.layers.set(LAYER_OCCLUDER);                 // copy() brings layers over
    return true;
  }

  // MUST run before the main render: renderer.shadowMap.needsUpdate is consumed
  // by whichever render() comes next, so the shadow flag is set between the two.
  function renderMask(scene) {
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    scene.add(sunDisc);
    renderer.setRenderTarget(maskRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, maskCam);
    scene.remove(sunDisc);

    blurMat.uniforms.tMask.value = maskRT.texture;
    renderer.setRenderTarget(rayRT);
    renderer.clear();
    renderer.render(quadScene, quadCam);

    renderer.setRenderTarget(null);
    renderer.setClearColor(prevClear, prevAlpha);
  }

  function composite() {
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(compScene, quadCam);
    renderer.autoClear = prevAuto;
  }

  function setTier(t) {
    enabled = t.godrays === 'full';
    scale = t.godrayScale ?? 1;
  }

  return {
    prepare, renderMask, composite, setTier, resize,
    get enabled() { return enabled; },
    get strength() { return strength; },
  };
}
