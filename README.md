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
| Swipe on right half | Look around (sensitivity in Settings) |
| PUNCH tap | Jab |
| PUNCH hold | Charge — a full charge levels a building |
| GRAB | Grab cars, props, rubble, people, weakened monsters; press again to throw |
| JUMP | Jump |
| TALK | Talk to whoever is in front of you |

Everything works simultaneously — move, look and punch at once.

## Live NPC dialogue (optional)

NPCs are fully voiced by built-in dialogue. If you want them powered by a
live LLM, paste a free [Groq](https://console.groq.com/keys) API key under
**Settings**. The key is stored only in your phone's local storage and is sent
only to `api.groq.com`. The client stays far inside Groq's free-tier limits
(15 requests/min, capped daily) and every NPC line still appears instantly —
model responses enrich future lines rather than delaying current ones.

## The game

- Dense downtown: four walkable blocks, ~30 buildings with interiors, lane
  traffic with working lights, hydrants, benches, trees, kiosks, dumpsters.
- Two city blocks are giant samosas — 33m of fried pastry apiece, and every bit
  as destructible as the offices around them. Punch one and you take a bite out
  of it; take enough out of the base and it comes down in a shower of crumbs.
- Everything is destructible: chunked facades, progressive top-down collapse,
  craters, bursting hydrants, felled streetlights, cars that crush and explode.
- 48 townsfolk live real days — commuting, shopping, eating, chatting — and
  panic properly: scattering, screaming, trampling, hiding indoors.
- Monsters arrive from the fog, eat pedestrians, and treat you as easy prey.
  Their moment of realization is yours to savor. Protect the city, join the
  chaos, or flatten all of it — the only judge is the karma meter.
- Nobody knows your strength until they witness it. Word spreads mouth to
  mouth, and fades. Monsters never get the memo — until they do.

## Development

Pure static site — no build step. Vanilla ES modules + three.js (vendored,
`vendor/three/`). GitHub Actions deploys `main` to Pages on every push.

```
tools/                # dev-only (node)
  make-icons.mjs      # icon set from the source artwork (full-bleed crop)
  optimize-glb.mjs    # Meshy/SAM GLB → compressed game assets
  process-textures.mjs# skybox seam-blend, splash/title WebP
  gen-sw.mjs          # regenerates sw.js (content-hash precache) — run before commits
  check-rig.mjs       # verifies all rigs share one skeleton
  test/serve.mjs      # local server mirroring the Pages subpath
  test/shot.mjs       # Playwright screenshot/assert driver
```

Local dev: `node tools/test/serve.mjs` → http://127.0.0.1:8080/Strongest-Man/
(desktop keys: WASD move, mouse-drag look, J punch/hold, K jump, L grab, E talk).

3D characters, monsters and several props were generated with Higgsfield
(SAM 3 3D lift + Meshy auto-rig + Meshy animation library); the skybox, splash
art, title art and app icon palette come from the same pipeline. Props that
failed visual QA were replaced with procedural palette geometry.

### Third-party assets

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
