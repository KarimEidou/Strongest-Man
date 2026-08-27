// WebGL renderer setup tuned for iPhone 17 Pro Max: DPR capped by the quality
// tier (low-poly gains nothing from 3), MSAA on (cheap on Apple GPUs), sRGB out.
//
// Tone mapping is NeutralToneMapping, not ACES: the palette in core/palette.js
// was authored to reach the screen unchanged, and ACES desaturates and hue-shifts
// exactly the orange family the whole art direction rests on. Neutral only rolls
// off highlights, which is all that is needed now that specular and a bright sun
// disc push values past 1.
import * as THREE from 'three';
import { onViewportChange } from './viewport.js';

// Context loss is not an edge case on iOS. Safari purges WebGL contexts on
// memory pressure, on backgrounding, and reliably when a phone call arrives —
// and without a handler the browser never even tries to give one back: the
// default action of webglcontextlost IS "give up", and preventDefault() is what
// asks for a restore. Skip it and the player comes back from a call to a black
// screen with no way out but a relaunch.
const listeners = { lost: new Set(), restored: new Set() };
export function onContextLost(fn) { listeners.lost.add(fn); return () => listeners.lost.delete(fn); }
export function onContextRestored(fn) { listeners.restored.add(fn); return () => listeners.restored.delete(fn); }

let contextLost = false;
export function isContextLost() { return contextLost; }

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
  onViewportChange(() => resize());

  canvas.addEventListener('webglcontextlost', (e) => {
    // Without this the context is gone for good.
    e.preventDefault();
    contextLost = true;
    for (const fn of listeners.lost) { try { fn(); } catch { /* keep going */ } }
  }, false);

  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    // three re-initialises its own GL state and re-uploads every geometry,
    // texture and program on the next render; what it cannot know is the state
    // WE set on the renderer object, so that is put back here.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.info.autoReset = false;
    for (const fn of listeners.restored) { try { fn(); } catch { /* keep going */ } }
  }, false);

  return { renderer, resize };
}
