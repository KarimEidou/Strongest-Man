# Verification

What was actually run, what it produced, and what it does not prove.

Every number here came out of a command in `tools/`. Nothing is estimated, and
where a measurement is not transferable to a real iPhone it says so in the same
sentence as the number rather than in a footnote.

---

## The short version

| | |
|---|---|
| Screenshots, final build | **602** — 31 scenes × 5 viewports × 2 orientations × 2 engines, plus portrait |
| Screenshots, pre-overhaul build | **90** — the nine scenes that exist in both |
| Console problems, final | **0** of 602 |
| Console problems, baseline | **90** of 90 |
| Layout assertions | **70 checks, 0 failures** |
| End-to-end suite | **29/29 ok, 0 console errors, 0 page errors** |
| Service-worker upgrade path | **11/11 checks passed** |
| Leak check | 20 gallery load/unload cycles + 20 building collapses: **geometry and texture counts flat** |
| Lighthouse (local) | performance 33 · accessibility 88 · best practices 100 · **SEO 100** |
| Physical iPhone | **none available** — see `BLOCKERS.md` §1 |

---

## 1. The screenshot matrix

```sh
node tools/capture/capture.mjs --set final --engine both
node tools/capture/scan.mjs screenshots/final
```

**602 screenshots, 0 with a console problem, 0 failed captures.**

| | |
|---|---|
| Scenes | 31 — see `tools/capture/scenes.mjs`, each with a note saying what it proves |
| Devices | iPhone SE 3 (667×375@2), 14 (844×390@3), 16 Pro (852×393@3), 16 Pro Max (932×430@3), desktop (1920×1080@1) |
| Orientations | `landscape-left` and `landscape-right`, with the notch inset on the correct side for each |
| Engines | Chromium and WebKit — WebKit files carry a `wk_` prefix |
| Portrait | the rotate overlay, on one device, because it is not device-specific |

Safe-area insets are injected per device **and per orientation** before any of
the page's own script runs, because in landscape the notch is on the left or the
right depending on which way the phone is turned, and a HUD that is correct one
way round is not automatically correct the other.

### A capture is a pure function of the scene

This was not true when the harness was written, and it took three fixes:

| The clock | What it did to a picture |
|---|---|
| The frame loop kept stepping between boot and the shutter | Scenes with a view out of a doorway differed by up to **142,000 pixels** between two runs of identical code — the townsfolk outside had walked further on an idle machine than a loaded one. Scenes with no view out were byte-identical, which is what identified it. |
| The shadow map's three-frame cadence counts **render** frames | 13,337 pixels on `museum-hall-wide`, max channel delta 72 |
| CSS transitions and `setTimeout` are on the wall clock | `#art-prompt` fades in over 0.18s and the reputation hint hides after 3s: **196,819 pixels** inside one pill, and a hint that was present or absent depending on how fast the machine was |

Fixed by freezing the loop after the first render in capture mode and driving
everything from `__test.step()` and `__test.renderNow()`; refreshing the shadow
map every frame during a capture; killing CSS transitions in the harness; and
moving every timed HUD affordance onto the frame clock.

**Verified**: a 3-lane and a 1-lane run of the same twelve scenes are
pixel-identical, all twelve, max channel delta 0. That is also what makes it
safe to run scenes concurrently, which took the full matrix from most of a day
to about fifty minutes.

### The scan

`tools/capture/scan.mjs` measures every image's largest channel deviation and
mean horizontal gradient. Six hundred screenshots is more than anyone reviews
honestly by eye, and a blank capture is still a valid PNG of the right size.

It found one: `loading_ip14_landscape-left` came out as bare navy with nothing in
it, because boot's own hide-the-overlay timer fired *after* the scene had made
the overlay visible again. Nothing else in the run mentioned it. The fix removed
that timer entirely (§4 below).

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

Both causes are in `AUDIT.md` (#105 and #104). The GL errors are two frames per
boot drawing every shadow receiver with no depth texture bound. The aborted
loads are three r185's `FileLoader` composing an `AbortSignal.any` whose
controller is collected once the un-referenced loader is — and a collected
`AbortController` aborts.

**The final build logs nothing, on any of its 602 screens.**

### Paired scenes

Nine scenes exist in both builds and pair directly: `title`, `loading`,
`settings`, `shop`, `pause`, `hud-idle`, `hud-bright`, `hud-dark`, `street`.

The other twenty-two are new-build only, and the reason is not a gap in the
method: **there was nothing there to photograph.** No gallery, no artwork, no
plaques, no inspect mode, no `hud-stress`, no `hud-down`, no rotate overlay
capture, no update banner. A before/after pair for `plaque-the-visitor` would be
a photograph of a wall.

---

## 3. Layout assertions

```sh
node tools/capture/layout.mjs
```

**70 checks, 0 failures.** Five devices × two orientations × seven interface
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

---

## 4. Boot

Instrumented by watching `#loading-msg` and timing every rAF from load to ready.

| | pre-overhaul | final |
|---|---:|---:|
| Boot phases complete | 1,980 ms | 2,163 ms |
| First frame presented (`__READY__`) | 2,896 ms | 7,404 ms |
| Largest single frame in between | 873 ms | 5,180 ms |

**Read this carefully, because the headline number is worse and the build is not.**

Boot itself is +183 ms, and that is the gallery: models, merge, four image
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
| Draw calls | 53 | **70** | +17 |
| Triangles | 253,880 | **265,107** | +11,227 |
| Geometries | 52 | **67** | +15 |
| Textures | 74 | **77** | +3 |
| Shader programs | 28 | **28** | — |
| JS heap | 26 MB | **25 MB** | −1 MB |
| Transfer, first visit | 2.64 MB | **3.39 MB** | +0.75 MB |
| Requests | 128 | **236** | +108 |
| Payload on disk | 4.87 MB | **6.09 MB** | +1.22 MB |
| Console problems | 7 | **0** | |

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
| Outside, facing the building | 103 | 275,909 |
| Inside the hall | **90** | **246,062** |

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

---

## 7. End to end

```sh
node tools/test/serve.mjs &
node tools/test/final.mjs
```

**29 assertions, 29 ok. Zero console errors, zero page errors.**

The suite waits on **simulation time**, never on wall time, so it does not pass
or fail based on how loaded the machine is. Two assertions had to be rewritten
during this work because they were measuring the run rather than the game:

- `armedCarry` re-picked `npcs.find(...)` — always the same first match — twenty-five
  times over. Grabbing worked first try in isolation and mid-panic; the test was
  asking the same unavailable NPC again and again. It iterates candidates now.
- `grounding` read `people.highest` as an instantaneous ceiling while monsters
  were flinging people around, and returned 0.418 or 1.662 on identical code. It
  uses a per-id run-length invariant now, the same treatment the monster check
  already had.

Neither was a game defect and neither is counted as one in `AUDIT.md`.

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
| 5 | exactly one cache survives, and it is the new one | PASS — `[sm-21af5f078c]` |
| 5b | new-build-only assets are in the surviving cache | PASS — 10 matched |
| 6 | the **new** build boots offline from its precache | PASS |
| 7 | a newer build is **offered**, not forced | PASS |
| 7b | accepting the offer lands on the newer build | PASS |
| 7c | only the newest cache is left | PASS — `[sm-48b2ad2518]` |
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
