# STRONGEST MAN

A low-poly open-world destruction sandbox for iPhone. You are the strongest
man in the universe. Nobody knows — until they see it.

**Play it:** https://karimeidou.github.io/Strongest-Man/

## Install on your iPhone (fullscreen, no browser bars)

1. Open the link above in **Safari** on your iPhone.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Launch **Strongest Man** from the Home Screen and rotate to landscape.

The game runs fullscreen (no Safari chrome), respects the Dynamic Island and
home indicator, and — after the first launch — works with no connection at all.

## Controls

| Input | Action |
|---|---|
| Left half of screen | Floating joystick — walk / jog / sprint by stick distance |
| Swipe on right half | Look around (sensitivity in Settings) — this is also how you aim |
| PUNCH tap | Jab — or, with something in your hands, swing it at what is in front of you |
| PUNCH hold | Charge — a full charge levels a building, or a car |
| GRAB | Grab cars, props, rubble, people, bodies; press again to throw |
| JUMP | Jump |
| TALK | Start a conversation with whoever is in front of you — type and they answer. Press again to end it |
| GALLERY | Quick travel to the City Gallery forecourt, and back out of it |

The four action controls sit on an arc around PUNCH in the bottom-right corner,
where a thumb pivots to reach them. Everything works simultaneously — move, look
and punch at once.

## What there is to do

Walk around a city and take it apart with your hands. There is no score, no
health bar, no weapon and nothing to buy: a punch is a punch, a charged punch
levels a building, and what you do with that is up to you.

There are 48 townspeople living real days — commuting, shopping, eating,
chatting, waiting at kerbs for the lights — and you can talk to any of them.
There is a public art gallery with four drawings in it, which is the one place in
the city you go to look rather than to demolish.

## Live NPC dialogue (optional)

NPCs are fully voiced by built-in dialogue with no setup. Paste a free
[Groq](https://console.groq.com/keys) API key under **Settings** and TALK
becomes a real conversation: type anything and the person in front of you
answers in character. They know who they are, which district you are standing in
and what time of day it is. They stop walking, turn to face you and gesture while
they speak; a building coming down nearby ends the conversation the way it would
in life.

The key is stored only in your phone's local storage and is sent only to
`api.groq.com`. **TEST KEY**, beside the field, runs one real request and prints
exactly what came back — a rejected key says so instead of silently falling back
to canned lines, which is the whole difference between "the model is answering"
and "the model has never been reached". Whenever it is unavailable the reason is
printed under the conversation and the reply is marked as a built-in line.

Ambient street barks stay instant and canned — only the conversation waits on the
model — and the client stays far inside Groq's free tier. With no key the panel
still opens and answers from the built-in corpus.

## Graphics

**Settings → Graphics** picks a tier. **High** (the default) is everything:
procedural surface detail, real sun shadows, a procedural sky with drifting
clouds, and sun shafts. **Auto** measures the device on first boot.

## The game

- Dense downtown: four walkable blocks, ~30 buildings with interiors, lane
  traffic with working lights, hydrants, benches, trees, kiosks, dumpsters.
- Two city blocks are giant samosas — 33m of fried pastry apiece, and every bit
  as destructible as the offices around them. Punch one and you take a bite out
  of it; take enough out of the base and it comes down in a shower of crumbs.
- Everything is destructible: chunked facades, progressive top-down collapse,
  craters, bursting hydrants, felled streetlights, cars that crush and explode.
  What you throw stays where it lands — a tree lies across the carriageway, a
  hydrant shears off its main, a wrecked car does not quietly rejoin the traffic.
- 48 townsfolk live real days — commuting, shopping, eating, chatting — and
  panic properly: scattering, screaming, trampling, hiding indoors. Held up by
  the throat they claw at your forearm and kick; carried at a sprint they trail
  behind you. The dead stay down — and can be picked up again.
- They also cross roads like people: they stop at the kerb, wait for the light
  and for a gap in the traffic, and step off when it is clear. The cars see them
  coming and brake in proportion rather than slamming to a stop.
- Most of the city's buildings are real modelled facades with shopfronts,
  awnings and balconies, and every one of them comes apart on the same 2 x 3 m
  grid as everything else. Punch a hole and you are looking into a room.

## The City Gallery

There is a small municipal art gallery on the north-west block, and it is the one
building in town that is not there to be knocked down. Walk in and four drawings
by **Inder** are hung on the walls — numbered **I** to **IV** in hanging order —
each with a proper museum plaque carrying the numeral, artist, date and medium.
Stand in front of one and a prompt appears; take it and the work fills the screen
at its own aspect ratio, where you can pinch to zoom and drag to pan around it.
Double-tap resets.

**GALLERY**, third in the top-right cluster, puts you on the forecourt outside
the door from anywhere in the city — and, since it always goes to the same spot,
it is also the way back out when you are inside. It is disabled while you are
down, because quick travel is not an escape from a knockout.

The room is lit and finished the way a gallery is rather than the way the rest of
the city is, and the reasons — why it is unlit baked vertex colour instead of four
spotlights, why the shell is generated by the same code that builds every other
building, why the artwork textures are the one place in the project that is not
power-of-two — are written up in [docs/MUSEUM.md](docs/MUSEUM.md).

The four works are Inder's own and are **not** covered by this repository's MIT
licence. See [LICENSE](LICENSE) and [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

## Development

Pure static site — no build step. Vanilla ES modules + three.js (vendored,
`vendor/three/`). GitHub Actions deploys `main` to Pages on every push.

```
tools/                # dev-only (node)
  make-icons.mjs      # icon set from the source artwork (full-bleed crop)
  optimize-glb.mjs    # Meshy/SAM GLB → compressed game assets
  import-models.mjs   # third-party CC0 packs → game GLBs (see assets/CREDITS.md)
  geom-probe.mjs      # where a model's mass sits, for code that hangs a light or
                      # a lens or a muzzle off one
  process-textures.mjs# skybox seam-blend, splash/title WebP
  gen-sw.mjs          # regenerates sw.js (content-hash precache) — run before commits
  check-rig.mjs       # verifies all rigs share one skeleton
  rigdump.mjs         # bind-pose bone axes — how anim/poses.js targets were authored
  test/serve.mjs      # local server mirroring the Pages subpath
  test/shot.mjs       # Playwright screenshot/assert driver
  test/probe.mjs      # one-off: boot the game, run a snippet, print the result
  test/viewer.html    # model viewer — a GLB against a 1.8m reference figure
  test/modelshot.mjs  # screenshots the viewer, for looking before shipping
  test/final.mjs      # full end-to-end suite (waits on sim time, not wall clock)
  test/bench.mjs      # frame-hitch benchmark: worst-frame, not average fps
  test/upgrade.mjs    # the service-worker upgrade path: old install -> new build,
                      # offline both sides, one surviving cache
  test/metrics.mjs    # draw calls, triangles, TTI, transfer, and a 20-cycle leak
                      # check on renderer.info and the JS heap
  import-art.mjs      # museum artwork -> two WebP derivatives, aspect verified
  capture/capture.mjs # the screenshot matrix: every scene x 5 devices x 2
                      # orientations x 2 engines, deterministic and parallel
  capture/devices.mjs # the device table, with per-orientation safe-area insets
  capture/scenes.mjs  # every screen the matrix covers, and what it is proving
  capture/layout.mjs  # measures every control in every state: 44pt minimums,
                      # safe areas, overlaps, reachability
  capture/baseline.mjs# the same scenes captured from the pre-overhaul build
```

### Screenshots

`screenshots/` holds a before/after set at real iPhone viewports with real
safe-area insets, plus one frame of everything that is new. `before/` is the
pre-overhaul build captured at the same viewport by the same harness, so the only
difference between a pair is the code. `screenshots/README.md` is the index.

The full matrix — 31 scenes × 5 viewports × 2 orientations × 2 engines, 602
captures — is regenerated by `node tools/capture/capture.mjs --set final --engine
both` and is deliberately not committed; `final-report.json` lists every one of
them with its console output.

### Documents

| | |
|---|---|
| [AUDIT.md](AUDIT.md) | every defect found, with repro and resolving commit — generated by `tools/audit/build.mjs` |
| [VERIFICATION.md](VERIFICATION.md) | how each fix was proven, with the numbers |
| [CHANGELOG.md](CHANGELOG.md) | what changed |
| [ASSUMPTIONS.md](ASSUMPTIONS.md) | decisions taken without asking, and why |
| [BLOCKERS.md](BLOCKERS.md) | what could not be done here, stated plainly |
| [ATTRIBUTIONS.md](ATTRIBUTIONS.md) | every asset, its licence and its source |
| [docs/BUILD.md](docs/BUILD.md) | how to run, test and deploy it |
| [docs/MUSEUM.md](docs/MUSEUM.md) | the gallery, and why it is built the way it is |
| [docs/STYLE.md](docs/STYLE.md) | the HUD rules, and the reasoning behind them |
| [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) | what an asset has to be to ship |

`node tools/import-models.mjs` reproduces every third-party asset in the repo
from scratch: it scrapes the pack off kenney.nl, merges it to a single mesh,
rescales it to metric game size, grounds and orients it for this game's
+Z-forward convention, re-encodes the palette atlas as WebP and rewrites
`assets/CREDITS.md`. Downloads are cached in `tools/.assetcache/`.

Local dev: `node tools/test/serve.mjs` → http://127.0.0.1:8080/Strongest-Man/
(desktop keys: WASD move, mouse-drag look, J punch, K jump, L grab, E talk).

The 3D characters, the hydrant, the bench and the dumpster were generated
with Higgsfield (SAM 3 3D lift + Meshy auto-rig + Meshy animation library); the
skybox, splash art, title art and app icon palette come from the same pipeline.

### Third-party assets

The street furniture, the traffic and the building facades are
**[Kenney](https://kenney.nl)** CC0 packs, imported by
`tools/import-models.mjs` — see
[assets/CREDITS.md](assets/CREDITS.md) for the file-by-file provenance.

The two giant samosa landmarks use a mesh lifted from
**["Samosa, Cake Snacks Plate"](https://sketchfab.com/3d-models/samosa-cake-snacks-plate-57baf38756304e7b979372500dac0e91)**
by **ronchoqa**, licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The samosa mesh was
extracted, stood upright and re-optimized by `tools/optimize-glb.mjs`; nothing
else from the original model ships.

### On-device touch checklist (not coverable by desktop tests)

- [ ] Joystick + swipe-look + held PUNCH all at the same time (3 fingers)
- [ ] No rubber-band scroll, no text selection, no double-tap zoom anywhere
- [ ] Nothing interactive under the Dynamic Island or home indicator
- [ ] Rotate overlay appears in portrait, game resumes in landscape
- [ ] Offline: airplane mode → app still launches from Home Screen
- [ ] Every control on the action arc is reachable with one thumb without
      covering another, and a tap between two of them reaches the world
