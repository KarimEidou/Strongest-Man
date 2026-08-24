// WebGL renderer setup tuned for iPhone 17 Pro Max: DPR capped at 2 (low-poly
// gains nothing from 3), MSAA on (cheap on Apple GPUs), sRGB out, no tone
// mapping so the authored palette ships to the screen unchanged.
import * as THREE from 'three';
import { settings } from '../core/state.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.info.autoReset = false; // reset manually so probes can read counts post-render

  function resize() {
    const dprCap = settings.quality === 'low' ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  return { renderer, resize };
}
