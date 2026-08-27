# Art direction

The rules every asset in this game conforms to. An asset that does not conform is
rejected, however good it is on its own — visual incoherence is worse than
placeholder art, and a mismatched-style asset dump is a failure condition rather
than progress.

This document is written before assets are chosen, not after.

---

## The look, in one paragraph

A low-poly city at a warm, low sun, seen from over a man's shoulder. Flat
saturated colour on simple forms, with all the surface interest coming from
*procedural shading in the material* rather than from texture maps. Buildings are
blue-family; everything the player can act on is orange. It is legible at arm's
length on a 4-inch-tall screen, at 60 fps, and it stays legible when a tower
comes down in front of it.

---

## Scale

**1 unit = 1 metre. This is not negotiable and everything depends on it.**

| | |
|---|---|
| Player | 1.8 m; capsule radius 0.38 |
| Floor height | 3 m (`FLOOR_H`) |
| Wall cell | 2 m wide × 3 m tall — the destruction grain |
| Road | 10 m wide, half-width 5 |
| Sidewalk | 3.5 m band, 0.12 m above the road |
| Block | 46 m square |
| Monster | up to 3.4 m |
| Streetlamp | 5.6 m |
| Gallery hall | 6 m to the ceiling; art hung with its centre at 1.52 m |

An imported model is rescaled to metric by `tools/optimize-glb.mjs` and grounded
so its origin is at its base. A model that arrives at the wrong scale and is
"close enough" is not close enough: collision radii, blob-shadow sizes, the
shadow ortho frustum and the camera boom are all metres.

---

## Silhouette

Read the shape first, the detail never. Every asset must be identifiable as a
black silhouette at 40 px.

- **Boxy and axis-aligned** where it will be destroyed — the whole city is a grid
  of 2×3 m cells and anything that fights that grid fights the destruction system.
- **Rounded and organic** only for the things that are alive, plus tree canopies.
- **No greebles.** Detail that survives at 40 px is worth having; detail that
  does not is triangles spent on a phone GPU for nothing.
- **One landmark per district maximum.** The eye needs somewhere to rest, and a
  skyline where everything is remarkable has no landmarks in it.

---

## Colour

The palette is `js/core/palette.js`, sampled from the app icon so the shell and
the game are the same object. Full table in `docs/STYLE.md`.

The rule that matters for assets:

> **Blue is the world. Orange is what you can do to it.**

Buildings, sky, glass, pavement, cars: blue family, desaturated as they recede.
The player's hands, the action buttons, points, the armed weapon, the samosa
landmarks, the gallery signage: orange family.

An asset that arrives in a third hue family is retinted through the instance
colour, not accepted as it is. Every static prop and every building cell is drawn
with `instanceColor`, which is exactly what makes that cheap.

### Time of day

Six keyframes over a 24-minute day (`SKY_KEYS`), interpolated for the dome, the
fog, both lights and the god-ray tint. The game *starts* at t = 0.70, the warm
low dusk the palette was authored around, and that is the stop to judge a new
asset at.

Night is a **floor, not a blackout**: the three night stops are lifted bodily and
warmed so a pedestrian is a person and not a silhouette. Streetlamps and lit
windows carry the local detail.

---

## Materials

**One `MeshLambertMaterial` draws the entire city.** Streets, every building
archetype, props, cars, debris. It carries three custom terms injected through
`onBeforeCompile`, so there is still exactly one shader program for the whole
world:

| Term | What it does |
|---|---|
| `aInterior` | swaps outdoor lighting for a dim indoor constant, so a room revealed by destruction never reads as sunlit |
| `aSurface` | a material id per vertex, driving procedural detail: asphalt grain and wheel tracks, concrete mottle, pavement panel joints, brick courses, roof gravel, wood grain, foliage clumps |
| specular | a Blinn-Phong lobe plus a sky-coloured fresnel rim, so glass, car paint and wet asphalt read as materials rather than flat colour |

**Surface detail is projected from world space** on the dominant face axis,
because none of this geometry has usable UVs — the prop pipeline deliberately
deletes them before merging. That is the trade: no UV authoring, no texture
budget, no seams, and in exchange the detail is procedural and the palette is
per-instance.

**Consequences for a new asset:**

- It must be tagged (`tagGeometry`) with a colour, an interior flag and a
  surface id, or the shader reads an undefined vertex attribute.
- It should carry **no texture map**. The one exception is a baked palette atlas
  on an imported GLB, and `world/props.js` rebuilds those onto the shared
  material anyway.
- The gallery interior is the deliberate exception: it is unlit
  `MeshBasicMaterial` with baked vertex colours, for the reasons in
  `docs/MUSEUM.md`.

---

## Lighting

One directional sun plus one hemisphere, both keyframed by time of day.

Shadows are **proxies**, not real casters: one InstancedMesh of boxes on a
dedicated layer, one per building and car, plus a second for street furniture and
a coarse icosahedron for tree canopies. The facades are ~3,400 instanced cells
with frustum culling off, so casting from the real geometry would redraw ~100k
triangles per shadow update. Cost as built: one to three draw calls, ~200
triangles, refreshed every third frame.

The player and the monsters cast from their real skinned meshes, because a boxy
silhouette under the character you are looking at is worse than no shadow. The 48
townsfolk get blob shadows.

**Baked beats real whenever it can.** The gallery is the clearest case: four
spotlights would have recompiled every material in the city and cost four extra
per-pixel evaluations on every surface of it, forever, to light 60 m².

---

## Technical standards

| | |
|---|---|
| Format | `.glb` only, meshopt-compressed, decoder **vendored** (never a CDN) |
| Textures | WebP; 1024 max for a hero asset, 512 for a prop, 256 for a small item |
| Colour space | albedo and artwork `SRGBColorSpace`; normal / roughness / metalness / AO stay `NoColorSpace` |
| Mesh | one mesh per model, merged, origin grounded, metric scale |
| Repeats | `InstancedMesh` — every building cell, every prop, every particle |
| Statics | merged with `mergeGeometries` — the whole gallery interior is one draw call |
| Total payload | **under 25 MB**, and the generator refuses to build a precache over it |
| Any single file | under 5 MB |

Every asset goes through `tools/`. Nothing raw ships.

### Power-of-two, and the one place it is not applied

Textures are power-of-two, except the four museum artworks. Those are 0.549–0.577
aspect and the only way to reach POT is to squash them, which §8.4 forbids
outright. WebGL2 samples and mipmaps NPOT natively, so the native aspect wins.
See `ASSUMPTIONS.md`.

---

## Licensing

Written here because it constrains selection as hard as style does. This is a
**public** repository, so committing a file republishes it — and that, not
non-commercial use, is the binding constraint.

- **Preferred:** CC0 / public domain.
- **Acceptable:** CC-BY (attribution given and kept), OFL fonts, MIT/Apache.
- **Rejected:** CC-BY-ND (importing here *is* a derivative work), "free for
  personal use" custom terms (they commonly forbid re-hosting the raw files,
  which is what this repo does), anything whose licence lives only in a forum
  post or a zip README, anything ripped from a commercial game, and anything with
  a trademark in it.

Full inventory in `ATTRIBUTIONS.md`.

---

## The checklist a new asset passes

1. Metric scale, origin at the base, one merged mesh.
2. Readable as a 40 px silhouette.
3. In the blue or orange family, or retintable through `instanceColor`.
4. Tagged with colour, interior flag and surface id.
5. No texture map unless it is a baked palette atlas.
6. Judged at t = 0.70 first, then at midday and at midnight.
7. Under budget, through `tools/`, listed in `ATTRIBUTIONS.md`.
8. Instanced if there will be more than three of it.
