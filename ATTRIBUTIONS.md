# Attributions

Every third-party file in this repository, with its author, its source, its
licence, and whether that licence permits the redistribution that a **public
repository is**.

That last column is the one that decides what may live here. This is a personal,
non-commercial project, but committing a file to a public repo republishes it —
so "free for personal use" and "free for use in your game" are not enough on
their own. Everything below either permits redistribution outright (CC0, MIT,
CC-BY with attribution) or is the repository owner's own work.

Licences were verified on their source pages on **26 August 2026**.

---

## Code and libraries

| Path | What | Author | Source | Licence | Redistribute? |
|---|---|---|---|---|---|
| `vendor/three/three.module.min.js`, `three.core.min.js` | three.js r185 | three.js authors | <https://github.com/mrdoob/three.js> | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | Yes |
| `vendor/three/addons/loaders/GLTFLoader.js` | glTF loader (r185) | three.js authors | <https://github.com/mrdoob/three.js> | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | Yes |
| `vendor/three/addons/utils/BufferGeometryUtils.js` | geometry merge helpers (r185) | three.js authors | <https://github.com/mrdoob/three.js> | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | Yes |
| `vendor/three/addons/utils/SkeletonUtils.js` | skeleton retargeting (r185) | three.js authors | <https://github.com/mrdoob/three.js> | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | Yes |
| `vendor/three/addons/libs/meshopt_decoder.module.js` | meshoptimizer decoder | Arseny Kapoulkine | <https://github.com/zeux/meshoptimizer> | [MIT](https://github.com/zeux/meshoptimizer/blob/master/LICENSE.md) | Yes |

The three.js addons are pinned to the **same revision as the core** (r185). A
mismatched addon and core is a classic silent-breakage source; `docs/BUILD.md`
records the revision and how to check it.

No decoder is fetched from a CDN at runtime. `MeshoptDecoder` is the vendored
module above and is imported through the import map like everything else, which
is what keeps the game working offline and free of third-party requests.

---

## 3D models

All Kenney models are **CC0 1.0** — public domain, no attribution required,
redistribution explicitly permitted. Credit is given anyway.

Imported by `tools/import-models.mjs`, which downloads the original pack, merges
it to a single mesh, rescales it to metric game size, grounds its origin and
re-encodes the palette atlas as WebP. Re-run it to reproduce every file below.

| Game asset | Kenney pack | Source model | Licence |
|---|---|---|---|
| `assets/models/prop_streetlamp.glb` | city-kit-roads | `light-curved.glb` | CC0 1.0 |
| `assets/models/prop_trafficlight.glb` | city-kit-roads | `traffic-light.glb` | CC0 1.0 |
| `assets/models/prop_sign.glb` | city-kit-roads | `road-sign-street.glb` | CC0 1.0 |
| `assets/models/prop_tree.glb` | city-kit-suburban | `tree-large.glb` | CC0 1.0 |
| `assets/models/prop_kiosk.glb` | city-kit-commercial | `detail-parasol-a.glb` | CC0 1.0 |
| `assets/models/car_sedan.glb` | car-kit | `sedan.glb` | CC0 1.0 |
| `assets/models/car_taxi.glb` | car-kit | `taxi.glb` | CC0 1.0 |
| `assets/models/car_van.glb` | car-kit | `van.glb` | CC0 1.0 |
| `assets/models/car_police.glb` | car-kit | `police.glb` | CC0 1.0 |
| `assets/models/car_wreck.glb` | car-kit | `sedan-sports.glb` | CC0 1.0 |
| `assets/models/gun_pistol.glb` | blaster-kit | `blaster-b.glb` | CC0 1.0 |
| `assets/models/gun_smg.glb` | blaster-kit | `blaster-j.glb` | CC0 1.0 |
| `assets/models/gun_rifle.glb` | blaster-kit | `blaster-d.glb` | CC0 1.0 |
| `assets/models/gun_shotgun.glb` | blaster-kit | `blaster-o.glb` | CC0 1.0 |
| `assets/models/gun_sniper.glb` | blaster-kit | `blaster-e.glb` | CC0 1.0 |
| `assets/models/gun_cannon.glb` | blaster-kit | `blaster-p.glb` | CC0 1.0 |

- **Author:** [Kenney](https://kenney.nl) · **Licence:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · **Redistribute:** Yes · **Accessed:** 2026-08-26

### The one asset that is not CC0

| Path | What | Author | Source | Licence | Redistribute? |
|---|---|---|---|---|---|
| `assets/models/landmark_samosa.glb` | one mesh from "Samosa, Cake Snacks Plate" | **ronchoqa** | [Sketchfab](https://sketchfab.com/3d-models/samosa-cake-snacks-plate-57baf38756304e7b979372500dac0e91) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Yes, **with attribution** |

CC BY *requires* the credit above; it is not optional the way the Kenney credits
are. The mesh was extracted from the multi-object original, stood upright and
re-optimized by `tools/optimize-glb.mjs`; nothing else from the source ships.
This attribution also appears in `assets/CREDITS.md`, which ships with the site.

---

## Artwork in the museum

| Path | What | Author | Licence | Redistribute? |
|---|---|---|---|---|
| `assets/art/the-visitor.webp`, `the-visitor_512.webp` | *The Visitor* | **Inder** | Owner's own artwork, used with permission | **No** |
| `assets/art/riverbank.webp`, `riverbank_512.webp` | *Riverbank* | **Inder** | Owner's own artwork, used with permission | **No** |
| `assets/art/reach.webp`, `reach_512.webp` | *Reach* | **Inder** | Owner's own artwork, used with permission | **No** |
| `assets/art/the-reader.webp`, `the-reader_512.webp` | *The Reader* | **Inder** | Owner's own artwork, used with permission | **No** |

Supplied by the repository owner for this project. They are **not** covered by
the repository's MIT licence and are not free for reuse: anyone cloning this
repo may build and run the game, but may not redistribute these four drawings
separately or use them in anything else.

Derived from the originals by `tools/import-art.mjs` — resized and re-encoded to
WebP at 1024 and 512 on the long edge, **never cropped, letterboxed, stretched
or squashed**. The tool re-checks the aspect ratio after encoding and fails the
run if it has drifted by more than 0.001.

---

## Original to this project

Created for this game and covered by the repository's MIT licence.

| Path | What |
|---|---|
| `assets/models/player.glb`, `npc_a.glb`, `npc_b.glb` | Player and townsfolk (Higgsfield SAM 3 + Meshy, re-rigged and optimized) |
| `assets/models/monster_a.glb`, `monster_b.glb` | Monsters |
| `assets/anim/clip_run.glb`, `clip_punch.glb`, `clip_die.glb` | Animation clips |
| `assets/models/prop_hydrant.glb`, `prop_bench.glb`, `prop_dumpster.glb` | Street props |
| `assets/img/splash.webp`, `title.webp` | Title screen art |
| `assets/tex/sky_equirect.webp` | Sky reference (kept as the pipeline's output; the game's sky is procedural and does not load it) |
| `assets/icons/*` | PWA icons, generated by `tools/make-icons.mjs` from the owner's app icon |
| `assets/splash/*` | iOS launch images, generated by `tools/make-icons.mjs` from `assets/img/title.webp` |

---

## Fonts

**None are bundled, and that is deliberate.** The UI uses the system stack —
`-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif` — which on
the target device is San Francisco, already installed. A webfont here would cost
every first load 30–100 KB, add a request that must work offline, and land the
game on a licence that has to be tracked, to render a handful of short uppercase
labels in a face the player's phone already draws better.

The in-world canvas textures (plaques, gallery signage) use the same stack.

---

## Audio

**No audio files ship.** Every sound in the game is generated at runtime by
`js/engine/audio.js` from WebAudio oscillators and one procedurally-filled noise
buffer, so there is nothing here to license, nothing to download, and nothing to
attribute.

---

## Rejected

Recorded so the same ground is not walked twice.

| Considered | Why it is not here |
|---|---|
| CC-BY-ND models and textures | Importing anything into this engine means re-encoding its textures, rescaling it, regenerating collision and rebuilding its material — that is a derivative work, which ND forbids. Not an edge case worth arguing. |
| "Free for personal use" custom-terms packs | These commonly permit shipping a game and forbid re-hosting the raw files. A public repository re-hosts the raw files. |
| Assets with a licence stated only in a forum post or a zip README | Unverifiable. If there is no licence on a live source page, it does not go in. |
| A bundled webfont | See Fonts above. |
