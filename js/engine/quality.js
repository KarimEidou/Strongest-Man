// Graphics tiers. Everything in §D is on at `high`, which is the default —
// the brief was fidelity first. The lower tiers exist so the game still runs on
// older hardware and so a player can trade looks for framerate by hand.
//
// Note: shadowMap.enabled and toneMapping are three PROGRAM PARAMETERS, so
// switching tiers recompiles every material in the scene. That is fine at boot
// and fine on the settings screen (the game is paused and the panel covers the
// canvas), but it must never happen mid-play.
import * as THREE from 'three';
import { worldUniforms } from './materials.js';

export const TIER_NAMES = ['low', 'medium', 'high'];

export const TIERS = {
  low: {
    dpr: 1.25, detail: 0, shadows: false, shadowSize: 0, shadowEvery: 0,
    cloudLayers: 1, fbm: 2, godrays: 'off', godrayScale: 0, characterShadows: false,
    propShadows: false, pbr: false,
  },
  medium: {
    dpr: 1.75, detail: 0.65, shadows: 'pcf', shadowSize: 1024, shadowEvery: 6,
    cloudLayers: 1, fbm: 3, godrays: 'off', godrayScale: 0, characterShadows: false,
    propShadows: true, pbr: true,
  },
  high: {
    // 3072 rather than 2048: the ortho covers 68m and the extra texels are what
    // let a streetlamp's shadow read as a pole instead of a smear.
    dpr: 2, detail: 1, shadows: 'pcf', shadowSize: 3072, shadowEvery: 3,
    cloudLayers: 2, fbm: 4, godrays: 'full', godrayScale: 1, characterShadows: true,
    propShadows: true, pbr: true,
  },
};

export function tierOf(name) { return TIERS[name] || TIERS.high; }

export function applyQuality(name, ctx) {
  const t = tierOf(name);
  worldUniforms.uWorld.value.z = t.detail;
  ctx.resize?.(t.dpr);
  ctx.sky?.setTier(t);
  ctx.shadows?.setTier(t);
  ctx.godrays?.setTier(t);
  ctx.setCharacterShadows?.(t.characterShadows);
  return t;
}

// Measured once on first boot when quality is 'auto': how long does a frame from
// the spawn viewpoint actually cost this GPU?
//
// The previous version put `await requestAnimationFrame` INSIDE the timed
// region, so every sample was render-cost plus a wait for the next vsync — on a
// 60 Hz display that is ~16.7 ms whatever the GPU is doing, which is past the
// 13 ms 'medium' threshold. 'auto' could therefore never return anything but
// 'low', on any hardware, including hardware that runs 'high' at a locked 60.
//
// GL commands are queued, so timing a render() on its own measures the driver
// accepting work rather than doing it. Submit a BATCH, then force a sync by
// reading one pixel back — the read cannot return until the queue has drained —
// and divide. Two batches, and only the second is scored: the first pays for
// pipeline warm-up and any program still compiling.
export async function probeTier(renderer, scene, camera) {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const BATCH = 8;
  const runBatch = () => {
    const t0 = performance.now();
    for (let i = 0; i < BATCH; i++) renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // sync point
    return (performance.now() - t0) / BATCH;
  };
  runBatch();                                     // warm-up, discarded
  await new Promise((r) => requestAnimationFrame(r));
  const perFrame = runBatch();
  if (perFrame < 7.5) return 'high';
  if (perFrame < 13) return 'medium';
  return 'low';
}

export { THREE };
