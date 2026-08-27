// Every screen the verification matrix covers.
//
// A scene is: the query string it boots with, and a `setup` run in the page once
// window.__ready is true. `setup` may return a promise. `steps` is how many
// FIXED simulation steps to run after setup before the shutter — deterministic,
// because ?capture=1 makes the frame loop use a fixed dt and freezes the clock,
// the shake and the day cycle (see js/core/loop.js and js/core/debug.js).
//
// `portraitOnly` scenes are captured in portrait only; everything else is
// captured in both landscape orientations on every device.

const BASE = 'autoplay=1&seed=42&capture=1&nomonsters=1&nogroq=1';
const DAY = `${BASE}&time=0.42`;      // late morning: the brightest the city gets
const DUSK = `${BASE}&time=0.70`;     // the palette's home stop
const NIGHT = `${BASE}&time=0.02`;    // the darkest, for HUD contrast

export const SCENES = [
  // ---- shell -------------------------------------------------------------
  {
    id: 'title',
    query: 'seed=42&capture=1',
    note: 'Title screen: logo, PLAY/SETTINGS, add-to-home tip, version.',
    setup: () => { document.getElementById('loading').hidden = true; },
    steps: 0,
  },
  {
    id: 'loading',
    query: 'seed=42&capture=1',
    note: 'Boot progress bar mid-load. Nothing may sit under the notch.',
    setup: () => {
      const l = document.getElementById('loading');
      l.hidden = false;
      document.getElementById('loading-fill').style.width = '62%';
      document.getElementById('loading-msg').textContent = 'destruction…';
    },
    steps: 0,
  },
  {
    id: 'settings',
    query: 'seed=42&capture=1',
    note: 'Settings panel: every control, including the long Groq hint.',
    setup: () => document.getElementById('btn-settings').click(),
    steps: 0,
  },
  {
    id: 'shop',
    query: DUSK,
    note: 'Armoury with a full balance, so every row shows its live state.',
    setup: () => { window.__test.setPoints(9000); document.getElementById('btn-shop').click(); },
    steps: 0,
  },
  {
    id: 'pause',
    query: DUSK,
    note: 'Pause overlay over live gameplay.',
    setup: () => document.getElementById('btn-pause').click(),
    steps: 0,
  },

  // ---- HUD ---------------------------------------------------------------
  {
    id: 'hud-idle',
    query: DUSK,
    note: 'HUD at rest: full health, zero points, fists.',
    setup: null,
    steps: 30,
  },
  {
    id: 'hud-bright',
    query: DAY,
    note: 'HUD over the brightest daylight the palette reaches — contrast test.',
    setup: () => window.__test.warpTo(2.5, -30, Math.PI),
    steps: 30,
  },
  {
    id: 'hud-dark',
    query: NIGHT,
    note: 'HUD at night — the other end of the contrast test.',
    setup: () => window.__test.warpTo(2.5, -30, Math.PI),
    steps: 30,
  },
  {
    id: 'hud-stress',
    query: DUSK,
    note: 'Worst case: 1 hp, maximum points, longest weapon rail, ammo empty, '
      + 'longest reputation string, longest toast. Everything that can overflow, does.',
    setup: () => window.__test.hudStress(),
    steps: 30,
  },
  {
    id: 'hud-down',
    query: DUSK,
    note: 'DOWN banner and the points forfeit.',
    setup: () => window.__test.hurtPlayer(999),
    steps: 90,
  },

  // ---- world -------------------------------------------------------------
  {
    id: 'street',
    query: DUSK,
    note: 'Spawn view: the road, the pavement, traffic and the gallery facade.',
    setup: null,
    steps: 60,
  },
  {
    id: 'landmark',
    query: DAY,
    note: 'The samosa landmark, for asset and signage quality.',
    setup: () => window.__test.warpTo(30, -30, Math.PI * 0.25),
    steps: 30,
  },

  // ---- museum ------------------------------------------------------------
  {
    id: 'museum-exterior',
    query: DAY,
    note: 'Gallery facade from across the road: pilasters, entablature, sign, steps.',
    setup: () => { const m = window.__test.museum(); window.__test.warpTo(3.0, m.door.z, Math.PI / 2); },
    steps: 30,
  },
  {
    id: 'museum-entrance',
    query: DAY,
    note: 'On the forecourt at the door. Threshold, surround, plinth.',
    setup: () => { const m = window.__test.museum(); window.__test.warpTo(m.door.x - 0.6, m.door.z, Math.PI / 2); },
    steps: 30,
  },
  {
    id: 'museum-hall',
    query: DAY,
    note: 'Main hall looking at the north wall: two works, benches, stanchions.',
    setup: () => window.__test.warpTo(-14.0, 20.0, Math.PI / 2),
    steps: 30,
  },
  {
    id: 'museum-hall-wide',
    query: DAY,
    note: 'Main hall from the doorway: floor, lining, cornice, ceiling, reception.',
    setup: () => window.__test.warpTo(-10.5, 23.5, Math.PI / 2),
    steps: 30,
  },
  {
    id: 'museum-alcove',
    query: DAY,
    note: 'Through the partition into the alcove: the fourth work.',
    setup: () => window.__test.warpTo(-20.0, 31.0, Math.PI),
    steps: 30,
  },
  {
    id: 'museum-prompt',
    query: DAY,
    note: 'Proximity prompt live, in the look half, clear of the joystick region.',
    setup: () => {
      const w = window.__test.museum().works[0];
      window.__test.warpTo(w.viewX, w.viewZ, Math.atan2(w.viewX - w.x, w.viewZ - w.z));
    },
    steps: 30,
  },
];

// One scene per artwork, head-on, plus one per plaque cropped to the plate, plus
// one per artwork in inspect mode. Generated rather than written out, so adding a
// fifth work to assets/art/plaques.json extends the matrix with no edit here.
export function artworkScenes(works) {
  const out = [];
  for (const w of works) {
    out.push({
      id: `art-${w.slug}`,
      query: DAY,
      note: `"${w.title}" head-on: native aspect, even lighting, frame depth, contact shadow.`,
      setup: `(() => { const w = window.__test.museum().works.find(k => k.slug === '${w.slug}');
        window.__test.warpTo(w.viewX, w.viewZ, Math.atan2(w.viewX - w.x, w.viewZ - w.z)); })()`,
      steps: 30,
    });
    out.push({
      id: `plaque-${w.slug}`,
      query: DAY,
      // 1.05 m from the wall is reading distance for a wall label; the camera
      // is put on the plate itself rather than behind the player
      note: `"${w.title}" plaque at reading distance — must read Inder, the year and the medium.`,
      setup: `(() => { const w = window.__test.museum().works.find(k => k.slug === '${w.slug}');
        window.__test.plaqueShot(w.slug); })()`,
      steps: 4,
    });
    out.push({
      id: `inspect-${w.slug}`,
      query: DAY,
      note: `"${w.title}" in inspect mode: fullscreen at native aspect, caption, CLOSE.`,
      setup: `(async () => { window.__test.inspect('${w.slug}');
        await new Promise(r => setTimeout(r, 500)); })()`,
      steps: 0,
    });
  }
  return out;
}

// Portrait: the rotate overlay must be up and the game must not be rendering
// broken behind it.
export const PORTRAIT_SCENES = [
  {
    id: 'rotate',
    query: DUSK,
    note: 'Portrait shows the rotate overlay and pauses; no broken render behind it.',
    setup: null,
    steps: 10,
  },
];
