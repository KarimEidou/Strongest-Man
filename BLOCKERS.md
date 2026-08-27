# Blockers

Everything this run could not complete, and exactly why. Nothing here is
"probably fine" — each item says what is unverified and what it would take to
verify it.

---

## 1. No physical iPhone. Every iOS claim is emulated.

**This is the largest gap in the whole run and it cannot be closed from here.**

There is no device in this environment. Everything iOS-specific was verified in
Chromium with iPhone device emulation and in Playwright WebKit, with the
safe-area insets injected by the harness because no headless browser reports
`env(safe-area-inset-*)`. That is the best automatable proxy and it is **not** the
device: different JIT, different compositor, no real GPU (SwiftShader here), and
none of Safari's own PWA behaviour.

**§5.5 asks for a real-device spot check. It has not been done.** These are the
things that genuinely cannot be proven without one, in the order they are most
likely to bite:

1. **Add to Home Screen, then launch fullscreen.** Confirm the icon is right,
   the launch image appears instead of a white flash, and the app opens with no
   browser chrome. `display: fullscreen` with a `display_override` chain is set;
   iOS's honouring of it in standalone mode is inconsistent and untestable here.
2. **Safe areas in BOTH landscape orientations.** Turn the phone one way, then
   the other. Nothing may sit under the Dynamic Island or in the home-indicator
   strip in either. The harness asserts this against injected values on five
   viewports; the real insets are the real test.
3. **Audio on a COLD PWA launch** — not after a reload. Tap PLAY and confirm
   sound. Then take a call, come back, and confirm sound returns. The unlock
   listener re-arms now, which is the fix for exactly this, and it has only been
   exercised against a desktop AudioContext.
4. **Airplane mode, cold launch, full session.** Play a level and visit the
   gallery with the radio off. Offline is verified here in DevTools and by the
   upgrade-path test; it is not verified on iOS storage.
5. **The upgrade path on the device.** With the current build installed, deploy a
   new one, reload twice, then close and relaunch from the home screen. The
   automated test proves the mechanism; iOS's own worker-update timing is its own
   thing.
6. **Two-finger play.** Move and punch at once, move and look at once, and a
   third finger on a weapon chip. Multi-touch is per-pointer-id by construction
   and no emulator proves a real thumb.
7. **A phone call mid-session**, to exercise real WebGL context loss. There is a
   handler and a `window.__test.loseContext()` that drives it synthetically;
   Safari's actual purge-and-restore is not the same event.
8. **Low Power Mode**, which caps rAF at 30 fps. The loop is fixed-step and
   frame-independent and was measured at 30 in the harness; the device is the
   proof.
9. **All four artworks and all four plaques**, read at arm's length. The plaques
   are asserted legible from cropped captures at 667 × 375, which is the smallest
   viewport, but readability is a thing eyes settle.

---

## 2. The work is on a feature branch. The live URL has not changed.

The brief says push to `main`. This session's git policy says the designated
branch and "never push to a different branch without explicit permission." The
branch policy governs, so everything went to
`claude/strongest-man-overhaul-u3t6bh`.

**The deploy workflow fires on `main` only, so
<https://karimeidou.github.io/Strongest-Man/> is still the old build.** Merging
the branch is what publishes this — a fast-forward, since the branch was cut from
`main` and nothing else has touched it.

Consequences, stated plainly:

- **"Actions run green" is unverified.** No deploy has run.
- **"Live URL fetched and verified to match local" is unverified.** There is
  nothing new at that URL to fetch.
- Everything else was verified against `tools/test/serve.mjs`, which mounts the
  site at `/Strongest-Man/` exactly as Pages does — so subpath correctness *is*
  covered; only the deployed artifact is not.

## 3. The revert point is a branch, not a tag

`git push origin pre-overhaul-2026-08-26` (a tag) is refused with **HTTP 403** —
this session's credential is scoped to `refs/heads/*`. The same commit
(`79d864b`) was pushed as a **branch** of that name, which reverts identically
and is what `tools/test/upgrade.mjs` uses as its "old build". Convert it with:

```sh
git tag pre-overhaul-2026-08-26 origin/pre-overhaul-2026-08-26
git push origin pre-overhaul-2026-08-26
```

## 4. Lighthouse has not been run

§10.1 asks for Lighthouse against the deployed URL. Lighthouse is not installed
here and there is nothing deployed to point it at. Run it after merging:

```sh
npx lighthouse https://karimeidou.github.io/Strongest-Man/ \
  --preset=desktop --only-categories=performance,best-practices,pwa
```

Performance numbers taken with the in-game profiler are in `VERIFICATION.md`, and
they are more useful for a WebGL game than a Lighthouse score is — but they are
not the same measurement and the score is not recorded.

## 5. Performance numbers are SwiftShader numbers

There is no GPU in this container. Every frame here is rasterized in software, so
absolute fps is meaningless. The numbers that ARE meaningful and are reported —
draw calls, triangles, geometry and texture counts, program count, JS heap,
`renderer.info.memory` across load/unload cycles, and per-system simulation time
— are all CPU-side or count-based and do not depend on the rasterizer.

**The one number that needs a device is the frame cost inside the museum**,
reported in `docs/MUSEUM.md` as a draw-call and triangle delta rather than as
milliseconds, for that reason.

## 6. `assets/tex/sky_equirect.webp` is an orphan and is kept

44 KB, referenced by nothing at runtime — the sky is fully procedural
(`engine/sky.js`). It is the documented output of the texture pipeline and is
kept as provenance, but **excluded from the service-worker precache**, so it
costs no visitor anything. Delete it if the pipeline record is not wanted.

## 7. The Groq dialogue path is exercised against a stub, not the live API

`tools/test/shot.mjs` has a `GROQSTUB` mode covering 200, slow, 401, 429 and a
dead model id. No real key exists here, so the live round trip is untested this
run. The offline path (new: `navigator.onLine === false` short-circuits it) is
tested.

## 8. Two console messages are filtered, and here is why

Named explicitly in `tools/capture/capture.mjs`:

- `Service Worker registration blocked by Playwright` — Playwright announcing the
  harness's own `serviceWorkers: 'block'`. Not the app.
- `KHR_parallel_shader_compile extension not supported` — SwiftShader lacking an
  extension real Safari has. The game asks for the extension before using
  `compileAsync` now, so it no longer appears at all.

Everything else counts, warnings included.
