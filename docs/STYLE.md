# UI style

The rules the HUD and every overlay follow, and the reasoning where the reasoning
is not obvious. This describes what `css/main.css` actually does; where the two
disagree, the CSS is wrong.

---

## Palette

Sampled from the app icon, so the shell and the game are the same object.
Declared once as custom properties on `:root`.

| Token | Value | Used for |
|---|---|---|
| `--navy-bg` | `#0d1b3e` | every panel background, the theme colour, the manifest background |
| `--ink` | `#eaf2ff` | body text on dark |
| `--blue-deep` | `#003090` | — |
| `--blue` | `#1848c0` | loading gradient |
| `--blue-mid` | `#1878d8` | panel borders, field borders |
| `--blue-bright` | `#3090f0` | positive karma, secondary control borders, focus |
| `--blue-sky` | `#48a8f0` | — |
| `--orange` | `#d89048` | player speech |
| `--orange-bright` | `#f0a860` | **the action colour**: primary buttons, the armed state, points |
| `--orange-deep` | `#c07830` | primary button gradient foot, negative karma |
| `--orange-shadow` | `#904818` | the 4px seat under a primary button |

Semantic colours outside the token set, used only where they carry meaning:
health green `#6ef0a8`→`#23b673`, hurt amber `#ffd06a`→`#e08a2a`, critical red
`#ff9a7a`→`#d02c2c`, loss `#ff8a6a`, gain `#7ef0a8`.

**Orange means "you can act on this."** Blue means "this is state." Nothing else
is orange, which is why the PUNCH button, the armed weapon chip, the points
readout and the gallery prompt all read as one family.

### Contrast

Body text is `--ink` on `--navy-bg`: **14.9:1**. Every panel clears AA
comfortably because every panel is opaque.

The HUD is the hard case, because it sits over gameplay whose brightness runs
from a midday sky to a moonlit street. A text shadow is **not** contrast — it
raises legibility against some backgrounds and none against others, and it cannot
be measured. So the two top-centre readouts that used to rely on one
(`#karma-label` at 1.90:1 and `#rep-hint` at 1.66:1 against the rendered sky) now
sit on `rgba(6,12,30,0.72)` plates, which puts them past AA against anything the
sky can do.

Readouts whose background is under our control (the HP bar, the ammo box, the
toast, every panel) carry their own opaque or near-opaque backing.

**Nothing is encoded in hue alone.** Health is a bar length *and* a colour *and*
a number. Karma is a bar position *and* a colour *and* a word. Weapon selection
is a border *and* a fill. A stock dialogue line is a colour *and* a different
bullet *and* the words "(stock reply)". The one place hue was doing the work
alone — the canned-vs-live distinction in the chat log, where the marker rule
was a byte-for-byte duplicate of the rule above it — is fixed.

---

## Spacing

**4 / 8 / 16 / 24 / 32.** Edge insets are 8 or 10; gaps within a cluster are 8 or
12; panel padding is 20/26; sections are separated by 16.

Positions in the HUD that are not on the scale are *derived*, and each carries the
arithmetic in a comment. The bottom-right cluster is the example:

```
#btns    right 10, bottom 14, 162 x 152   (64 + 12 + 86 wide, 54 + 12 + 86 tall)
         → occupies right 10..172, bottom 14..166
#ammo    right 182, bottom 22             (left of the cluster, at its height)
#weapons right 10,  bottom 174            (above the cluster, wrapping upward)
```

`182` and `174` are not arbitrary — they are `172 + 10` and `166 + 8`. A derived
number with its derivation written down is better than a round number that is
wrong.

The top edge works the same way, and one rule governs it:

```
#btn-pause    top 8, right 8,   44 x 44    → the row is 8..52 tall
#btn-shop     top 8, right 62              (8 + 44 + 8, the cluster gutter)
#btn-gallery  top 8, right 137             (62 + 67.2 + 7.8, same gutter)
#karma-wrap   top 8, centred, 200 wide     → ends 16.1px short of #btn-gallery
                                             at 667x375, the tightest viewport
#rep-hint     top 56                       (52 + 4, BELOW the row)
#toast        top 86                       (74 + 12, the gap it always had)
```

**Nothing in the centre stack may start inside the button row's 8..52 band.**
`#rep-hint` used to sit at 42, ten pixels inside it, and looked fine for as long
as the middle of that row was empty — both buttons were pinned to the right edge
and the longest reputation string stopped short of them. Adding a third button
filled exactly the gap the text ran through, and it was drawn under a control.
The overlap was always there; only the collision was new. `layout.mjs` asserts
the pairs now.

---

## Type

**No webfont.** `-apple-system, "SF Pro Display", "Helvetica Neue", Arial,
sans-serif` — San Francisco on the target device, already installed. See
`ATTRIBUTIONS.md` for why.

**One exception, and it is a legibility fix rather than a flourish.** The four
museum works are numbered `I`–`IV`, and a Roman `I` in San Francisco is a bare
vertical stroke — a tick, a divider, a text cursor, anything but a number. So the
three places the game prints a work's title are set in `Georgia, "Times New
Roman", Times, serif`: the wall label (drawn to a canvas in
`js/world/museum.js`), the proximity prompt, and the inspect caption. Serifs are
what make an `I` a one, and it is also the convention a real wall label follows —
the number gets serifs, the catalogue data under it does not. Still no webfont:
both faces ship on the target device and the fallback is the platform serif.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Loading title | 40 | 900 | 3 |
| Panel heading | ~19–21 | 700 | 3 |
| Primary button | 17 | 900 | 2 |
| **Work numeral** (serif) | 15 prompt / 21 caption | 700 | 2–3 |
| **Any text input** | **16** | 400 | — |
| Panel body / row label | 14 | 400 | — |
| Chat line, bubble | 13 | 400 | — |
| Action button | 11–13 | 800 | 1 |
| Chip, small button | 10–12 | 800 | 1–1.5 |
| HUD number | 11–15 | 800–900 | 1 |
| Caption, hint | 9.5–11 | 400–700 | 0.5–2 |

**16px on every text input is a hard rule, not a preference.** Below 16, iOS
zooms the viewport on focus, and with `user-scalable=no` in the viewport meta
there is no way for the player to zoom back out — they are left typing into a
page stuck at 1.3×. The chat field was 15px with a comment calling it
"16px-ish"; it was not close enough.

Nothing smaller than 9.5px ships, and nothing below 11px carries information the
player needs mid-fight.

### Long strings

Containers flex or truncate; none clip. `#rep-hint`, `#toast`, `#art-prompt` and
`#update-banner` take a `max-width` off the safe box and use
`text-overflow: ellipsis`. `#points-row` is `nowrap` — a payout label used to
push the `+N` chip onto a second line, away from the score it modifies. The
`hud-stress` capture state exists to photograph all of it at once: 1 hp, eight
digits of score, a full weapon rail, an empty magazine, the longest reputation
string and the longest toast, at 667×375.

---

## Control states

Every interactive control has **default, pressed, disabled** and, where it
applies, **selected**.

| | |
|---|---|
| Pressed | `:active` — a lighter fill, and a 2px drop on buttons with a seat |
| Disabled | `opacity: 0.4`, `[disabled]` |
| Selected | orange border + orange wash (`.wchip.on`, `.abtn.armed`, `.gun-buy.equipped`) |
| Held | `.held`, added on pointerdown and removed on up, cancel **or lostpointercapture** |

**No `:hover` anywhere.** On iOS a hover state sticks after a tap and leaves the
control looking permanently pressed with no way to clear it.
`tools/capture/layout.mjs` greps the stylesheet and fails the run if a `:hover`
rule reappears.

`-webkit-tap-highlight-color: transparent` removes the system's own tap flash, so
every control has to provide its own — `:active` on all of them is not polish, it
is the replacement for the thing that was removed.

`.gun-buy.equipped[disabled]` is explicitly `opacity: 1`. It is disabled because
there is nothing to do, not because it is unavailable — it is the readout telling
you what is in your hands, and dimming it made the one thing you most need to
read the faintest thing in the panel.

---

## Touch

- **44 × 44 CSS px minimum**, in both axes, for anything tappable. The *visual*
  pill may be smaller; the target may not. `.wchip` is the clearest case: a 10px
  label inside a 44px box.
- `tools/capture/layout.mjs` measures every control in every state on every
  viewport in both orientations and fails on any that is short.
- `touch-action: none` on `html`, `body`, the canvas and every control;
  `pan-y` on the two things that must scroll (the chat log and the overlay
  panels), because `none` on the ancestors would otherwise stop them.
- `overscroll-behavior: none`, `-webkit-user-select: none`,
  `-webkit-touch-callout: none`, `-webkit-tap-highlight-color: transparent`.
- `gesturestart` / `gesturechange` / `gestureend` and `dblclick` are
  `preventDefault`ed, which is what kills pinch and double-tap zoom.
- Multi-touch is the normal case: the joystick and every action button own their
  own pointer id, so move + punch + look work together.
- The joystick claims any pointer that is **not** on a control
  (`button, input, select, textarea, a, label, [data-ui]`). Listening on `#gl`
  alone made every HUD container a hole in the stick.

---

## Safe areas

```css
--sa-t: env(safe-area-inset-top, 0px);   /* and -r, -b, -l */
```

`#hud` and every overlay panel are inset by all four. **Two layers deliberately
are not**, and the exception matters:

- `#bubbles` — speech balloons are projected from world space with the layer's
  own `clientWidth`/`clientHeight`, so insetting the layer detaches every bubble
  from the head it belongs to.
- `#aim-layer` — the crosshair marks the centre of the **canvas**, because that
  is what the shot is built from. 50% of the safe box is not 50% of the canvas:
  inset, the mark sat 29.5px from where the round went on a notched iPhone, and
  flipped sides when the phone was turned.

In landscape the notch inset is on the **left or the right depending on which
way the phone is turned**, and the bottom inset is the home indicator. Nothing
interactive may sit in the bottom 20px, where the OS eats the touch for its own
swipe gesture. Both orientations are captured and measured for exactly this
reason.

---

## Layers

| z | What |
|---|---|
| — | `#gl`, the canvas, full bleed |
| 5 | `#bubbles` — full bleed |
| 8 | `#vignette` |
| 9 | `#aim-layer` — full bleed |
| 10 | `#hud` — safe-area inset |
| 12 | `#chat` |
| 14 | `#down-banner` — above the chat, because going down is the most important thing the HUD can say |
| 20 | `#title-screen`, `#settings-screen`, `#pause-screen`, `#shop-screen` |
| 30 | `#loading` |
| 35 | `#inspect` |
| 38 | `#update-banner` — above every panel so it can be taken from a paused game |
| 39 | `#update-dismiss` |
| 40 | `#rotate-overlay` — a hard input block, and the only thing on screen when the phone is the wrong way round |

---

## Motion

Transitions are 0.12–0.4s and carry state changes only. Three animations loop:
the critical-health pulse, the rotate icon, and the scream shake on a bubble.

All three are disabled under `prefers-reduced-motion: reduce`, along with every
transition. That is a vestibular accessibility setting, not a preference about
polish — and nothing is lost, because every state those animations carry is also
carried by colour, shape or words.

---

## Loading, empty and error states

Every screen has all three; none is a blank rectangle.

- **Loading** — `#loading` with a real progress fraction and the name of what is
  being loaded.
- **Boot failure** — the same panel becomes an error state with the reason and a
  RELOAD button, driven by a 90-second watchdog and by `error` /
  `unhandledrejection` handlers registered before the first `await`. An opaque
  overlay with no way out is the worst failure this app can have, and on an
  installed PWA there is not even a URL bar to reload from.
- **Empty** — the armoury with nothing affordable shows every gun with its price
  and a disabled button, never an empty list.
- **Error** — the Groq key test prints whatever the server said, verbatim. A
  failed purchase marks that row UNAVAILABLE rather than silently doing nothing.
- **Offline** — the whole game is precached, so offline is not an error state.
