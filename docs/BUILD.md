# Build, run, verify

There is **no build step**. The repository root *is* the site: `index.html`,
`js/`, `css/`, `assets/`, `vendor/`, `sw.js`, `manifest.webmanifest`, `.nojekyll`.
Every deploy is a copy of these files, and `.github/workflows/deploy.yml` does
exactly that (`upload-pages-artifact` with `path: .`).

`tools/` is dev-only and never deployed. It is not referenced by anything the
browser loads.

---

## three.js

| | |
|---|---|
| **Revision** | **r185** |
| **Location** | `vendor/three/three.module.min.js` + `three.core.min.js` |
| **Addons** | `vendor/three/addons/` — GLTFLoader, BufferGeometryUtils, SkeletonUtils, meshopt_decoder |
| **Resolution** | bare specifiers `three` and `three/addons/`, via the `<script type="importmap">` in `index.html` |

Check the revision at runtime:

```js
const THREE = await import('./vendor/three/three.module.min.js');
THREE.REVISION;   // "185"
```

**The addons must stay on the same revision as the core.** A GLTFLoader from a
different release against this core is the classic silent-breakage source: it
compiles, it loads, and something subtle is wrong. If three.js is ever upgraded,
upgrade the core *and every addon together* and re-run the full capture matrix.

Do not switch to a CDN import or an npm install. The vendored, no-build,
import-map setup is what makes the game work offline and free of third-party
requests, and it is a requirement rather than an accident.

### Two things about r185 worth knowing

`onBeforeCompile` runs **before** three resolves `#include`, so a `.replace()`
aimed at GLSL that lives inside a chunk matches nothing and silently does
nothing. `js/engine/materials.js` expands `lights_lambert_pars_fragment` itself
and patches the expansion, and records whether that worked — a future revision
renaming the chunk gets a console error and a failing assertion instead of a
city that quietly loses its specular.

`FileLoader` builds its request signal with
`AbortSignal.any([ownController.signal, manager.abortController.signal])`, and
`GLTFLoader.load()` keeps no reference to the FileLoader it creates — so once V8
collects it the composite signal loses a source and Chromium aborts the
in-flight request. `js/engine/assets.js` fetches the bytes itself and hands them
to `parseAsync`, which sidesteps the whole thing.

---

## Run it locally

```sh
node tools/test/serve.mjs        # http://127.0.0.1:8080/Strongest-Man/
```

**Use this rather than `npx serve`.** It mounts the site under `/Strongest-Man/`,
exactly as GitHub Pages does — so a root-absolute path that works fine on a local
root server 404s here too, which is the single most likely cause of "works
locally, broken live". There is nothing to install; it is zero-dependency Node.

`file://` will not work: ES modules need an origin, and service workers need
`localhost` or HTTPS.

### Useful query parameters

| Parameter | Effect |
|---|---|
| `?seed=N` | world seed (default 1337) |
| `?autoplay=1` | skip the title screen |
| `?capture=1` | deterministic: fixed render dt, frozen day cycle, no camera shake |
| `?time=0..1` | start the clock at that time of day (0.5 = midday, 0.70 = the palette's home dusk) |
| `?warp=museum` | spawn on the gallery forecourt |
| `?quality=low\|medium\|high` | force a graphics tier |
| `?nomonsters=1` | no monster spawns — for deterministic runs |
| `?nogroq=1` | never call the dialogue API |
| `?prof=1` | per-system timings via `window.__test.profile()` |
| `?fastday=1` | 60-second day |
| `?nogodrays=1` `?noshadows=1` `?nodetail=1` | isolate one render pass |

`window.__READY__` (and `window.__ready`) go true after the first fully-rendered
frame. `window.__perf` carries fps, frame time, draw calls and triangles at 1 Hz.
`window.__test` carries the scripted hooks the suites drive.

---

## tools/

Install once: `cd tools && npm install`.

| Script | What it does |
|---|---|
| `node tools/gen-sw.mjs` | **Regenerates `sw.js`.** Run after ANY change to a deployed file. |
| `node tools/make-icons.mjs [icon.png]` | Regenerates the 20 iOS launch images; with a source PNG, also the icon set. Prints the `<link>` block for `index.html`. |
| `node tools/import-art.mjs <dir>` | Imports the museum artworks; fails if an aspect ratio drifts. |
| `node tools/import-models.mjs` | Re-downloads and re-processes the Kenney packs. |
| `node tools/optimize-glb.mjs` | Meshopt compression, WebP textures, grounded origins, metric scale. |
| `node tools/process-textures.mjs` | Texture resize / re-encode pipeline. |
| `node tools/check-rig.mjs`, `rigdump.mjs`, `geom-probe.mjs` | Asset diagnostics. |

### gen-sw.mjs is not optional

`sw.js` is generated: its `VERSION` is a content hash of every precached byte and
its `PRECACHE` list is the tree. `cache.addAll()` is **all-or-nothing**, so one
path that has moved since the last run does not degrade the site — it removes
offline play entirely, and silently. Three guards exist because of that:

- the generator **refuses to run** if any precached file is untracked in git,
  because what deploys is what git has;
- it **refuses to run** if the precache exceeds 25 MB, because an over-large
  precache fails silently mid-install on iOS;
- CI **regenerates `sw.js` and fails the deploy on a diff**, so the only way to
  ship a stale worker is to change that step.

---

## Test and verification suites

All of them start the static server themselves if it is not already up.

```sh
node tools/capture/capture.mjs --set final          # the screenshot matrix
node tools/capture/capture.mjs --set final --engine both
node tools/capture/capture.mjs --set final --only museum --device ip16pro
node tools/capture/layout.mjs                       # layout assertions
node tools/test/upgrade.mjs                         # the §9.2 upgrade-path test
node tools/test/final.mjs                           # the long gameplay e2e
node tools/test/bench.mjs                           # performance sampling
```

### capture.mjs

Shoots every screen on every device in **both** landscape orientations, plus
portrait on one device for the rotate overlay. Writes to
`screenshots/<set>/<scene>_<device>_<orientation>.png` and a `report.json` of
what each shot is for, and exits non-zero if any capture produced a console
error, a page error or a failed request.

No headless browser reports `env(safe-area-inset-*)`, so the harness injects the
real per-device values as the `--sa-*` custom properties the CSS already reads —
**asymmetrically**, because in landscape the notch sits on one side and which
side it is flips with the orientation. That flip is why both orientations are
captured; a HUD that clears the island in one and hides under it in the other is
the most commonly missed iOS landscape bug.

`?capture=1` is what makes two runs comparable: the frame loop steps a fixed dt
instead of the wall clock, the day does not advance, and the camera does not
shake.

### layout.mjs

Reads the real `getBoundingClientRect` of every interactive control in every
state on every viewport and fails on the numbers: any target under 44×44,
anything breaking the safe box, anything in the bottom 20 px where the
home-indicator swipe lives, any pair that must not overlap doing so, anything
that must be reachable being off-screen, and any `:hover` rule in the stylesheet.

Screenshots prove what a thing looks like. They are a poor way to prove a button
is 44 points or that two boxes miss each other by three pixels — those are
measurements, and a person reviewing forty images will miss them.

### upgrade.mjs

The one that decides whether a deploy is real. See `VERIFICATION.md`.

---

## Deploying

Push to `main`. The workflow verifies `sw.js` is current, then uploads the repo
root and deploys. It takes about a minute and there is no staging.

Before pushing: run the server, load the site, confirm zero console errors,
confirm the game is playable. A push is a deploy.

- `.nojekyll` must stay at the repo root. Without it Pages runs Jekyll and drops
  underscore-prefixed files.
- **Never use Git LFS.** Pages does not resolve LFS objects — it serves the
  pointer file, so an LFS-tracked asset arrives as a 130-byte text file and the
  game breaks silently in production. There is no `.gitattributes` in this repo
  and there should not be one with filters in it.
- Every path in HTML, CSS, JS, the manifest and the service worker is relative.
  `tools/test/serve.mjs` is what keeps that honest.
