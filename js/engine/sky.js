// Skybox (generated equirect), fog matched to its horizon band, and the two
// scene lights. Fog doubles as the cull curtain: nothing spawns or despawns
// inside it, so nothing ever pops.
import * as THREE from 'three';
import { PAL } from '../core/palette.js';

export const FOG_NEAR = 90;
export const FOG_FAR = 210;

export async function initSky(scene, renderer) {
  const tex = await new THREE.TextureLoader().loadAsync('./assets/tex/sky_equirect.webp');
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
  scene.backgroundIntensity = 1.0;

  scene.fog = new THREE.Fog(PAL.fog, FOG_NEAR, FOG_FAR);

  const hemi = new THREE.HemisphereLight(PAL.skyLight, PAL.groundBounce, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PAL.sun, 1.35);
  sun.position.set(-60, 46, -35); // low warm dusk sun
  scene.add(sun);
  return { sun, hemi };
}
