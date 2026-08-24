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
| TALK | Start a conversation with whoever is in front of you — type and they answer. Press again to end it |

Everything works simultaneously — move, look and punch at once.

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
`api.groq.com`. Ambient street barks stay instant and canned — only the
conversation waits on the model — and the client stays far inside Groq's free
tier. With no key the panel still opens and answers from the built-in corpus.

## Graphics

**Settings → Graphics** picks a tier. **High** (the default) is everything:
procedural surface detail, real sun shadows, a procedural sky with drifting
clouds, and sun shafts. **Auto** measures the device on first boot.

## The game

- Dense downtown: four walkable blocks, ~30 buildings with interiors, lane
  traffic with working lights, hydrants, benches, trees, kiosks, dumpsters.
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
  test/final.mjs      # full end-to-end suite (waits on sim time, not wall clock)
  test/bench.mjs      # frame-hitch benchmark: worst-frame, not average fps
```

Local dev: `node tools/test/serve.mjs` → http://127.0.0.1:8080/Strongest-Man/
(desktop keys: WASD move, mouse-drag look, J punch/hold, K jump, L grab, E talk).

3D characters, monsters and several props were generated with Higgsfield
(SAM 3 3D lift + Meshy auto-rig + Meshy animation library); the skybox, splash
art, title art and app icon palette come from the same pipeline. Props that
failed visual QA were replaced with procedural palette geometry.

### On-device touch checklist (not coverable by desktop tests)

- [ ] Joystick + swipe-look + held PUNCH all at the same time (3 fingers)
- [ ] No rubber-band scroll, no text selection, no double-tap zoom anywhere
- [ ] Nothing interactive under the Dynamic Island or home indicator
- [ ] Rotate overlay appears in portrait, game resumes in landscape
- [ ] Offline: airplane mode → app still launches from Home Screen
