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

// Measured once on first boot when quality is 'auto': render a handful of
// frames from the spawn viewpoint and pick a tier from the median cost.
export async function probeTier(renderer, scene, camera) {
  const samples = [];
  for (let i = 0; i < 24; i++) {
    const t0 = performance.now();
    renderer.render(scene, camera);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => requestAnimationFrame(r));
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const med = samples[Math.floor(samples.length / 2)] || 0;
  if (med < 7.5) return 'high';
  if (med < 13) return 'medium';
  return 'low';
}

export { THREE };
