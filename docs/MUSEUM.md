# The City Gallery

A civic building on Market Side holding four drawings by **Inder**.

---

## Where it is

| | |
|---|---|
| **Lot** | x −24.5 … −8.5, z 12.5 … 34.5 (16 m deep × 22 m of frontage) |
| **District** | 2, *Market Side* — the only block with no samosa landmark |
| **Front** | East, flush with the block edge at x = −8.5 |
| **Door** | (−8.5, 23.5), stepping out onto the forecourt at (−6.9, 23.5) |
| **Height** | 2 cell floors = 6 m, with the mid-floor slab suppressed so the hall is one room |
| **Interior** | x −24.2 … −8.8, z 12.8 … 34.2 (15.4 × 21.4 m), ceiling 5.72 m |

The player spawns at **(2.5, 0, 20)**, standing on the central north–south road.
The gallery's facade is **eleven metres away and directly in view**: approach,
signage and door are all visible before the player has taken a step. That is why
this lot and not another.

The lot is reserved in `js/world/city.js` (`export const MUSEUM`) **before** the
procedural fill runs, so the generator lays the rest of the block around it. It
is pushed straight into the placed list rather than through `tryPlace()`, so it
consumes none of the world seed's random stream itself.

### Getting there in one step

```
?warp=museum          drops the player on the forecourt facing the facade
window.__test.museum()   the door, the interior bounds and all four works
window.__test.inspect('the-visitor')   opens inspect mode on one work
```

---

## Layout

```
                    z = 34.2  (south wall)
   ┌──────────────────────────┬────────────────────────┐
   │        ALCOVE            │                        │
   │   ▣ IV                   │                        │
   │      (south wall)        │                        │
   ├───────────── partition ──┘   z = 27.6             │
   │                                                   │
   │  ▣ III                                            │
   │  (west wall)                                   ╔══╡  door
   │                                                ║  │  (−8.5, 23.5)
   │                                       reception║  │
   │            ▣ II           ▣ I                   ─┤
   └──────────────────────────────────────────────────┘
    x = −24.2        z = 12.8 (north wall)        x = −8.8
```

Enter from the east. The north wall carries **I** and **II** on the right; **III**
is straight ahead on the west wall. Walk south past the partition's opening (which
is 6.6 m wide, between x = −15.4 and the east wall) and the alcove holds **IV**.
**All four are on a single natural walkthrough**, and from the doorway you can
already see a corner of **IV** through the gap — which is the point of putting it
there. The numbering runs in that walking order, so the hang and the labels tell
the same story.

The **partition** runs along x at z = 27.6, from the west lining to x = −15.4,
220 mm thick. It is full height for collision even though it stops at the
ceiling visually, so nothing can hop over it into the alcove.

**Dressing:** reception desk right of the door, a bench facing each work, rope
stanchions 1.15 m off each wall, a planter in the north-east corner, and a
darker stone inlay at the threshold so the material change reads underfoot.

---

## The four works

The works are **numbered, not named** — `I`, `II`, `III`, `IV`, in hanging
order. That is the owner's instruction and it overrides the earlier descriptive
titles, which are recorded below only so the table still says which drawing is
which.

Numbering is a real convention and not a placeholder: a plain numeral says the
sequence is the curator's and declines to put a reading on somebody else's
drawing. It is also the honest option here, because every descriptive title was
this project's invention rather than the artist's.

| Plaque | File | Wall | Which drawing |
|---|---|---|---|
| **I** | `the-visitor` | north, x = −13.0 | A woman in a wide-brimmed hat, seen in profile, with a butterfly settled on her raised finger. |
| **II** | `riverbank` | north, x = −19.6 | Reeds, seed heads, pebbles and a small bird over shallow water with fish in it. |
| **III** | `reach` | west, z = 19.5 | A hand rising from a sleeve, index finger extended, a butterfly hovering just above the fingertip and not yet landed. |
| **IV** | `the-reader` | alcove, south wall, x = −20.0 | A girl seen from behind under a tree, knees drawn up, an open book in her hands, ducks on the water beyond. |

All four are credited to `Inder`, `Undated`, `Graphite on paper`.

**The slugs are file keys, not titles.** `the-visitor.webp` displays as `I`. They
were left alone deliberately: renaming them renames the assets, the service
worker's precache list and every capture filename, for no gain — the mapping
lives in the table above and in `assets/art/plaques.json`.

**The medium and the date are descriptions, not inventions.** The works are
photographs of graphite drawings on paper — two of them carry Inder's signature
in the lower right — so "Graphite on paper" is a description. The year is not
known here, and a plaque asserting one would be a fabrication about somebody
else's work, so the label reads `Undated`, which is the ordinary museum
convention for exactly this case.

---

## How a work is hung

The **only** fixed dimension is the canvas height: **1.62 m**, centred at
**1.52 m**, which is the standard gallery hanging line. The width comes from the
image:

```js
const { tex, w: iw, h: ih } = await loadArtwork(`./assets/art/${slug}_512.webp`, maxAniso);
const cw = CANVAS_H * (iw / ih);          // js/world/museum.js
```

`iw` / `ih` are `naturalWidth` / `naturalHeight` off the decoded bitmap. Nothing
anywhere hardcodes a ratio, nothing is cropped, letterboxed, stretched or
squashed, and a replacement artwork of any shape hangs correctly with no code
change.

Resulting widths, from the sources' own 0.549–0.577 aspects: 0.89 m, 0.91 m,
0.93 m, 0.91 m. Close enough to each other that a uniform height reads as a
coherent hang, which is why height is the fixed axis and not width.

Texture setup, per work: `SRGBColorSpace` (it is albedo), mipmaps on,
`LinearMipmapLinearFilter`, `ClampToEdgeWrapping`, and
`anisotropy = renderer.capabilities.getMaxAnisotropy()`.

Around the canvas: a real four-bar frame with 90 mm of depth, a backing board so
no wall shows through the opening, a soft contact shadow on the wall, a modelled
picture-light fixture above, and the plaque 300 mm to its right.

### The label

The plate is 0.46 m wide and **its height is cut to its content** — the four
lines are laid out first and the canvas is sized to the block, so there is never
a band of empty plate under the last line and a longer title can never run off
the bottom. `plaqueTexture()` in `js/world/museum.js` returns that height in
metres alongside the texture, and the plate geometry is built from it.

The title line is set in a **serif** face and everything under it in sans. That
is not decoration. The works are numbered, and a Roman `I` set in Helvetica is a
bare vertical bar — it reads as a stray tick or a text cursor rather than as a
numeral; the serifs are what make it a one. It also happens to be the museum
convention: the number gets serifs, the catalogue data underneath does not.

---

## Lighting

**Baked, and the room is unlit** — one `MeshBasicMaterial` with vertex colours.
Two things forced that, and both are worth writing down.

**Real lights are out.** Every world surface in the city shares *one* Lambert
program (`js/engine/materials.js`), and a light count is a program parameter. Four
spotlights for four paintings would recompile every material in town and then
cost four extra per-pixel light evaluations on every surface of the city, forever,
to light 60 m² of interior.

**The shared indoor constant is out too.** `uInterior` is tuned for a room torn
open by a punch — it puts a stone floor at about sRGB 0.11 — and it swings warm
and five times brighter after dark. A gallery is the one interior in this city
that has its own lighting and does not care what time it is.

So the room is lit the way a gallery is: an even wall wash baked into the vertex
colours, `faceShade()` for form, an additive gradient quad under each modelled
picture light, and `MeshBasicMaterial` canvases — which makes *evenly lit, no
hotspot, no corner falloff, no specular glare* true by construction rather than
by tuning. The exterior pieces (forecourt, steps, pilasters, entablature) stay on
the shared world material, because they abut real pavement and must take the same
sun.

The shell's own inner faces are marked `aInterior` by `world/buildings.js` and are
therefore dark navy. They are not the gallery's walls: a **60 mm lining** is built
inside them, floor to ceiling, which is what a real exhibition wall is anyway and
what every painting actually hangs on. An earlier version stopped the lining at a
picture rail and left 2.7 m of near-black shell above it; the facade is solid
stone now precisely so the lining can run all the way up.

### Measured cost

See `VERIFICATION.md` for the numbers taken inside the room against the same
viewpoint outside it.

---

## Indestructible, and why

`world/city.js` marks the lot `protected: true`. `world/destruction.js` refuses
every removal on a protected lot, in **one place**: `removeSphere()` is the single
funnel every cell removal in the game goes through — punches, throws, gunfire,
monsters and the collapse solver all arrive there — so one guard is the whole
rule and nothing else needs a special case.

This is a deliberate design decision, not an omission. §8.2 asks for collision
that stays watertight from every angle, and a destructible shell cannot be; a
gallery whose walls come down also takes four paintings with it. In fiction it is
civic stone. Punching it produces the sound and the recoil and no hole.

---

## Inspect mode

Standing in front of a work, within 3.4 m and facing it, raises a prompt. TALK or
a tap on the prompt opens inspect mode.

The picture is a **DOM `<img>`, not a second WebGL surface**. `object-fit:
contain` makes losing the native aspect ratio structurally impossible at any
viewport, a 1024 px source decodes at whatever the 3× panel can actually show,
and none of it lands in texture memory beside the four wall textures.

Entering freezes the simulation by putting the game in `paused` — `main.js` runs
`fixedSystems` only while `playing` and `frameSystems` for `paused` too, so the
city keeps rendering behind the overlay while nothing in it moves. That is also
why the player's position needs no saving. The camera **is** snapshotted and
restored exactly, because it damps toward its target every frame.

Pinch to zoom, drag to pan when zoomed, double-tap to reset, CLOSE (or Escape on
a keyboard) to leave.

---

## Swapping an artwork

1. Put the new image somewhere on disk.
2. Add it to `WORKS` in `tools/import-art.mjs` with a slug, and run
   `node tools/import-art.mjs <sourceDir>`. That writes `<slug>.webp` (1024 on
   the long edge, for inspect mode) and `<slug>_512.webp` (the wall texture), and
   **fails the run** if the aspect ratio drifted during encoding.
3. Add or edit the entry in `assets/art/plaques.json`:

   ```json
   { "slug": "…", "title": "V", "year": "Undated", "medium": "Graphite on paper",
     "wall": "north", "at": -13.0 }
   ```

   `wall` is one of `north`, `south`, `west`, `east`, `alcove-south`. `at` is the
   coordinate that runs *along* that wall — x for north/south, z for east/west.
4. `node tools/gen-sw.mjs` — the new files must be in the precache or the gallery
   will not open offline. The generator will also refuse to run if the files are
   not committed.
5. `node tools/capture/capture.mjs --set final --only museum` re-shoots the whole
   museum matrix, including a plaque close-up per work. The scene list is
   generated from `plaques.json`, so a fifth work extends the matrix with no
   edit to the harness.

Nothing in `js/` needs touching for any of that. Titles, years and medium live
only in `plaques.json`; positions live only in `plaques.json`; sizes come from the
images themselves.
