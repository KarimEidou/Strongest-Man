// One debounced source of truth for "the window changed shape".
//
// There used to be three separate listeners: the renderer on resize AND
// orientationchange (the latter behind a 250 ms setTimeout), the camera on
// resize only, and the god-ray pass on resize with a 60 ms one. So a rotation
// could leave the camera's aspect, the canvas size and the ray targets each
// describing a different viewport for a quarter of a second — and on the paths
// where iOS fires orientationchange without a following resize, the camera's
// aspect stayed wrong until something else happened to trigger one.
//
// Every listener now fires twice per change: immediately, because most changes
// are instantaneous and waiting looks broken, and again after SETTLE ms, because
// iOS reports the OLD innerWidth/innerHeight for a moment during a rotation and
// the second call is the one that gets it right. Handlers here are idempotent by
// construction — they set a size, they do not accumulate — so being called twice
// costs one extra setSize and nothing else.
const SETTLE = 260;

const listeners = new Set();
let timer = 0;

function fire() {
  for (const fn of listeners) {
    try { fn(window.innerWidth, window.innerHeight); } catch { /* one bad listener must not stop the rest */ }
  }
}

function schedule() {
  fire();
  clearTimeout(timer);
  timer = setTimeout(fire, SETTLE);
}

addEventListener('resize', schedule);
addEventListener('orientationchange', schedule);
// visualViewport is the only thing that reports the iOS keyboard and the URL bar
// collapsing; neither fires a plain resize in a standalone PWA.
window.visualViewport?.addEventListener('resize', schedule);

export function onViewportChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Test hook: force the whole chain without waiting on a real rotation.
export function fireViewportChange() { fire(); }
