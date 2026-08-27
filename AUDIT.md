# Audit

Every defect found in the pre-overhaul build, what proves it, and the commit
that resolves it. Nothing here is aspirational: an entry exists because the
behaviour was reproduced against the running game, and it carries a commit
because the behaviour was reproduced again afterwards and had changed.

The baseline is the branch `pre-overhaul-2026-08-26` (commit `79d864b`). Line
numbers are that build's, not the current tree's.

## How this was found

- Every module read end to end, worst-first by blast radius: the shared material,
  the frame loop, the physics world, the service worker.
- The running game instrumented rather than reasoned about — `shaderSource` hooked
  before boot to read what actually compiled, `renderer.info` sampled across scene
  cycles, `getBoundingClientRect` measured for every control in every state on
  five viewports in both orientations.
- Console output treated as a defect list. The baseline logs a problem on **every
  one of its 90 captured screens** (`screenshots/baseline/report.json`).
- Each candidate reproduced before it was written down, and re-reproduced after
  the fix. Findings that did not survive that step are not in this document.
- **The screenshots were then reviewed, and reviewing them found more.** Seven
  entries here (#107–#113) exist because 602 captures were looked at rather
  than counted: a museum label with a hole under it, an armed weapon chip half
  off the screen, five wall-clock timers running behind the pause panel, a
  prompt drawn over the ammo readout at 667×375, a loading screen that comes
  down five seconds before there is anything behind it, a solid wooden door
  across every entrance the player is meant to walk through, and four scenes
  whose stated purpose is to show the artwork and which showed the back of the
  man standing in front of it. §5.7 of the brief asks for that pass because it
  is the one that finds these; it is not a formality.

**Reading an entry.** *Repro* is the exact steps that produced the behaviour.
*Expected* and *Actual* are what should happen and what did, with the mechanism.
*Remedy* is the fix identified when the defect was written up — where the commit
took a different route to the same outcome, the commit message says which and why.
The commit named is where the behaviour actually changed.

## Counts

| Severity | Count | Meaning |
|---|---:|---|
| Blocker | 4 | the game or the deploy is broken for someone |
| Major | 53 | a feature does not work, leaks, or is unusable on the target device |
| Minor | 49 | wrong, but survivable |
| Polish | 4 | correct, and not good enough |
| **Total** | **110** | from 113 raw findings; 3 were the same defect seen by two sweeps |

| Category | Count |
|---|---:|
| Logic | 22 |
| UI | 18 |
| Render | 16 |
| Touch | 16 |
| HUD | 13 |
| Perf | 10 |
| PWA | 6 |
| SW | 6 |
| Deploy | 2 |
| Audio | 1 |

## Resolving commits

| Commit | Subject |
|---|---|
| `a57209f` | fix(assets): fetch GLBs directly instead of through GLTFLoader's FileLoader |
| `a6d17b9` | fix(render): build the shadow map before anything draws with it |
| `fa6d2a6` | fix(input): release captured pointers, and add a reset for state changes |
| `bfa5c46` | feat(museum): the City Gallery, four works by Inder, and inspect mode |
| `c474314` | fix(render): one debounced viewport source, and recover from context loss |
| `cc84e4d` | fix(render): the world material's specular lobe has never compiled |
| `5418f1e` | fix(core): eleven defects the audit sweep confirmed |
| `8b2e8cf` | fix(sim): re-entrancy, projectile stacking, and a feature nobody could see |
| `708a37d` | fix(ai): timers at double speed, a leaked slot, a dead lane, a stale meter |
| `4d7b089` | fix(audio): a master limiter, and a suspend that actually suspends |
| `5aa9e2e` | fix(hud): the crosshair, the way out of the shop, and 44pt everywhere |
| `c62005a` | fix(pwa): an update path that reaches players, and three guards so it stays one |
| `9456ab7` | fix(render): the god-ray composite was adding linear light to an sRGB frame |
| `9ab347f` | fix(loop): the render frame ran in the wrong order, at the wrong times |
| `bbad27f` | fix(sim): corpses leaked bodies, victims never moved, and a whole feature was dead |
| `58fdadf` | fix(input): rotating to portrait mid-press left a button lit and a jab queued |
| `f7ff336` | style(css): declare the spacing scale, and drop a negative-margin hack |
| `b31524c` | fix(hud): a label cut to its text, an armed chip you can see, and no wall clocks |
| `37f79d9` | fix(hud): the gallery prompt sat on top of the ammo readout on the SE |
| `42e3709` | fix(boot): the loading screen came down before there was anything behind it |
| `90ca0e0` | fix(world): open the doors, and photograph the art instead of the man in front of it |

## Index

| # | Sev | Category | Where | Defect | Commit |
|---:|---|---|---|---|---|
| 13 | Blocker | PWA | `js/ui/overlays.js:81` | Any boot failure leaves the opaque loading overlay up forever — no error, no retry, no way out | `5aa9e2e` |
| 67 | Blocker | SW | `sw.js:137` | Nine precached URLs are not tracked in git; addAll() is all-or-nothing, so a deploy of HEAD kil… | `c62005a` |
| 68 | Blocker | SW | `sw.js:137` | Precache and navigation fetches use the default HTTP cache mode, so on GitHub Pages (max-age=60… | `c62005a` |
| 69 | Blocker | Deploy | `.github/workflows/deploy.yml:21` | Nothing regenerates or verifies sw.js on deploy; sw.js is stale against the tree on every check | `c62005a` |
| 1 | Major | Render | `js/engine/materials.js:313` | Specular lobe never compiles: onBeforeCompile .replace() targets GLSL that lives inside an unre… | `cc84e4d` |
| 2 | Major | Render | `js/engine/camera.js:38` | camera.aspect is never recomputed on orientationchange — only the renderer is | `c474314` |
| 3 | Major | Render | `js/engine/quality.js:56` | probeTier measures the display's frame interval, not render cost — 'auto' can never pick 'high' | `5418f1e` |
| 4 | Major | Perf | `js/engine/shadows.js:100` | Switching to the low tier leaks the 3072x3072 shadow depth target forever | `5418f1e` |
| 5 | Major | Render | `js/engine/godrays.js:113` | God-ray render targets never resize on orientationchange; mask keeps the pre-rotation aspect | `c474314` |
| 6 | Major | Render | `js/engine/blobshadows.js:40` | Blob-shadow follower slots are never released; every despawned monster leaks one permanently | `5418f1e` |
| 14 | Major | Logic | `js/core/points.js:68` | Points are never written to disk while the game is not in 'playing' — an award followed by paus… | `5418f1e` |
| 15 | Major | Logic | `js/core/state.js:45` | A corrupt sm_save_v1 silently and permanently deletes the user's stored Groq API key and the wh… | `5418f1e` |
| 16 | Major | Audio | `js/engine/audio.js:17` | Audio cannot recover after the PWA is backgrounded on iOS: the only unlock listener is {once:tr… | `5418f1e` |
| 17 | Major | Perf | `js/core/debug.js:66` | window.__perf.maxMs / p99Ms can never exceed 100 and fps can never read below 10 — the perf gat… | `5418f1e` |
| 25 | Major | Touch | `js/core/input.js:230` | resetInput() is never wired to a game-state change — a PUNCH release queued behind PAUSE fires … | `5aa9e2e` |
| 26 | Major | UI | `css/main.css:400` | Armoury DONE button is entirely below the screen when the shop opens — panels apply max-height … | `5aa9e2e` |
| 27 | Major | Touch | `css/main.css:307` | #chat is a 314x223 pointer-events:auto dead zone sitting inside the joystick's left-44% claim r… | `5aa9e2e` |
| 28 | Major | Touch | `js/core/input.js:63` | TALK cannot close the conversation while the chat field has focus — pollInput discards pendingI… | `5aa9e2e` |
| 29 | Major | Touch | `js/dialogue/talk.js:199` | chat.input.focus() is called from the fixed-step loop, not a user gesture — iOS shows no keyboa… | `5aa9e2e` |
| 30 | Major | Touch | `js/core/input.js:47` | Action buttons have no per-pointer refcount: a second finger's release drops the hold while the… | `5aa9e2e` |
| 31 | Major | Touch | `css/main.css:342` | #chat-input is font-size:15px — iOS zooms the viewport on focus and the player cannot zoom back… | `5aa9e2e` |
| 32 | Major | Touch | `css/main.css:291` | #btn-pause is 40x32 CSS px — under the 44x44 HIG minimum in both axes | `5aa9e2e` |
| 33 | Major | Touch | `css/main.css:204` | #btn-shop is 59.19x32 and only 6px from #btn-pause — short target, mis-tap risk with a neighbou… | `5aa9e2e` |
| 34 | Major | Touch | `css/main.css:193` | .wchip weapon chips are 23px tall and equip on pointerdown, with a 6px gutter when the rail wra… | `5aa9e2e` |
| 35 | Major | Touch | `css/main.css:319` | #chat-close is 26x26 CSS px — the escape hatch from the input-lock is 34% of the HIG minimum ar… | `5aa9e2e` |
| 42 | Major | Render | `css/main.css:138` | Crosshair is centred on the safe-area box, not on the canvas — it misses the actual point of im… | `5aa9e2e` |
| 43 | Major | Render | `js/dialogue/bubbles.js:47` | Speech bubbles are positioned with full-canvas NDC inside a safe-area-inset layer — they detach… | `5aa9e2e` |
| 44 | Major | HUD | `css/main.css:355` | #toast is drawn on top of the weapon rail on all four iPhone viewports — the comment justifying… | `5aa9e2e` |
| 45 | Major | HUD | `css/main.css:167` | Weapon chips paint on top of the ammo readout — the ammo count and RELOADING text are occluded … | `5aa9e2e` |
| 47 | Major | UI | `css/main.css:400` | Every overlay panel is exactly 20px (settings/pause) or 8px (shop) taller than the viewport, so… | `5aa9e2e` |
| 48 | Major | HUD | `css/main.css:303` | At 667x375 the conversation panel covers the crosshair, including its centre | `5aa9e2e` |
| 51 | Major | Touch | `css/main.css:188` | #weapons' 'stays out of the joystick zone' invariant is computed against the inset HUD box but … | `5aa9e2e` |
| 52 | Major | UI | `css/main.css:469` | .gun-buy[disabled] dims the EQUIPPED marker to ~1.8:1 — the one control that tells you which gu… | `5aa9e2e` |
| 53 | Major | HUD | `css/main.css:95` | #karma-label and #rep-hint measure 1.90:1 and 1.66:1 against the actual rendered sky — both sit… | `5aa9e2e` |
| 54 | Major | Touch | `css/main.css:290` | Seven interactive controls are below the 44pt iOS minimum, including PAUSE (40x32) and the weap… | `5aa9e2e` |
| 70 | Major | SW | `sw.js:198` | caches.match() is unscoped while old caches are deliberately kept alive, so the first-created (… | `c62005a` |
| 71 | Major | PWA | `js/main.js:483` | No Screen Wake Lock anywhere — the iPhone dims and auto-locks mid-session | `5aa9e2e` |
| 72 | Major | PWA | `manifest.webmanifest:7` | manifest "id": "./" resolves to the origin root, not the /Strongest-Man/ subpath | `c62005a` |
| 73 | Major | PWA | `tools/make-icons.mjs:62` | apple-touch-startup-image covers 4 device profiles, two of them mislabelled, and there is no fa… | `c62005a` |
| 79 | Major | Logic | `js/player/combat.js:518` | Grab-and-throw permanently leaks a debris body's heightfield pile (ground rises where rubble no… | `8b2e8cf` |
| 80 | Major | Logic | `js/player/combat.js:531` | Dying while carrying rubble orphans the body: a chunk hangs in mid-air forever and its instance… | `8b2e8cf` |
| 81 | Major | Logic | `js/physics/pworld.js:39` | pworld.step() mutates the `active` array while iterating it — bodies get skipped for a whole st… | `8b2e8cf` |
| 82 | Major | Logic | `js/player/combat.js:622` | armProjectile stacks a new onMove wrapper on every throw — re-thrown objects do N× the work and… | `8b2e8cf` |
| 83 | Major | Logic | `js/player/combat.js:484` | Breaking a carried prop_sign with a swing strands it tipped-over in mid-air, permanently and un… | `8b2e8cf` |
| 84 | Major | Render | `js/player/outfit.js:26` | Torn-jacket flaps are parented to bones without undoing the 0.01 armature scale, so the whole s… | `8b2e8cf` |
| 90 | Major | Perf | `js/ai/monster.js:447` | Every monster despawn leaks its blob-shadow slot; after ~47 spawns nothing in the game gets a b… | `708a37d` |
| 91 | Major | Logic | `js/ai/panic.js:150` | Panic/alert/hide/tumbled timers run at exactly 2x speed — stateT is decremented twice per think… | `708a37d` |
| 92 | Major | Render | `js/ai/npc.js:334` | An NPC being eaten by a monster leaves its body standing where it was grabbed — the mesh never … | `bbad27f` |
| 93 | Major | Logic | `js/ai/npc.js:171` | Shop closure is a dead flag: reputation writes `closed` on building specs, NPC routing reads it… | `bbad27f` |
| 94 | Major | Logic | `js/world/traffic.js:226` | One car abandoned by scareCars() permanently deadlocks every car behind it on that circuit; 'wr… | `708a37d` |
| 104 | Major | Logic | `js/engine/assets.js:41` | Random GLB loads abort mid-flight: three r185 FileLoader drops a source from its AbortSignal.an… | `a57209f` |
| 105 | Major | Render | `js/engine/shadows.js:118` | Two frames per boot draw every shadow receiver with no depth texture bound — ~170 GL_INVALID_OP… | `a6d17b9` |
| 106 | Major | Touch | `js/core/input.js:118` | A pointer whose capture is stolen never releases its control: the button stays held and the joy… | `fa6d2a6` |
| 108 | Major | HUD | `js/ui/hud.js:155` | The armed weapon chip can sit off the edge of the rail with nothing to say it is there | `b31524c` |
| 110 | Major | HUD | `css/main.css:751` | The gallery prompt is drawn on top of the ammo readout at 667x375 | `37f79d9` |
| 111 | Major | UI | `js/ui/overlays.js:84` | The loading screen comes down before there is anything behind it | `42e3709` |
| 112 | Major | Render | `js/world/buildings.js:61` | Every walkable front door in the city is drawn shut, and the player passes through the leaf | `90ca0e0` |
| 7 | Minor | Perf | `js/engine/warmup.js:43` | warmUp disposes three's module-level shared Sprite geometry | `5418f1e` |
| 8 | Minor | Render | `js/engine/blobshadows.js:25` | Blob-shadow CanvasTexture carries colour but is left at NoColorSpace, so shadows render as ligh… | `5418f1e` |
| 9 | Minor | Render | `js/engine/godrays.js:40` | God-ray composite adds linear-light values onto an already tone-mapped, sRGB-encoded framebuffer | `9456ab7` |
| 10 | Minor | Perf | `js/engine/godrays.js:145` | renderMask allocates a THREE.Color every frame the sun is on screen | `9456ab7` |
| 11 | Minor | Perf | `js/engine/particles.js:152` | particlesFrame allocates two throwaway arrays on every rendered frame | `5418f1e` |
| 18 | Minor | Perf | `js/core/loop.js:50` | The whole city is rendered at full cost every frame behind the opaque title screen | `9ab347f` |
| 19 | Minor | Render | `js/main.js:329` | Pausing does not pause the FX: particles keep integrating and hydrant jets keep emitting while … | `5aa9e2e` |
| 20 | Minor | Logic | `js/core/loop.js:37` | game.slowmo is a simulation timescale but is applied to the render dt, and nothing clears it wh… | `9ab347f` |
| 21 | Minor | UI | `js/ui/settings.js:65` | loadState validates the three save numbers but nothing in settings; one bad value crashes openS… | `5aa9e2e` |
| 22 | Minor | Perf | `js/core/loop.js:53` | The display-refresh probe measures achieved fps over the first 60 boot frames and never re-meas… | `9ab347f` |
| 23 | Minor | Logic | `js/core/input.js:117` | Desktop key handlers have no game.state guard, so presses during a pause latch into `input` and… | `5418f1e` |
| 24 | Minor | UI | `js/ui/shop.js:95` | shop.buy() debits and persists before the work that can fail, with no error handling — a failed… | `5418f1e` |
| 36 | Minor | UI | `css/main.css:413` | Every settings-row control is under 44px in the short axis | `5aa9e2e` |
| 37 | Minor | UI | `css/main.css:463` | .gun-buy shop buttons are 96x34 — 34px tall | `5aa9e2e` |
| 38 | Minor | UI | `css/main.css:346` | #chat-send is 60.56x35 — 35px tall | `5aa9e2e` |
| 39 | Minor | Logic | `js/core/input.js:133` | `!e.isPrimary === false` is always false — the mouse drag-look listener can never arm | `5aa9e2e` |
| 40 | Minor | Touch | `js/ui/overlays.js:70` | Rotating to portrait mid-press clears input.punchDown but leaves the button visually held and t… | `58fdadf` |
| 41 | Minor | Touch | `css/main.css:303` | The conversation form sits in the bottom 30% of a landscape viewport, where the iOS keyboard la… | `5aa9e2e` |
| 55 | Minor | HUD | `css/main.css:103` | #vitals and #karma-bar overlap at 667x375 — the karma meter runs across the last digit of the H… | `5aa9e2e` |
| 56 | Minor | HUD | `css/main.css:313` | #chat (z-index 12) paints over the DOWN banner | `5aa9e2e` |
| 57 | Minor | UI | `css/main.css:336` | The 'canned vs live reply' marker in the chat log does not exist — the ::before rule is a byte-… | `5aa9e2e` |
| 58 | Minor | Touch | `css/main.css:33` | Five HUD/panel buttons have no pressed state, and -webkit-tap-highlight-color removes the syste… | `5aa9e2e` |
| 59 | Minor | UI | `css/main.css:77` | Three infinite animations with no prefers-reduced-motion guard, including a 0.3s shake on body … | `5aa9e2e` |
| 60 | Minor | UI | `css/main.css:615` | #update-banner is centred on the raw viewport, not the safe box — its own comment claims the op… | `5aa9e2e` |
| 61 | Minor | UI | `css/main.css:613` | #update-banner (z-index 45) renders above #rotate-overlay (z-index 40), which its own comment s… | `5aa9e2e` |
| 62 | Minor | HUD | `js/ui/overlays.js:103` | #update-banner has no dismiss and permanently covers the karma meter for the rest of the session | `5aa9e2e` |
| 63 | Minor | UI | `css/main.css:440` | Overlay panels carry no horizontal safe-area padding, and #shop-panel is edge-to-edge full-blee… | `5aa9e2e` |
| 64 | Minor | HUD | `css/main.css:128` | #points-row wraps to two lines whenever a payout label appears, detaching the +N chip from the … | `5aa9e2e` |
| 74 | Minor | SW | `sw.js:179` | navigate() returns a 4xx/5xx network response instead of falling back to the cached shell | `c62005a` |
| 75 | Minor | Deploy | `.github/workflows/deploy.yml:11` | Pages deploy uses cancel-in-progress: true, which can abort a production deployment mid-publish | `c62005a` |
| 76 | Minor | PWA | `tools/make-icons.mjs:33` | icon-512.png and icon-512-maskable.png are byte-identical, so the maskable icon has no safe zon… | `4d7b089` |
| 77 | Minor | SW | `sw.js:126` | Eight iOS launch images (411 KB) are precached but the page never requests them | `c62005a` |
| 78 | Minor | SW | `sw.js:154` | Old caches are only purged on a navigation, so a long-running standalone PWA accumulates one 5.… | `c62005a` |
| 85 | Minor | Logic | `js/physics/heightfield.js:50` | addPile clamps to 1.6 but removePile subtracts the full recorded amount — stacked rubble sinks … | `8b2e8cf` |
| 86 | Minor | Logic | `js/player/weapons.js:267` | equip() dereferences buildGun()'s null return when a gun model failed to load | `8b2e8cf` |
| 87 | Minor | Logic | `js/world/debris.js:103` | reclaimOldest can steal the instance slot of the chunk the player is currently carrying | `4d7b089` |
| 88 | Minor | Logic | `js/main.js:147` | Pause freezes the fixed step but not the animation mixer, so a scheduled strike desyncs from it… | `9ab347f` |
| 89 | Minor | Perf | `js/physics/collide.js:191` | capsuleVsWorld allocates a two-element array on every call, and debrisVsWorld calls it once per… | `bfa5c46` |
| 95 | Minor | Render | `js/ai/panic.js:140` | evacuate() is a third exit from 'hide' that never undoes the cower squash — the NPC stays 8% sh… | `708a37d` |
| 96 | Minor | Logic | `js/dialogue/talk.js:83` | MONSTER_SPAWNED schedules a bare, uncancellable setTimeout that fires while the game is paused … | `bbad27f` |
| 97 | Minor | UI | `js/main.js:233` | Speech bubbles age out and are removed while the game is paused | `9ab347f` |
| 98 | Minor | HUD | `js/ai/karma.js:50` | Karma drift changes the value and the band without emitting KARMA_CHANGED or persisting — the H… | `708a37d` |
| 99 | Minor | Perf | `js/ai/npc.js:439` | Corpse physics bodies are never reclaimed from pworld.sleeping; re-throwing one corpse creates … | `bbad27f` |
| 100 | Minor | Logic | `js/ai/monster.js:159` | despawn() splices the monsters array while fixedUpdate is iterating it with for...of, skipping … | `708a37d` |
| 101 | Minor | Logic | `js/ai/monster.js:186` | A rampaging monster can kill or hijack the NPC in the player's hands — monster.js has no 'carri… | `708a37d` |
| 102 | Minor | PWA | `js/dialogue/groq.js:223` | The Groq client is never skipped offline — no navigator.onLine check exists anywhere in the app | `708a37d` |
| 103 | Minor | Logic | `js/dialogue/groq.js:157` | The daily request cap never persists for player conversations — dayCount is only written to loc… | `708a37d` |
| 109 | Minor | HUD | `js/ui/hud.js:231` | Every timed HUD affordance is on setTimeout, so it counts down behind the pause panel | `b31524c` |
| 113 | Minor | UI | `tools/capture/scenes.mjs:169` | The artwork scenes photographed the player's back instead of the artwork | `90ca0e0` |
| 12 | Polish | Render | `js/main.js:331` | Billboards and the sky dome are posed from the previous frame's camera | `9ab347f` |
| 65 | Polish | HUD | `css/main.css:212` | #down-banner clears the action-button cluster by 0.5px at 667x375 | `5aa9e2e` |
| 66 | Polish | UI | `css/main.css:441` | Spacing is off the stated 4/8/16/24/32 scale throughout, including a negative-margin hack that … | `f7ff336` |
| 107 | Polish | UI | `js/world/museum.js:72` | The museum plaque is a fixed plate holding four lines that end 43% of the way down it | `b31524c` |

---

## Detail

### 13. Any boot failure leaves the opaque loading overlay up forever — no error, no retry, no way out

**Blocker · PWA · `js/ui/overlays.js:81` · fixed in `5aa9e2e`**

**Repro.** Playwright, chromium, http://127.0.0.1:8080/Strongest-Man/?autoplay=1&seed=7 with `page.route('**/js/world/traffic.js', r => r.abort())`. After 45s: {"ready":false,"loadingVisible":true,"loadingMsg":"people…","fill":"96%","anyErrorUI":false} and one pageerror the player cannot see: "Failed to fetch dynamically imported module: .../js/world/traffic.js". Same result for any of the ~30 `await import()` calls in js/main.js, `await loadModels(...)`, `await initSky(...)` or `await warmUp(...)`.

**Expected.** A boot failure surfaces a visible message and a retry/reload affordance; the player is never left staring at a frozen progress bar.

**Actual.** js/main.js is a top-level-await module with no try/catch anywhere in the boot chain, and there is no `window.onerror` / `unhandledrejection` handler in the tree (grep for `unhandledrejection|window.onerror|addEventListener('error'` across js/ and index.html returns nothing). `loadingProgress(1, 'ready')` (js/main.js:285) is the ONLY code that ever hides `#loading`, so a rejected await means it is never reached. `#loading` is `position:fixed; inset:0; z-index:30` with an opaque radial-gradient background (css/main.css:363-364, 477) and default `pointer-events:auto`, so the app is completely dead — force-quitting the PWA is the only recovery, and it fails again on the next launch if the cause persists. This matters most on the FIRST online load, which fetches ~110 files from the network before the service worker can serve any of them, and on a partial-cache offline load.

**Remedy.** Wrap the boot in try/catch (or add a top-level `unhandledrejection` listener) that swaps `#loading-msg` for the error text plus a RELOAD button, e.g. `catch (e) { el('loading-msg').textContent = 'Could not start: ' + e.message; showReloadButton(); }`, and register the same handler before the first await so an early failure is covered too.

### 67. Nine precached URLs are not tracked in git; addAll() is all-or-nothing, so a deploy of HEAD kills the service worker entirely

**Blocker · SW · `sw.js:137` · fixed in `c62005a`**

**Repro.** `node -e` over sw.js's PRECACHE vs `git ls-files` in /home/user/Strongest-Man reports 9 entries that are not in git: `js/engine/viewport.js` and all eight `assets/splash/splash-*.jpg` (`git status --porcelain` shows `?? assets/splash/`, `?? js/engine/viewport.js`). `.github/workflows/deploy.yml` deploys `actions/checkout@v4` output, i.e. tracked files only. On Pages those 9 URLs 404. `Cache.addAll()` rejects atomically if ANY request fails, so `install` rejects, the worker never reaches `installed`, `skipWaiting()` never runs, and no cache is ever committed. Chrome logs one line in the SW console and the page carries on normally — nothing surfaces to the player.

**Expected.** Every URL in PRECACHE resolves 200 on the deployed artifact; a single missing asset degrades the precache, it does not delete the app's entire offline capability.

**Actual.** One 404 anywhere in the 128-entry list silently produces a site with no service worker and zero offline play. The repo is in exactly that state right now: 9 of the 128 precached URLs exist only in the working tree.

**Remedy.** Two changes. (1) In tools/gen-sw.mjs, build the list from `git ls-files` (or verify each walked path is tracked) and `process.exit(1)` on any untracked entry, so an uncommitted asset fails the generator instead of the deploy — the same shape as the existing EXCLUDE assertion at gen-sw.mjs:75-80. (2) Make install resilient: replace `c.addAll(PRECACHE)` with `Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch((err) => { console.error('precache miss', u, err); })))` so one bad URL costs one asset, not the worker.

### 68. Precache and navigation fetches use the default HTTP cache mode, so on GitHub Pages (max-age=600) a new worker fills its NEW cache with the OLD build's bytes

**Blocker · SW · `sw.js:137` · fixed in `c62005a`**

**Repro.** GitHub Pages sets `cache-control: max-age=600` on every response (verified: `curl -sI https://pages.github.com/` -> `cache-control: max-age=600`). Timeline: t=0 player loads build A, browser HTTP-caches index.html / css/main.css / js/**.js for 600s. t=60s build B deploys. t=120s the player foregrounds the PWA, js/main.js:519 fires `reg.update()`; sw.js itself is re-fetched from network because register() passes `updateViaCache: 'none'` (js/main.js:485), so VERSION-B's worker installs. Its `c.addAll(PRECACHE)` runs with the default `cache: 'default'` mode, so every URL still fresh in the HTTP cache is satisfied from disk WITHOUT a network hit — build A's bytes are written into the cache named VERSION-B. `navigate()`'s bare `fetch(req)` at sw.js:168 does the same for index.html and then `c.put('./index.html', copy)` (sw.js:171) stores build A's HTML under VERSION-B too.

**Expected.** A precache keyed by a content hash of build B contains build B's bytes.

**Actual.** The cache named `sm-<hashOfBuildB>` holds build A end to end. Because VERSION now matches the deployed sw.js, no further update fires and `purgeOldCaches()` has already deleted the only other copy. The player is stranded on build A — online and offline — until a THIRD deploy happens. This is the exact stranding mechanism, and it is invisible to tools/test/upgrade.mjs because that harness serves `'cache-control': 'no-store'` (tools/test/upgrade.mjs:81) and tools/test/serve.mjs:27 does the same, so neither ever exercises a populated HTTP cache.

**Remedy.** In tools/gen-sw.mjs's emitted worker, force both paths past the HTTP cache: precache with `c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))` and make the navigation `fetch(new Request(req, { cache: 'no-store' }))` (or `'reload'`). Also add a max-age-bearing mode to tools/test/upgrade.mjs so the regression is covered.

### 69. Nothing regenerates or verifies sw.js on deploy; sw.js is stale against the tree on every check

**Blocker · Deploy · `.github/workflows/deploy.yml:21` · fixed in `c62005a`**

**Repro.** There is no `node tools/gen-sw.mjs` step and no check that the committed sw.js matches the committed tree. Recomputing gen-sw.mjs's own hash over the tree three times during this audit gave, each time, a value different from the VERSION in sw.js: `sm-49c4f381e8` vs computed `sm-a9cb4db00b`; `sm-b951a38c58` vs computed `sm-2813e8382e`. It also let a real precache miss ship: for a window during this audit `js/engine/viewport.js` existed and was imported by js/engine/renderer.js:10, js/engine/camera.js:8 and js/engine/godrays.js:14, but was absent from PRECACHE. I installed the worker from a local server on :8123, killed the server, and reloaded — the navigation returned 200 from cache but the console showed `js/engine/viewport.js :: net::ERR_FAILED` and `window.__ready` never became true. The game did not boot offline.

**Expected.** A push to main cannot deploy a service worker whose VERSION or PRECACHE disagrees with the files being deployed.

**Actual.** When a source file changes and gen-sw.mjs is not re-run, sw.js is byte-identical to the deployed one, so the browser fires no update at all. Navigations are network-first (sw.js:167-181) so the player DOES get the new index.html, while every subresource keeps coming cache-first (sw.js:198) from the old cache. New HTML + old js/main.js + old css/main.css, permanently, with no update banner and no way for the player to escape it.

**Remedy.** Add a verification step before upload in deploy.yml: `- run: node tools/gen-sw.mjs && git diff --exit-code sw.js` (fails the build if the committed worker is stale), and give gen-sw.mjs a `--check` mode so it can run in CI without writing. `path: .` is fine — upload-pages-artifact@v3 already excludes .git and .github.

### 1. Specular lobe never compiles: onBeforeCompile .replace() targets GLSL that lives inside an unresolved #include

**Major · Render · `js/engine/materials.js:313` · fixed in `cc84e4d`**

**Repro.** Hook WebGL2RenderingContext.prototype.shaderSource before boot, load http://127.0.0.1:8080/Strongest-Man/?autoplay=1&seed=7, wait for window.__ready, then count sources containing 'smHalf'. Result: 0 of 56 compiled shaders. The compiled world fragment shader reads: `LambertMaterial material;\nmaterial.diffuseColor = diffuseColor.rgb;\nmaterial.specularStrength = specularStrength;\nmaterial.specularStrength = smSpecPow;\n\nvec3 geometryPosition = - vViewPosition;` — the injected specular block is absent. Same for makeCharacterMaterial (js/engine/materials.js:374, identical no-op).

**Expected.** Glass, car paint, wet asphalt, metal and every character get the Blinn-Phong lobe the file header describes, scaled by the per-surface sInt/sPow table and by CHAR_SPEC.

**Actual.** three calls onBeforeCompile BEFORE resolveIncludes (vendor/three/three.module.min.js: `e.onBeforeCompile(s,G),u=Ie.acquireProgram(s,l)`), so shader.fragmentShader still contains `#include <lights_lambert_pars_fragment>` and the literal being searched for does not exist in the string. String.replace returns the source unchanged — silently. reflectedLight.directSpecular therefore stays 0, `reflectedLight.directSpecular *= smSpecInt;` (line 320) multiplies zero, and no surface in the game has a highlight. `material.specularStrength = smSpecPow;` (line 311) and CHAR_SPEC/CHAR_POW are dead writes/constants; only the fresnel rim at lights_fragment_end survives.

**Remedy.** Move the injection to an include that actually exists in meshlambert_frag. Replace `#include <lights_fragment_begin>` with a copy of the chunk that has the specular accumulation added, or override THREE.ShaderChunk.lights_lambert_pars_fragment once at module load with a version whose RE_Direct_Lambert carries the smHalf term (guarded behind a #ifdef the two materials define). Add a boot assertion that the compiled source contains 'smHalf' so this cannot regress silently on the next three upgrade.

### 2. camera.aspect is never recomputed on orientationchange — only the renderer is

**Major · Render · `js/engine/camera.js:38` · fixed in `c474314`**

**Repro.** Boot the page at 956x440. Then in the page: redefine innerWidth/innerHeight to 440/956 and dispatch ONLY `new Event('orientationchange')` (modelling iOS Safari, where the metrics available at `resize` time are stale — which is precisely why js/engine/renderer.js:34 waits 250ms). After 500ms: renderer drawing buffer went [1912,880] -> [880,1912] and getSize() -> [440,956], but camera.aspect stayed 2.172727 (expected 0.460251).

**Expected.** After a device rotation the projection aspect matches the drawing-buffer aspect, so the scene is not distorted.

**Actual.** js/engine/renderer.js registers BOTH a `resize` and a delayed `orientationchange` handler (`window.addEventListener('orientationchange', () => setTimeout(() => resize(), 250));`), but camera.js registers only `resize`. The renderer self-corrects at +250ms and the camera does not, so the whole scene renders horizontally stretched/squashed until some later resize event happens to fire — which on a landscape-locked home-screen PWA may be never. This is the one code path every player hits: the game ships a #rotate-overlay telling them to rotate the phone.

**Remedy.** Give createRenderer a single resize owner and have camera + godrays subscribe to it: in renderer.js keep one `resize()` that fires a callback list, call it from both `resize` and the delayed `orientationchange` handler (debounced with one timer, ~120ms), and register `camera.aspect = w/h; camera.updateProjectionMatrix()` and `godrays.resize()` as subscribers instead of each module listening to `resize` on its own.

### 3. probeTier measures the display's frame interval, not render cost — 'auto' can never pick 'high'

**Major · Render · `js/engine/quality.js:56` · fixed in `5418f1e`**

**Repro.** In the booted page, run the same 12-iteration loop twice: once sampling `performance.now() - t0` immediately after renderer.render (median 2.0 ms -> tier 'high'), once sampling after the awaited rAF exactly as written (median 3360.6 ms -> tier 'low'). The push happens after the await, so every sample = render cost + time until the next animation frame.

**Expected.** The sample is the cost of renderer.render(scene, camera), so `med < 7.5 -> high` measures GPU capability.

**Actual.** Each sample is dominated by the rAF wait: ~16.7 ms on a 60 Hz device (median 16.7 > 13 -> always 'low') and ~8.3 ms on a 120 Hz ProMotion iPhone (7.5 <= 8.3 < 13 -> 'medium'). Selecting 'Auto — measure this device' therefore permanently downgrades the target hardware; the result is written to settings.qualityResolved and persisted (js/main.js:232-233), so it sticks across sessions.

**Remedy.** Capture the sample before the await: `const dtms = performance.now() - t0; await new Promise(r => requestAnimationFrame(r)); samples.push(dtms);`. Better still, call `renderer.getContext().finish()` (or read a query) before stopping the clock so the sample reflects GPU work rather than command submission, and drop the first few warm-up samples.

### 4. Switching to the low tier leaks the 3072x3072 shadow depth target forever

**Major · Perf · `js/engine/shadows.js:100` · fixed in `5418f1e`**

**Repro.** Boot at the default 'high' tier, read `sun.shadow.map` -> 3072x3072 and `renderer.info.memory.textures` -> 79. Call `window.__quality('low')`, wait two frames, read again: `sun.shadow.map` is STILL 3072x3072 and info.memory.textures is still 79.

**Expected.** Dropping to a tier with no shadows frees the ~37 MB depth texture — the whole point of the low tier is to fit weaker hardware.

**Actual.** TIERS.low has `shadowSize: 0` (js/engine/quality.js:16), so the `if (t.shadowSize)` guard is false and the dispose branch never runs. renderer.shadowMap.enabled goes false and sun.castShadow goes false, so the map is never used again, but the WebGLRenderTarget and its 3072x3072 depth texture stay resident. A player who drops to 'low' because the phone is thermally throttling keeps paying the full shadow-map memory cost, and the same 37 MB is retained when Auto resolves to 'low' after the tier was initialised at 'high' (js/main.js:229-236 runs applyQuality after initShadows).

**Remedy.** Move the dispose out of the size guard: always `if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }` when the tier changes, and only call `sun.shadow.mapSize.set(...)` when t.shadowSize is non-zero. Guard on an actual change (previous tier's shadowSize) so a no-op setTier does not force a needless rebuild.

### 5. God-ray render targets never resize on orientationchange; mask keeps the pre-rotation aspect

**Major · Render · `js/engine/godrays.js:113` · fixed in `c474314`**

**Repro.** Same iOS rotation path as the camera.aspect finding: js/engine/renderer.js:34 corrects the drawing buffer at +250ms after `orientationchange`, but godrays only listens to `resize` (and then at +60ms). On iOS, where the metrics at `resize` time are stale — the reason the 250ms delay exists at all — maskRT/rayRT are sized from the pre-rotation dimensions and are never revisited.

**Expected.** maskRT and rayRT track the canvas: `w = floor(getSize().x / 4)`, `h = floor(getSize().y / 4)` after every canvas resize, whatever triggered it.

**Actual.** maskCam.copy(cam) inherits the (correct) new camera aspect while the mask render target still has the old aspect, so the occluder mask is rendered stretched relative to the main pass. COMPOSITE_FRAG then samples tRays with the fullscreen quad's vUv 1:1, so the shafts are offset from the sun disc and from the buildings that are supposed to occlude them. rayRT is also the wrong resolution for the blur radius baked into uDensity.

**Remedy.** Subscribe godrays.resize to the same single resize owner proposed for renderer/camera (it is already exported on the returned object as `resize`), and drop the private `addEventListener('resize', ...)` here. As a minimum, add `addEventListener('orientationchange', () => setTimeout(resize, 300));` so the RTs follow the renderer's delayed correction.

### 6. Blob-shadow follower slots are never released; every despawned monster leaks one permanently

**Major · Render · `js/engine/blobshadows.js:40` · fixed in `5418f1e`**

**Repro.** Boot with ?nomonsters=1. Probe the next free slot with `addBlob({x:0,y:0,z:0,blobOn:false},0.01).idx` -> 55. Call `window.__test.spawnMonster(0, 30+i, 30)` five times, probe again -> 61 (delta 6 = 5 monsters + the previous probe). The index only ever grows; the module exports initBlobShadows/addBlob/blobFrame and no removal function at all, and js/ai/monster.js:447 `function despawn(m) { scene.remove(m.root); const i = monsters.indexOf(m); if (i >= 0) monsters.splice(i, 1); }` removes the root from the scene but never releases m.blob.

**Expected.** A despawned monster gives its blob slot back, so the 96-slot pool serves an unbounded number of monsters over a session.

**Actual.** followers[] grows monotonically. 1 player + 48 NPCs occupy 49 slots permanently, leaving 47. After ~47 monster deaths addBlob returns null, `m.blob = null`, and every subsequent monster spawns with no ground shadow at all — silently, with no error. Meanwhile blobFrame() keeps iterating and writing a matrix for every dead follower and uploads all 96 instance matrices every frame regardless.

**Remedy.** Add `export function removeBlob(f)` that nulls the slot and pushes f.idx onto a free-list, have addBlob pop the free-list before extending, and call it from monster despawn (js/ai/monster.js:447). Have blobFrame skip freed slots rather than composing a matrix for them, and set mesh.count to the high-water mark so unused instances are not submitted.

### 14. Points are never written to disk while the game is not in 'playing' — an award followed by pause/shop/backgrounding is lost

**Major · Logic · `js/core/points.js:68` · fixed in `5418f1e`**

**Repro.** Verified in Chromium at /Strongest-Man/?autoplay=1&seed=7. Set a known balance, then: `window.__test.grantPoints(500); window.__test.shop.open('hud');` in the same tick. After 5 real seconds: `{"mem":600,"ls":100,"st":"paused"}` — the in-memory and HUD balance is 600, localStorage still holds 100. It stays 100 for as long as the shop/pause screen is up, however long that is.

**Expected.** Points earned are durable within ~2.5s, and are flushed whenever play stops or the app is backgrounded.

**Actual.** `award()` (js/core/points.js:43) sets `saveT = 2.5` and the countdown lives in `fixedUpdate`, which is registered as a FIXED system (js/main.js:75). `fixed()` early-returns on `if (game.state !== 'playing') return;` (js/main.js:318), so the countdown is frozen for the entire duration of pause / shop / settings / rotate-to-portrait. Compounding it, there is no `visibilitychange`, `pagehide`, `freeze` or `beforeunload` handler anywhere in the tree (verified by grep over js/, index.html and sw.js), so nothing flushes on the way out either. The normal way an iPhone player stops — kill the last monster, hit PAUSE, swipe home, iOS reclaims the PWA — loses the kill every time. `save.earned` is documented as "lifetime, never spent down — the only real score" (js/core/state.js:20).

**Remedy.** Flush on the way out of 'playing' and on the way out of the page: call `persist()` from a `GAME_STATE` listener when the new state is not 'playing' and `saveT > 0`, and add `addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); })` plus a `pagehide` listener (iOS often skips `beforeunload` entirely).

### 15. A corrupt sm_save_v1 silently and permanently deletes the user's stored Groq API key and the whole save

**Major · Logic · `js/core/state.js:45` · fixed in `5418f1e`**

**Repro.** Verified in Chromium. Seed storage with a real key and a truncated save, then load the game: localStorage.setItem('sm_groq_key','gsk_REAL_USER_KEY'); localStorage.setItem('sm_save_v1','{"save":{"points":4321,"earned":9999,"owned":["pistol","smg"'); After boot: key still present, points 0. Then trigger any persist (`window.__test.grantPoints(5)`), wait 4s: {"key":null,"save":"{...\"points\":5,...\"owned\":[\"pistol\"]...}"} The key is gone from localStorage and the 4321 points / owned SMG have been overwritten with defaults.

**Expected.** A malformed save costs the player their progress at worst; it must not take a secret they typed in by hand and stored in a completely separate key.

**Actual.** The `localStorage.getItem('sm_groq_key')` read sits INSIDE the same try block as `JSON.parse(raw)`, so a parse throw skips it and `settings.groqKey` stays `''`. `persist()` then treats the empty string as "the user cleared the field" and executes `localStorage.removeItem('sm_groq_key')`, destroying a key that cannot be reproduced (js/ui/settings.js:38-40 says exactly that: "The owner's key cannot be reproduced anywhere else"). The same swallow silently resets karma/points/earned/owned/equipped to defaults and then persists the defaults over the corrupt record, with no notice and no backup. `settings.audio` and `settings.lookSensitivity` are likewise unrecovered.

**Remedy.** Read `sm_groq_key` outside the try (its own try/catch), before or after the save parse; and make `persist()` remove the key only when the user explicitly cleared it (an explicit `groqKeyCleared` flag set by settings.js) rather than inferring it from an empty string. Optionally keep the unparseable raw string under a `sm_save_v1.bad` key instead of overwriting it.

### 16. Audio cannot recover after the PWA is backgrounded on iOS: the only unlock listener is {once:true} and the fallback resume() is un-gestured and uncaught

**Major · Audio · `js/engine/audio.js:17` · fixed in `5418f1e`**

**Repro.** iPhone, installed PWA. Play until a sound has fired (context unlocked), swipe home / take a call, come back and punch something. iOS suspends the AudioContext on background and does not auto-resume.

**Expected.** Returning to the foreground restores sound, or at minimum re-arms a user-gesture unlock so the next tap fixes it.

**Actual.** There is no `visibilitychange`/`pagehide` handler anywhere in the tree, so nothing suspends the context on the way out or resumes it on the way back in. The only gesture-driven unlock is `window.addEventListener('pointerdown', unlockAudio, { once: true });` (js/engine/audio.js:62) — already consumed on the first tap of the session — plus the one-shot call from the PLAY button (js/ui/overlays.js:18). After that the sole resume path is this line, reached from event-bus SFX handlers, i.e. never from a user gesture; iOS rejects `resume()` outside a gesture. The call has no `.catch`, so the rejection is an unhandled promise rejection, and the game is silent for the rest of the session.

**Remedy.** Add `document.addEventListener('visibilitychange', ...)` that calls `ctx.suspend()` when hidden and re-arms a `{once:true}` pointerdown unlock when visible; and give this line a `.catch(() => {})` (or `.catch(() => addEventListener('pointerdown', unlockAudio, { once: true }))`) so a rejected resume re-arms instead of going unhandled.

### 17. window.__perf.maxMs / p99Ms can never exceed 100 and fps can never read below 10 — the perf gate is blind to exactly the hitches it was written to catch

**Major · Perf · `js/core/debug.js:66` · fixed in `5418f1e`**

**Repro.** Chromium/swiftshader at /Strongest-Man/?autoplay=1&seed=7. Poll `renderer.info.render.frame` (true render count) alongside `window.__perf` every 2s: glFrame went 9 → 39 over 18s of wall clock — 30 rendered frames in 18s, a real 1.67 fps / ~600ms per frame — while __perf reported {"fps":10-15,"ms":86.1-100,"maxMs":100,"p99Ms":100}. maxMs and p99Ms sat at exactly 100.00, saturated.

**Expected.** `ms`/`maxMs`/`p99Ms` are real wall-clock frame intervals, so a 300ms collapse hitch reads as 300.

**Actual.** `perfFrame` is fed `lastDt` (js/main.js:350), and `lastDt` is the loop's post-processed dt, not the real interval: js/core/loop.js:35-37 does `let dt = Math.min((tMs - last) / 1000, 0.1); last = tMs; dt *= game.slowmo;`. The 0.1 clamp hard-caps every sample at 100ms, so `maxMs`/`p99Ms` are structurally incapable of exceeding 100 and `fps` cannot go below 10 — and the file's own header (js/core/debug.js:7-9) says "a game that averages 60 fps and stalls for 300ms when a building falls reads as fine on `ms` alone, so hitch work is judged on these". The one metric hitch work is judged on always reports 100 for any stall of 100ms or worse. The `* game.slowmo` on the same line adds a second error: during a charged-punch hit-stop (`game.slowmo = 0.25`, js/player/combat.js:212) every sample is 4x too small, so `ms` reads 4x low and `fps` 4x high. `tAcc >= 1` also stops meaning "one second" — at…

**Remedy.** Have main.js pass the unclamped, unscaled wall-clock delta to `perfFrame` — either capture `tMs` in the loop and hand `render()` the raw `(tMs - prevTms)/1000`, or call `performance.now()` in `perfFrame` and derive the interval there. Keep the clamped/scaled dt for simulation only.

### 25. resetInput() is never wired to a game-state change — a PUNCH release queued behind PAUSE fires an unrequested attack the instant play resumes

**Major · Touch · `js/core/input.js:230` · fixed in `5aa9e2e`**

**Repro.** grep -rn 'resetInput\|EV.GAME_STATE' js/ returns only js/ui/inspect.js:174,197 — there is no on(EV.GAME_STATE, ...) listener anywhere, so the comment's contract is unimplemented for PAUSE / SHOP / SETTINGS / the rotate overlay. main.js `function fixed(dt) { if (game.state !== 'playing') return; ... pollInput(dt);` means pollInput stops while paused, so pending edges accumulate. Playwright (844x390, real CDP touch): touchStart on #btn-punch -> click #btn-pause (game.state 'paused') -> touchEnd on #btn-punch (the pointer is captured by the button, so release() runs and sets state.pendingPunchUp with nothing to consume it) -> click #btn-resume, then exactly one fixed step in the same task via window.__test.step(1/60): {"beforeStep":{"released":false,"down":false},"afterOneStep":{"released":true,"pressed":false}}. Control (pause+resume with nothing held): {"released":false,"pressed":false}.

**Expected.** Leaving/entering 'playing' drops every held button and pending edge, so nothing a finger did behind an overlay fires on the way out.

**Actual.** input.punchReleased is true on the first fixed step after RESUME with no finger on the screen. combat.js:116 `} else if (input.punchReleased && !p.dead) { const charge = p.charge; ... swing(charge); }` throws a punch the player never asked for — and p.charge is whatever it was when the overlay went up, because combat.fixedUpdate does not run while paused, so it can be a full-power charged punch (crater, shockwave, EV.FEAT, karma hit).

**Remedy.** Subscribe to the state bus in ui/hud.js or main.js: `on(EV.GAME_STATE, ({state}) => resetInput())` — the function already exists and already clears buttons, pendings, axes and stickId; nothing calls it.

### 26. Armoury DONE button is entirely below the screen when the shop opens — panels apply max-height to the content box, so they end up taller than the viewport

**Major · UI · `css/main.css:400` · fixed in `5aa9e2e`**

*Also recorded as #46 by the second sweep.*

**Repro.** 844x390 landscape, window.__test.shop.open(): #shop-panel rect = {y:-4, h:398} in a 390px viewport, scrollTop 0, scrollHeight 471, clientHeight 394. #btn-shop-done rect = {y:393, bottom:441} — 100% below the viewport bottom; document.elementFromPoint at its centre returns 'shop-panel'. With real landscape insets (--sa-r/l 47px, --sa-b 21px) it is worse: scrollHeight 492 vs clientHeight 394. #settings-panel: {y:-10, h:410} in the same 390px viewport (heading clipped at the top, panel bottom 10px off-screen), scrollHeight 446/467 vs clientHeight 406, #btn-settings-done {y:356, bottom:404} — its bottom 14px is cut off.

**Expected.** `max-height: calc(100vh - insets - 24px)` should keep the panel inside the screen with a 12px margin top and bottom, and DONE — the only element bound to close() (js/ui/shop.js:109 `el('btn-shop-done')?.addEventListener('click', close);`) — should be visible on open.

**Actual.** There is no `box-sizing: border-box` on these panels, so max-height sizes the CONTENT box only; padding (20 + 20 + --sa-b) plus 4px of border adds 44-65px on top, making the border box 8-40px TALLER than the whole screen. The shop opens with no DONE button visible anywhere and no scrollbar cue (a finger drag does scroll it — scrollTop 0 -> 77 brings DONE to y 316 — but nothing tells the player that).

**Remedy.** Add `box-sizing: border-box;` to the `#settings-panel, #pause-panel, #shop-panel` rule (as #update-banner:619 and .wchip:193 already do), and/or move the `.btnrow` out of the scrolling box (position it sticky at the bottom of the panel) so DONE is never below the fold.

### 27. #chat is a 314x223 pointer-events:auto dead zone sitting inside the joystick's left-44% claim region

**Major · Touch · `css/main.css:307` · fixed in `5aa9e2e`**

*Also recorded as #50 by the second sweep.*

**Repro.** js/core/input.js:75 `if (e.clientX < w * 0.44 && state.stickId === -1) {` claims the stick anywhere in the left 44% and only listens on #gl. Measured at 844x390: #chat border box = x 10 -> 372 (57 -> 419 with real 47px insets), y 62 -> 284.8; the claim boundary is x < 371.4, so the panel covers 314-362px of the 371.4px claim width for 223px of the 390px screen height. CDP touchStart(180,160)+touchMove(240,160) with the chat open and the field blurred: {"moveX":0,"stickActive":false}. Identical gesture at y=340 (below the panel): {"moveX":1,"stickActive":true}. The blurred-but-open state is trivially reachable: tapping the world once only blurs the field (input.js:71 returns before preventDefault when textFocus is set), and talk.js:120 keeps the panel open until you are 7m away.

**Expected.** The file's own rule, stated twice (css/main.css:176-183 for #weapons and 495-506 for #art-prompt): 'ANY pointer-events:auto element of the HUD sitting in that half is a permanent hole in the stick.'

**Actual.** #chat violates exactly that rule and is the largest such hole in the HUD — the whole upper-left quadrant of the joystick region is dead while a conversation panel is up, which is precisely when the player wants to walk away.

**Remedy.** Drop `pointer-events: auto` from #chat and put it on #chat-head, #chat-log and #chat-form instead (the gaps between them still leak, so better: move the panel into the LOOK half like #weapons/#art-prompt, or cap it with `max-width: calc(44vw - 20px)` measured from the viewport rather than from #hud).

### 28. TALK cannot close the conversation while the chat field has focus — pollInput discards pendingInteract before it is ever folded in

**Major · Touch · `js/core/input.js:63` · fixed in `5aa9e2e`**

**Repro.** Playwright, real CDP touch on #btn-interact next to an NPC. Tap 1: {"open":true,"textFocus":true,"active":"chat-input"}. Tap 2 (should close): {"open":true,"textFocus":true,"active":"chat-input"} — nothing happens. Blur the field, then tap TALK: {"open":false,"textFocus":false} — now it works. The press handler is deliberately NOT wrapped in `guarded`, but pollInput's textFocus branch (input.js:182,185) runs first: `input.jumpPressed = input.grabPressed = input.interactPressed = false;` ... `state.pendingJump = state.pendingGrab = state.pendingInteract = state.pendingCycle = false;` — so the pending edge is cleared before line 203 can ever turn it into input.interactPressed. And the button's own `e.preventDefault()` on pointerdown (input.js:46) suppresses the compatibility mousedown, so tapping TALK does not blur the field either.

**Expected.** The comment on the same line: TALK closes the panel too, including while the text field has focus (which is the state openChat leaves you in — talk.js:199 calls chat.input.focus()).

**Actual.** TALK is inert for the entire time the field has focus, which on iOS is from the moment the panel opens until the player finds the 26x26 ✕ or taps the world to blur it.

**Remedy.** Keep pendingInteract alive through the textFocus branch: clear pendingJump/pendingGrab/pendingCycle but let pendingInteract fall through to line 203 (or handle it explicitly in the branch: `input.interactPressed = state.pendingInteract; state.pendingInteract = false;` before the return).

### 29. chat.input.focus() is called from the fixed-step loop, not a user gesture — iOS shows no keyboard while every control is locked out

**Major · Touch · `js/dialogue/talk.js:199` · fixed in `5aa9e2e`**

**Repro.** Call chain: #btn-interact pointerdown -> `state.pendingInteract = true` (input.js:63) -> next rAF frame -> main.js `function fixed(dt)` -> pollInput turns it into input.interactPressed -> main.js:194 `if (inputRef.interactPressed) dialogue.onInteract();` -> onInteract -> openChat(n) -> chat.input.focus(). That is a requestAnimationFrame callback, two task boundaries away from the touch. iOS Safari (and standalone PWAs) only raise the software keyboard for focus() invoked synchronously inside a user-gesture handler. Verified in Chromium that focus DOES apply: {"open":true,"textFocus":true,"active":"chat-input"} — so talk.js:172 `chat.input.addEventListener('focus', () => { input.textFocus = true; });` fires and locks the controls.

**Expected.** Tapping TALK opens the conversation with the keyboard up, ready to type.

**Actual.** On iOS the field takes focus (so input.textFocus = true and pollInput zeroes every axis and edge — the player cannot move, punch, jump or grab) but no keyboard appears, and TALK will not close the panel either (see the pendingInteract finding). The only exits are the 26x26 ✕ or a throwaway tap on the world to blur.

**Remedy.** Focus the field from the gesture itself — call chat.input.focus() inside the TALK button's pointerdown/pointerup handler (or a click handler on #btn-interact) rather than from the fixed step; queue the rest of openChat as it is today.

### 30. Action buttons have no per-pointer refcount: a second finger's release drops the hold while the first finger is still pressing

**Major · Touch · `js/core/input.js:47` · fixed in `5aa9e2e`**

**Repro.** CDP touch, 844x390: touchStart id=11 at (punchCx-20, punchCy) -> touchStart id=12 at (punchCx+20, punchCy) — both land on the 86x86 #btn-punch. State: {"down":true,"cls":"abtn big held"}. touchEnd id=12 only, id=11 still down: {"down":false,"charge":0.33,"cls":"abtn big"}. The button is visually un-held and input.punchDown is false with a finger still on it.

**Expected.** PUNCH stays held (and .held stays applied) until the LAST pointer on the button lifts — a rolled thumb, a second finger joining during full-auto fire, or a palm contact must not cancel the hold.

**Actual.** release() is per-event, not per-pointer: the first pointerup/pointercancel/lostpointercapture from ANY of the pointers currently on the button runs `up()` and removes .held. For PUNCH that ends a charge / stops full-auto fire mid-hold; the player has to lift and re-press to get it back.

**Remedy.** Track live pointer ids per button (a Set on the button record pushed at line 45): add on pointerdown, delete in release, and only run `up()` / remove .held when the set becomes empty. resetInput() should clear the set too.

### 31. #chat-input is font-size:15px — iOS zooms the viewport on focus and the player cannot zoom back out

**Major · Touch · `css/main.css:342` · fixed in `5aa9e2e`**

**Repro.** Measured computed font-size on #chat-input: 15px (also #set-groq 14px at css/main.css:423 and #set-quality 14px at css/main.css:418). iOS Safari's focus auto-zoom threshold is exactly 16px, not '16px-ish' — anything strictly below 16px zooms the layout viewport when the field is focused. index.html:5 `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">` plus css/main.css:29 `touch-action: none;` mean there is no pinch gesture left to undo it, and in a standalone home-screen PWA there is no address bar to reset the scale either.

**Expected.** Focusing the conversation field leaves the HUD at 1x scale.

**Actual.** The whole fullscreen landscape HUD jumps to a zoomed viewport as soon as the player taps the text field, and stays there — the joystick region, the button cluster and the safe-area layout are all displaced for the rest of the session.

**Remedy.** Set font-size: 16px on #chat-input, .key-row input[type=password] (css:423) and .srow select (css:418). If 16px is visually too large, scale it back down with `transform: scale(0.94)` + `transform-origin: left center` rather than by lowering font-size.

### 32. #btn-pause is 40x32 CSS px — under the 44x44 HIG minimum in both axes

**Major · Touch · `css/main.css:291` · fixed in `5aa9e2e`**

**Repro.** Measured getBoundingClientRect at 844x390: {"w":40,"h":32,"x":796,"y":8}. 40 x 32 = 1280 sq px vs the 1936 sq px HIG minimum (66%), and it is short in BOTH axes. It sits in the top-right corner where a landscape grip has to stretch a thumb to reach it, and it is the only route to RESUME/ARMOURY/SETTINGS.

**Expected.** At least 44x44 CSS px of tappable area (Apple HIG).

**Actual.** 40x32.

**Remedy.** Give it `min-width: 44px; min-height: 44px; box-sizing: border-box;` (keeping the visual pill via an inner span or padding), or grow it outright to 44x44 — there is room, #btn-shop can shift left with it.

### 33. #btn-shop is 59.19x32 and only 6px from #btn-pause — short target, mis-tap risk with a neighbouring modal trigger

**Major · Touch · `css/main.css:204` · fixed in `5aa9e2e`**

**Repro.** Measured at 844x390: #btn-shop {"w":59.19,"h":32,"x":730.8} -> right edge 789.99; #btn-pause {"x":796} -> the horizontal gap between the two is 6.01px. Both are 32px tall (73% of the 44px minimum) and both open a modal that pauses the world, so a mis-tap costs a full open/close cycle.

**Expected.** 44px minimum in the short axis, and enough separation that a fingertip cannot straddle two different modal triggers.

**Actual.** 32px tall with a 6px gutter between two adjacent pause-the-game buttons.

**Remedy.** `min-height: 44px; box-sizing: border-box;` on both and widen the gutter to >= 12px (move #btn-shop to `right: 62px` once #btn-pause is 44px wide).

### 34. .wchip weapon chips are 23px tall and equip on pointerdown, with a 6px gutter when the rail wraps

**Major · Touch · `css/main.css:193` · fixed in `5aa9e2e`**

**Repro.** Measured at 844x390 with a full armoury: FISTS 51.92x23, PISTOL 60.14x23, SMG 44.6x23, SHOTGUN 74.5x23, RIFLE 52.5x23, SNIPER 61.4x23, CANNON 67.7x23. The rail wraps to two rows at y=330 and y=359 — a 29px pitch, so 6px of vertical gutter between two 23px targets. js/ui/hud.js:135 activates them on `pointerdown` with preventDefault, so there is no press-and-slide-off cancel: `b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); weapons?.equip(id || null); }, { passive: false });`

**Expected.** 44px minimum in the short axis for a control that swaps your weapon mid-fight, and a way to back out of a mis-touch.

**Actual.** 23px tall (52% of the minimum) with 6px gutters, committing on touch-down. The comment at css/main.css:176-183 already records that a stray touch on this rail 'switched him to FISTS mid-fight'.

**Remedy.** `min-height: 44px` with the visual pill kept small via an inner span, or a transparent `::before { inset: -11px 0 }` hit-slop; and commit on pointerup (with a slop check) rather than pointerdown.

### 35. #chat-close is 26x26 CSS px — the escape hatch from the input-lock is 34% of the HIG minimum area

**Major · Touch · `css/main.css:319` · fixed in `5aa9e2e`**

**Repro.** Measured at 844x390: {"w":26,"h":26,"x":335,"y":71}. 26 x 26 = 676 sq px vs 1936 (34.9%). This is the control the player has to hit while input.textFocus is true and every game control is dead (pollInput input.js:178-191), and while the TALK button is inert (see the pendingInteract finding).

**Expected.** 44x44 minimum, especially for the only reliable dismissal of a modal input lock.

**Actual.** 26x26, in the top-right corner of a 362px-wide panel.

**Remedy.** `min-width: 44px; min-height: 44px; box-sizing: border-box;` and keep the 26px visual box centred inside it (or add `padding: 9px; margin: -9px;` to grow the hit box without moving the glyph).

### 42. Crosshair is centred on the safe-area box, not on the canvas — it misses the actual point of impact by 29.5px on every notched iPhone, and the error flips sides when the phone is rotated

**Major · Render · `css/main.css:138` · fixed in `5aa9e2e`**

**Repro.** #reticle is a child of #hud, which is `inset: var(--sa-t) var(--sa-r) var(--sa-b) var(--sa-l)` (css/main.css:85), so left/top:50% is 50% of the INSET box. The bullet direction is the camera forward vector (js/player/weapons.js:290 aimDir / :637 `cam.camera.getWorldDirection`), which projects to the centre of the CANVAS — and the canvas is full-bleed (`#gl { position: fixed; inset: 0 }`, css/main.css:43) sized to `window.innerWidth/innerHeight` (js/engine/renderer.js:30). Measured in Chromium with the insets forced to iOS landscape values: 852x393, sa-l:59/sa-r:0 -> reticle centre (455.5, 186.0) vs viewport centre (426.0, 196.5); 852x393 sa-l:0/sa-r:59 -> reticle centre (396.5, 186.0). Same +/-29.5 / -10.5 at 667x375, 844x390 and 932x430.

**Expected.** The crosshair sits exactly where the round lands: viewport centre (W/2, H/2). js/player/weapons.js:629 even asserts this — "The reticle is a div pinned at 50%/50%, so the camera's forward direction and the direction a round leaves in have to be the SAME vector".

**Actual.** The reticle is displaced by ((sa_l - sa_r)/2, (sa_t - sa_b)/2) = +29.5px right / 10.5px up with the Dynamic Island on the left, and 29.5px LEFT / 10.5px up with it on the right. At 60m a 29.5px lateral error is roughly a whole NPC body width; the aim assist cone (AIM_CONE, 9 deg) masks it near targets and exposes it on everything else.

**Remedy.** Take #reticle out of #hud and position it against the canvas: `#reticle { position: fixed; left: 50%; top: 50%; }` as a sibling of #gl (or inside a new full-bleed `#reticle-layer { position: fixed; inset: 0; pointer-events: none; z-index: 9 }`). Same for the hit-marker ring, which inherits the same origin.

### 43. Speech bubbles are positioned with full-canvas NDC inside a safe-area-inset layer — they detach from the speaker's head by up to 59px horizontally / 21px vertically on every notched iPhone

**Major · Render · `js/dialogue/bubbles.js:47` · fixed in `5aa9e2e`**

**Repro.** `layer` is #bubbles, which is `inset: var(--sa-t) var(--sa-r) var(--sa-b) var(--sa-l)` (css/main.css:46-52). `V.project(camera)` produces NDC against the CANVAS, which is full-bleed and sized to window.innerWidth/innerHeight. Measured at 852x393 with sa-l:59 / sa-b:21: #bubbles rect = [x 59, y 0, w 793, h 372] while #gl = [x 0, y 0, w 852, h 393]. An NPC at NDC x=0 lands at 59 + 793/2 = 455.5 instead of 426.0 (+29.5px); at NDC x=-1 (canvas left edge) it lands at 59 instead of 0 (+59px); at NDC y=-1 (canvas bottom) it lands at 372 instead of 393 (-21px). The error scales with screen position, so a bubble slides away from its owner as the speaker moves across frame.

**Expected.** A bubble's tail sits on the speaker's head at every screen position, on every device.

**Actual.** On any device that reports a left/right or bottom inset (i.e. every iPhone in the target matrix except the SE), bubbles are both offset and non-uniformly scaled: correct only where the inset happens to be zero. `overflow: hidden` on #bubbles then clips the ones that drifted toward the inset edge.

**Remedy.** Either make #bubbles full-bleed (`inset: 0`) and keep the current NDC math, or keep the inset box and convert: `x = ((V.x+1)/2) * innerWidth - saLeft`, `y = ((1-V.y)/2) * innerHeight - saTop`, reading the insets from getComputedStyle(document.documentElement).getPropertyValue('--sa-l') once per resize. Full-bleed is simpler — nothing in #bubbles is interactive so it needs no safe-area protection.

### 44. #toast is drawn on top of the weapon rail on all four iPhone viewports — the comment justifying `bottom: 42px` describes a layout that no longer exists

**Major · HUD · `css/main.css:355` · fixed in `5aa9e2e`**

**Repro.** #weapons no longer owns the bottom centre — it was moved to `right: 210px; bottom: 8px` with `flex-wrap: wrap-reverse` (css/main.css:185-187), so it grows UPWARD past `bottom: 42px`. Measured with the full 7-chip rail and toast text 'SNIPER equipped': 667x375 — toast (x 269.8..397.2, y 305..333) overlaps the SMG chip (331.9..376.5, y 315..338) by 44.6x18px and the RIFLE chip (337.2..389.6, y 286..309) by 52.4x4px. 844x390 — toast (358.3..485.7, y 320..348) overlaps the RIFLE chip (440.5..492.9, y 330..353) by 45.2x18px. Same at 852x393 and 932x430. Only 1920x1080 is clear. #toast is later in the DOM than #weapons (index.html:95 vs :79) and both are z-index auto, so the toast's opaque rgba(13,27,62,0.85) box paints over the chips.

**Expected.** A toast never covers a control. The rail only needs two rows before it reaches y=42; at 667x375 `max-width: calc(56% - 220px)` = 153.5px, so FISTS(51.9)+PISTOL(60.1)+6px gap = 118px fits one row but adding SMG (44.6px) makes 168.6px and wraps — i.e. this collides from the second gun purchase onward.

**Actual.** Buying a second gun makes every toast for the rest of the session land on top of the weapon chips.

**Remedy.** Anchor the toast where nothing else lives — either move it to the top band under #karma-wrap (`top: calc(38px)`, centred) or give it `bottom: 42px` only in the left half: `left: 24px; right: auto; transform: none; max-width: 40%`. If it must stay bottom-centre, raise it above the rail's tallest possible height (3 rows = 8 + 3*23 + 2*6 = 89px, so `bottom: 100px`) and re-check against #down-banner.

### 45. Weapon chips paint on top of the ammo readout — the ammo count and RELOADING text are occluded on every viewport once the rail wraps to two rows

**Major · HUD · `css/main.css:167` · fixed in `5aa9e2e`**

**Repro.** The comment only reasons about #btns; the element that actually collides is #weapons at `right: 210px; bottom: 8px` with `flex-wrap: wrap-reverse`, whose rows are right-aligned to x = hudWidth-210 and stack upward through the ammo box. Measured, full 7-chip rail: 667x375 — SHOTGUN chip (382.5..457, y 315..338) vs #ammo showing '34/34 RELOADING' (415..487, y 313..341) = 42x23px overlap; with the state line empty, #ammo shrinks to (450..487) and the overlap is still 7x23px. 852x393 — CANNON chip (574.3..642, y 333..356) vs #ammo (600..672, y 331..359) = 42x23px. Same at 844x390 and 932x430. `document.elementFromPoint(453, 325)` at 667x375 returns the `wchip`, confirming the chip is on top (index.html:76 #ammo precedes :79 #weapons, both z-index auto).

**Expected.** The round count stays readable while shooting; RELOADING is the only signal that the trigger is dead for 1.0-2.4s.

**Actual.** With five or more chips the rail's second row sits exactly over the ammo box; you cannot read how many rounds are left or whether you are mid-reload. Screenshot at 667x375 confirms '34' and 'RELOADING' rendered under/behind the SHOTGUN chip.

**Remedy.** Move #ammo out of the rail's column. Either put it directly above the FIRE button (`right: 24px; bottom: 106px`, which is inside the #btns column and above its 152px block) or reserve the rail's vertical band: give #weapons `bottom: 8px; max-height: 52px` (two rows, then scroll horizontally) and push #ammo to `bottom: 70px`. Also delete the stale #btns reasoning in the comment.

### 47. Every overlay panel is exactly 20px (settings/pause) or 8px (shop) taller than the viewport, so its top and bottom borders and rounded corners are cut off on every device

**Major · UI · `css/main.css:400` · fixed in `5aa9e2e`**

**Repro.** There is no `box-sizing: border-box` on these panels and no global reset in the file, so `max-height` bounds the CONTENT box while 40px of padding and 4px of border are added on top of it: borderBoxHeight = (100vh - sa_t - sa_b - 24) + 20 + (20 + sa_b) + 4 = 100vh - sa_t + 20. The sa_b term is subtracted once and added back once, so safe areas do not help. Flex-centred in a 100vh container that means 10px hangs off the top and 10px off the bottom. Measured #settings-panel: 667x375 -> y -10..385; 844x390 -> y -10..400; 852x393 -> y -10..403; 932x430 -> y -10..440. Identical with the insets forced to 59/0/21. #shop-panel (padding 14px, css/main.css:410) is 8px too tall: y -4..379 / -4..394 / -4..397 / -4..434.

**Expected.** The panel is a card with 12px of breathing room top and bottom, fully inside the viewport, with its 16px radius visible.

**Actual.** The card bleeds off both edges — the 2px border and the rounded corners are sliced away top and bottom. Screenshot at 667x375 shows the settings panel with no top border and the DONE button cut through the middle by the screen edge. In a Safari tab (not standalone) it is worse still: 100vh there is the LARGE viewport, which exceeds window.innerHeight by the toolbar height.

**Remedy.** Add `box-sizing: border-box` to the `#settings-panel, #pause-panel, #shop-panel` rule (or a global `*, *::before, *::after { box-sizing: border-box }`), and switch `100vh` to `100dvh` so it tracks the visible viewport in a browser tab.

### 48. At 667x375 the conversation panel covers the crosshair, including its centre

**Major · HUD · `css/main.css:303` · fixed in `5aa9e2e`**

**Repro.** 667x375: `min(340px, 46vw)` = 306.8px content; with `padding: 8px 10px 10px` and a 1.5px border and no box-sizing:border-box the outer box is 328.8px wide -> x 10..338.8. `min(52vh, 296px)` = 195px content -> 215px outer, so after ~3 exchanges the panel is y 62..277. #reticle is at x 320.5..346.5, centre (333.5, 187.5). #chat has `z-index: 12` (css/main.css:313) and #reticle is z-index auto, so 18.3px of the 26px crosshair — the centre dot and the whole left arm — are behind the panel. Verified in a screenshot: with the chat panel open and a gun equipped at 667x375, no crosshair is visible at screen centre.

**Expected.** The crosshair is never occluded while a gun is out; nothing hides the aim point.

**Actual.** On iPhone SE landscape (the only 667x375 device) a conversation blanks the crosshair, and the world keeps simulating behind the panel (talk.js does not pause the game), so you can be attacked mid-conversation with no aim point.

**Remedy.** Cap the panel to the left third: `width: min(300px, 38vw)` and add `box-sizing: border-box` so the padding does not add 23px, which puts the right edge at 253px at 667x375 — clear of both the crosshair and the 293.5px joystick line. Or hide #reticle while #chat is open.

### 51. #weapons' 'stays out of the joystick zone' invariant is computed against the inset HUD box but the joystick is measured against the raw viewport — the rail intrudes 16px whenever the notch is on the right

**Major · Touch · `css/main.css:188` · fixed in `5aa9e2e`**

**Repro.** The arithmetic is exact only with zero insets: leftEdge = W - 210 - (0.56W - 220) = 0.44W + 10, i.e. 10px right of the joystick line. But 56% resolves against #hud's width (W - sa_l - sa_r, css/main.css:85) while js/core/input.js:75 uses `window.innerWidth`. Substituting: leftEdge = 0.44W + 0.56*sa_l - 0.44*sa_r + 10, so with sa_r=59 and sa_l=0 the margin becomes 10 - 25.96 = -15.96px. Measured with the insets forced to sa-r:59 / sa-l:0: 667x375 rail left 277.5 vs line 293.5 (-16.0); 844x390 355.4 vs 371.4 (-16.0); 852x393 358.9 vs 374.9 (-16.0); 932x430 394.1 vs 410.1 (-16.0). With the full 7-chip roster the leftmost chip clears by only 3.3px (844), 7.8px (852), 3.7px (932) — and a different owned set changes the row packing: e.g. a row of CANNON+SHOTGUN+SNIPER (67.7+74.5+61.4+12 = 215.6px) inside the 224.1px container at 852x393 puts a chip's left edge at 367.4, i.e. 7.5px inside the …

**Expected.** The measured 10px margin the comment relies on, in BOTH landscape orientations. The comment at css/main.css:176-183 records exactly what this bug costs: "a thumb coming down low to run switched him to FISTS mid-fight".

**Actual.** With the Dynamic Island on the right the rail container is 16px inside the joystick region, and whether a tappable chip actually lands there depends on which guns the player owns — a latent, save-dependent hole in the stick.

**Remedy.** Compute the clamp against the same quantity input.js uses. Either take #weapons out of #hud and position it `position: fixed; right: calc(var(--sa-r) + 210px); max-width: calc(56vw - 220px)` (vw is the raw viewport), or make input.js use the HUD box: read the left inset and test `e.clientX < saLeft + (innerWidth - saLeft - saRight) * 0.44`.

### 52. .gun-buy[disabled] dims the EQUIPPED marker to ~1.8:1 — the one control that tells you which gun you are holding is the faintest thing in the panel

**Major · UI · `css/main.css:469` · fixed in `5aa9e2e`**

**Repro.** js/ui/shop.js:74-77 sets both flags on the same button: `btn.classList.add('equipped'); btn.textContent = 'EQUIPPED'; btn.disabled = true;`. `opacity: 0.4` composites the whole button — text and background together — against the row behind it. Undimmed, #f0a860 on the button's own rgba(240,168,96,0.25)-over-rgba(240,168,96,0.14)-over-#0d1b3e stack is already only 3.98:1 for 12px text. At opacity 0.4 the text resolves to about rgb(123,95,79) on rgb(65,59,70): 1.83:1. Verified visually — in a 667x375 shop screenshot the CANNON row's EQUIPPED label is visibly washed out beside five full-strength EQUIP buttons.

**Expected.** WCAG AA for 12px bold text is 4.5:1, and the equipped state should be the MOST prominent row in the panel, not the least.

**Actual.** 'EQUIPPED' reads as 'unavailable' — identical treatment to an unaffordable BUY button, which is also `disabled` with `opacity: 0.4`. Two opposite meanings share one visual.

**Remedy.** Scope the dimming to the affordability case only: `.gun-buy[disabled]:not(.equipped) { opacity: 0.4 }`, and give `.equipped` full-strength styling (solid orange fill, `color: #24150a`) plus a non-colour marker such as a leading check glyph, so it reads as 'in your hands' rather than 'greyed out'.

### 53. #karma-label and #rep-hint measure 1.90:1 and 1.66:1 against the actual rendered sky — both sit permanently in the top-centre band where the sky always is

**Major · HUD · `css/main.css:95` · fixed in `5aa9e2e`**

**Repro.** 667x375, `__test.setTimeOfDay(0.5)` (midday). Hid #hud, screenshot-sampled the 7x7px background under each label's centre, then composited the CSS colour at its declared opacity: #karma-label at (334,29) over rgb(145,173,219) -> 1.90:1; #rep-hint at (334,44) over rgb(155,181,218) -> 1.66:1. At the authored dusk (timeOfDay 0.70) they are 4.41:1 and 4.30:1 — still under AA. For reference #hp-num measures 14.21:1 and the weapon chips 15.59:1 at the same moment, because those have opaque backing.

**Expected.** 4.5:1 for 10-11px text (WCAG 1.4.3 AA). A `0 1px 3px #000` shadow darkens only a 3px halo below the glyph; it does not create a compliant background for 2px-letter-spaced 10px type.

**Actual.** The karma band name ('SAINT'/'NEUTRAL'/'MENACE') and every reputation hint are effectively invisible against a daylight sky — and they are pinned to `top: 10px` / `top: 44px` at screen centre, which is where the sky is at every camera pitch.

**Remedy.** Give both the same treatment #toast and .wchip already get — a backing plate: `background: rgba(13,27,62,0.7); padding: 2px 8px; border-radius: 6px; display: inline-block;` — and drop the opacity multipliers (0.9 / 0.8) which cost contrast for no legibility gain.

### 54. Seven interactive controls are below the 44pt iOS minimum, including PAUSE (40x32) and the weapon chips (23px tall)

**Major · Touch · `css/main.css:290` · fixed in `5aa9e2e`**

*Umbrella over #32, #33, #34, #35, #36, #37, #38, each measured individually.*

**Repro.** Measured hit boxes across the matrix (all viewport-independent): #btn-pause 40x32; #btn-shop 59.2x32 (css/main.css:201-204, `height: 32px`); #chat-close 26x26 (css/main.css:318-319); .wchip 23px tall, e.g. SMG 44.6x23 (css/main.css:191-197, `padding: 5px 9px; font-size: 9.5px`) with only 6px gaps between them; .gun-buy 96x34 (css/main.css:461-463); #btn-groq-test 98.7x38; the settings checkboxes 20x20 (css/main.css:414). By contrast #art-prompt is `min-height: 48px` and #inspect-close is `min-width: 72px; min-height: 44px` — the project already applies the rule, with the reasoning spelled out at css/main.css:498-499 ("48px tall, which clears the 44pt HIG minimum with the border included").

**Expected.** Apple HIG minimum 44x44pt for every touch target, which this codebase already treats as binding for two of its controls.

**Actual.** PAUSE — the control you reach for when a monster is on you — is a 40x32 box in the screen corner. The weapon chips, which are the mid-fight loadout switch, are 23px tall with 6px gutters, so a thumb landing between two chips or slightly low hits nothing (or, per the note at css/main.css:180-182, the wrong gun).

**Remedy.** Give #btn-pause and #btn-shop `min-width: 44px; min-height: 44px` (they have room — the top-right band is otherwise empty), #chat-close `width: 44px; height: 44px` with a transparent halo around the 26px glyph, and .wchip `min-height: 44px; padding: 0 12px; display: inline-flex; align-items: center` with `gap: 8px` on #weapons. Recheck #weapons' max-width after: taller chips mean fewer rows fit under `bottom: 8px`.

### 70. caches.match() is unscoped while old caches are deliberately kept alive, so the first-created (old) cache shadows the current one

**Major · SW · `sw.js:198` · fixed in `c62005a`**

**Repro.** CacheStorage.match with no `cacheName` walks caches in creation order and returns the first hit. Proved in Chromium: with `sm-49c4f381e8` (created first) and a second cache created afterwards holding a poisoned `./js/main.js`, `caches.match(...)` returned the entry from the FIRST-created cache. The new design at sw.js:143-161 deliberately does NOT delete old caches at activate when a window is open, so after `skipWaiting()` (sw.js:137) + `clients.claim()` (sw.js:156) the running page is controlled by the new worker while the OLD cache — created earlier — still wins every lookup. The same applies to `caches.match('./index.html')` at sw.js:167. Then on the update reload, sw.js:192-194 issues `e.respondWith(navigate(req))` and `e.waitUntil(purgeOldCaches())` concurrently: the new document starts requesting `./js/main.js`, `./css/main.css`, `./vendor/three/three.module.min.js` within millis…

**Expected.** A worker at VERSION N serves only VERSION N's assets; the retained old cache is a safety net for the outgoing page, never a source for the incoming one.

**Actual.** Race-dependent mixed build: the new index.html is paired with whichever of the old build's JS/CSS/GLB the purge has not yet reached. Offline it is deterministic and worse — `caches.match('./index.html')` at sw.js:167 returns the OLD cache's shell even though the new cache has the new one, so a cold offline launch after an update boots the previous build's HTML against the new build's modules.

**Remedy.** Scope every lookup to the current cache: `caches.open(VERSION).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || fetch(req))`, and likewise `caches.open(VERSION).then((c) => c.match('./index.html'))` in navigate(). With that, retaining old caches is purely a courtesy to the outgoing page and can never shadow the live build.

### 71. No Screen Wake Lock anywhere — the iPhone dims and auto-locks mid-session

**Major · PWA · `js/main.js:483` · fixed in `5aa9e2e`**

**Repro.** `grep -rn "wakeLock" js/ index.html` returns nothing outside tools/node_modules. Play in the installed PWA using only the on-screen stick and buttons (which are pointer events on #stick / #btns, not the taps iOS counts as user activity for the idle timer): after the device's Auto-Lock interval the screen dims and then locks, killing the WebGL context and the session.

**Expected.** A fullscreen landscape game holds a screen wake lock while `game.state === 'playing'` and releases it on pause/background, re-acquiring on `visibilitychange`. Safari has supported `navigator.wakeLock.request('screen')` since iOS 16.4 and it is named as a requirement for this build.

**Actual.** The API is never called. The screen sleeps during play.

**Remedy.** Alongside the storage.persist() call in js/main.js, add a sentinel: `let wl = null; const acquire = async () => { try { wl = await navigator.wakeLock?.request('screen'); wl?.addEventListener('release', () => { wl = null; }); } catch {} };` acquire on entering 'playing', `wl?.release()` on pause/title, and re-acquire in the existing `visibilitychange` handler (js/main.js:518-520) when the document becomes visible and the game is playing. Wrap in try/catch — the request rejects on a backgrounded document.

### 72. manifest "id": "./" resolves to the origin root, not the /Strongest-Man/ subpath

**Major · PWA · `manifest.webmanifest:7` · fixed in `c62005a`**

**Repro.** `id` is the one manifest URL member resolved against the ORIGIN of start_url rather than against the manifest URL. Confirmed empirically in Chromium via CDP `Page.getAppManifest` on http://127.0.0.1:8080/Strongest-Man/ — the parsed manifest came back as `{"id":"http://127.0.0.1:8080/", "scope":"http://127.0.0.1:8080/Strongest-Man/", "startUrl":"http://127.0.0.1:8080/Strongest-Man/"}`. On Pages that makes the app identity `https://<user>.github.io/`.

**Expected.** id === start_url === https://<user>.github.io/Strongest-Man/, so the installed app is identified by this project and not by the account's Pages root.

**Actual.** The app id is the shared github.io origin root. Every other PWA the account publishes on that origin with the same `"id": "./"` claims the identical id, so installs collide and update-matching targets the wrong app. Correcting the id later makes it a different app to Chrome — existing installs would have to be removed and reinstalled.

**Remedy.** Either set `"id": "/Strongest-Man/"` (an origin-relative path, which is what the member expects) or delete the `id` member entirely, in which case it defaults to start_url and is correct. Deleting it is the safer choice while nothing has shipped.

### 73. apple-touch-startup-image covers 4 device profiles, two of them mislabelled, and there is no fallback — current iPhones flash white on launch

**Major · PWA · `tools/make-icons.mjs:62` · fixed in `c62005a`**

**Repro.** 393x852@3 is iPhone 15/15 Pro/16, not iPhone 16 Pro (402x874@3); 430x932@3 is iPhone 15 Plus/16 Plus, not 16 Pro Max (440x956@3). So the eight `<link rel="apple-touch-startup-image">` tags at index.html:17-24 have no media query that can match an iPhone 16 Pro, 16 Pro Max, 12/13 Pro Max, 14/15 Plus (428x926@3), X/XS/11 Pro/12 mini/13 mini (375x812@3), XR/11 (414x896@2), or XS Max/11 Pro Max (414x896@3). Add to Home Screen on any of those and launch: iOS falls back to a blank white launch screen.

**Expected.** Per the requirement, a startup image for each target device and orientation, or an equivalent styled first paint that does not flash white. iOS ignores the manifest's `background_color: #0d1b3e` for the standalone launch screen, so the manifest is not a fallback.

**Actual.** Only 4 of the current iPhone profiles are covered, the two newest names describe the wrong hardware, and there is no un-media'd `<link rel="apple-touch-startup-image">` catch-all — so the majority of iPhones in use flash white on every launch of a game whose whole point is the fullscreen home-screen experience.

**Remedy.** Extend SPLASH_DEVICES with at least {375,812,3}, {414,896,2}, {414,896,3}, {428,926,3}, {402,874,3}, {440,956,3}; rename `ip16pro`->`ip15`/`ip16` and `ip16promax`->`ip15plus` so the filenames stop lying. The images are flat gradient+logo JPEGs at ~30-65 KB each so the extra weight is small — but pair this with the dead-weight fix below and stop precaching them.

### 79. Grab-and-throw permanently leaks a debris body's heightfield pile (ground rises where rubble no longer is)

**Major · Logic · `js/player/combat.js:518` · fixed in `8b2e8cf`**

**Repro.** Boot ?autoplay=1&seed=42. Collapse a building, let the rubble sleep. Pick a sleeping chunk b (measured: id 12 at x=-25.25, z=-12.98, pileCell 13262, pileAmount 0.36; pileAt(-25.25,-12.98)=0.36, groundHeight=0.3761). Stand next to it, GRAB, wait for 'carrying', THROW. The chunk lands 23.2 m away and re-sleeps, adding a second 0.36 pile at cell 17310. Re-measure the ORIGINAL cell: pileAt=0.36, groundHeight=0.3761 — unchanged. Every grab/throw cycle adds a new pile without ever releasing the old one, up to the 1.6 m per-cell cap in heightfield.js addPile.

**Expected.** Taking a sleeping body out of the world releases its pile share first, exactly as pworld.js:141 (wakeRadius) and debris.js:118 (removeFromPhysics) both do: `if (b.pileCell >= 0) { removePile(b.pileCell, b.pileAmount); b.pileCell = -1; }`.

**Actual.** combat.js drops the pileCell reference without calling removePile, so the 0.36 m bump stays in the heightfield forever. groundHeight() is authoritative for the player's feet (player.js:94), for every rigid body (pworld.js:74) and for hitscan (collide.js:351 `if (y <= g)`) — so the city accumulates invisible curbs that stop bullets in mid-air and step the player up onto nothing. combat.js already imports removePile (line 11) and uses it correctly at line 301.

**Remedy.** Release the pile at the moment the body leaves the sleeping list, i.e. in tryGrab right after `sleepingBodies.splice(i, 1)` (combat.js:237): `if (b.pileCell >= 0) { removePile(b.pileCell, b.pileAmount); b.pileCell = -1; }`, and make line 518 a no-op (or defensively do the same removePile there).

### 80. Dying while carrying rubble orphans the body: a chunk hangs in mid-air forever and its instance slot is never freed

**Major · Logic · `js/player/combat.js:531` · fixed in `8b2e8cf`**

**Repro.** Grab a sleeping debris chunk (combat.js:238 builds the handle as `{ kind: 'debris', body: b, size, origin }` — it has no `release`, no `alive`, no `place`, no `launch`). Reach phase 'carrying', then `__test.hurtPlayer(9999)`. combat.js:141 fires `dropCarried()`. Measured afterwards: body is in NEITHER pw.active NOR pw.sleeping; its InstancedMesh matrix is still at (-25.64, 1.88, -13.92) at scale 0.6 six seconds after revive; pool.used still contains its record and pool.free does not contain its idx.

**Expected.** Going down should put the carried chunk back into the physics world (push it into activeBodies with a small drop velocity) so it falls, or free its pool slot.

**Actual.** `st.carried?.release?.()` is a no-op for the debris handle (the property does not exist), and the body was already spliced out of sleepingBodies at grab time (combat.js:237) and was never in activeBodies. It is now referenced by nothing that steps it: a grey chunk floats 1.88 m in the air at the spot where the player's hands were, permanently, and one of the 520 chunk instances is consumed. Repeat = a field of floating cubes. (The pile leak of finding #1 also applies on this path.)

**Remedy.** Give the debris handle a `release()` that returns the body to the world (`b.asleep=false; b.quiet=0; b.vy=-1; activeBodies.push(b);` plus the removePile from #1), or special-case `h.kind === 'debris'` in dropCarried() the way release() at combat.js:512 already does.

### 81. pworld.step() mutates the `active` array while iterating it — bodies get skipped for a whole step

**Major · Logic · `js/physics/pworld.js:39` · fixed in `8b2e8cf`**

**Repro.** Captured live (Chromium, ?autoplay=1&seed=42), stack at the moment of the splice, spliceIdx 0 with active.length 251: at sleepBody (js/physics/pworld.js:114:10) <- active.splice(0, 1) at forceSleep (js/physics/pworld.js:129:15) at createBody (js/physics/pworld.js:39:57) at kill (js/ai/npc.js:439:16) at onProjectile(js/ai/npc.js:515:37) at body.onMove (js/player/combat.js:634:38) at step (js/physics/pworld.js:102:21) Steps: throw a debris chunk (armProjectile wraps its onMove) so it passes within 1.4 m of a live NPC while active.length >= ACTIVE_CAP. The cap is reached in ordinary play — measured 10 full-charge punches on one facade drove active to 418 with counters.forced = 218 (wakeRadius at pworld.js:147 pushes with no cap check, so the list overshoots 250 too).

**Expected.** A body list being walked by `for (let i = active.length - 1; i >= 0; i--)` (pworld.js:62) must not be spliced at an arbitrary index from inside that walk.

**Actual.** `b.onMove(b)` at pworld.js:102 re-enters createBody through combat.js:628/634 -> removeSphere/spawnDebris and npc.js:439 / monster.js:417, and createBody evicts `oldestSmallest()` — an arbitrary index. Every splice below the descending cursor shifts the remaining elements down one, so exactly one still-unprocessed body is skipped for that step (no gravity, no integration, no onMove, no sleep bookkeeping) per splice. debris.js:98-109 reclaimOldest -> removeFromPhysics -> activeBodies.splice is a second route into the same hazard, also reachable from spawnDebris.

**Remedy.** Make the eviction deferred: have createBody push evictions onto a pending list that step() drains after its loop, or iterate over a snapshot/compaction pass (write-index compaction like destruction.js:159-212) instead of splicing in place.

### 82. armProjectile stacks a new onMove wrapper on every throw — re-thrown objects do N× the work and N× the projectile damage

**Major · Logic · `js/player/combat.js:622` · fixed in `8b2e8cf`**

**Repro.** Instrument `window.__npcs.hooks.onProjectile` with a counter. Grab a sleeping chunk (body id 110), throw it, count calls over the window where speed2 > 90: 1 call. Let it sleep, grab the SAME body again, throw again over the same-length fast window: 2 calls. The wrapper is never removed when the body sleeps, so the chain grows by one layer per throw, forever.

**Expected.** A body that is armed as a projectile again should replace its projectile behaviour, not nest it.

**Actual.** Each layer independently runs `removeSphere(b.x, b.y, b.z, blastR, ...)` (a full building-grid sphere query, allocating a Set per call at destruction.js:32), `st.hooks.npcs.onProjectile(b)` and `st.hooks.monsters.onProjectile(b)` every fixed step while the body is fast. monster.js:512-516 onProjectile does `hurt(m, 20, ...)` with no per-step dedupe, so a chunk you have thrown four times deals 80 damage per step instead of 20 to anything within 2 m — and npc.js:439 createBody is invoked once per layer.

**Remedy.** Store the original mover once (`body.baseMove ??= body.onMove`) and rebuild from it, or stash the projectile behaviour in a body field that step() calls, rather than re-wrapping the closure.

### 83. Breaking a carried prop_sign with a swing strands it tipped-over in mid-air, permanently and un-interactable

**Major · Logic · `js/player/combat.js:484` · fixed in `8b2e8cf`**

**Repro.** prop_sign is grabbable — the tryGrab filter at combat.js:242 excludes only `prop_streetlamp` and `prop_trafficlight` — and PROP_TYPES.prop_sign.mass is 40, so `frail` is true and damageLoad triggers on any connected swing at charge 0. Measured: grab sign idx 0, teleport to a facade, tap PUNCH. carry.pos was (-34.65, 0.98, -20.9); after the swing the sign record is x=-34.65 y=0.98 z=-20.9 alive=false, and 2 s later (tip-over animation finished) reg.types.prop_sign.mesh.getMatrixAt(0) still reports position (-34.65, 0.98, -20.9) at scale 1 — 0.86 m above the pavement.

**Expected.** A sign smashed out of your hands should either break into parts and disappear (as bench/tree/kiosk do) or fall to the ground.

**Actual.** hitProp routes prop_sign into the lamp branch (destruction.js:282-291), which pushes a `lampFalls` entry animating `M.compose(V.set(L.p.x, L.p.y, L.p.z), ...)` (destruction.js:227) at the carry height and calls `P.retire(p)` — retire only drops it from the collision grid (props.js:280) and never hides the instance. The sign ends up lying on its side floating in the air, `alive === false` forever, so nothing can re-grab it, hit it or clean it up.

**Remedy.** Either exclude prop_sign from the grab filter at combat.js:242, or in damageLoad set `pr.y = groundHeight(c.pos.x, c.pos.z)` before calling hitProp (a tip-over is only meaningful from the ground), or route detached props to the break-into-parts branch rather than the lamp branch.

### 84. Torn-jacket flaps are parented to bones without undoing the 0.01 armature scale, so the whole sleeper-build reveal is sub-millimetre and invisible

**Major · Render · `js/player/outfit.js:26` · fixed in `8b2e8cf`**

**Repro.** Measured on the live rig: RightHand bone world scale = [0.01, 0.01, 0.01]. The flap meshes (localScale [1,1,1]) therefore have world scale 0.01. Box3 of the LeftShoulder flap = 0.0010 x 0.00043 x 0.00084 m; the RightForeArm flap = 0.00037 x 0.00080 x 0.00033 m — on a character whose measured bounds are 0.97 x 1.80 x 0.46 m. Their offsets are equally wrong: `out = 0.05` lands 0.5 mm from the bone instead of 5 cm.

**Expected.** Same compensation weapons.js already documents and applies for a child of a hand bone (weapons.js:216-220): `const s = 1 / handScale(); mesh.scale.setScalar(s);` — the measured gun mesh has localScale 100 / userData.unit 99.99996 and renders at true size.

**Actual.** outfit.js adds the planes with no scale correction, so at tear stage 2 and 3 the strained seams, split sleeves and exposed skin are ~1 mm specks buried inside the character mesh. The stage toast fires and the material tint shifts, but the visual half of the feature never appears.

**Remedy.** Multiply both the geometry size and the local position by `1 / boneWorldScale` in addFlap, mirroring weapons.js buildGun: read the bone's world scale after `bone.updateWorldMatrix(true, false)` and set `m.scale.setScalar(1 / s)` plus `m.position.set(out / s, 0.02 / s, 0)`.

### 90. Every monster despawn leaks its blob-shadow slot; after ~47 spawns nothing in the game gets a blob shadow again

**Major · Perf · `js/ai/monster.js:447` · fixed in `708a37d`**

**Repro.** Boot ?autoplay=1. `blobStats()` reads {active:49, used:49, free:0} (48 NPCs + player). Spawn and kill 50 monsters, letting each corpse run out its `deadT > 18` despawn: `for (batch) { spawnMonster x5; punchAt(m.x,m.z,1) until dead; step(26) }`. Result measured: monsters alive = 0, `blobStats()` = {active:96, used:96, free:0, cap:96}. Spawning one more monster leaves blobStats unchanged — `addBlob` hit `idx >= CAP` and returned null.

**Expected.** despawn() releases the monster's blob slot (blobshadows.js exports `removeBlob` precisely for this, and its comment at lines 44-49 says the slot INDEX is pooled so despawned monsters stop consuming the cap), the follower array shrinks, and the despawned monster becomes garbage.

**Actual.** `removeBlob` is never called anywhere in the codebase (grep: only the export in js/engine/blobshadows.js:62). `followers[]` grows by one per `spawn()` (monster.js:139 `m.blob = addBlob(m, 1.5)`) and never shrinks; `freeSlots` stays empty forever. Three consequences: (a) after 47 monster spawns `addBlob` returns null and no new monster — nor anything else — ever gets a shadow; (b) every despawned monster stays strongly reachable from `followers[i].src`, retaining its SkinnedMesh clone, its cloned THREE.Skeleton (whose bone DataTexture is also never disposed — despawn() never calls skeleton.dispose()) and its AnimationMixer, so memory climbs for the whole session; (c) a monster despawned alive via the flee path (monster.js:267/271) has `blobOn === undefined`, so blobFrame keeps drawing its quad at its last x/z — a shadow on empty pavement forever. The director spawns every 35-90 s, someti…

**Remedy.** In `despawn(m)`: `removeBlob(m.blob); m.blob = null;` (import removeBlob from ../engine/blobshadows.js) and also dispose the clone's skeletons — `m.root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); })` — plus `m.mixer.uncacheRoot(m.root)` before `scene.remove(m.root)`.

### 91. Panic/alert/hide/tumbled timers run at exactly 2x speed — stateT is decremented twice per think()

**Major · Logic · `js/ai/panic.js:150` · fixed in `708a37d`**

**Repro.** ?autoplay=1&nomonsters=1. Stand next to an NPC so it is tier 0, then set `n.state='tumbled'; n.stateT=500` and `__test.step(1.0)`. Measured drop = 2.0000 over one simulated second. Repeat with a second NPC set to `state='at_poi'; stateT=500`: measured drop = 1.0000. Both at tier 0, same step count.

**Expected.** stateT counts down at 1 s of state time per 1 s of simulation, the same as every non-panic state, so `randRange(24,40)` in 'hide' really means 24-40 s.

**Actual.** js/ai/npc.js:158 `n.stateT -= dt;` runs at the top of think() for ALL states; the `default:` arm at npc.js:210-212 then calls `sys.panicThink(n, dt, t)`, which decrements the same accumulator again. Every authored panic duration is halved: 'hide' randRange(24,40) lasts 12-20 s, 'panic' randRange(9,16) lasts 4.5-8 s, 'alert' randRange(0.3,1.1) lasts 0.15-0.55 s, and 'tumbled' randRange(1.6,2.6) lasts 0.8-1.3 s — shorter than the 'die' one-shot it plays at timeScale 1.6 (~1.9 s), so a trampled NPC stands up while still lying on the pavement.

**Remedy.** Delete `n.stateT -= dt;` from panic.js:150 — npc.js think() already owns the decrement for every state it dispatches.

### 92. An NPC being eaten by a monster leaves its body standing where it was grabbed — the mesh never follows

**Major · Render · `js/ai/npc.js:334` · fixed in `bbad27f`**

**Repro.** ?autoplay=1&nomonsters=1. Reproduce exactly what monster.js `case 'eat'` does to its victim: take a live NPC, set `n.state='carried'` and then each fixed step write `n.x = n.px = start.x + i*0.4; n.z = n.pz = start.z; n.y = 2.0;` and `__test.step(1/60)`. After 30 steps: n.x = -9.53 but n.root.position.x = -21.53 — 12.0 m of divergence, and root.y = 0.159 while the code asked for y = 2.0.

**Expected.** The victim's mesh is held at the monster's chest for the 1.9 s of the 'eat' state, and the corpse then drops where it was eaten.

**Actual.** js/ai/monster.js:212-214 sets `t.x/t.z/t.y` on the victim but never sets `t.carryQuat`, `t.carryY`, `t.neckBone` or `t.carryTarget` — only npcSys `hooks.tryGrab` (npc.js:546-563) sets those. npc.js `move()` returns immediately for state 'carried' (line 218), and frameUpdate's carried branch above only writes root.position when `n.carryQuat` is set, so the mesh is frozen at the grab point. Worse, npc.js:376 `n.y = n.root.position.y - n.footY;` writes the stale ground height straight back over the chest height monster.js just assigned, so `t.y` is clobbered every frame too. The player sees the monster mime eating thin air while the victim stands motionless several metres away; the blob shadow (which reads the live n.x/n.z) slides over to the monster on its own, and `npcSys.kill(t,'eaten',4)` at monster.js:219 drops a corpse whose body is at the grab point while its blood decal is at the m…

**Remedy.** In monster.js `case 'eat'`, also drive the render transform the way the player's carry handle does — set `t.carryY = m.y + m.targetH * 0.55` and `t.carryQuat` from the monster's orientation each step (and clear both in `releaseHeld`) — or give npc.js's carried branch a fallback `else { n.root.position.set(n.x, n.y + n.footY, n.z); }` for carriers that do not supply a quaternion.

### 93. Shop closure is a dead flag: reputation writes `closed` on building specs, NPC routing reads it on POI objects that never have it

**Major · Logic · `js/ai/npc.js:171` · fixed in `bbad27f`**

**Repro.** ?autoplay=1. Run `__test.setKarma(-80); __test.setKnowledgeAll(70); __test.districtPass();` then inspect the live city spec the NPCs use. Measured: `buildings.filter(s=>s.closed).length` = 9 (all 9 shop/diner lots), `pois.filter(p=>p.closed).length` = 0, `Object.keys(pois[0])` = ['type','building','x','z','district'] (no `closed`), `pois[0] === buildings[0]` = false, and 38 of 48 NPCs currently hold a goal whose building is closed.

**Expected.** With karma in the 'feared'/'monster' band and district reputation ≥ 30, shops shutter and townsfolk stop routing to them — the reason the guard at npc.js:171 exists and the reason lines.js has a `shop_closed` bark.

**Actual.** js/ai/reputation.js:110 sets `s.closed` on entries of `city.buildings`. js/world/city.js:187 builds `pois` as brand-new objects — `pois.push({ type: s.type, building: s.id, x: nx, z: nz, district: s.district })` — that are not the building objects and never gain a `closed` property. So `n.goal?.closed` is permanently `undefined` and the whole shuttering feature has no effect on NPC behaviour; only panic.js:77 (`s.closed` on `b.spec`, which IS the building object) reads it correctly.

**Remedy.** Either resolve the building in the guard — `const b = city.buildings.find(s => s.id === n.goal.building); if (b?.closed) { n.goal = null; return; }` — or, cheaper, have reputation.js:108-112 mirror the flag onto the matching POI (build an id→poi index once) so `pickGoal`/`think` can keep reading it directly.

### 94. One car abandoned by scareCars() permanently deadlocks every car behind it on that circuit; 'wreck' is a terminal mode

**Major · Logic · `js/world/traffic.js:226` · fixed in `708a37d`**

**Repro.** ?autoplay=1&nomonsters=1. `step(6)`, then do exactly what scareCars does to one car: `list[0].mode='wreck'; list[0].speed=0;`. `step(60)` twice and measure `s` (arc length along the circuit) for the other cars on the same circuit. Measured: car id 8 travelled 0.00 m in 60 s with speed 0.000 (it is behind the wreck); car id 4 travelled 45.6 m (it is ahead of it). Separately, 70 monster spawn/kill cycles took the fleet from {drive:12} to {wreck:3, drive:9} monotonically — the wreck count only ever rises.

**Expected.** An abandoned car is an obstacle other drivers route around or, at worst, a temporary blockage; the fleet does not monotonically decay to zero moving traffic over a session.

**Actual.** `gapAhead` (traffic.js:201-216) skips only `held` and `flying`, so a wreck registers as a car to yield to; `target = Math.min(target, Math.max(0, (gap - MIN_GAP) * 1.5))` (line 248) then pins the follower at speed 0 forever, and `separateCars` (line 359) actively pushes it backwards along its own lane. There is no transition out of `wreck` anywhere — grep for `mode = 'drive'` finds only the loose-landing branch (line 301, guarded by `!car.exploded && !car.lastHitByPlayer && !car.wasHeld`). scareCars runs on MONSTER_SPAWNED, CAR_EXPLODED, BUILDING_COLLAPSED and every FEAT with magnitude ≥ 40, so with 12 cars total the city's traffic degrades permanently and irreversibly.

**Remedy.** Give a wreck a way back into service (a timer that respawns it at the far side of its circuit as `mode='drive'` once it is off-screen), or make `gapAhead` treat a stationary `wreck` as something to route past — e.g. let a blocked driver advance `car.s` past a wreck it has been stopped behind for more than a few seconds, the same way `snapToCircuit` already teleports along the lane.

### 104. Random GLB loads abort mid-flight: three r185 FileLoader drops a source from its AbortSignal.any when the un-referenced loader is collected

**Major · Logic · `js/engine/assets.js:41` · fixed in `a57209f`**

**Repro.** Boot the game repeatedly in Chromium (loadModels fetches nine .glb files through GLTFLoader). On a fraction of runs one or more requests fail with net::ERR_ABORTED and the boot throws "Failed to load asset". The failing URL is different every run, which is what rules out the file, the server and the path. Forcing GC between loads raises the rate.

**Expected.** Nine GLBs load on every boot. A cold first launch is the one moment the whole game depends on the network, and it is the moment a PWA is being installed.

**Actual.** three r185 GLTFLoader delegates to FileLoader, which composes its own AbortController with the manager's through AbortSignal.any([...]). The composed signal keeps a strong reference to its sources but not the other way round: once the FileLoader instance itself is unreachable — which it is, GLTFLoader does not retain it past the call — its controller can be collected, and the specified behaviour of a collected AbortController is to abort. The request dies with ERR_ABORTED and nothing in the app can distinguish that from a network failure.

**Remedy.** Do not hand the loader the URL at all. fetch() the bytes directly, check res.ok so an HTTP error is an HTTP error rather than a parse failure, and call loader.parseAsync(buf, resourcePath) with the resource path so relative textures inside the GLB still resolve.

### 105. Two frames per boot draw every shadow receiver with no depth texture bound — ~170 GL_INVALID_OPERATION warnings and two frames of unshadowed city

**Major · Render · `js/engine/shadows.js:118` · fixed in `a6d17b9`**

**Repro.** Boot with the console open. 176 warnings: "[.WebGL-...] GL_INVALID_OPERATION: Mismatch between texture format and sampler type (Texture is not depth or stencil)", one per draw call, at every single boot, on every device profile. Also present in engine/warmup.js's compile frame.

**Expected.** Zero console warnings at boot, and the first drawn frame has shadows in it.

**Actual.** shadowMap.autoUpdate is off and beforeRender only raises needsUpdate on its own cadence, with the frame counter starting such that the first two frames are skipped. Every shadow-receiving material in those frames therefore sampled a sampler2DShadow with three's 1x1 default colour texture bound, which the driver rejects once per draw call.

**Remedy.** Flag an update as soon as shadows are enabled in setTier, and start the frame counter at -1 so the first beforeRender lands on the cadence. Also gate compileAsync on KHR_parallel_shader_compile, which without the extension only adds a warning of its own.

### 106. A pointer whose capture is stolen never releases its control: the button stays held and the joystick stays claimed

**Major · Touch · `js/core/input.js:118` · fixed in `fa6d2a6`**

**Repro.** Hold PUNCH, then let the system take the pointer (a notification banner, an edge swipe, the app being backgrounded mid-press). pointerup and pointercancel never arrive; lostpointercapture does. The button keeps .held and input.punchDown stays true with no finger on the glass.

**Expected.** Any way a pointer can end releases the control it owned.

**Actual.** Only pointerup and pointercancel were wired. lostpointercapture is the third way a captured pointer ends and iOS delivers it in exactly the cases where the other two do not, so the control was left latched with no way for the player to clear it.

**Remedy.** Listen for lostpointercapture alongside pointerup/pointercancel on every capturing control and the stick, and add a resetInput() that drops the held classes, the pending edges, the axes, the charge and the pointer ids together so state changes can use it.

### 108. The armed weapon chip can sit off the edge of the rail with nothing to say it is there

**Major · HUD · `js/ui/hud.js:155` · fixed in `b31524c`**

**Repro.** Own all six guns, arm the CANNON, capture hud-stress at 852x393: the chip is clipped by the right edge of #weapons and the orange armed border is half off screen. markRail sets the class and returns.

**Expected.** The chip that says what is in your hands is always fully visible.

**Actual.** #weapons is a single nowrap row with overflow-x:auto. With seven chips it is wider than the screen and the scroll position never moves, so whichever chip is armed beyond the fold stays beyond it. Justify-content:flex-end does not help: when the content overflows, the items start at the content-box start and run off the right.

**Remedy.** After marking, scroll the selected chip into view with rail.scrollLeft, with the same 10px slop .wchip::after uses. scrollLeft rather than scrollIntoView, which is entitled to scroll ancestors.

### 110. The gallery prompt is drawn on top of the ammo readout at 667x375

**Major · HUD · `css/main.css:751` · fixed in `37f79d9`**

**Repro.** tools/capture/layout.mjs, museum state, se3 both orientations: #art-prompt 229..438 x 309..357 against #ammo 413..485 x 325..353. 25px of overlap in x, 28 in y.

**Expected.** Nothing in the HUD is drawn over anything else in the HUD.

**Actual.** #art-prompt is centred on the viewport (left 50%, translateX(-50%)) and #ammo is pinned to right:182px. On a 852px screen they clear each other by 68px; on a 667px screen they do not, and the prompt is the wider of the two so narrowing it is not an option — VIEW THE READER does not fit in the 143px that would be needed.

**Remedy.** Above the ammo row rather than beside it: bottom 58px, derived from #ammo at bottom 22 and 28 tall plus the 8px gutter. Still 116px clear of #weapons at bottom 174.

### 111. The loading screen comes down before there is anything behind it

**Major · UI · `js/ui/overlays.js:84` · fixed in `42e3709`**

**Repro.** Instrument #loading-msg and time every rAF from load. Boot phases complete at 2,163 ms; the first frame is presented at 7,404 ms; the overlay hides 150 ms after the bar reaches 100%, i.e. at 2,313 ms. Five seconds of unpainted canvas. The same timer also produced one blank capture in 602: loading_ip14_landscape-left, where the scene made the overlay visible and boot hid it again a moment later.

**Expected.** The loading screen is up until there is a frame behind it.

**Actual.** loadingProgress(1, ...) hid the overlay on a setTimeout, which fires at boot-complete. Boot-complete and first-frame are different moments, and between them sits the most expensive frame the app ever runs: every remaining shader link, every first texture upload, the first shadow map and the first god-ray pass. On this machine that is 5.2 seconds; on a phone it is not free either, and it is worst on the device that can least afford it.

**Remedy.** loadingComplete(), called from inside render() after the frame is drawn, and the only thing in the tree that hides #loading. The bar's last message is "first frame…" rather than "ready", because a screen that says ready while it is not is what makes a slow launch feel broken.

### 112. Every walkable front door in the city is drawn shut, and the player passes through the leaf

**Major · Render · `js/world/buildings.js:61` · fixed in `90ca0e0`**

**Repro.** screenshots/final/museum-entrance_se3_landscape-right.png, cropped to the opening: the player stands in the doorway with a solid brown panel behind him and no interior visible. The museum door instance is at x=-8.65, z=23.5 — the wall plane — and physics/collide.js:82 gives that cell a 1.3 m walkable gap, so walking in means walking through it. doorGeo() merges a 1.2 x 2.2 leaf at 0x5a3a20 into the shared door archetype, and every one of the 29 door instances in the city carries it.

**Expected.** A door you can walk through looks like one, and a building with FREE ADMISSION lettered over the entrance is not sealed.

**Actual.** The geometry contradicted the collision on every building in the game that has an interior. From the street the gallery read as closed; from inside, the doorway was a brown rectangle rather than a view of the forecourt.

**Remedy.** Delete the leaf. Nothing has to replace it: the two jambs and the head are already full wall thickness, so removing it leaves a real 0.3 m reveal and the interior is visible through the opening.

### 7. warmUp disposes three's module-level shared Sprite geometry

**Minor · Perf · `js/engine/warmup.js:43` · fixed in `5418f1e`**

**Repro.** js/main.js:246 calls `await warmUp(renderer, scene, cam.camera, [bangMaterial()])`, and bangMaterial() returns a SpriteMaterial (js/ai/monster.js:51). warmup.js:18 therefore takes the `mat.isSpriteMaterial ? new THREE.Sprite(mat)` branch, and line 43 disposes that Sprite's geometry. In the page: `const a = new THREE.Sprite(new THREE.SpriteMaterial()), b = new THREE.Sprite(new THREE.SpriteMaterial()); a.geometry === b.geometry` -> true. Confirmed in the vendored bundle: `class la extends Ar{constructor(t=new Gn){...void 0===Xn&&(Xn=new Wn;...);this.geometry=Xn`.

**Expected.** warmUp only disposes geometry it created itself (the 0.01x0.01 PlaneGeometry it makes for non-sprite materials).

**Actual.** Sprite does not own its geometry — every Sprite in three shares one module-level BufferGeometry. Disposing it fires the 'dispose' event, so WebGLGeometries deletes the GPU buffers and drops the cache entry. The next time a monster's realization '!' sprite is drawn (js/ai/monster.js:148), the interleaved buffer has to be re-uploaded — the exact mid-play hitch warm-up exists to prevent, and it lands on the same dramatic beat the header calls out.

**Remedy.** Track which geometries warmUp created: `const o = mat.isSpriteMaterial ? new THREE.Sprite(mat) : new THREE.Mesh(ownGeo = new THREE.PlaneGeometry(0.01,0.01), mat);` and only dispose the ones stored in that list, i.e. skip disposal entirely on the Sprite branch.

### 8. Blob-shadow CanvasTexture carries colour but is left at NoColorSpace, so shadows render as light slate blue

**Minor · Render · `js/engine/blobshadows.js:25` · fixed in `5418f1e`**

**Repro.** Boot the page and read the InstancedMesh's material.map.colorSpace -> "" (THREE.NoColorSpace). Renderer outputColorSpace is 'srgb' and THREE.ColorManagement.enabled is true (verified at runtime).

**Expected.** An albedo map authored in a 2D canvas is sRGB data and must be tagged `tex.colorSpace = THREE.SRGBColorSpace` so map_fragment linearises it.

**Actual.** With NoColorSpace the texel (8,10,20)/255 = (0.031,0.039,0.078) is treated as already-linear, so colorspace_fragment encodes it on the way out: it reaches the screen as roughly (50,57,80) instead of the intended near-black navy (8,10,20). Every character's ground shadow is a pale blue smudge rather than a shadow. Same class of bug at js/ai/monster.js:51, where the '!' sprite's #f0a860 fill renders as ~#f9d5a5 and its #0d1b3e outline as ~#3f5b87.

**Remedy.** Set `tex.colorSpace = THREE.SRGBColorSpace;` immediately after each `new THREE.CanvasTexture(c)` that draws non-white pixels — here and at js/ai/monster.js:51. The pure-white gradients in js/engine/particles.js:18 and js/engine/tracers.js:43/66 are unaffected, but tagging them too costs nothing and prevents the next coloured sprite from inheriting the bug.

### 9. God-ray composite adds linear-light values onto an already tone-mapped, sRGB-encoded framebuffer

**Minor · Render · `js/engine/godrays.js:40` · fixed in `9456ab7`**

**Repro.** js/main.js:346-347 renders the scene to the default framebuffer (tone-mapped Neutral, encoded to sRGB by outputColorSpace) and then calls godrays.composite(), which draws compQuad with AdditiveBlending and autoClear off. COMPOSITE_FRAG includes neither <tonemapping_fragment> nor <colorspace_fragment>. In the page: THREE.ColorManagement.enabled is true, workingColorSpace 'srgb-linear', and `new THREE.Color(0xffd7a8)` holds (1.0000, 0.6795, 0.3916) — linear, not the authored sRGB (1.000, 0.843, 0.659).

**Expected.** The shafts reach the screen as the authored 0xffd7a8 warm cream, rolled off by the same NeutralToneMapping as everything else.

**Actual.** A linear RGB triple is blended additively into a display-encoded buffer, so the tint is applied with its green and blue crushed by the sRGB transfer: the shafts read markedly more saturated orange/red than 0xffd7a8, and they bypass tone mapping entirely, so they clip to white sooner than any other bright element. sky.sample().sun (copied into uTint at godrays.js:135) is linear for the same reason.

**Remedy.** Either encode in the composite — `vec3 c = uTint * r * uStrength;` then append `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` to the ShaderMaterial (three prefixes the pars chunks for ShaderMaterial automatically, as sky.js already relies on) — or, if the additive-over-display look is deliberate, store the tint with `new THREE.Color().setHex(0xffd7a8, THREE.NoColorSpace)` so at least the authored hue survives.

### 10. renderMask allocates a THREE.Color every frame the sun is on screen

**Minor · Perf · `js/engine/godrays.js:145` · fixed in `9456ab7`**

**Repro.** At the 'high' tier with the sun above the horizon and on screen, js/main.js:342-343 calls prepare() then renderMask() once per rendered frame, so this allocates a Color object 60-120 times a second for the whole daylight half of the cycle.

**Expected.** Nothing in a per-frame render path allocates — the same discipline js/engine/shadows.js:37-41 and js/engine/tracers.js:25-31 apply with module-level scratch objects.

**Actual.** A fresh THREE.Color is constructed on every mask render purely as a getClearColor out-parameter, adding steady nursery churn on a phone during exactly the frames that are already the most expensive (mask render + shadow update + main pass).

**Remedy.** Hoist it: add `const _prevClear = new THREE.Color();` beside `const NDC = new THREE.Vector3();` at godrays.js:47 and use `renderer.getClearColor(_prevClear)`. The clear colour is in fact never changed anywhere else in the app, so the save/restore pair could also be dropped entirely.

### 11. particlesFrame allocates two throwaway arrays on every rendered frame

**Minor · Perf · `js/engine/particles.js:152` · fixed in `5418f1e`**

**Repro.** particlesFrame is registered in the fx.frame system (js/main.js:128) and runs every rendered frame while playing or paused. Line 152 builds a 5-element array literal and line 169 (`for (const r of [ring, ring2]) {`) builds a 2-element one, unconditionally — 120-240 short-lived arrays per second at 60-120 fps, plus their iterators.

**Expected.** The frame path iterates a pre-built list, matching the explicit no-allocation discipline documented in js/engine/blobshadows.js:9-13 ("allocated a fresh object per follower per frame ... which showed up as a GC saw-tooth") and js/engine/shadows.js:143.

**Actual.** Two array literals are constructed and discarded per frame. Trivial individually, but it is exactly the GC saw-tooth the rest of the engine goes out of its way to avoid, and it happens on every frame regardless of whether any particle is alive.

**Remedy.** Build the pools list once in initParticles — `pools = [dust, sparks, blood, water, smoke]; rings = [ring, ring2];` at module scope — and iterate those in particlesFrame. Line 57's one-off literal in initParticles can then reuse the same array.

### 18. The whole city is rendered at full cost every frame behind the opaque title screen

**Minor · Perf · `js/core/loop.js:50` · fixed in `9ab347f`**

**Repro.** Load /Strongest-Man/?seed=7 (no autoplay) and sit on the title screen. After 12s: `game.state === 'title'` and `window.__perf` = {"drawCalls":98,"triangles":378748,...}; `renderer.info.render.frame` keeps incrementing.

**Expected.** While the title screen is up nothing behind it is visible, so the scene pass (plus the god-ray mask pass and the shadow pass) should be skipped or throttled.

**Actual.** `render()` is called unconditionally from the loop, and js/main.js:338-355 has no `game.state` gate of its own (unlike `fixed()` at :318 and `frame()` at :329). `#title-screen` is `position:fixed; inset:0; z-index:20` with `background: var(--navy-bg)` and a full-bleed `object-fit:cover` splash (css/main.css:363-364, 370-371), i.e. fully opaque. So an iPhone burns 98 draw calls / 378,748 triangles per frame, plus `godrays.prepare` + `godrays.renderMask` + `shadows.beforeRender` (js/main.js:344-346), for as long as the player looks at the menu — heating the phone and draining battery before the game has started. The same waste applies while the settings screen is up, where `frame()` is skipped but `render()` still runs.

**Remedy.** Gate `render()` on state, e.g. `if (game.state === 'title' || game.state === 'settings') { if (!renderedOnce) { ...draw one frame... } return; }`, or drop to a low-rate redraw (every Nth frame) while a full-screen opaque overlay is up.

### 19. Pausing does not pause the FX: particles keep integrating and hydrant jets keep emitting while game.state === 'paused'

**Minor · Render · `js/main.js:329` · fixed in `5aa9e2e`**

**Repro.** Verified in Chromium: with the game playing, `const P = await import('/Strongest-Man/js/engine/particles.js'); P.burstSparks(0, 4, 0, 60);` then click #btn-pause. Sum every `isPoints` geometry position attribute in the scene at t+150ms and t+1650ms: -157729.246 → -157700.138. The particles are still moving. (`window.__test.timeOfDay()` is correctly frozen over the same interval, confirming the fixed systems did stop.)

**Expected.** PAUSE freezes the world; sparks, dust, blood, smoke and water hang in the air until RESUME.

**Actual.** `frame()` runs the whole `frameSystems` list in the 'paused' state, and that list includes `profile('fx.frame', (dt) => { debrisFrame(dt); particlesFrame(dt); tracersFrame(dt); blobFrame(); })` (js/main.js:128). js/engine/particles.js:139-164 is a full integrator — `p.life[i] -= dt; p.vy[i] += p.grav[i] * dt; p.px[i*3] += p.vx[i] * dt; ...` — and js/engine/particles.js:140-150 keeps SPAWNING for every live hydrant jet (`j.t += dt` and 7 new particles per frame). So a burst hydrant's whole 25-second life (`if (j.t > j.dur + 25)`) can expire behind the pause menu, and the player resumes to a dry hydrant. js/world/debris.js:130-143 (shrink animations, decals) and `sky.frameUpdate` (drifting clouds) run for the same reason. The same applies to the rotate-to-portrait pause (js/ui/overlays.js:61), where nothing is even visible.

**Remedy.** Split the frame list: keep the interpolation/camera systems running while paused (which is what the overlays.js:55-58 comment wants, so the world stays rendered behind the panel) but pass `dt = 0` — or skip them entirely — for the purely time-advancing ones (`fx.frame`, `sky.frame`, and the character mixers).

### 20. game.slowmo is a simulation timescale but is applied to the render dt, and nothing clears it while paused

**Minor · Logic · `js/core/loop.js:37` · fixed in `9ab347f`**

**Repro.** Verified in Chromium: set `game.slowmo = 0.25` (the exact value js/player/combat.js:212 writes on a charged-punch hit), then click #btn-pause. After 3 real seconds: {"slowmo":0.25,"st":"paused"} — still 0.25. In the real game: land a fully charged punch (js/player/combat.js:464 `game.slowmo = 0.3; st.slowmoT = 0.35;`) and tap PAUSE within 0.35s.

**Expected.** Hit-stop is a property of the simulation; while the simulation is stopped it should either be cleared or not affect anything.

**Actual.** The `dt *= game.slowmo` happens before `frame(dt, alpha)`, and `frame()` still runs the whole frameSystems list in the 'paused' state (js/main.js:329). The only code that restores `game.slowmo = 1` is `combat.fixedUpdate` (js/player/combat.js:154-156), which is a FIXED system and therefore does not run while paused. So a pause taken during hit-stop leaves the systems that DO run behind the pause screen (particles, debris, sky, camera — see the related finding) crawling at a quarter speed for the whole pause, and feeds `perfFrame` a dt that is 4x too small the entire time.

**Remedy.** Move the `dt *= game.slowmo` inside the simulation path (apply it to the accumulator only, not to the dt handed to `frame`/`render`), or reset `game.slowmo = 1` from a `GAME_STATE` listener whenever the new state is not 'playing'.

### 21. loadState validates the three save numbers but nothing in settings; one bad value crashes openSettings half-way and DONE then silently mutes the game

**Minor · UI · `js/ui/settings.js:65` · fixed in `5aa9e2e`**

**Repro.** Verified in Chromium. Seed storage with `localStorage.setItem('sm_save_v1', JSON.stringify({settings:{lookSensitivity:null,quality:'ultra',audio:'yes',invertY:1}, save:{karma:'x',points:50,earned:50,owned:['pistol'],equipped:''}}))`, reload /Strongest-Man/?seed=7, click #btn-settings. Result: pageerror "Cannot read properties of null (reading 'toFixed')", settings screen visible with `set-sens-val` empty and `groq-status` empty. Then click #btn-settings-done — stored settings become {"lookSensitivity":1.2,"invertY":false,"audio":false,...}: sound is now OFF and written to disk.

**Expected.** A stored value of the wrong type is coerced or discarded, the same way `save.owned`/`points`/`earned` already are three lines above it.

**Actual.** js/core/state.js:37 does `Object.assign(settings, d.settings || {});` with no validation at all, while js/core/state.js:41-43 immediately below DO validate save's fields with the comment "a corrupted one can have the wrong types". The asymmetry means `settings.lookSensitivity.toFixed(2)` throws on this line, aborting `openSettings` before lines 66-72 run — so `set-invy`, `set-audio`, `set-groq` and `groq-status` keep their markup defaults (unchecked, empty). The panel is then shown anyway (the throw is after `el('settings-screen').hidden = false; setGameState('settings')` on :62-63), and the DONE handler at js/ui/settings.js:18-20 reads those never-populated controls back — `settings.audio = audio.checked;` writes `false`, `settings.invertY = invy.checked;` writes `false` — and js/ui/settings.js:30 persists them. One visit to Settings permanently mutes the game and clears invert-Y, with…

**Remedy.** Validate the settings object in `loadState` the way `save` already is (clamp `lookSensitivity` to a finite 0.4..2, coerce `invertY`/`audio` with `!!`, whitelist `quality` against the four option values), and/or write the DOM in `openSettings` before `setGameState('settings')` so a throw cannot leave a half-populated panel on screen.

### 22. The display-refresh probe measures achieved fps over the first 60 boot frames and never re-measures, so adaptive half-rate is dead on the hardware it was written for

**Minor · Perf · `js/core/loop.js:53` · fixed in `9ab347f`**

**Repro.** Launch the PWA on a 120Hz ProMotion iPhone; the first 60 rendered frames start the instant `createLoop` runs (js/main.js:357), while the first shadow map, the god-ray render targets and the deferred shader uploads are still landing (and, per the known-issues list, 176 GL_INVALID_OPERATION warnings are being emitted). Anything slower than 90 achieved fps in that first ~0.5s latches `refreshHz` below the threshold permanently. Worse: background the app during those 60 frames — rAF pauses but `refreshT0` stays pinned to the first frame — and `refreshHz` lands in single digits forever.

**Expected.** The half-rate governor knows the panel's real refresh rate, and re-evaluates if the first measurement was taken under load.

**Actual.** `refreshHz` is the ACHIEVED frame rate of the worst 60 frames of the session, not the display refresh rate, and once it is non-zero the `if (refreshHz === 0)` guard means it is never measured again. `const allowed = refreshHz > 90;` (js/core/loop.js:67) and `if (!allowed) halfRate = false;` (:75) then permanently disable the entire adaptive half-rate path — 20 lines of governor (js/core/loop.js:18-28, 33, 58-78) that can never engage. There is also no way to observe this from a test: `createLoop`'s return value, which exposes `get halfRate()` and `get refreshHz()` (js/core/loop.js:82-86), is discarded at js/main.js:357 (`createLoop({ fixed, frame, render });`), so neither value is reachable and the feature is untestable.

**Remedy.** Measure the refresh rate from a short idle rAF probe before the first heavy frame (or use `screen.refreshRate` where available), re-probe periodically while `halfRate` is off, and assign `createLoop`'s handle to something reachable (e.g. `window.__test.loop = createLoop(...)`) so the governor can be asserted on.

### 23. Desktop key handlers have no game.state guard, so presses during a pause latch into `input` and the queued edges all fire on the first step after resume

**Minor · Logic · `js/core/input.js:117` · fixed in `5418f1e`**

**Repro.** Verified in Chromium: click #btn-pause (state 'paused', pause screen up), then hold KeyJ. Reading the live module: {"punchDown":true,"chargeTime":0,"punchPressed":false}. Press KeyK twice while still paused, then click #btn-resume — the queued jump fires on the first fixed step.

**Expected.** Input is ignored while a full-screen overlay owns the screen, the same way the touch path already ignores it.

**Actual.** The pointer path four lines up guards correctly — js/core/input.js:71 `if (game.state !== 'playing' || input.textFocus) return;` — but neither the keydown nor the keyup listener checks `game.state`. Since `pollInput(dt)` lives inside `fixed()` (js/main.js:320) and `fixed()` early-returns while paused (js/main.js:318), the `state.pendingPunchDown/pendingJump/pendingGrab/pendingInteract/pendingCycle` edges are never drained: they accumulate for the entire pause (however long) and all fire together in the single fixed step after RESUME, and `input.punchDown` stays latched true across the whole pause. Same path applies while the shop, settings or rotate overlay is up.

**Remedy.** Add `if (game.state !== 'playing') return;` to the keydown handler (keeping the existing keyup exception so a release can always clear `punchDown`), and clear the pending edges on the transition into a non-playing state.

### 24. shop.buy() debits and persists before the work that can fail, with no error handling — a failed purchase leaves the player paid and the shop stale

**Minor · UI · `js/ui/shop.js:95` · fixed in `5418f1e`**

**Repro.** Any run where a gun GLB is missing from `MODELS` (the known ERR_ABORTED on model fetches is the live example). Buy that gun: `points.spend()` has already debited and `persist()` has already written the new balance and owned list, then `buildGun(id)` returns null (js/player/weapons.js:209 `if (meshes[id] || !MODELS[GUNS[id].model]) return meshes[id] || null;`) and `equip(id)` throws on js/player/weapons.js:267 `if (id) buildGun(id).visible = true;`.

**Expected.** Either the purchase completes and the panel refreshes, or it does not happen at all and the points stay in the player's pocket.

**Actual.** The throw propagates out of `buy()` before `build()` runs, so the shop panel never refreshes: `#shop-points` still shows the pre-purchase balance and the row still shows the price on an enabled button. Tapping it again hits `if (!g || save.owned.includes(id)) return;` and does nothing, so there is no way to retry from inside the panel — the player has paid and the UI says they have not. The same ordering means the state is committed and persisted before any of the work that can fail. (The boot path has the same hazard: js/player/weapons.js:603 `if (st.equipped) equip(st.equipped);` throws on the same null for a saved-equipped gun whose model is missing, which turns into the permanently-stuck loading screen reported separately.)

**Remedy.** Do the fallible work first and commit last: `const mesh = weapons.buildGun(id); if (!mesh) return;` before `points.spend()`, and wrap the whole transaction in try/catch that refunds and calls `build()` on failure. Independently, guard js/player/weapons.js:267 with `buildGun(id)?.visible` so a missing model degrades instead of throwing.

### 36. Every settings-row control is under 44px in the short axis

**Minor · UI · `css/main.css:413` · fixed in `5aa9e2e`**

**Repro.** Measured at 844x390 with #settings-screen shown: #set-sens (range) 560x16 — the element box is 16px tall and the thumb is smaller still (iOS renders a 28x28 thumb, still under 44); #set-invy 20x20 and #set-audio 20x20, and because they are `float: right` their <label class="srow"> wrapper is only 560x16 tall, so even the label is a 16px-tall strip; #set-quality (select) 560x36; #set-groq (password) 453.31x38; #btn-groq-test 98.69x38 (css/main.css:430-433 `flex: none; margin-top: 8px; padding: 10px 14px; font-size: 12px;`). Only #btn-settings-done clears the bar at 129.13x48.

**Expected.** 44px minimum in the short axis for every interactive control (Apple HIG).

**Actual.** 16px (range), 20x20 (checkboxes, in a 16px-tall label), 36px (select), 38px (password field and TEST KEY).

**Remedy.** `min-height: 44px` on `.srow select`, `.key-row input[type=password]` and `#btn-groq-test`; give the range an explicit `height: 44px` (styling the track with ::-webkit-slider-runnable-track and the thumb at 28px); and make the checkbox rows a flex row with `min-height: 44px` so the whole label — not a 16px strip — is the target.

### 37. .gun-buy shop buttons are 96x34 — 34px tall

**Minor · UI · `css/main.css:463` · fixed in `5aa9e2e`**

**Repro.** Measured with the shop open at 844x390: all six buttons are {"w":96,"h":34}, at y = 70, 124, 178, 232, 286, 340 — a 54px pitch, so 20px of gutter between adjacent buy/equip buttons. The parent `.gun-row { align-items: center }` (css/main.css:448) prevents the grid item from stretching to the 48px row height.

**Expected.** 44px minimum in the short axis for a button that spends the player's points.

**Actual.** 34px (77% of the minimum).

**Remedy.** `min-height: 44px` on .gun-buy, or `align-self: stretch` so it fills the 48px row height.

### 38. #chat-send is 60.56x35 — 35px tall

**Minor · UI · `css/main.css:346` · fixed in `5aa9e2e`**

**Repro.** Measured at 844x390: {"w":60.56,"h":35,"x":300.4,"y":238.8}. It has no height of its own — it stretches to #chat-input's 35px box (css/main.css:340 `padding: 8px 10px;` + 15px font + 3px border), which is itself under 44.

**Expected.** 44px minimum in the short axis.

**Actual.** 35px for both the SEND button and the text field it sits beside.

**Remedy.** `min-height: 44px` on #chat-form's children (or on #chat-input, which #chat-send stretches to match).

### 39. `!e.isPrimary === false` is always false — the mouse drag-look listener can never arm

**Minor · Logic · `js/core/input.js:133` · fixed in `5aa9e2e`**

**Repro.** Operator precedence: `!` binds tighter than `===`, so the guard parses as `(!e.isPrimary) === false`, i.e. `e.isPrimary === true`. `isPrimary` is a PointerEvent property; on the MouseEvent delivered to a `mousedown` listener it is `undefined`, so `!undefined === false` -> `true === false` -> `false`. state.mouseLook is therefore never set, and the whole mousemove look branch at lines 135-140 (`if (state.mouseLook && game.state === 'playing')`) is unreachable. Belt and braces, the surface's own pointerdown handler calls e.preventDefault() (line 72), which suppresses the compatibility mousedown entirely.

**Expected.** The intent, per the header comment 'desktop testing: WASD move, mouse-drag look', is `e.isPrimary !== false` — treat a plain MouseEvent's undefined as primary.

**Actual.** Dead code. Desktop drag-look still works only because the pointerdown/pointermove pair on the same surface happens to claim the mouse as the look pointer (verified: a 200px mouse drag moved cam.st.yaw by 0.684 rad), so the movementX path this listener was written for has never run.

**Remedy.** Change to `e.isPrimary !== false`, or delete lines 133-140 since the pointer path already covers mouse drag-look.

### 40. Rotating to portrait mid-press clears input.punchDown but leaves the button visually held and the pending edges queued

**Minor · Touch · `js/ui/overlays.js:70` · fixed in `58fdadf`**

**Repro.** Hold PUNCH, rotate the phone to portrait. #rotate-overlay (css z-index 40) only occludes #btn-punch, it does not hide it, so the button keeps its pointer capture and no pointerup / lostpointercapture fires. This line sets input.punchDown = false but does not remove the `.held` class, does not zero input.chargeTime, and does not clear state.pendingPunchDown / pendingPunchUp / pendingJump / pendingGrab / pendingInteract. Rotate back to landscape -> setGameState('playing') with the finger still on the button.

**Expected.** The same full reset resetInput() performs, so the button state matches the finger when play resumes.

**Actual.** PUNCH is still lit orange (.abtn.held, css/main.css:277) but input.punchDown is false and nothing will set it true again until the finger lifts and re-presses — the charge is silently dead. When the finger finally does lift, release() queues pendingPunchUp and the next resume fires a phantom jab (same mechanism as the resetInput finding).

**Remedy.** Replace the hand-rolled three-field clear with `resetInput()` (already exported from core/input.js), which drops .held, the pendings, the axes and chargeTime together.

### 41. The conversation form sits in the bottom 30% of a landscape viewport, where the iOS keyboard lands, on a page that cannot scroll to reveal it

**Minor · Touch · `css/main.css:303` · fixed in `5aa9e2e`**

*Also recorded as #49 by the second sweep.*

**Repro.** Measured at 844x390 (iPhone 14-class landscape) with a populated log: #chat-log spans y 103 -> 232.8, #chat-form / #chat-input / #chat-send span y 238.8 -> 273.8 — the form's bottom edge is at 70.2% of the screen height. An iPhone landscape keyboard with its accessory bar occupies roughly the bottom 190-215pt of a 390pt viewport, i.e. from y ~= 175 down. css/main.css:22-27 pins `html, body { position: fixed; inset: 0; ... overflow: hidden; }`, so there is no scrollable layout viewport for Safari to scroll in order to bring the caret into view.

**Expected.** index.html:84-85 states the design intent: 'Anchored top-left: on iOS the keyboard overlays the viewport without resizing it, so a bottom-anchored panel would vanish.' The whole panel — log AND form — should stay above the keyboard.

**Actual.** Only the log clears it. The field the player is typing into, and the SEND button, are inside the keyboard's region, so the typed text is not visible while typing.

**Remedy.** Clamp the panel so the form stays above the keyboard: reduce `max-height` to `min(30vh, 170px)`, or listen to `visualViewport.resize` and shrink #chat-log's flex basis by (innerHeight - visualViewport.height) while the field has focus.

### 55. #vitals and #karma-bar overlap at 667x375 — the karma meter runs across the last digit of the HP readout

**Minor · HUD · `css/main.css:103` · fixed in `5aa9e2e`**

**Repro.** 667x375 with zero insets (iPhone SE landscape, which has none): #vitals occupies x 10..218, and #hp-num — `flex: none; width: 34px; text-align: right` — sits at x 184..218, y 9..21. #karma-wrap is centred at 333.5 so #karma-bar spans x 213.5..453.5, y 10..20. Overlap 4.5x10px. Confirmed in a screenshot: the '200' and the karma bar's left cap are touching with no gap. No overlap at 844/852/932 because the wider viewport pushes the centred bar right.

**Expected.** A gap between the two top-left readouts. The layout has a fixed 240px karma bar and a fixed 208px vitals block, so the two are guaranteed to collide below 208+240+2*10 = 468px of half-width, i.e. below 916px of usable width — 667 is well inside that.

**Actual.** The karma bar's rgba(0,0,0,0.45) fill and its 1px border run over the last 4.5px of the health number.

**Remedy.** Make the karma meter fluid instead of fixed: `#karma-wrap { width: min(240px, calc(100% - 460px)); }` — or move it out of the collision path entirely by anchoring it to the top-right of the safe box under #btn-pause/#btn-shop.

### 56. #chat (z-index 12) paints over the DOWN banner

**Minor · HUD · `css/main.css:313` · fixed in `5aa9e2e`**

**Repro.** Get knocked down with a conversation open (nothing in talk.js closes the panel on PLAYER_DOWN). Measured overlaps: 667x375 — #chat (10..338.8, y 62..277) vs #down-banner (255..412, y 142.5..208.5) = 83.8x66px; 844x390 = 28.5x66px; 852x393 = 24.5x66px. #chat carries z-index 12 and #down-banner is z-index auto, so the panel wins. Screenshot at 667x375 shows 'DOWN' rendered as 'WN' and '-480 POINTS' as 'POINTS'.

**Expected.** The full-screen state banner — the thing telling you you are downed and how many points it cost — sits above a side panel.

**Actual.** The left half of DOWN and the point-loss figure are hidden behind the conversation panel.

**Remedy.** Close the chat panel on EV.PLAYER_DOWN in talk.js (it already interrupts on BUILDING_COLLAPSED and MONSTER_SPAWNED), and give #down-banner `z-index: 14` so it outranks #chat regardless.

### 57. The 'canned vs live reply' marker in the chat log does not exist — the ::before rule is a byte-for-byte duplicate, leaving a hue-only distinction that itself measures 3.93:1

**Minor · UI · `css/main.css:336` · fixed in `5aa9e2e`**

**Repro.** Line 336 sets exactly the same `content` and `opacity` as line 331, so it is a no-op override — the promised mark is identical for both kinds of line. The only remaining difference is hue: `--blue-bright` (#3090f0) at opacity 0.8 vs `--ink` (#eaf2ff) at 1.0. Compositing #3090f0 at 0.8 over the panel's rgba(9,18,44,0.92) gives rgb(40,119,202) on rgb(9,20,48) = 3.93:1, below AA for 13px text (css/main.css:326). js/dialogue/talk.js:233 relies on this styling: `pending.className = live ? 'them' : 'them canned';`.

**Expected.** The comment's own requirement — canned replies visibly 'marked' so a colour-blind or bright-screen player can tell a built-in line from a model answer, at 4.5:1 or better.

**Actual.** Canned and live replies are distinguished by a blue-vs-white hue alone, with no shape, glyph or label redundancy, at 3.93:1.

**Remedy.** Give the canned lines a real marker: `#chat-log .them.canned::before { content: "◇ "; }` (or a small uppercase 'BUILT-IN' tag), lift the colour to something like #7cc0ff to clear 4.5:1, and delete the duplicate rule at line 336 once it carries different content.

### 58. Five HUD/panel buttons have no pressed state, and -webkit-tap-highlight-color removes the system fallback — tapping them produces zero feedback

**Minor · Touch · `css/main.css:33` · fixed in `5aa9e2e`**

**Repro.** Line 33 sits in the `html, body` rule and -webkit-tap-highlight-color is inherited, so every descendant loses the iOS tap flash. The only :active rules in the whole 632-line file are `.mbtn:active` (:395), `#art-prompt:active` (:526) and `#inspect-close:active` (:594). That leaves #btn-pause (:288), #btn-shop (:201), #chat-send (:345), #chat-close (:318), .wchip (:191) and .gun-buy (:461) with no pressed state at all. .abtn has `.held` (:277) driven from JS, so the action buttons are covered; the rest are not. #chat-send additionally has no disabled state even though js/dialogue/talk.js:219 silently drops the submit while a request is in flight: `if (!n || !text || chatBusy()) return;`.

**Expected.** Every touch control acknowledges the press, and a control that will refuse the press looks refused.

**Actual.** SHOP, PAUSE, SEND, the chat close ✕ and the weapon chips are visually inert on touch. Tapping SEND during an in-flight Groq call does nothing at all, with no change to the button.

**Remedy.** Add one shared rule — `#btn-pause:active, #btn-shop:active, #chat-send:active, #chat-close:active, .wchip:active, .gun-buy:active:not([disabled]) { filter: brightness(1.35); transform: translateY(1px); }` — and have talk.js set `chat.send.disabled = true` for the duration of the request, with `#chat-send[disabled] { opacity: 0.5 }`.

### 59. Three infinite animations with no prefers-reduced-motion guard, including a 0.3s shake on body text

**Minor · UI · `css/main.css:77` · fixed in `5aa9e2e`**

**Repro.** grep for `prefers-reduced-motion` in css/main.css returns nothing. `bubble-shake` rotates a block of 13px readable text +/-1.5deg at 3.3Hz for the bubble's whole life (js/dialogue/talk.js:80/:86/:105 apply `cls: 'scream'` on panic barks and monster spots — routine events). `hp-pulse` runs for as long as HP stays under 28%. `spin` runs for the entire time the phone is in portrait. iOS exposes the system Reduce Motion switch as `prefers-reduced-motion: reduce`; nothing here reads it.

**Expected.** WCAG 2.2.2 (Pause, Stop, Hide) for animation that runs longer than 5 seconds, and respect for the OS accessibility setting.

**Actual.** A player with Reduce Motion enabled gets a permanently shaking speech bubble they have to read, a pulsing health bar, and a spinning icon — none of which can be stopped.

**Remedy.** Append `@media (prefers-reduced-motion: reduce) { .bubble.scream, #hp-bar.critical, #rotate-icon { animation: none; } .bubble { animation: none; } * { transition-duration: 0.01ms !important; } }` and substitute a non-moving cue for `.bubble.scream` (it already has a distinct orange border, which is enough).

### 60. #update-banner is centred on the raw viewport, not the safe box — its own comment claims the opposite, and its max-width explicitly allows it under the notch

**Minor · UI · `css/main.css:615` · fixed in `5aa9e2e`**

**Repro.** `left: 50%` on a position:fixed element resolves against the initial containing block — the raw viewport — so the banner is centred at W/2 regardless of the insets. `max-width` only caps the width; it never shifts the centre. Measured with sa-l:59 / sa-r:0: 667x375 banner centre 333.5 vs safe centre 363.0 (off by 29.5px); 852x393 426.0 vs 455.5; 932x430 466.0 vs 495.5 — all exactly -29.5px. Worse, at max-width the banner spans W/2 +/- (W-83)/2, i.e. left edge 41.5px: I forced a longer label at 667x375 and measured x = 43.4, which is 15.6px INSIDE a 59px inset.

**Expected.** What the comment says: the banner is horizontally centred within the safe box and can never reach under the notch.

**Actual.** It is off-centre by 29.5px in landscape (visibly not centred between the two visible edges, and the offset flips when the phone is rotated), and the clamp permits a longer message to sit under the Dynamic Island.

**Remedy.** Centre it in the safe box: `left: calc(var(--sa-l) + (100% - var(--sa-l) - var(--sa-r)) / 2)` with the existing `translateX(-50%)`, or drop left/transform and use `inset-inline: calc(var(--sa-l) + 12px) calc(var(--sa-r) + 12px); margin-inline: auto; width: max-content;`.

### 61. #update-banner (z-index 45) renders above #rotate-overlay (z-index 40), which its own comment says it sits under

**Minor · UI · `css/main.css:613` · fixed in `5aa9e2e`**

**Repro.** Full stack measured from getComputedStyle: #gl auto(0) < #bubbles 5 < #vignette 8 < #hud 10 (#chat 12 inside it) < #title/#settings/#pause/#shop 20 < #loading 30 < #inspect 35 < #rotate-overlay 40 < #update-banner 45. The comment at css/main.css:607-608 asserts "above every overlay except the rotate block", but 45 > 40. Turn the phone to portrait with an update pending and the orange banner floats on top of the opaque 'Rotate your phone to play' screen.

**Expected.** z-index 45 is above the pause/shop/settings/inspect/loading tier and below the rotate block that is meant to be an absolute stop, i.e. a value between 35 and 40.

**Actual.** The banner is the topmost element in the whole application, including over the rotate block and over the full-screen artwork viewer (#inspect, z-index 35) where an orange pill at top-centre lands on the picture.

**Remedy.** Set `#update-banner { z-index: 38; }` — above #inspect (35) and #loading (30), below #rotate-overlay (40) — and update the comment to record the actual ordering.

### 62. #update-banner has no dismiss and permanently covers the karma meter for the rest of the session

**Minor · HUD · `js/ui/overlays.js:103` · fixed in `5aa9e2e`**

**Repro.** The only listener accepts the update and reloads; there is no close affordance, no auto-hide timer, and no CSS that ever re-hides it. The banner is 294.9x44px at `top: calc(var(--sa-t) + 8px)` with z-index 45; #karma-bar is 240x10 at `top: 10px` inside #hud (z-index 10). Measured at 667x375 with sa-l:59: banner x 186..481, y 8..52 vs #karma-bar x 243..483, y 10..20 — the banner covers the meter completely (238x10px of a 240x10px element).

**Expected.** A non-blocking update prompt either dismisses or does not sit on top of a live readout. The comment at js/ui/overlays.js:93-97 is explicit that the point is "nothing is pulled out from under a session that is mid-fight".

**Actual.** A player who does not want to reload mid-fight loses the karma meter — the readout for the game's central mechanic — for the remainder of the session, with no way to get it back short of taking the reload.

**Remedy.** Add a dismiss: a second tap target (or a long-press) that sets `b.hidden = true`, plus an auto-hide after ~15s that leaves the update to apply on the next natural launch. Alternatively anchor the banner at the BOTTOM-centre inside the safe box, where nothing persistent lives at 42-100px, instead of over the karma band.

### 63. Overlay panels carry no horizontal safe-area padding, and #shop-panel is edge-to-edge full-bleed at 667x375

**Minor · UI · `css/main.css:440` · fixed in `5aa9e2e`**

**Repro.** `#settings-panel, #pause-panel, #shop-panel` (css/main.css:398-407) subtract --sa-t and --sa-b from max-height and add --sa-b to the padding, but never touch --sa-l / --sa-r, and the panels are flex-centred in an `inset: 0` overlay — i.e. centred on the raw viewport. Measured #shop-panel: 667x375 -> x 0..667, width 667 (content min(680, 613.6) = 613.6 plus 52px padding and 4px border = 669.6, flex-shrunk to exactly fill the viewport) — zero margin on either edge. 844x390 -> x 54..790 against a 59px landscape inset, so 5px of the panel's border and background sit under the notch; 852x393 -> x 58..794, 1px under.

**Expected.** The 92vw / 86vw widths imply a visible gutter, and the panel edge stays inside env(safe-area-inset-left/right) in both landscape orientations.

**Actual.** At 667x375 the ARMOURY spans the full screen with no gutter, its rounded corners flush against the display's own rounded corners; on notched devices the panel edge crosses into the inset band.

**Remedy.** Add `margin-inline: calc(var(--sa-l) + 12px) calc(var(--sa-r) + 12px)` (or `max-width: calc(100vw - var(--sa-l) - var(--sa-r) - 24px)` with `box-sizing: border-box`) to the shared `#settings-panel, #pause-panel, #shop-panel` rule.

### 64. #points-row wraps to two lines whenever a payout label appears, detaching the +N chip from the score it modifies

**Minor · HUD · `css/main.css:128` · fixed in `5aa9e2e`**

**Repro.** #vitals is a hard `width: 208px` (css/main.css:103) and #points-row has no nowrap or ellipsis. js/ui/hud.js:103 builds the pop string as `${delta > 0 ? '+' : ''}${delta}${what ? ` ${what}` : ''}`, and js/core/points.js supplies labels 'MONSTER DOWN' (300), 'BUILDING DOWN' (450), 'WRECKED' (90), 'CIVILIAN' (-25), 'IT KNOWS' (40). Measured with '12,340' + 'PTS' + '+450 BUILDING DOWN': #points-row height 28px, i.e. two 14px lines, at every viewport (the box is fixed-width so this is viewport-independent); #vitals grows to 46px. The pop text is never cleared — js/ui/hud.js:108 only removes the `.show` class — so the row stays two lines tall (with an invisible second line) for the rest of the session after the first payout.

**Expected.** The payout chip appears inline beside the score, on one line, for every label in AWARDS — and stops reserving layout width once it has faded.

**Actual.** Any labelled award pushes '+450 BUILDING DOWN' onto a second line under the score, so the feedback no longer reads as attached to the number, and #vitals silently grows 32px -> 46px permanently.

**Remedy.** Give #points-row `display: flex; align-items: baseline; white-space: nowrap; overflow: hidden` and #points-pop `min-width: 0; overflow: hidden; text-overflow: ellipsis`, or widen #vitals to 240px to match #karma-wrap (after fixing the #karma-bar collision). Clear `pop.textContent = ''` alongside the class removal in js/ui/hud.js:108.

### 74. navigate() returns a 4xx/5xx network response instead of falling back to the cached shell

**Minor · SW · `sw.js:179` · fixed in `c62005a`**

**Repro.** `done(r)` is called for any resolved response. `fetch()` only rejects on a transport error, so a 404 (GitHub Pages during deploy propagation, or an accidental Pages settings change) or a captive-portal 200 interstitial resolves normally and wins the race against the 2500 ms cached fallback. Note the cache-write guard at sw.js:169 correctly checks `res.ok && res.type === 'basic'`, so the code already knows the distinction — it just isn't applied to what gets served.

**Expected.** An app that holds a complete offline copy of itself never shows the player a 404 page.

**Actual.** The PWA renders GitHub's 404 page (or a hotel Wi-Fi login page) instead of the fully cached game.

**Remedy.** In tools/gen-sw.mjs's template, gate the win on the same condition as the cache write: `network.then((r) => { clearTimeout(timer); if (r && r.ok && r.type === 'basic') done(r); else cached.then((c) => done(c) || done(r)); })`.

### 75. Pages deploy uses cancel-in-progress: true, which can abort a production deployment mid-publish

**Minor · Deploy · `.github/workflows/deploy.yml:11` · fixed in `c62005a`**

**Repro.** Push twice in quick succession (or push while a `workflow_dispatch` run is live). The second run cancels the first while `actions/deploy-pages@v4` is in its publish step, not merely during the build.

**Expected.** GitHub's own Pages starter workflow ships `cancel-in-progress: false` with the comment that in-progress production deployments must be allowed to complete; queued runs between the in-progress one and the latest are skipped instead.

**Actual.** An in-flight deployment can be cancelled part-way through publishing, leaving the run marked failed and the previous build live, which reads as 'the deploy silently did nothing'.

**Remedy.** Set `cancel-in-progress: false`.

### 76. icon-512.png and icon-512-maskable.png are byte-identical, so the maskable icon has no safe zone and 384 KB is duplicated in every precache

**Minor · PWA · `tools/make-icons.mjs:33` · fixed in `4d7b089`**

**Repro.** `md5sum assets/icons/*.png` gives the same digest `b8c14b494b9554a5f00ca247eaf22294` for icon-512.png and icon-512-maskable.png (393,149 bytes each). Both are listed separately in sw.js's PRECACHE.

**Expected.** A `purpose: "maskable"` icon keeps all essential artwork inside the inner 80% safe zone (a circle of diameter 409 px on a 512 px canvas), because the platform crops to an arbitrary mask. And two manifest entries pointing at identical bytes should be one entry.

**Actual.** The maskable icon is the same full-bleed 112% crop as the `any` icon, so Android's circle/squircle masks shave roughly 10% off each edge of the art; and 384 KB of the 5.4 MB precache is a literal duplicate of another precached file, downloaded twice by every first-time visitor.

**Remedy.** Composite the artwork onto a 512x512 background at ~80% scale for the maskable variant (`sharp(bg512).composite([{ input: await base.clone().resize(410,410).toBuffer(), gravity: 'centre' }])`), or drop the maskable entry from manifest.webmanifest and ship one 512 icon. Either way stop emitting two identical files.

### 77. Eight iOS launch images (411 KB) are precached but the page never requests them

**Minor · SW · `sw.js:126` · fixed in `c62005a`**

**Repro.** `assets/splash/*.jpg` is referenced only by `<link rel="apple-touch-startup-image">` (index.html:17-24). Non-iOS browsers ignore that relation entirely and never issue a request; iOS Safari fetches the matching image at Add-to-Home-Screen / launch-screen time, outside any page's service worker. `du` shows the set is 411 KB, and on any single device at most 2 of the 8 can ever match a media query.

**Expected.** gen-sw.mjs's EXCLUDE list (tools/gen-sw.mjs:60-64) exists precisely to keep files the game never opens out of the precache — sky_equirect.webp, art/sources.json and CREDITS.md are already excluded on that reasoning.

**Actual.** All eight are precached, so every first-time visitor on every platform downloads 411 KB of images that will never be read from that cache. This also grows as the device list is extended to fix the coverage gap above.

**Remedy.** Add `'assets/splash'` as a directory prefix to EXCLUDE in tools/gen-sw.mjs (the current EXCLUDE is exact-path only, so it needs a `startsWith` branch alongside the existing assertion at lines 74-80) and regenerate.

### 78. Old caches are only purged on a navigation, so a long-running standalone PWA accumulates one 5.4 MB cache per deploy

**Minor · SW · `sw.js:154` · fixed in `c62005a`**

**Repro.** The stated use case is an installed iPhone PWA left running for days; js/main.js:518-520 calls `reg.update()` on every foreground, so each deploy installs a fresh ~5.4 MB cache. `purgeOldCaches()` runs only when `clients.matchAll({type:'window'})` is empty at activate, or on the first navigation (sw.js:194). A player who keeps declining the update banner never navigates, so nothing is ever deleted. Measured usage for one cache in Chromium: `navigator.storage.estimate()` -> `{caches: 5747013}`.

**Expected.** Storage stays bounded at roughly one live cache plus one retained predecessor.

**Actual.** N deploys without a reload leave N+1 caches. Combined with `navigator.storage.persist()` (js/main.js:483), which asks the browser NOT to evict, this walks toward the origin quota; once there, a later `addAll` rejects and updates stop arriving with no visible symptom.

**Remedy.** Keep only the immediately-previous cache: in purgeOldCaches (sw.js:146-152) the filter already drops everything that isn't VERSION — also run a bounded sweep at activate that deletes all `sm-` caches except VERSION and the single most recently created other one, rather than deferring the whole purge.

### 85. addPile clamps to 1.6 but removePile subtracts the full recorded amount — stacked rubble sinks the ground under itself

**Minor · Logic · `js/physics/heightfield.js:50` · fixed in `8b2e8cf`**

**Repro.** A collapsed building drops up to 46 mound chunks into one footprint (destruction.js:242-268), several of which share a 1 m pile cell; each records `b.pileAmount = Math.min(b.half * 1.2, 0.5)` (pworld.js:119) whether or not the clamp actually accepted it. Punch that mound (strike -> wakeRadius, combat.js:195): each woken body calls `removePile(cell, 0.5)` (pworld.js:141) even though the 4th and 5th chunk in that cell contributed only 0.1 and 0.0.

**Expected.** A body should give back exactly what its addPile call actually applied.

**Actual.** addPile returns the cell index but not the applied delta, so removals over-subtract. Waking two of five stacked chunks drops the cell by 1.0 m while three sleeping chunks are still resting on it — their frozen matrices now hover up to a metre above the walkable ground, and the player walks through them.

**Remedy.** Return the applied delta from addPile (`const before = pile[i]; pile[i] = Math.min(before + amount, 1.6); return { i, applied: pile[i] - before };`) and store that as pileAmount, or clamp the subtraction to the body's true share.

### 86. equip() dereferences buildGun()'s null return when a gun model failed to load

**Minor · Logic · `js/player/weapons.js:267` · fixed in `8b2e8cf`**

**Repro.** buildGun returns null for any gun whose GLB is absent from MODELS: `if (meshes[id] || !MODELS[GUNS[id].model]) return meshes[id] || null;` (weapons.js:209). The project already logs net::ERR_ABORTED on model fetches; if gun_sniper.glb (or any other) fails to decode, buying/equipping that weapon throws `TypeError: Cannot read properties of null (reading 'visible')` out of the shop and the weapon rail, leaving st.equipped set to a weapon with no mesh and the UI mid-transaction.

**Expected.** A missing gun model should degrade (no mesh drawn, or the equip refused) rather than throw.

**Actual.** Unguarded property write on a documented null return path. The sibling call site at weapons.js:602 (`for (const id of GUN_IDS) if (save.owned.includes(id)) buildGun(id);`) correctly ignores the return value; this one does not.

**Remedy.** `const m = buildGun(id); if (m) m.visible = true;` — or return false from equip() when the model is unavailable so the caller can report it.

### 87. reclaimOldest can steal the instance slot of the chunk the player is currently carrying

**Minor · Logic · `js/world/debris.js:103` · fixed in `4d7b089`**

**Repro.** Grab a sleeping chunk. Measured during the carry: the body is in neither pw.active nor pw.sleeping, but `b.asleep` is still true (tryGrab at combat.js:232-240 never clears it) and its record is still in pool.used. It is therefore a prime candidate — usually the OLDEST sleeping one, since it was rubble from the earliest punch. Now spawn 520 more chunks (two or three charged punches plus a collapse) so the chunk pool exhausts and reclaimOldest runs.

**Expected.** A body the carry system owns should not be reclaimable, or the carry should mark it not-asleep.

**Actual.** reclaimOldest splices the record out of pool.used, calls removeFromPhysics, and hands the idx to pool.shrink -> pool.free (debris.js:107-109, 140), while placeCarried (combat.js:608-611) keeps calling `b.onMove(b)` -> writeMatrix on that same idx every frame. Two objects then fight over one InstancedMesh slot: the carried chunk and a freshly spawned one flicker between the hands and the new spawn point.

**Remedy.** Clear `b.asleep = false` in tryGrab when the body is taken out of sleepingBodies (it is being carried, not settled), and skip records whose body is the active carry target in reclaimOldest.

### 88. Pause freezes the fixed step but not the animation mixer, so a scheduled strike desyncs from its punch clip

**Minor · Logic · `js/main.js:147` · fixed in `9ab347f`**

**Repro.** Throw a punch, then pause before the strike lands (combat.js:167 schedules `st.swing = { t: 0.3, charge }` and combat.js:145-151 decrements it in fixedUpdate only). main.js:372 `if (game.state !== 'playing') return;` freezes st.swing.t, but main.js:383 keeps every frameSystem running while 'paused', so player.frameUpdate -> loco.update(dt) -> mixer.update(dt) plays the punch clip to completion and retires the one-shot. Resume: the strike fires 0.3 s later with the arms already back at rest, no punch animation at all.

**Expected.** The same gating fx.frame already got — main.js:158-161 explicitly passes `const d = game.state === 'playing' ? dt : 0;` for exactly this reason.

**Actual.** player.frame, combat.frame, weapons.frame and chars.frame all receive the real dt while paused, so the mixer, the pose layer (pose.update / updateAnchor / c.strideT at combat.js:584), the recoil decay (weapons.js:581) and the carry sway all keep advancing behind the pause panel while the simulation that drives them does not.

**Remedy.** Apply the same `game.state === 'playing' ? dt : 0` gate to the character frame systems, or hoist it into frame() so every frameSystem gets a zero dt when not playing.

### 89. capsuleVsWorld allocates a two-element array on every call, and debrisVsWorld calls it once per active body per fixed step

**Minor · Perf · `js/physics/collide.js:191` · fixed in `bfa5c46`**

**Repro.** pworld.step calls `collideWorld(b, dt)` for every active body every fixed step (pworld.js:90). Active body count was measured at 418 during a punch flurry, so that is ~25 000 throwaway arrays per second at 60 Hz, on top of one per player step and one per NPC/monster capsule resolve.

**Expected.** No steady-state allocation on the per-body hot path — this is the same class of defect heightfield.js:18-21 documents as an already-shipped regression ('the closures this used to build per call were a steady stream of garbage and a matching stream of GC pauses — the smooth, then it stutters report').

**Actual.** Every capsuleVsWorld call allocates a fresh array literal that is immediately destructured and discarded, producing sustained nursery pressure exactly during a collapse, which is when frames are already expensive and loop.js MAX_STEPS catch-up is closest to saturating.

**Remedy.** Write the result into a module-scope scratch pair (e.g. `const _out = [0, 0]; ... _out[0] = x; _out[1] = z; return _out;`) or give capsuleVsWorld an out-parameter, matching the no-allocate convention the grid queries and heightfield already follow.

### 95. evacuate() is a third exit from 'hide' that never undoes the cower squash — the NPC stays 8% short forever

**Minor · Render · `js/ai/panic.js:140` · fixed in `708a37d`**

**Repro.** ?autoplay=1&nomonsters=1. Force an NPC into 'hide' (forcePanic, set n.shelter to an intact building, park them on its door and step until state==='hide'). Measured in hide: scale.y = 0.8751, baseY = 0.9512. Now emit `EV.CHUNK_DESTROYED` at the shelter's centre so panic.js:107-114 calls evacuate(). Measured immediately after: state 'panic', scale.y still 0.8751. After step(30) and a return to 'commute': scale.y still 0.8751.

**Expected.** Leaving 'hide' restores the body to full height, as the timeout exit does — and as the comment at panic.js:206-208 explicitly demands: "any other way out of 'hide' — killed in the doorway, or grabbed out of it — left that person permanently 8% short."

**Actual.** The squash is applied at panic.js:171 `n.root.scale.y = n.baseY * 0.92;` and undone in exactly three places: the 'hide' timeout (panic.js:209), npc.js `kill()` (line 431) and npc.js `hooks.tryGrab` (line 552). `evacuate()` is the fourth exit and restores nothing, so anyone driven out of a shelter by CHUNK_DESTROYED (panic.js:111) or by BUILDING_COLLAPSED (panic.js:120) runs around visibly squat for the rest of the session. evacuate() also leaves them standing inside the building footprint, unlike the timeout exit which explicitly steps them back out through the door (panic.js:210-213) because "NPCs collide with walls now, so resuming from inside the footprint would just wedge them."

**Remedy.** In `evacuate(n)` add `n.root.scale.y = n.baseY;` and step them out of the shelter before clearing it: `const d = n.shelterB?.spec?.door; if (d) { n.x = n.px = d.outX; n.z = n.pz = d.outZ; }` — i.e. reuse the same two lines the 'hide' timeout already runs.

### 96. MONSTER_SPAWNED schedules a bare, uncancellable setTimeout that fires while the game is paused and on a monster that may be gone

**Minor · Logic · `js/dialogue/talk.js:83` · fixed in `bbad27f`**

**Repro.** ?autoplay=1&nomonsters=1. Clear #bubbles, put the player next to an NPC, then `setGameState('paused')` and `emit(EV.MONSTER_SPAWNED, { monster: {x,z,y:0,targetH:3.4} })`. Measured: 1 bubble immediately, then after 1.6 s of real time with the game still paused there are 2 — the new one reading "Not again. NOT AGAIN!" (lines.js:75, the `monster_spot` pool). No fixed step ran during that window.

**Expected.** Nothing in the simulation may act while game.state !== 'playing'; main.js:371-372 `if (game.state !== 'playing') return;` is the rule for every other system, and fx.frame (main.js:162-164) goes to lengths to freeze even particles while paused.

**Actual.** The timer is wall-clock and nothing holds or clears its handle. A player who pauses within 1.2 s of a spawn gets a scream bubble over the pause overlay, and the barked NPC's 6 s `lastBark` cooldown is consumed for a line the player never properly saw. The closure also retains `monster` unconditionally: if the monster is killed and despawned inside those 1.2 s, the callback still reads `monster.x/monster.z` off the detached object and barks about a threat that no longer exists (harmless only because the object is not nulled on despawn).

**Remedy.** Keep the handle and gate the body: store it in a module-scoped set, clear it on GAME_STATE leaving 'playing', and re-check liveness inside the callback (`if (game.state !== 'playing' || monster.dead) return;`). Better still, drive the delay off `fixedUpdate`'s accumulator rather than setTimeout, so it inherits the pause for free.

### 97. Speech bubbles age out and are removed while the game is paused

**Minor · UI · `js/main.js:233` · fixed in `9ab347f`**

**Repro.** ?autoplay=1&nomonsters=1. Talk to an NPC and send a line so a speech bubble exists (1 bubble in #bubbles). `setGameState('paused')`, then run 360 paused frames. Measured: bubbles go 1 → 0 while paused; the bubble is gone when the player unpauses.

**Expected.** Paused means paused. main.js:156-161 says so in as many words — "a player who paused mid-collapse came back to a settled street and a dust cloud that had aged out" was fixed for debris, particles and tracers, and bubbles are the same class of timed effect.

**Actual.** dialogue.frameUpdate → bubblesFrame(dt) (talk.js:282-284) is registered with the raw frame dt, so bubbles.js:38-39 `b.t += dt; if (b.t >= b.life) { b.el.remove(); active.splice(i, 1); }` keeps running while paused. Pausing to read what an NPC just said destroys the very line you paused to read (bubble life is speakDuration + 1.2 s, i.e. under 8 s).

**Remedy.** Gate it the same way fx.frame is gated: `frameSystems.push((dt) => dialogue.frameUpdate(game.state === 'playing' ? dt : 0));`

### 98. Karma drift changes the value and the band without emitting KARMA_CHANGED or persisting — the HUD bar goes stale and the drift is lost on reload

**Minor · HUD · `js/ai/karma.js:50` · fixed in `708a37d`**

**Repro.** ?autoplay=1&nomonsters=1. Subscribe a counter to EV.KARMA_CHANGED, then `__test.setKarma(20.1)` (band 'good', just over the 20 boundary) and `__test.step(400)` with no deeds. Measured: save.karma 20.1 → 6.5, `repStats().band` 'good' → 'neutral', KARMA_CHANGED events fired = 0, and nothing was written to localStorage.

**Expected.** Any change to save.karma emits KARMA_CHANGED (so the HUD bar tracks it) and is persisted, exactly as the `add()` path at karma.js:22-27 does with `emit(...)` followed by `persist()`.

**Actual.** The drift branch mutates `save.karma` directly and does neither. js/ui/hud.js:32 `on(EV.KARMA_CHANGED, ({ value, band }) => { ... fill.style.width = ... })` is the only thing that redraws the karma bar, so the HUD keeps showing the pre-drift width and colour until the next deed — potentially for the whole session, since the drift only runs when the player has been behaving for 60 s. And because nothing persists, up to 400+ seconds of earned drift is silently discarded on the next reload while a single deed writes the un-drifted value straight back.

**Remedy.** Route the drift through the same helper: compute the delta and call the existing `add(dv)` (which clamps, emits with prevBand, and persists) — or at minimum emit KARMA_CHANGED and call persist() when the drift actually moves the value, throttled to the 5 s cadence it already runs on.

### 99. Corpse physics bodies are never reclaimed from pworld.sleeping; re-throwing one corpse creates a new body every time

**Minor · Perf · `js/ai/npc.js:439` · fixed in `bbad27f`**

**Repro.** ?autoplay=1&nomonsters=1. Read `__pworld.sleeping.length` (0). Kill 20 townsfolk with a launching impulse (`kill(n,'player',30,1,0)` — impulse > 14 takes the createBody branch) and `step(40)`. Measured: sleeping = 20, all `kind === 'corpse'`, active = 0. None are ever removed.

**Expected.** A settled corpse's rigid body is retired the way debris bodies are — js/world/debris.js:117 does exactly this: `i = sleepingBodies.indexOf(body); if (i >= 0) sleepingBodies.splice(i, 1);`

**Actual.** pworld only ever moves bodies from `active` to `sleeping` (pworld.js:114-115); nothing splices a corpse body out again. npc.js `updateDead` (line 292) sets `n.body = null` when it sleeps, orphaning the entry, and monster.js:436 does the same. Worse, npc.js `launch()` at line 598 creates a *fresh* body every time an already-dead NPC is thrown, so the pick-up-and-throw-a-corpse loop is unbounded and entirely player-driven — each throw permanently adds one entry. `wakeRadius` (pworld.js:134) scans the whole `sleeping` array on every explosion, so the cost of that scan grows for the rest of the session.

**Remedy.** Give corpse bodies the debris treatment: when npc.js/monster.js null out `n.body`/`m.body` on sleep (or when a body is superseded by a re-launch), splice it out of `pworld.sleeping` — a small `releaseBody(b)` export in pworld.js that removes from both lists would serve all three call sites.

### 100. despawn() splices the monsters array while fixedUpdate is iterating it with for...of, skipping the next monster's step

**Minor · Logic · `js/ai/monster.js:159` · fixed in `708a37d`**

**Repro.** Static: `for (const m of monsters)` uses an index-based array iterator. `despawn(m)` runs inside that loop from three sites — monster.js:267 `if (Math.abs(m.x) > 85 || Math.abs(m.z) > 85) despawn(m);`, monster.js:271 `else if (m.stateT <= 0) { if (pd > 45) despawn(m); ... }`, and monster.js:442 `if (m.deadT > 18) despawn(m);` (reached via updateDead at line 160) — and each does `monsters.splice(i, 1)`. With the director's cap of 4 this triggers whenever two monsters are alive and one retires.

**Expected.** Removing a monster does not disturb the iteration order of the ones still being simulated.

**Actual.** Splicing at index i shifts monsters[i+1] down into index i while the iterator's cursor has already advanced past it, so the monster immediately after the despawned one is skipped entirely for that fixed step: it gets no stateT/swingT/wreckT decrement, no state machine tick, no movement integration and no `m.px/m.pz` update, which briefly stalls its render interpolation. With the flee path this fires exactly when a second monster is closing on the player.

**Remedy.** Iterate backwards by index, which is splice-safe: `for (let i = monsters.length - 1; i >= 0; i--) { const m = monsters[i]; ... }` — or mark for removal and compact the array after the loop, the way destruction.js's collapseQueue does with its `write` cursor.

### 101. A rampaging monster can kill or hijack the NPC in the player's hands — monster.js has no 'carried' guard where the npc hooks do

**Minor · Logic · `js/ai/monster.js:186` · fixed in `708a37d`**

**Repro.** With a monster in 'rampage' whose current target is NPC #k, grab #k with the player's carry (npcSys hooks.tryGrab sets `state='carried'` and combat pins them ~1.4 m in front of the chest). The re-target guard at line 186 only fires on `!m.target || m.target.state === 'dead'`, so the monster keeps closing on the person in your fist; at `d < 2.6` it either kills them outright (lines 199/202) or claims them a second time (line 197), leaving both the player's carry handle and monster.js writing the same NPC's transform every step.

**Expected.** The person the player is holding is off-limits to monsters, the same way the player's own attacks exempt them: npc.js hooks.onPunch line 507 `if (n.state === 'carried') continue;` and hooks.damageRadius line 520 `if (n.state === 'carried') continue; // not the one you are swinging`. pickVictim (monster.js:345) already excludes carried NPCs at selection time — the guard is just missing after selection.

**Actual.** A stale `m.target` survives the transition to 'carried'. The victim dies with cause 'monster' (no karma penalty, so the player is not even blamed) while still nominally in the player's grip; combat's `alive: () => n.state === 'carried'` then goes false and dropCarried()'s `release()` bails at npc.js:577 `if (n.state !== 'carried') return;`, so the drop path is skipped and the corpse settles wherever the tug-of-war left it. In the eat branch the two carriers fight over `t.x/t.z` every fixed step.

**Remedy.** Extend the re-target guard to `if (!m.target || m.target.state === 'dead' || m.target.state === 'carried' || m.target.state === 'hide') m.target = pickVictim(m);` and add a defensive `if (t.state === 'carried') { m.target = null; break; }` before the swing branch.

### 102. The Groq client is never skipped offline — no navigator.onLine check exists anywhere in the app

**Minor · PWA · `js/dialogue/groq.js:223` · fixed in `708a37d`**

**Repro.** grep -rn "navigator.onLine" over js/, sw.js and index.html returns nothing. With a key saved and api.groq.com routed to connectionrefused, each TALK turn still issues a real cross-origin POST (verified: one request per turn to https://api.groq.com/openai/v1/chat/completions, plus one to /v1/models on the first turn) before falling back with "Could not reach api.groq.com — network error (Failed to fetch)". The background bark path retries on a 15 s back-off (groq.js:363 `barkDisabledUntil = performance.now() + (r.retryAfterMs || (status ? 30000 : 15000))`) for as long as the app is open.

**Expected.** An installed offline PWA does not spend requests, battery or a 15 s AbortController budget on a host it demonstrably cannot reach; `chatUnavailable()` should say so in one word and let the canned corpus answer instantly.

**Actual.** Nothing consults connectivity. Offline every player turn opens a fetch with `timeoutMs = 15000` (groq.js:237) while `chatBusy()` (groq.js:233, checked at talk.js:219) blocks any further submit — so on a captive or half-dead cellular link, where fetch stalls rather than rejecting, the chat panel sits on its "…" pending line for a full 15 seconds per turn with the input dead. On a clean offline (what iOS actually gives an airplane-mode PWA) it fails in ~30 ms, so this is degradation rather than a hang — but the retries never stop.

**Remedy.** Add `if (navigator.onLine === false) return 'Offline — replies come from built-in lines.';` to `chatUnavailable()` and mirror it in `groqAvailable()`, plus an `addEventListener('online', ...)` to clear `barkDisabledUntil` so live dialogue resumes the moment the link comes back.

### 103. The daily request cap never persists for player conversations — dayCount is only written to localStorage on a successful background bark

**Minor · Logic · `js/dialogue/groq.js:157` · fixed in `708a37d`**

**Repro.** Static trace: `dayCount++` happens in postChat for every request (chatTurn, requestLine and testKey all route through it), but the only call to `persistCache()` — which writes `localStorage.setItem('sm_dlg_day', JSON.stringify({ d: dayStamp, n: dayCount }))` at groq.js:62 — is at groq.js:349, inside `if (r.line)` in requestLine's success handler. A player who only ever uses the TALK panel, or whose key is rejected, or who is offline, never reaches that line, so `sm_dlg_day` is never updated and `loadCache()` reads back the stale count on the next launch.

**Expected.** DAY_CAP = 4000 is described at groq.js:1-4 as "a conservative token bucket stays far inside the free tier", which only holds if the counter survives a reload — an iOS PWA is relaunched many times a day.

**Actual.** The counter is effectively in-memory only for every path except a successful ambient bark. Reload resets consumption to whatever the last successful bark happened to record, so the daily cap does not bound daily usage. It is also incremented before the request is known to have succeeded, so failed and aborted attempts inflate the in-memory count against the player.

**Remedy.** Persist the counter where it is incremented — call persistCache() (or a small persistDay() that writes only `sm_dlg_day`) from postChat's `finally` block, and consider incrementing only after the fetch resolves so timeouts and network failures do not spend the budget.

### 109. Every timed HUD affordance is on setTimeout, so it counts down behind the pause panel

**Minor · HUD · `js/ui/hud.js:231` · fixed in `b31524c`**

**Repro.** Raise a reputation hint (or a toast, or a points pop), pause within its lifetime, wait, resume. It is gone. repHint sets a 3000 ms setTimeout; toast, the points pop, the damage vignette and the hit marker do the same with 2200, 900/1400, 180 and 200.

**Expected.** A HUD affordance over a pausable game is measured in game time. Pausing to read something does not destroy it.

**Actual.** Five separate wall-clock timers, none of them aware of game.state. It is also the last clock in the game a screenshot could not pin down: whether the reputation hint appeared in a capture depended on whether the machine took more or less than three seconds to get from the scene setup to the shutter — 196,819 differing pixels between two runs of identical code.

**Remedy.** One countdown each, decremented in hudFrame(dt), which frame() hands a zero dt whenever the state is not playing. toastFrame is called from main.js rather than hud.js so the deliberate hud->overlays import break stays broken.

### 113. The artwork scenes photographed the player's back instead of the artwork

**Minor · UI · `tools/capture/scenes.mjs:169` · fixed in `90ca0e0`**

**Repro.** screenshots/final/art-riverbank_ip14_landscape-left.png: the player stands centred in front of the picture, covering its lower half. All four art-* scenes did this, on every device, in both orientations, in both engines — 80 captures whose stated purpose is asset quality and which show a blue hoodie.

**Expected.** A scene whose note says "head-on: native aspect, even lighting, frame depth, contact shadow" shows the work.

**Actual.** The scenes used __test.warpTo, which moves the PLAYER. The camera is a shoulder camera, so the body is always between the lens and whatever the player is facing. plaque-* already had the right treatment (plaqueShot puts the camera on the plate); the artwork shots did not.

**Remedy.** __test.artShot(slug), mirroring plaqueShot: camera on the wall normal at the work's own hanging height, occlusion off, with the camera rig's shoulder and head offsets backed out so the optical centre lands on the picture centre.

### 12. Billboards and the sky dome are posed from the previous frame's camera

**Polish · Render · `js/main.js:331` · fixed in `9ab347f`**

**Repro.** frameSystems contains fx.frame (tracersFrame -> stepBillboards reads camRef.quaternion, js/engine/tracers.js:152), chars.frame (healthPipsFrame -> camRef.getWorldQuaternion, js/engine/healthpips.js:52) and sky.frame (dome.position.copy(camera.position), js/engine/sky.js:218) — all three run before cam.frameUpdate(dt) writes this frame's camera.position/quaternion, and render() then draws with the new camera.

**Expected.** Camera-facing geometry is oriented with the same camera transform the frame is rendered from.

**Actual.** Every billboard is oriented one frame late. Muzzle flashes, impact flashes, tracer streak rolls and monster health bars are skewed by the camera's per-frame angular delta (~3 degrees during a fast swipe orbit at 60 fps), and the sky dome trails the camera by one frame of translation. Tracers live only 75 ms, so the error never gets a chance to settle out.

**Remedy.** Move `cam.frameUpdate(dt)` above the frameSystems loop, or split it: run the camera solve first and keep only the trauma-shake offset after, so the systems that consume the camera transform see the current one. The systems that write the camera's inputs (weapons recoil into cam.st.pitch) would then need to run before it — which they already do, since they only touch st.pitch, not the resolved transform.

### 65. #down-banner clears the action-button cluster by 0.5px at 667x375

**Polish · HUD · `css/main.css:212` · fixed in `5aa9e2e`**

**Repro.** 667x375: `top: 38%` of the 375px inset box = 142.5px; the banner is 66px tall (42px 'DOWN' block plus a 4px margin and the 12px sub-line), so it ends at y 208.5. #btns is `right: 10px; bottom: 14px` with a 64+12+86 = 162px x 54+12+86 = 152px grid, so its top edge is at 375-14-152 = 209. Clearance: 0.5px. The two do not overlap horizontally today (banner x 255..412, btns x 495..657), but the vertical margin is a rounding error, and any of `top: 38%`, the 42px font size, or the button sizes moving by one pixel puts them in contact.

**Expected.** A deliberate gap on the intended 4/8/16/24 spacing scale between the state banner and the control cluster.

**Actual.** 0.5px of accidental clearance produced by three unrelated magic numbers agreeing by chance at exactly one viewport size.

**Remedy.** Anchor the banner to a fixed offset rather than a percentage of a variable-height box: `top: calc(50% - 90px)` (or `bottom: 190px`), which keeps a real 30px+ gap above #btns at every height in the matrix.

### 66. Spacing is off the stated 4/8/16/24/32 scale throughout, including a negative-margin hack that reaches into an adjacent element's box

**Polish · UI · `css/main.css:441` · fixed in `f7ff336`**

**Repro.** `#shop-panel h2 { margin: 0 0 8px; }` (css/main.css:409) is immediately followed by a -10px top margin, so the balance line is pulled 10px up — 8px through the h2's own bottom margin and 2px into the heading itself. Change the h2 margin and the balance moves. Other off-scale one-offs on the same top rail and panels: #karma-wrap `top: 10px` next to #vitals / #btn-pause / #btn-shop at `top: 8px` (:91, :103, :290, :203); #karma-label `margin-top: 3px` (:95); #chat-log `margin: 6px 0` and #chat-hint `margin-top: 6px` (:324, :350); #chat padding `8px 10px 10px` (:311); .srow `margin: 14px 0` (:412); #btn-groq-test `margin-top: 8px` against a sibling input at `margin-top: 8px` inside a flex-start row (:428-432); #inspect-meta `margin-top: 2px` (:574); #loading-bar `margin: 18px auto 8px` (:484).

**Expected.** One spacing scale, so a change to a heading or a font size does not silently move an unrelated element.

**Actual.** Roughly a dozen independent magic numbers, one of which (-10px) is a load-bearing overlap between two sibling boxes.

**Remedy.** Introduce `--s1: 4px; --s2: 8px; --s3: 16px; --s4: 24px; --s5: 32px` in :root and quantise. For the specific hack, delete `#shop-balance`'s negative margin and set `#shop-panel h2 { margin: 0 0 4px; }` instead, and align the top rail on a single `top: 8px`.

### 107. The museum plaque is a fixed plate holding four lines that end 43% of the way down it

**Polish · UI · `js/world/museum.js:72` · fixed in `b31524c`**

**Repro.** screenshots/final/plaque-the-visitor_ip16pro_landscape-left.png at the plaque close-up viewpoint. The plate measures 0.46 x 0.30 m; the text block ends at canvas y=292 of 668, i.e. 43% down, leaving 376 px of blank plate below the last line.

**Expected.** A wall label is cut to its content, like every label in every gallery.

**Actual.** PLAQUE_W and PLAQUE_H were both constants and the canvas height was derived from their ratio, so the plate size had nothing to do with the text drawn on it. It also meant a longer title could run out of plate with no warning.

**Remedy.** Lay the four lines out first, take the canvas height from the last baseline plus a descender and the same padding used at the top, and build the PlaneGeometry from that height. Plate is now 0.46 x 0.161 m and the margins match.

---

## What is not in here

- **Physical-device results.** Everything above was reproduced in Chromium and
  WebKit at real iPhone viewports with real safe-area insets injected. No iPhone
  was available to this environment. `BLOCKERS.md` says so in full, and the
  distinction is never blurred: an emulator result is called an emulator result.
- **Findings that did not survive verification.** A handful of suspicions did not
  reproduce and were dropped rather than written up as fixes.

