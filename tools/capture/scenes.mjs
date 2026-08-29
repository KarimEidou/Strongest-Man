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

const BASE = 'autoplay=1&seed=42&capture=1&nogroq=1';
// The city is always daytime now, so `?time=` moves the townspeople's schedules
// and nothing else — every one of these renders the same noon sky. They are kept
// distinct because they still put DIFFERENT PEOPLE on the street: the morning
// commute, the evening one, and a near-empty small-hours city.
const DAY = `${BASE}&time=0.42`;      // late morning: the busiest pavements
const DUSK = `${BASE}&time=0.70`;     // the evening commute
// `?skytime=` is the tooling-only visual override. Play never reaches it — this
// scene exists to prove the lamp pools and lit windows still work.
const NIGHT = `${BASE}&time=0.02&skytime=0.02`;

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
    note: 'HUD at rest: the joystick idle and every control in its base state.',
    setup: null,
    steps: 30,
  },
  {
    id: 'hud-bright',
    query: DAY,
    note: 'The city at noon, which is now the only sky there is.',
    setup: () => window.__test.warpTo(2.5, -30, Math.PI),
    steps: 30,
  },
  {
    id: 'hud-dark',
    query: NIGHT,
    note: 'Night rendering, forced with ?skytime= — lamp pools and lit windows. '
      + 'Play never reaches this; the city is always daytime.',
    setup: () => window.__test.warpTo(2.5, -30, Math.PI),
    steps: 30,
  },
  {
    id: 'hud-stress',
    query: DUSK,
    note: 'Worst case for the controls: GRAB reading THROW, the charge ring '
      + 'full and the longest toast on screen at once.',
    setup: () => window.__test.hudStress(),
    steps: 30,
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
    note: 'The samosa landmark in its block: 33 m of pastry, the crossroads it '
      + 'stands on, and the second one on the skyline behind it.',
    // lookFrom, not warpTo. The generator puts the two samosas at (-35.5,-47.5)
    // and (28.5,47.5); the old viewpoint stood at (30,-30) facing PI*0.25, which
    // is 77m from the nearer one and pointed away from it, so this scene spent
    // its life photographing an office wall while its note claimed a landmark.
    // lookFrom aims the camera AT a world point and turns occlusion off, which
    // is what a beauty shot of a 33m object needs.
    // The south-west samosa (x -54.5..-16.5, z -54.5..-40.5, 11 floors = 33 m),
    // seen down the diagonal from beyond the road intersection at (-63, -63).
    // That diagonal is the only line on the grid with clear sight of it: the
    // roads run at -63/0/63 and every other approach looks across a block full
    // of offices.
    setup: () => window.__test.lookFrom(-76, 24, -76, -35.5, 12, -47.5),
    steps: 30,
  },
  {
    id: 'landmark-sign',
    query: DAY,
    note: 'The samosa\'s signage band square on: INDER\'S / BIG SAMOSA, projected '
      + 'onto the pastry rather than bolted in front of it, and legible.',
    // The band is projected from whichever side the spec calls `front`, and this
    // one is north, so it is read from -z. The z=-63 road is only 13.5 m off the
    // face — far too close for a 33 m object — so the camera stands on the open
    // ground beyond it. Looking IN from outside the grid is fine: the fog is
    // distance-based from the camera, not a wall at the map edge.
    setup: () => window.__test.lookFrom(-35.5, 18, -85, -35.5, 12, -47.5),
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
      // artShot, not warpTo: warpTo is the shoulder camera, so the player's back
      // stood between the lens and the picture in every one of these.
      setup: `window.__test.artShot('${w.slug}')`,
      steps: 4,
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
