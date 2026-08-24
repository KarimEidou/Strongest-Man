// WebGL renderer setup tuned for iPhone 17 Pro Max: DPR capped by the quality
// tier (low-poly gains nothing from 3), MSAA on (cheap on Apple GPUs), sRGB out.
//
// Tone mapping is NeutralToneMapping, not ACES: the palette in core/palette.js
// was authored to reach the screen unchanged, and ACES desaturates and hue-shifts
// exactly the orange family the whole art direction rests on. Neutral only rolls
// off highlights, which is all that is needed now that specular and a bright sun
// disc push values past 1.
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
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;
  renderer.info.autoReset = false; // reset manually so probes can read counts post-render

  let dprCap = 2;
  function resize(cap) {
    if (cap) dprCap = cap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  resize();
  window.addEventListener('resize', () => resize());
  window.addEventListener('orientationchange', () => setTimeout(() => resize(), 250));
  return { renderer, resize };
}
