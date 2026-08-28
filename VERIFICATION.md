# Verification

What was actually run, what it produced, and what it does not prove.

Every number here came out of a command in `tools/`. Nothing is estimated, and
where a measurement is not transferable to a real iPhone it says so in the same
sentence as the number rather than in a footnote.

---

## The short version

| | |
|---|---|
| Screenshots, final build | **622** — 32 scenes × 5 viewports × 2 orientations × 2 engines, plus portrait |
| Screenshots, pre-overhaul build | **90** — the nine scenes that exist in both |
| Console problems, final | **0** of 622 |
| Console problems, baseline | **90** of 90 |
| Layout assertions | **74 checks, 0 failures**, report byte-identical across runs |
| End-to-end suite | **30/30 ok, 0 console errors, 0 page errors** |
| Service-worker upgrade path | **11/11 checks passed** |
| Leak check | 20 gallery load/unload cycles + 20 building collapses: **geometry and texture counts flat** |
| Lighthouse (local) | performance 33 · accessibility 88 · best practices 100 · **SEO 100** |
| Physical iPhone | **none available** — see `BLOCKERS.md` §1 |

Every figure above was measured on the tree at the head of this branch. The 622
captures were taken at `ff8a4d2`, and `git diff ff8a4d2..HEAD -- js/ css/
index.html vendor/ assets/ sw.js manifest.webmanifest` is empty — nothing that
renders has changed since the shutter. Everything committed after `ff8a4d2` is
documentation.

---

## 1. The screenshot matrix

```sh
node tools/capture/capture.mjs --set final --engine both
node tools/capture/scan.mjs screenshots/final
```

**622 screenshots, 0 with a console problem, 0 failed captures.**
Every row is in `screenshots/final-report.json`.

| | |
|---|---|
| Scenes | 32 — see `tools/capture/scenes.mjs`, each with a note saying what it proves |
| Devices | iPhone SE 3 (667×375@2), 14 (844×390@3), 16 Pro (852×393@3), 16 Pro Max (932×430@3), desktop (1920×1080@1) |
| Orientations | `landscape-left` and `landscape-right`, with the notch inset on the correct side for each |
| Engines | Chromium and WebKit — WebKit files carry a `wk_` prefix |
| Portrait | the rotate overlay, on one device, because it is not device-specific |

Safe-area insets are injected per device **and per orientation** before any of
the page's own script runs, because in landscape the notch is on the left or the
right depending on which way the phone is turned, and a HUD that is correct one
way round is not automatically correct the other.

### A capture is a pure function of the scene

This was not true when the harness was written, and it took five fixes. Each one
was found the same way — by capturing the same scene twice and subtracting.

| What was not the fixed step | What it did to a picture |
|---|---|
| The frame loop kept stepping between boot and the shutter | Scenes with a view out of a doorway differed by up to **142,000 pixels** between two runs of identical code — the townsfolk outside had walked further on an idle machine than a loaded one. Scenes with no view out were byte-identical, which is what identified it. |
| The shadow map's three-frame cadence counts **render** frames | 13,337 pixels on `museum-hall-wide`, max channel delta 72 |
| CSS transitions and `setTimeout` are on the wall clock | `#art-prompt` fades in over 0.18s and the reputation hint hides after 3s: **196,819 pixels** inside one pill, and a hint that was present or absent depending on how fast the machine was |
| Scenes shared `localStorage` inside a viewport's context | The shop scene writes 9,000 points; karma and reputation persist too, and reputation decides which shops are shut, which decides where the townsfolk walk. A street captured after the shop had **6,600 pixels** of different pedestrians in it, reproducibly. |
| The screenshot could outrun the compositor | `renderNow()` rasterizes the whole city in software inside its rAF, and the surface committed can be the one from before it. A `loading` capture came out as bare canvas about once in a few hundred. |

Fixed by freezing the loop after the first render in capture mode and driving
everything from `__test.step()` and `__test.renderNow()`; refreshing the shadow
map every frame during a capture; killing CSS transitions in the harness; moving
every timed HUD affordance onto the frame clock; clearing storage before the
page's own script runs; and waiting on a real pause, `document.fonts.ready` and
`img.decode()` before the shutter. None of the waits can change what is in a
picture — the loop is suspended and the world is frozen.

**Verified, and stated with its tolerance:** a 3-lane and a 1-lane run of all 32
scenes on one device give **58 of 63 captures byte-identical**. The five that
differ do so at ±1 on antialiased edges — 5 to 26 pixels out of 3,013,524 — with
one exception: the title screen, a full-bleed photograph, where Chromium's image
scaler resamples ±1 along the artwork's own edges across most of the frame at a
mean delta of 1.2. That is the browser's rasterizer and not the game's
rendering; the game's own draw is identical in every one of the 63.

That is what makes it safe to run scenes concurrently, which took the full
matrix from most of a day to about ninety minutes.

### The scan

`tools/capture/scan.mjs` measures every image three ways: its largest channel
deviation and mean horizontal gradient (*is there anything here?*), and its
self-similarity under a horizontal shift of w/2, w/3 or w/4 (*is this one frame,
or the same frame repeated?*). Six hundred screenshots is more than anyone
reviews honestly by eye, and a blank or mosaiced capture is still a valid PNG of
the right size, still counted in the report.

It has earned its place three times.

**Blank, from a timer.** `loading_ip14_landscape-left` came out as bare navy with
nothing in it, because boot's own hide-the-overlay timer fired *after* the scene
had made the overlay visible again — the fix removed that timer entirely (§4
below).

**Blank, from the compositor.** Once that was fixed, the same symptom appeared on
a different device from a different cause: `renderNow()` rasterizes the whole
city in software inside its rAF, and the compositor can commit the surface from
*before* that frame, so the screenshot was the previous composite. Two more rAFs
after the draw; verified over 30 consecutive captures of the scene that was
failing, zero blank.

**Tiled, twice.** A `plaque-riverbank` capture came back as a 3 × 4 mosaic of the
frame repeated — high detail, high edge energy, and therefore invisible to both
of the first two measurements. The repeat test was added for it, and on the very
next full re-shoot it fired again: `loading_se3_landscape-right` was the
background gradient repeated two across and three down, with the title, the
progress bar and the status line absent, while its landscape-left sibling was
correct. That one scored a standard deviation of **9.8** against a blank floor of
6 — comfortably "not blank", and nothing on it.

Because it has now happened twice, `capture.mjs` asks the same question at the
shutter and shoots again once when the answer is yes, marking the row `reshot`
and printing `R` instead of a dot. One retry, never a loop: a frame still tiled
after it fails the run, because re-shooting until the picture looks acceptable is
how a harness starts lying. The measurement lives in `tiling.mjs` so the sweep
and the shutter cannot drift (`AUDIT.md` #120). It is *normalised*, and
that matters: the first version of it simply asked whether the shifted difference
was small, which flagged the two portrait `rotate` captures — a navy field with
one centred glyph, where every shift is near zero because there is almost nothing
there to differ. Both were checked by eye and were correct. The test now asks
whether the shifted difference is small **relative to the same image shifted by a
fraction that cannot be a tile period**. Measured on this project: a genuinely
mosaiced frame scores 0.006; the least self-different of 622 good captures scores
0.657. The threshold is 0.25, and the full matrix passes with none flagged.

None of the three would have been noticed in a contact sheet of 622, and nothing
else in any run mentioned any of them.

The thresholds have their own test — `node tools/capture/scan.test.mjs` — which
synthesises a 3 × 4 tiled frame, a normal one and a flat one with a single
centred mark, and asserts that the first is caught, the other two are not, and a
tiled frame fails the run. Neither real fixture could be committed (one is a
corrupt PNG, the other belongs to a matrix that stays out of git), and a
threshold with no test is a number somebody will nudge. It paid for itself on
first run by failing on a path bug in `scan.mjs` — an absolute directory argument
was being joined onto the repo root, so `/tmp/x` was looked for at `<root>/tmp/x`
and reported as missing.

---

## 2. Before and after

```sh
node tools/capture/baseline.mjs origin/pre-overhaul-2026-08-26
```

The pre-overhaul build is checked out of git into a temp directory and served at
the same `/Strongest-Man/` subpath, so the two sets are the same scenes at the
same viewports with the same insets. The only difference is the code.

**90 baseline screenshots. All 90 logged a console problem.**

| Problem | Occurrences across 90 boots |
|---|---:|
| `GL_INVALID_OPERATION: Mismatch between texture format and sampler type` | **17,795** |
| `net::ERR_ABORTED` on a `.glb` | **321** |
| `KHR_parallel_shader_compile extension not supported` | 89 |
| **Total** | **18,358** |

Both causes are in `AUDIT.md` (#105 and #104). The GL errors are two frames per
boot drawing every shadow receiver with no depth texture bound. The aborted
loads are three r185's `FileLoader` composing an `AbortSignal.any` whose
controller is collected once the un-referenced loader is — and a collected
`AbortController` aborts.

**The final build logs nothing, on any of its 622 screens.**

### Paired scenes

Nine scenes exist in both builds and pair directly: `title`, `loading`,
`settings`, `shop`, `pause`, `hud-idle`, `hud-bright`, `hud-dark`, `street`.

The other twenty-three are new-build only, and the reason is not a gap in the
method: **there was nothing there to photograph.** No gallery, no artwork, no
plaques, no inspect mode, no `hud-stress`, no `hud-down`, no rotate overlay
capture, no update banner. A before/after pair for `plaque-the-visitor` would be
a photograph of a wall.

---

## 3. Layout assertions

```sh
node tools/capture/layout.mjs
```

**74 checks, 0 failures.** Five devices × two orientations × seven interface
states, with every control's `getBoundingClientRect` measured in each.

What each check enforces:

| Check | Rule |
|---|---|
| Touch targets | ≥ 44 × 44 CSS px in **both** axes, for everything tappable |
| Safe area | nothing interactive under the notch or the Dynamic Island |
| Home indicator | nothing interactive in the bottom 20px — only where the device has a bottom inset |
| Overlaps | no forbidden pair overlaps (HUD vs. HUD, panel vs. its own exit) |
| Reachability | every control that must be reachable is on screen, or in a scroller that reaches it |
| `:hover` | the stylesheet is grepped; a `:hover` rule fails the run |

Rects are clipped to the nearest scrolling ancestor before being tested, because
a control scrolled out of a panel is not "under the notch" — it is off-screen,
and reporting it as the former was a false positive the first version produced.

**One real failure was caught by this suite and fixed:** at 667×375 the gallery
prompt ran 229..438 and the ammo readout starts at 413. The prompt now sits above
the ammo row rather than beside it.

### The report has to be reproducible, and it was not

`screenshots/layout-report.json` used to change between two runs of the same
build: rows flipped between `#art-prompt 118.1x48.0` and `#art-prompt: none
visible` for the same device and orientation.

The measurement drops any element at computed opacity 0, and `#art-prompt` fades
in over 0.18 s of **wall** clock while the museum state advances the
**simulation** by a fixed 0.5 s. Two clocks. Which side of the fade the settling
frames landed on decided whether the prompt was measured at all.

The unstable file is the smaller half of it. On the runs that landed at 0, the
three `noOverlap` pairs for that state — the prompt against `#btns`, `#weapons`
and `#ammo`, which is the regression guard for `AUDIT.md` #110 — were skipped,
and the suite still printed `0 layout failure(s)`. **A check that sometimes does
not happen reads exactly like a check that passes.** `capture.mjs` had killed CSS
transitions in its own init script since the determinism work in §1; `layout.mjs`
had not. It does now: the prompt is measured on all ten device/orientation pairs,
never `none visible`, and consecutive runs produce byte-identical reports
(`AUDIT.md` #118).

---

## 4. Boot

Instrumented by watching `#loading-msg` and timing every rAF from load to ready.

| | pre-overhaul | final |
|---|---:|---:|
| Boot phases complete | 1,980 ms | 2,150 ms |
| First frame presented (`__READY__`) | 2,896 ms | 7,585 ms |
| Largest single frame in between | 873 ms | 5,359 ms |

**Read this carefully, because the headline number is worse and the build is not.**

Boot itself is +170 ms, and that is the gallery: models, merge, four image
textures and four canvas plaques. Everything else is the **first rendered
frame**, and it got more expensive for two reasons that are both fixes working:

- The world material's specular lobe now **compiles**. It never did — the
  `onBeforeCompile` string replace targeted GLSL inside an unresolved `#include`
  and silently did nothing (`AUDIT.md` #1). Every pixel of the city now
  evaluates a Blinn-Phong lobe and a sky fresnel that it previously skipped.
- The shadow map is built **before** the first frame is presented instead of two
  frames after it, which is the same fix that removed 17,795 GL errors.

There is no GPU in this container; every pixel is rasterized on the CPU, so
per-pixel shader cost shows up multiplied by three million pixels. On a phone a
Blinn-Phong lobe is a handful of ALU ops. **Boot-complete is the transferable
number here; the first-frame figure is a SwiftShader number** (`BLOCKERS.md` §5).

### And it exposed a real defect

The loading overlay used to hide 150 ms after the progress bar reached 100% — at
boot-complete, not at first-frame. The player therefore sat looking at an
unpainted canvas for the whole of that gap, which reads as a crash. The overlay
now comes down from inside `render()`, after the frame is drawn, and the bar's
last message says `first frame…` rather than `ready`.

That same timer was what produced the one blank capture in §1.

---

## 5. Runtime cost

```sh
node tools/test/metrics.mjs
node tools/test/metrics.mjs --ref origin/pre-overhaul-2026-08-26
```

852×393 at dpr 2, dusk, no monsters.

| | before | after | |
|---|---:|---:|---|
| Draw calls | 53 | **71** | +18 |
| Triangles | 253,880 | **267,786** | +13,906 |
| Geometries | 52 | **67** | +15 |
| Textures | 74 | **77** | +3 |
| Shader programs | 28 | **28** | — |
| JS heap | 26 MB | **26 MB** | — |
| Page-load requests | 128 | **136** | +8 |
| Payload on disk | 4.87 MB | **6.09 MB** | +1.22 MB |
| Precache | — | **5.01 MB**, 121 URLs | |
| Console problems | 7 | **0** | |

**On "transfer".** A first visit pays for the page load *and* the service
worker's precache pass, and the two overlap without being the same set — the
worker fetches with `{cache: 'reload'}` on purpose, so a precached file the page
already pulled is pulled again. Rather than quote one ambiguous megabyte figure
that moves between runs, the three numbers that do not move are given: what the
page requests (136), what the worker precaches (5.01 MB across 121 URLs — 120
files plus `./`, the navigation entry — from `tools/gen-sw.mjs`), and what the
whole site weighs on disk (6.09 MB).

**The baseline's numbers are cheap because the baseline was broken.** On the run
that produced them it failed to load `monster_b.glb`, `prop_hydrant.glb` and
`prop_bench.glb` — so some of that draw-call and geometry difference is props
that now exist and previously did not. That is not a like-for-like comparison and
it is not presented as one.

The rest of the growth is accounted for: the gallery is a building with an
interior, four framed works, four plaques and their fittings; the payload carries
20 iOS launch images (~1 MB) and eight artwork derivatives (~145 KB).

One draw call still to explain honestly: shader programs are unchanged at 28 in
the snapshot, but the gallery pushes the live count to 32, and twenty building
collapses take it to 35 — three programs compiled the first time debris, dust and
blood materials are used. Bounded, not a leak: the count does not move on the
second round.

### The gallery's own cost

Measured from two fixed viewpoints, one outside the door and one in the middle of
the hall:

| | draw calls | triangles |
|---|---:|---:|
| Outside, facing the building | 103 | 275,561 |
| Inside the hall | **90** | **245,714** |

The gallery is **cheaper to stand in than to stand outside**, because its walls
occlude the city. The interior is two draw calls: one unlit merged mesh with
baked vertex colours, one world-lit shell. `docs/MUSEUM.md` has the reasoning.

### Per-system frame budget

`?prof=1`, average ms per call:

| System | avg | max |
|---|---:|---:|
| `chars.frame` (48 NPCs + traffic + monsters, skinned) | 2.925 | 5.7 |
| `npcs` (fixed step) | 0.625 | 3.2 |
| `player.frame` | 0.200 | 0.5 |
| `fx.frame` | 0.175 | 0.6 |
| `traffic` | 0.125 | 0.9 |
| `sky.frame` | 0.125 | 0.3 |
| `citylights` | 0.075 | 0.3 |
| `museum` | 0.025 | 0.2 |
| **All fixed-step systems** | **0.931** | |
| **All frame systems** | **3.575** | |

CPU-side and therefore meaningful off this machine. Character skinning dominates,
which is expected and is why the townsfolk get blob shadows rather than real ones.

### What reviewing them found

The pictures were then opened and looked at, which is §5.7 of the brief and is
not a formality. Eleven defects came out of that pass and only that pass:

| # | What the screenshot showed |
|---|---|
| 107 | The museum plaque's four lines ended 43% down a fixed plate — a label with a hole under it |
| 108 | With all seven weapons owned, the armed chip sat half off the right edge of the rail |
| 109 | Five wall-clock timers in the HUD, counting down behind the pause panel |
| 110 | The gallery prompt drawn on top of the ammo readout at 667×375 |
| 111 | The loading screen down five seconds before there was anything behind it |
| 112 | **A solid wooden door across every entrance the player is meant to walk through** |
| 113 | The four artwork scenes photographing the player's back instead of the artwork |
| 116 | At 667×375, the artwork drawn across the last word of the gesture hint |
| 117 | The Roman numerals set in the UI sans face, where an `I` is a bare vertical bar |
| 119 | The longest reputation string drawn under a HUD control at 667×375 |
| 120 | A capture returned as a mosaic of itself, passing every blank test |

\#116 and #117 are the second round: the works were renumbered `I`–`IV` after the
first pass, the matrix was re-shot, and reading it again found two more. That is
the argument for the pass in one line — it is worth running every time the
pictures change, not once.

\#119 makes the same case from the other direction. A quick-travel button added
to the top-right cluster landed on top of a reputation string that had been
running through that row the whole time: `#rep-hint` sat ten pixels inside the
button row's own vertical band, and nothing revealed it while the middle of the
row was empty. **The overlap was old; only the collision was new.** The layout
suite had not caught it because the pair was never listed — it asserted
`#rep-hint` against `#karma-wrap` and nothing else in that band. Four pairs were
added with the fix.

\#112 is the one worth naming twice. `physics/collide.js` gives every floor-0
door cell a 1.3 m walkable gap — that is how you get inside any of the thirty
buildings with an interior — and `doorGeo()` merged a solid leaf across it. The
geometry contradicted the collision on all 29 doors in the city, and the gallery,
with FREE ADMISSION lettered over its door, read as sealed. Nothing in any test
suite was ever going to say so.

---

## 6. Memory

Twenty gallery load/unload cycles, then twenty whole buildings brought down —
hundreds of debris bodies created, slept, reclaimed and re-instanced.

| | geometries | textures | programs | JS heap |
|---|---:|---:|---:|---:|
| Cycle 1 | 93 | 83 | 32 | 25.2 MB |
| Cycle 10 | 93 | 83 | 32 | 25.4 MB |
| Cycle 20 | 93 | 83 | 32 | 25.5 MB |
| After 20 collapses | 93 | 83 | 35 | 25.0 MB |

**Flat.** `renderer.info.memory` does not move across twenty full teardowns and
rebuilds of the gallery, which covers merged geometry, canvas textures, image
textures, materials and a whole object graph. Heap moves 0.3 MB across twenty
cycles, which is noise.

This is the check that matters most on iOS and is invisible in any screenshot: a
climbing texture count is the usual reason a WebGL app gets killed under memory
pressure. Four leaks that this class of test exists to find were fixed
(`AUDIT.md` #4, #6, #90, #99).

The baseline cannot be measured this way — it has no gallery to cycle and no test
hook to do it with — so the "before" column is genuinely absent rather than zero.

### And two more from making a test honest

The service-worker upgrade test failed after the screenshot work, and the reason
turned out to be two defects in the test sitting on top of two in the product.

The test's: `waitForCache` polled `caches.keys()`, and `caches.open()` creates
the cache the instant a worker starts installing — so it reloaded mid-precache,
manufactured a slow-boot condition and then failed on it. And the newer-build
step did `cp -a` of the whole repository, which since the screenshots landed is
most of a gigabyte of IO in the middle of a timing-sensitive test.

Underneath them:

- **#114 — an update offer with a hole in the middle.** `register()` resolves
  whenever it resolves, and the browser has usually already begun fetching the
  new `sw.js` on the navigation before any page script runs. The code handled a
  worker that was already *waiting* and one that had not started; it missed one
  that was *installing* at the moment the page looked, because `reg.waiting` was
  empty and `updatefound` had already fired. A player who reloads at that moment
  is never offered the update. On a phone that is the ordinary case.
- **#115 — a watchdog that reported a healthy boot as a failure.** Ninety seconds
  measured from module evaluation, with no knowledge of whether anything was
  happening. It fires in exactly the situation it exists for — a first install
  where the page and the precache compete for a slow connection — and tells the
  player the app failed while it is still loading. It measures a stall now.

Neither was reachable without driving a real worker through a real deploy, and
neither shows up in any screenshot.

---

## 7. End to end

```sh
node tools/test/serve.mjs &
node tools/test/final.mjs
```

**30 assertions, 30 ok. Zero console errors, zero page errors.** Four
consecutive runs, to show it stays that way.

The suite also **failed on a failed assertion** for the first time. It used to
exit on console errors alone, so a check printing `ok: false` still exited 0 —
invisible to CI, to a shell loop, or to anyone reading the exit code. That is a
report, not a suite, and it was hiding one.

It waits on **simulation time**, never on wall time, so it does not pass or fail
based on how loaded the machine is. Three assertions had to be rewritten during
this work because they were measuring the run rather than the game:

- `armedCarry` re-picked `npcs.find(...)` — always the same first match — twenty-five
  times over. Grabbing worked first try in isolation and mid-panic; the test was
  asking the same unavailable NPC again and again. It iterates candidates now.
- `grounding` read `people.highest` as an instantaneous ceiling while monsters
  were flinging people around, and returned 0.418 or 1.662 on identical code. It
  uses a per-id run-length invariant now, the same treatment the monster check
  already had.
- `carriedSwing` left its victim in the `commute` state, so between being placed
  2.4 m ahead and the swing landing 0.35 s later they walked off at about
  1.4 m/s — sometimes out of the arc. The check was passing or failing on where
  an NPC's own errand happened to take them. The victim stands still now.

None was a game defect and none is counted as one in `AUDIT.md`.

---

## 8. The PWA upgrade path

```sh
node tools/test/upgrade.mjs
```

**11/11 checks passed.** This is the §9.2 scenario end to end, against a real
service worker in a real browser:

| # | Check | Result |
|---|---|---|
| 1 | old build installs a worker and controls the page | PASS |
| 1b | old build precached | PASS — `sm-a92e24d463` |
| 2 | old build boots **offline** from its precache | PASS |
| 4 | the new build reaches a player who had the old one | PASS — 2 reloads (limit 2) |
| 5 | exactly one cache survives, and it is the new one | PASS — `[sm-dd8217b08b]` |
| 5b | new-build-only assets are in the surviving cache | PASS — 10 matched |
| 6 | the **new** build boots offline from its precache | PASS |
| 7 | a newer build is **offered**, not forced | PASS |
| 7b | accepting the offer lands on the newer build | PASS |
| 7c | only the newest cache is left | PASS — `[sm-84d3cf683f]` |
| 8 | no uncaught page errors across the whole upgrade | PASS |

Checks 7 and 7b are the distinction that matters: a player who already has the
game installed and is mid-session is **offered** the update by a banner they can
dismiss, rather than having the page pulled out from under them. A first install
takes over immediately, because there is no session to interrupt.

---

## 9. Lighthouse

```sh
CHROME_PATH=… npx lighthouse http://127.0.0.1:8080/Strongest-Man/ \
  --only-categories=performance,accessibility,best-practices,seo
```

| Category | Score |
|---|---:|
| Performance | 33 |
| Accessibility | 88 |
| Best practices | **100** |
| SEO | **100** |

Against the **local** server, not the deployed URL, because the work is on a
feature branch and there is nothing deployed to point it at (`BLOCKERS.md` §2).

Three audits failed on the first run:

- `meta-description` — **fixed**, and SEO went 91 → 100.
- `bf-cache` — not a defect, and Lighthouse itself labels it "Not actionable":
  the reason given is `MainResourceHasCacheControlNoStore`, which is
  `tools/test/serve.mjs` sending `cache-control: no-store` so a local run cannot
  serve a stale build. GitHub Pages sends `max-age=600`.
- `meta-viewport` (`user-scalable=no`) — **kept**, and it is the only
  accessibility failure left in the report. It is what makes the virtual joystick
  and the 16px input rule work: with pinch-zoom available a two-finger
  move-and-look becomes a zoom, and with `viewport-fit=cover` there is no way
  back out. Documented in `ASSUMPTIONS.md` and `docs/STYLE.md`.

**The performance score is a SwiftShader number and is not claimed as a result.**
It is dominated by largest-contentful-paint and total blocking time on a
CPU-throttled emulated phone with no GPU, where one frame of this game takes
seconds. Re-run it on the real URL after merging.

---

## 10. What none of this proves

Stated plainly, because an emulator result presented as a device result is worse
than no result.

**No physical iPhone was available.** Every iOS claim here — safe areas, the
Dynamic Island, the home indicator, multi-touch, the installed-PWA launch, the
launch images, offline-after-install — was verified in Chromium and WebKit at
real iPhone logical sizes with real safe-area insets injected. That is a good
proxy and it is not the thing itself. `BLOCKERS.md` §1 lists what specifically
cannot be checked without one, and `README.md` carries the on-device checklist.

Also not covered:

- **Real frame rate.** Software rasterisation only. Draw calls, triangles,
  geometry and texture counts, program count, heap and per-system CPU time are
  all reported instead, and all of them mean the same thing on a phone.
- **The live Groq API.** The dialogue path is exercised against a stub
  (`BLOCKERS.md` §7). No key is committed and none was used.
- **The deployed site.** Nothing has been pushed to `main`. The service-worker
  upgrade path is proven against a local server that switches builds under a
  live install, which is the same mechanism, not the same host.
- **Lighthouse on the real URL**, for the same reason.
