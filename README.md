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
| FIRE | The same button, with a weapon out. Tap for semi-auto, hold for full-auto |
| Weapon strip (bottom centre) | FISTS, or any gun the armoury has sold you |
| GRAB | Grab cars, props, rubble, people, bodies, weakened monsters; press again to throw |
| JUMP | Jump |
| TALK | Start a conversation with whoever is in front of you — type and they answer. Press again to end it |
| SHOP | The armoury. Spend points on guns |

Everything works simultaneously — move, look and shoot at once.

## Points, health and the armoury

The city pays for spectacle. A monster is worth 300, a levelled building 450, a
wrecked car 90, and every wall cell you take out is worth something; killing
townsfolk costs you. Points are spendable and persist between sessions — the
lifetime total never goes down.

**SHOP** opens the armoury: six weapons, from a free sidearm to a 15,000-point
explosive cannon, each with its own damage, rate of fire, spread, magazine and
range. Buying one equips it; the weapon strip along the bottom of the HUD
switches between them and bare hands instantly.

The health bar is not a difficulty knob. Nothing in the city can hurt him except
a monster's hands, a building coming down on him, and his own explosive rounds.
A monster that still thinks he is prey cannot meaningfully hurt him — it gives
back more between swings than it takes with them. Two of them can. And one that
has *seen* what he is and comes at him anyway can put him on the floor before its
rage burns out, which is what makes the realization worth having. Going down is a
setback and never a game over: he gets up where he fell, at half health, a tenth
of his spendable points lighter.

## Guns

Hitscan, so the frame you tap the thing you were pointing at takes the hit, with
a tracer drawn from the muzzle to wherever the round stopped. Muzzle flash,
impact flashes and sparks, blood, and heavy rounds chip the facade behind what
they hit. Aim comes off the camera — where you are looking is where it goes —
with generous assist onto anything near the crosshair, because this is a game
played with a thumb.

Shooting a monster does **not** give it the realization. Anyone can own a gun.
It makes it hostile: it drops whoever it was eating and comes for you, and finds
out what it has been fighting when it finally lands a hand on you.

## Live NPC dialogue (optional)

NPCs are fully voiced by built-in dialogue with no setup. Paste a free
[Groq](https://console.groq.com/keys) API key under **Settings** and TALK
becomes a real conversation: type anything and the person in front of you
answers in character. They know who they are, whether they have actually *seen*
what you can do, what the city thinks of you, which district you are standing in
and what time it is — so the same person answers very differently before and
after they watch you throw a taxi. They stop walking, turn to face you and
gesture while they speak; a monster arriving or a building coming down ends the
conversation the way it would in life.

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
- Monsters arrive from the fog, eat pedestrians, and treat you as easy prey.
  Their moment of realization is yours to savor. Protect the city, join the
  chaos, or flatten all of it — the only judge is the karma meter. They carry
  their health over their heads once something has taken a piece out of them,
  they flinch when hit, and their hands are the only thing in town that can put
  you on the floor.
- Nobody knows your strength until they witness it. Word spreads mouth to
  mouth, and fades. Monsters never get the memo — until they do.

## The City Gallery

There is a small municipal art gallery on the north-west block, and it is the one
building in town that is not there to be knocked down. Walk in and four drawings
by **Inder** are hung on the walls, each with a proper museum plaque — title,
artist, date, medium. Stand in front of one and a prompt appears; take it and the
work fills the screen at its own aspect ratio, where you can pinch to zoom and
drag to pan around it. Double-tap resets.

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

### Documents

| | |
|---|---|
| [AUDIT.md](AUDIT.md) | every defect found, with repro and resolving commit |
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
(desktop keys: WASD move, mouse-drag look, J punch/fire, K jump, L grab, E talk,
Q cycle weapon).

3D characters, monsters, the hydrant, the bench and the dumpster were generated
with Higgsfield (SAM 3 3D lift + Meshy auto-rig + Meshy animation library); the
skybox, splash art, title art and app icon palette come from the same pipeline.

### Third-party assets

Street furniture, the traffic and the weapons are **[Kenney](https://kenney.nl)**
CC0 packs, imported by `tools/import-models.mjs` — see
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
- [ ] FIRE held with an auto weapon while the joystick is moving and the other
      thumb is swiping to aim (3 fingers, all three doing their job)
- [ ] The weapon strip is reachable without covering the joystick or the
      buttons, and a tap on it never also drives the character
