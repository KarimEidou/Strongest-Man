# Changelog

## 2026-08-28 — World cleanup, a new HUD, and a smaller game

Ten fixes to the live game. The city is always daytime, the cars point the right
way, the townspeople look before they cross, the buildings are real downloaded
models, the HUD is rebuilt, and everything that made this a score attack is gone.

### Changed

- **It is always daytime.** The sky used to sample `game.timeOfDay`, which starts
  at the authored dusk and advances a full day every 24 real minutes, so the city
  drifted through sunset and night while you played it. There are two clocks now:
  `timeOfDay` keeps advancing and keeps running the townspeople's daily needs,
  and a new `skyTime` is pinned to noon. `?time=` and `?fastday=` therefore move
  schedules only; `?skytime=` is a tooling-only flag that still moves the sky.
- **Cars drive forwards.** `rotY: 180` was applied to all five car imports on the
  assumption that the whole pack faces -Z. It does not: `car-kit` already points
  +Z, which is this game's forward, so the blanket rotation turned every car in
  the city around. Fixed at the import layer, because `car.yaw` feeds six other
  systems and desynchronising it from the drawn orientation would be worse.
- **The samosas lost their floors, their floating door and their invisible
  wall.** Ten rectangular floor slabs per landmark speared out through a
  lens-shaped crust; a door frame stood in mid-air beside the pastry because it
  was placed on the flat lot-rectangle face plane a cone only touches at a
  tangent; and the collider fenced off the whole 38 x 14 m lot around a shape
  that reaches 32 x 10.5 m. The four collision bands now follow the crust's own
  per-floor cross-section.
- **The HUD is rebuilt as one surface language** — a translucent dark disc, one
  thin bright rim, a soft inner glow that dies before it reaches the rim, and a
  pale gold accent reserved for the two things that are live: the joystick nub
  and the charge sweep. The four action controls moved from a 2x2 grid to a
  quarter-arc around the primary, because a thumb pivots rather than travelling
  in rows.
- **The townspeople look before they cross.** A new `wait_kerb` state holds them
  on the pavement until the light is red for the traffic they are crossing AND no
  car is inside a speed-dependent horizon. Measured over thirty simulated
  seconds: the closest a car came to a pedestrian in its own lane went from 0.03 m
  (which is driving through them) to 2.41 m, and frames with somebody inside
  three metres fell from 279 to 18.
- **The nav lattice works.** It had 4 of its 8 crossings, three disconnected
  components, and eight waypoints standing in a traffic lane. Now: 8 crossings,
  one component, nothing on asphalt, seven more destinations reachable.
- **Walking has a floor.** Any deflection past the dead zone used to map onto a
  crawl no clip covers, where the feet planted and slid and the graph sat two
  thirds on `idle` — small mincing steps with full hip sway. The stick now maps
  onto 1.2 m/s and up. The pelvis also got its sway back: the Hips X/Z channels
  were zeroed outright, and none of the looping clips has any root motion to
  strip, so what that deleted was 7.8 cm of weight shift.
- **Most of the ordinary lots wear real downloaded buildings**
  (Kenney's CC0 city kits) — 17 of 26 on the capture seed, 21 of 24 on the e2e
  suite's — fitted to their lot with an independent scale per axis so the
  footprint is exactly the lot rectangle. The rest keep their
  procedural facade, which is the intended outcome rather than a shortfall — see
  ASSUMPTIONS.md 25. They are destructible on the same cell grid as everything
  else, they carry an interior liner so a punched hole reads as a room rather
  than as a view straight through, and they are on the world material so the
  streetlamps light them.

### Removed

- **Monsters, health, guns, the shop, points, karma and reputation** — ten
  modules, two monster models, six gun models, and the wiring through main.js,
  the event bus, combat, the pose tables, the save file and the HUD. Precache
  drops from 5.02 MB to 4.18 MB. Talking to people stays: the dialogue system
  resolves on one fixed neutral band now, so the canned corpus still works with
  no API key.

### Fixed

- `tools/capture/layout.mjs` compared overlap by bounding box, which is a false
  positive for two circular controls on a diagonal — a browser hit-tests
  `border-radius`. It compares circles by centre distance now, and still fails
  when two circles genuinely intersect.
- `tools/check-rig.mjs` compared bone names and order only, and printed MATCH for
  rigs whose bind poses are 120 degrees apart. It compares bind rotations now.
- `tools/test/final.mjs` section 15 re-picked the same first candidate on every
  attempt and dereferenced a probe without a null check, so an unreachable first
  NPC took the whole suite down with a TypeError that said nothing.

## 2026-08-26 — Overhaul

A full pass over the game: every confirmed defect fixed at the root, a verified
screenshot and layout matrix built to prove it, the PWA layer rebuilt around an
upgrade path that actually reaches players, and a new art museum holding four
drawings by **Inder**.

### Added

- **The City Gallery** — an enterable, indestructible civic building on Market
  Side, eleven metres from the player's spawn and in view from it. Reserved lot,
  16 × 22 m, one 6 m hall plus an alcove behind a partition, watertight
  collision, exhibition lining, cornice, skirting, reception desk, benches, rope
  stanchions and a planter. `?warp=museum` reaches it in one step.
- **Four works by Inder**, hung at gallery height with plane sizes derived from
  each image's own decoded pixels — nothing cropped, letterboxed, stretched or
  squashed. Real 3D frames with depth, contact shadows, modelled picture lights,
  and a legible plaque beside each one.
- **A `GALLERY` quick-travel button**, third in the top-right cluster, putting
  the player on the gallery forecourt from anywhere in the city and doubling as
  the way out when they are inside. Disabled while down and while any panel is
  up. The teleport is factored out of the screenshot harness's own warp so there
  is one definition of what moving the player actually involves.
- **Inspect mode** — a DOM `<img>` at native aspect with pinch, pan and
  double-tap-to-reset. Freezes the sim, hides the HUD, locks input, and restores
  the camera exactly on exit.
- **`tools/capture/`** — a deterministic screenshot harness over five viewports
  in both landscape orientations plus portrait, with per-device safe-area
  injection, in Chromium and WebKit.
- **`tools/capture/layout.mjs`** — layout assertions: every touch target
  measured against 44 pt, every safe-area and home-indicator violation, every
  forbidden overlap, everything that must stay reachable, and a `:hover` grep.
- **`tools/test/upgrade.mjs`** — the upgrade-path test: old build installed and
  offline, new build deployed over it, and the update proven to arrive.
- An **update banner** with a dismiss, a **boot-failure state** with a RELOAD
  button and a 90-second watchdog, **Screen Wake Lock**, and
  **`navigator.storage.persist()`**.
- 20 iOS launch images, one per distinct logical size iOS reports.
- `LICENSE`, `ATTRIBUTIONS.md`, `ASSUMPTIONS.md`, `AUDIT.md`, `VERIFICATION.md`,
  `BLOCKERS.md`, `docs/ART_DIRECTION.md`, `docs/STYLE.md`, `docs/MUSEUM.md`,
  `docs/BUILD.md`.

### Fixed — render

- **The world material's specular lobe had never compiled.** `onBeforeCompile`
  runs before three resolves `#include`, so the Blinn-Phong lobe and sky rim —
  written against the body of `RE_Direct_Lambert`, inside a chunk — were a silent
  no-op. Glass, car paint, wet asphalt and every metal prop had been rendering
  flat since the material was written.
- **No WebGL context-loss handling at all.** The default action of
  `webglcontextlost` is to give up permanently; without `preventDefault()` a
  player returning from a phone call got a black screen and a relaunch.
- ~170 `GL_INVALID_OPERATION` warnings at every boot, from two frames drawing
  with no shadow depth texture bound.
- Three separate resize listeners with three different debounces replaced by one
  source; the camera's aspect is no longer left stale by an `orientationchange`
  with no following `resize`.
- `probeTier` timed a vsync wait rather than the GPU, so `auto` quality could
  never return anything but `low` on any hardware.
- The low tier leaked a 3072² shadow depth target — 36 MB held by a switched-off
  feature, on the tier that exists for devices with none to spare.
- Blob-shadow slots were never released; after ~47 monster spawns nothing in the
  game had a shadow. Their texture was also decoded as linear and rendered as a
  slate-blue smudge instead of near-black.
- The warm-up pass disposed a Sprite's geometry, which in three is a
  module-level singleton shared by every sprite.
- **The torn-jacket flaps rendered at 0.4–0.8 mm.** The armature carries a 0.01
  node scale; the whole sleeper-build reveal had been invisible since it was
  written.
- The god-ray composite added raw linear values onto an already tone-mapped,
  sRGB-encoded framebuffer, so every shaft in the game came out redder and
  darker than the tint the sky was sampled for.
- **The whole city was drawn behind the opaque title screen**, at full cost,
  including the shadow and god-ray passes — 97 draw calls a frame on the screen
  an installed PWA sits on longest. Now 0.
- The sky dome, the city-light billboards, the monster health pips and every
  speech bubble were posed from the **previous** frame's camera. The render pass
  is now producers, then the camera solve, then consumers.
- Random GLB loads aborted mid-flight on a fraction of boots: three's
  `FileLoader` composes an `AbortSignal.any` whose controller is collected once
  the un-referenced loader is, and a collected `AbortController` aborts.
- **Every walkable front door in the city was drawn shut.** `physics/collide.js`
  gives every ground-floor door cell a 1.3 m walkable gap — that is how you get
  inside any of the thirty buildings with an interior — and the shared door
  archetype merged a solid wooden leaf across it. The player walked through
  visible wood on all 29 of them, and the gallery, with FREE ADMISSION lettered
  over its door, read as sealed. The leaf is gone; the jambs and head are full
  wall thickness, so the opening is a real reveal you can see into.

### Fixed — pause, and the frame clock

- **Pausing did not pause anything that runs on a render frame.** Mixers, the
  pose layer, recoil decay, carry sway, the particle integrators, the hydrant
  jets and speech-bubble lifetimes all kept advancing against a simulation that
  had stopped. Pausing mid-collapse returned you to a settled street; pausing to
  read a line destroyed the line you paused to read.
- Hit-stop is cleared by a fixed system, which does not run while paused, so
  pausing inside those 0.45 s latched a 0.25× timescale onto everything that did.
- **The display-refresh probe measured the boot, not the display.** It counted
  achieved frames across the first 60 frames of the game — the most expensive
  frames it ever runs — so a 120 Hz iPhone scored about 40 and the adaptive
  half-rate could never engage on the only hardware it exists for. It is now an
  idle rAF burst before the first heavy frame, refined by the shortest delivered
  interval in each window.

### Fixed — simulation

- `pworld.step()` had its `active` array spliced from inside its own walk by a
  re-entrant path, skipping one body per collapse and stepping another twice.
- `armProjectile` stacked a new handler on every throw: three throws meant three
  times the damage and three times the debris.
- `addPile` clamps and `removePile` did not, so clearing rubble dug the ground
  below the street.
- The animation mixer kept running while paused, moving a scheduled strike away
  from the frame of its punch clip.
- Panic, alert, hide and tumbled timers ran at exactly double speed.
- An abandoned car permanently deadlocked every car behind it on its circuit.
- `equip()` dereferenced a null model and left the weapon system half-switched.
- **Corpse physics bodies were never handed back.** Both call sites nulled the
  reference the moment a body fell asleep, leaving the body itself in
  `pworld.sleeping` with nothing pointing at it — one permanent entry per death
  in a list that every explosion walks, and the pile it raised under the corpse
  never came down, so the street grew a bump where each body had landed.
  Re-throwing one corpse then created a fresh body every time, unbounded.
- **An NPC being eaten never moved.** The monster set the victim's simulation
  position but not their render transform, so their mesh stood upright at the
  spot they were taken from for the whole 1.9 seconds.
- **Shop closure was a dead flag.** Reputation wrote `closed` onto building
  specs; NPC routing read it on the POI objects, which are built separately and
  never gained the property. Shops shuttering under a feared strongman had no
  effect on where anybody went.
- The monster-spotted bark was a bare `setTimeout` — wall-clock, uncancellable,
  and holding a monster that might already be dead.

### Fixed — state, input, audio

- **A corrupt save silently and permanently deleted the stored API key.**
- Points awarded just before a pause, a shop visit or a background were lost.
- Audio could not recover after an iOS interruption — the unlock listener was
  `{once:true}` — and every failed `resume()` raised an unhandled rejection.
  Audio now also stops on pause, on background and on mute.
- Captured pointers were never released on `lostpointercapture`, leaving PUNCH
  latched and the player pinned to charge speed for the session.
- Input edges queued behind an overlay all fired on the first step after resume.
- Desktop mouse drag-look had never worked: `!e.isPrimary === false` is false
  whenever `isPrimary` is undefined, which it always is on a `MouseEvent`.
- The joystick only claimed pointers landing on the canvas, so every HUD
  container was a hole in it — including a chat panel covering 97% of its region.
- TALK could not close the conversation it opened.
- The chat field was focused from the fixed-step loop, so iOS showed no keyboard
  while every control was locked out.
- `maxMs` could never read above 100 and `fps` never below 10 — the perf gate was
  blind to exactly the hitches it was written to catch.
- Buying a gun debited before the work that could fail.

### Fixed — layout, HUD, touch

- Rotating to portrait mid-press cleared three input fields by hand, which left
  PUNCH lit orange over a charge that was in fact dead and queued a phantom jab
  for whenever the finger finally lifted.
- **The loading screen came down before there was anything behind it** — 150 ms
  after the bar hit 100%, which is boot-complete, not first-frame. Between those
  two moments sits the most expensive frame the app ever runs, and the player
  spent all of it looking at an unpainted canvas.
- **The armed weapon chip could sit off the edge of the rail** with nothing to
  say it was there. With all seven owned, arming the CANNON put the one thing you
  most need to see half off the screen.
- **Five wall-clock timers in the HUD** — the reputation hint, the toast, the
  points pop, the damage vignette, the hit marker — counted down behind the pause
  panel. Pausing to read a line destroyed the line.
- The gallery prompt was drawn on top of the ammo readout at 667×375.
- The museum plaque was a fixed plate holding four lines that ended 43% of the
  way down it. It is cut to its text now.
- A `meta description`, which took the Lighthouse SEO score from 91 to 100.

- **The crosshair was centred on the safe-area box, not the canvas** — 29.5 px
  from the actual point of impact on a notched iPhone, and it flipped sides when
  the phone was turned. Speech bubbles had the same fault.
- **The armoury's DONE button was below the fold on three of five viewports**,
  and it is the only way out. Every overlay panel was its own padding and border
  taller than the space it was told to fit.
- The toast painted over the weapon rail; the rail painted over the ammo count;
  the karma meter ran across the last digit of the HP readout.
- Seven controls were under the 44 pt minimum, including PAUSE at 40 × 32 and the
  weapon chips at 23 px tall.
- The chat field was 15 px, so iOS zoomed on focus with no way to zoom back out.
- No pressed state on five controls that had had their system tap flash removed.
- Three infinite animations with no `prefers-reduced-motion` guard.
- Karma and reputation text measured 1.90:1 and 1.66:1 against the sky they are
  always drawn over.
- The "stock reply" marker in the chat log did not exist — the rule was a
  byte-for-byte duplicate of the one above it.

### Fixed — PWA and deploy

- **A player who reloaded while a new worker was installing was never offered
  the update.** `register()` resolves whenever it resolves, and the browser has
  usually already begun fetching the new `sw.js` on the navigation before any
  page script runs. A worker already *waiting* was handled and one that had not
  started was handled; one *installing* at that moment was not, because
  `reg.waiting` was empty and `updatefound` had already fired. On a phone that
  is the ordinary case. All three states are watched now.
- **The boot watchdog reported a slow first install as a failure.** Ninety
  seconds measured from module evaluation, with no idea whether anything was
  happening — so it fired in exactly the case it exists for, a first install
  where the page and the precache compete for a slow connection, and told the
  player the app had failed while it was still loading. It measures a stall now.

- **Navigations were cache-first**, so the HTML could never update from the
  network.
- `cache.addAll()` used the HTTP cache, so a worker installing within ten minutes
  of a deploy filled its brand-new cache with the previous build's bytes.
- `caches.match()` was unscoped while old caches were kept alive, letting an old
  cache shadow the current one.
- `navigate()` returned a 404 or a 502 as if it were a page, and cached it.
- The manifest's `id` resolved to the origin root, not the subpath.
- The maskable icon was byte-identical to the standard one, so it had no safe
  zone and duplicated 384 KB in every precache.
- The Groq client never checked `navigator.onLine`, so every request in airplane
  mode spent its full timeout before falling back.
- `cancel-in-progress: true` on the Pages concurrency group could abort a deploy
  mid-publish.
- **`gen-sw.mjs` now refuses to run if any precached file is untracked in git**,
  and CI regenerates `sw.js` and fails on a diff. One untracked path does not
  degrade the site — `addAll` is all-or-nothing, so it removes offline play
  entirely and silently.

### Changed

- **The four works are numbered `I`–`IV` rather than named**, in hanging order,
  at the owner's instruction. The plaque, the inspect caption and the proximity
  prompt all read from `assets/art/plaques.json`, so this was a data change; the
  file slugs are deliberately unchanged, because renaming them would rename the
  assets, the precache list and every capture filename to no end. The title line
  on the plaque moved to a serif face at the same time — a Roman `I` in Helvetica
  is a bare vertical bar and does not read as a numeral.
- `manifest.display` is `fullscreen`, with a `display_override` chain.
- The museum facade is solid stone with pilasters and an entablature rather than
  glazed; the interior is lined floor to ceiling because of it.
- iOS launch images are not precached — iOS fetches them before any worker
  exists, so they never pass through the fetch handler.
- The top-centre stack (`#rep-hint`, `#toast`) now begins **below** the
  top-right button row rather than through the middle of it. It had always
  overlapped that band vertically; nothing showed until a third button filled
  the horizontal gap the text was running through.

### Verification

- **602 screenshots** of the final build — 31 scenes × 5 iPhone viewports × 2
  orientations × 2 engines — with **zero console problems**. The pre-overhaul
  build logs a problem on **all 90** of its captures: 17,795 `GL_INVALID_OPERATION`
  warnings and 321 aborted model loads across those boots.
- **74 layout assertions, 0 failures.** Every control measured against 44 pt in
  both axes, in seven states, on every viewport, in both orientations.
- **30/30 end-to-end assertions**, waiting on simulation time rather than wall
  time, with zero console and zero page errors.
- **11/11 service-worker upgrade checks**, including offline on both sides of the
  upgrade and exactly one surviving cache.
- **No leak**: twenty gallery load/unload cycles and twenty building collapses
  leave `renderer.info.memory` flat.
- Lighthouse, locally: best practices 100, SEO 100, accessibility 88 with one
  deliberate exception.

The screenshot harness had to be made deterministic first, and doing so found
five things getting into the pictures that were not the fixed step: the frame
loop between boot and the shutter, the shadow map's render-frame cadence, CSS
transitions plus five `setTimeout`s in the HUD, scenes sharing a save inside a
browser context, and a shutter that could outrun the compositor.
`VERIFICATION.md` has the numbers and the tolerance.

### Deploy

Fast-forwarded onto `main` and published. The workflow's `sw.js` freshness gate
passed, run #19 is green, and the live origin was checked rather than assumed:
121/121 precached URLs return 200, 120/120 precached files are byte-identical to
the local tree by sha256, `sw.js` reports the same `VERSION`, and every content
type is right — `application/javascript` for the modules and the worker,
`application/manifest+json`, `model/gltf-binary`, `image/webp`.

The deployed site was **not** opened in a browser: Playwright's Chromium cannot
reach any HTTPS host through this environment's proxy. `BLOCKERS.md` §2 says what
that does and does not leave unverified.

### Known gaps

See `BLOCKERS.md`. The short version: nothing here has been run on a physical
iPhone, and the branch has not been merged to `main`, so the live URL is
unchanged.
