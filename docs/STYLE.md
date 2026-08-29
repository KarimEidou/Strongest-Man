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
| `--blue-bright` | `#3090f0` | secondary control borders, focus |
| `--blue-sky` | `#48a8f0` | — |
| `--orange` | `#d89048` | player speech |
| `--orange-bright` | `#f0a860` | **the action colour** in the shell: primary buttons, the gallery prompt |
| `--orange-deep` | `#c07830` | primary button gradient foot |
| `--orange-shadow` | `#904818` | the 4px seat under a primary button |

**Orange means "you can act on this."** Blue means "this is state." That rule
governs the SHELL — the title screen, the panels, the gallery prompt.

### The HUD's own surface language

The in-game HUD is a separate, smaller vocabulary, because it has a job the shell
does not: it sits over gameplay and has to stay legible against a white crossing
stripe and a shadowed wall in the same frame.

Every control is the same three things — **a translucent dark disc, one thin
bright rim, and a soft inner glow that dies before it reaches the rim.** The glow
stopping short is what makes a control read as a lit piece of glass with a hard
edge rather than as a fat soft outline.

| Token | Value | Used for |
|---|---|---|
| `--hud-glass` | `rgba(9,17,38,0.58)` | the disc |
| `--hud-glass-lit` | `rgba(28,48,92,0.72)` | the disc, pressed or held |
| `--hud-rim` | `rgba(255,252,244,0.88)` | the bright edge on the primary and the joystick |
| `--hud-rim-soft` | `rgba(230,240,255,0.58)` | the bright edge on everything else |
| `--hud-edge` | `rgba(4,9,24,0.55)` | a 1px dark ring OUTSIDE the bright rim |
| `--hud-gold` | `#f2dfae` | the joystick nub, the charge sweep, the pressed rim |
| `--hud-gold-dim` | `rgba(242,223,174,0.30)` | the charge sweep's unfilled track |
| `--hud-glow` | `rgba(150,190,255,0.20)` | the inner falloff |

Two of these exist for reasons that are not obvious.

`--hud-edge` is the dark ring outside the bright one. Without it the rim is the
only edge the control has, and over sunlit concrete a near-white rim on a
translucent plate has nothing to sit against. The dark ring is what makes the
same control read on asphalt and on a crossing stripe.

The accent is a **pale gold rather than the shell's orange**. On this HUD orange
no longer means anything: the one thing it marked, the shop, is gone. Gold
against the navy glass is what reads at arm's length in daylight, and it is
reserved for the two things that are *live* — the joystick nub under your thumb,
and the charge filling behind PUNCH.

**Alpha, never `opacity`.** Every value above is an alpha on a colour. Fading a
control with `opacity` would take its rim and its glyph down with the plate, and
the rim is the part that has to survive.

### Contrast

Body text is `--ink` on `--navy-bg`: **14.9:1**. Every panel clears AA
comfortably because every panel is opaque.

The HUD is the hard case, because it sits over gameplay. A text shadow is **not**
contrast — it raises legibility against some backgrounds and none against others,
and it cannot be measured. Two top-centre readouts once relied on one and
measured 1.90:1 and 1.66:1 against the rendered sky; the rule that came out of
that is the one the surface language above encodes: **every HUD element carries
its own plate.** The translucent disc is a measurable backing, and the dark ring
outside its bright rim is what stops the rim itself washing out over concrete.

**Nothing is encoded in hue alone.** A pressed control is a lighter fill *and* a
gold rim. The charge is a colour *and* an arc length. A stock dialogue line is a
colour *and* a different bullet *and* the words "(stock reply)". The one place
hue was doing the work alone — the canned-vs-live distinction in the chat log,
where the marker rule was a byte-for-byte duplicate of the rule above it — is
fixed.

---

## Spacing

**4 / 8 / 16 / 24 / 32.** Edge insets are 8 or 10; gaps within a cluster are 8 or
12; panel padding is 20/26; sections are separated by 16.

Positions in the HUD that are not on the scale are *derived*, and each carries the
arithmetic in a comment. The action arc is the example, and it is derived in
**both** directions:

```
primary r 44, secondary r 28, one gap of 14 used everywhere
arc radius R = 44 + 14 + 28 = 86
angular step so two ADJACENT secondaries clear by that same 14:
  chord = 2 R sin(step/2) >= 28 + 28 + 14 = 70
  step >= 2 asin(70/172) = 48.03deg          -> 48deg, which lands it exactly

#btns  right 10, bottom 14, 162 x 157        -> occupies right 10..172
PUNCH  d 88  centred (44, 44)                   right   0    bottom   0
JUMP   d 56  at   4deg -> (129.8,  50.0)        right 101.8  bottom  22.0
GRAB   d 56  at  52deg -> ( 96.9, 111.8)        right  68.9  bottom  83.8
TALK   d 56  at 100deg -> ( 29.1, 128.7)        right   1.1  bottom 100.7
```

Centre-to-centre, every pair: PUNCH to each 86.0 against 72 of radius, so 14
clear; JUMP–GRAB and GRAB–TALK 70.0 against 56, so 14 clear; JUMP–TALK 127.8
against 56.

**It is not enough for each secondary to clear the primary — they have to clear
each other.** The first cut of this arc spaced every button off PUNCH correctly
and had TALK overlapping GRAB by 11.5px and GRAB overlapping JUMP by 12.9px: two
44pt targets sharing pixels, which is worse than either of them being small.
`layout.mjs` asserts all five touching pairs.

The container stays **162** wide although the arc only needs 157.8, because
`#art-prompt`'s `max-width` is derived from this box's 172px right edge:

```
#art-prompt  centred, bottom 14, max-width calc(100% - 344px)
             a centred width W spans (100% - W)/2 .. (100% + W)/2, so staying
             left of the cluster's 100% - 172 needs W <= 100% - 344
```

A derived number with its derivation written down is better than a round number
that is wrong.

The top edge works the same way:

```
#btn-pause    top 8, right 8,   44 x 44    -> the row is 8..52 tall
#btn-gallery  top 8, right 62              (8 + 44 + 10, the cluster gutter plus
                                            the 1.5px rim on each side)
#toast        top 60                       (52 + 8, BELOW the row)
```

**Nothing in the centre stack may start inside the button row's 8..52 band.** A
top-centre readout used to sit at 42, ten pixels inside it, and looked fine for
as long as the middle of that row was empty — every button was pinned to the
right edge and the longest string stopped short of them. Adding a button filled
exactly the gap the text ran through, and it was drawn under a control. The
overlap was always there; only the collision was new. `layout.mjs` asserts the
pairs now.

### Overlap is tested by SHAPE, not by box

`layout.mjs` compares two circular controls by centre distance against the sum of
their radii, a circle and a rectangle by the rectangle's nearest point, and two
rectangles by their extents. The rectangle case is the original test.

This is not a loosened check, it is a truthful one. A browser hit-tests
`border-radius`, so a tap in the corner of a round control's box falls through to
whatever is underneath. Four circles on an arc are diagonal neighbours whose
**boxes** touch — the arc above overlaps by 19x4px in the corner — while the
circles themselves clear by 14. Reporting that would push the design around for
nothing. Verified both ways: tightening the arc until two circles genuinely
intersect still fails the run.

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
| Action button | 11 secondary / 13 primary | 800 | 1 |
| Chip, small button | 10–12 | 800 | 1–1.5 |
| Caption, hint | 9.5–11 | 400–700 | 0.5–2 |

**16px on every text input is a hard rule, not a preference.** Below 16, iOS
zooms the viewport on focus, and with `user-scalable=no` in the viewport meta
there is no way for the player to zoom back out — they are left typing into a
page stuck at 1.3×. The chat field was 15px with a comment calling it
"16px-ish"; it was not close enough.

Nothing smaller than 9.5px ships, and nothing below 11px carries information the
player needs mid-fight.

### Long strings

Containers flex or truncate; none clip. `#toast`, `#art-prompt` and
`#update-banner` take a `max-width` off the safe box and use
`text-overflow: ellipsis`.

An action button's label is checked differently, and harder:
`tools/test/final.mjs` puts the four corners of the label's own text rect through
the **ellipse** equation of its circle. A label that fits the bounding box but
pokes out of the circle fails. THROW in a 56px circle is the tight case, and it
is checked by name. This is also why each of the four buttons must keep a **bare
text node** as a direct child — the test reads it with a `Range`, and wrapping
the label in a `<span>` throws.

The `hud-stress` capture state photographs the worst case at 667x375: GRAB
reading THROW, the charge ring full and the longest toast on screen at once.

---

## Control states

Every interactive control has **default, pressed, disabled** and, where it
applies, **selected**.

| | |
|---|---|
| Pressed | `:active` — a lighter fill, and a 2px drop on buttons with a seat |
| Disabled | `opacity: 0.4`, `[disabled]` |
| Selected | gold rim + lit glass (`.abtn.armed`) |
| Held | `.held`, added on pointerdown and removed on up, cancel **or lostpointercapture** — same treatment as `:active` |

**No `:hover` anywhere.** On iOS a hover state sticks after a tap and leaves the
control looking permanently pressed with no way to clear it.
`tools/capture/layout.mjs` greps the stylesheet and fails the run if a `:hover`
rule reappears.

`-webkit-tap-highlight-color: transparent` removes the system's own tap flash, so
every control has to provide its own — `:active` on all of them is not polish, it
is the replacement for the thing that was removed.

---

## Touch

- **44 × 44 CSS px minimum**, in both axes, for anything tappable. The *visual*
  pill may be smaller; the target may not. The action arc runs 88 / 56 / 56 / 56;
  the two top-right plates are 44 tall.
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
| 10 | `#hud` — safe-area inset |
| 12 | `#chat` |
| 20 | `#title-screen`, `#settings-screen`, `#pause-screen` |
| 30 | `#loading` |
| 35 | `#inspect` |
| 38 | `#update-banner` — above every panel so it can be taken from a paused game |
| 39 | `#update-dismiss` |
| 40 | `#rotate-overlay` — a hard input block, and the only thing on screen when the phone is the wrong way round |

---

## Motion

Transitions are 0.12–0.4s and carry state changes only. Two animations loop: the
rotate icon and the scream shake on a bubble.

Both are disabled under `prefers-reduced-motion: reduce`, along with every
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
