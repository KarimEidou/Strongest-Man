# Assumptions

Every judgment call made without asking, and the reasoning behind it. Anything
here can be reversed; this file exists so that reversing it is an informed
decision rather than a discovery.

---

## 1. The work was built on a feature branch and then deployed from `main`

**The brief said `main`. The session's own git policy said
`claude/strongest-man-overhaul-u3t6bh` and "never push to a different branch
without explicit permission."** Those conflict, so everything was built on the
feature branch until permission was given, at which point `main` was
fast-forwarded onto it and pushed. The feature branch still exists and points at
the same commit — nothing was force-pushed and no history was rewritten.

**<https://karimeidou.github.io/Strongest-Man/> now serves this build**, and the
deploy was verified rather than assumed: the workflow is green, all 121 precached
URLs return 200 from the live origin, and all 120 precached files are
byte-identical to the local tree by sha256. `BLOCKERS.md` §2 has the table.

One distinction that has *not* gone away: the deployed site was never opened in a
browser, because Playwright's Chromium cannot reach any HTTPS host through this
environment's proxy. So "verified live" here means the bytes and the headers were
fetched and compared, not that a page was watched running. `BLOCKERS.md` says
which is which rather than letting the two blur.

## 2. The revert point is a branch, not a tag

`git push origin pre-overhaul-2026-08-26` (a tag) is refused with **HTTP 403** by
this session's credential, which is scoped to `refs/heads/*`. The same commit was
pushed as a **branch** of that name instead, which is functionally identical for
reverting and is what `tools/test/upgrade.mjs` uses as its "old build".

## 3. The museum is indestructible

This is a destruction sandbox and the gallery cannot be destroyed. §8.2 requires
collision that stays watertight from every angle, and a destructible shell cannot
be one; a gallery whose walls come down also takes four paintings with it.
Implemented as one guard in `removeSphere()`, the single funnel every cell
removal goes through. In fiction it is civic stone: punching it gives the sound
and the recoil and no hole.

**Reversible in one line** — delete `protected: true` from the `MUSEUM` spec in
`js/world/city.js`.

## 4. The museum lot is reserved, not chosen

The samosa landmarks pick whatever pair of lots the generator happened to lay
down. The gallery does not: a museum needs a fixed, findable address with a known
interior, so its footprint is reserved before the fill runs and the procedural
buildings are placed around it. This changes the layout of Market Side compared
to the previous build — the same seed now produces a different block, because
some `tryPlace()` calls that used to succeed now fail. That is expected and the
rest of the city is untouched.

## 5. The gallery interior is unlit, and the artwork planes are `MeshBasicMaterial`

§8.3 asks for "soft ambient fill plus a focused light per artwork" and then says
baked or cheap lighting is preferred on a mobile budget. Real lights were
measured against the constraint and rejected: the whole city shares one Lambert
program, so a light count is a program parameter — four spotlights would
recompile every material in town and then cost four extra per-pixel evaluations
on every surface of the city, forever, to light 60 m². The shared indoor constant
was rejected too: it is tuned for a room torn open by a punch and swings warm and
five times brighter after dark.

So the room is baked and unlit, with an additive gradient under each modelled
picture light. §8.4 explicitly permits `MeshBasicMaterial` for the canvases, and
it is what makes "evenly lit, no hotspot, no corner falloff, no specular glare"
true by construction rather than by tuning. Cost measured in `VERIFICATION.md`.

## 6. The artwork textures are NOT power-of-two

§7.4 asks for power-of-two textures. §8.4 forbids cropping, letterboxing,
stretching or squashing. These four drawings are 0.549–0.577 aspect, and the only
way to reach POT is to squash them. WebGL2 — which is what three r185 targets —
samples and mipmaps NPOT textures natively with no penalty, so **the native
aspect wins and POT is deliberately not applied here.** `tools/import-art.mjs`
re-checks the ratio after encoding and fails the run if it drifted.

## 7. Two derivatives per artwork

`<slug>.webp` at 1024 on the long edge is the DOM `<img>` inspect mode uses,
where the picture fills a 430 pt viewport at DPR 3 and costs no texture memory.
`<slug>_512.webp` is the in-world wall texture, where a canvas covers at most
~300 screen px and 512 is already oversampled. Four framed paintings then cost
~3 MB of VRAM instead of ~12. 168 KB on disk for all eight files.

## 8. The works are numbered, not titled

**Superseded by instruction.** Each work first carried a descriptive title
invented from its own drawing — the reasoning for each is still in
`docs/MUSEUM.md` — and the owner then asked for them to be numbered `I`–`IV`
instead, keeping `Inder` as the artist.

That is the better answer and it is worth saying why rather than just complying.
Every one of those titles was *this project's reading* of somebody else's
drawing, and a reading presented on a wall label is indistinguishable from the
artist's own words. A numeral makes no claim about the picture: it says only
that this is the first of four, which is a fact about the hang and is the
curator's to assert. Numbering is also a standing museum convention rather than
a fallback, and it sits consistently with the plaques reading `Undated` (§16c)
for exactly the same reason.

The numbers run in hanging order along the natural walkthrough, so the labels
and the route tell the same story. Titles live in `assets/art/plaques.json` and
are editable without touching code; the file slugs still carry the old
descriptive names because they are file keys, not titles.

## 9. The service worker calls `skipWaiting()`, and defers deleting old caches

The safe-looking choice — never `skipWaiting`, let the page offer a reload — was
implemented first and **failed the upgrade-path test**. A waiting worker only
activates when every client controlled by the old one is gone; a reload does not
release a client, and the build already deployed has no update UI of its own to
offer the waiting worker. The update reached nobody.

Taking over immediately *and* deleting the old cache in `activate` is the other
trap: the page still on screen is now controlled by a worker whose cache no
longer holds what that page will ask for next. Online it falls through to the
network; in airplane mode it breaks.

So: claim at once, and purge old caches at the **first navigation** this worker
handles — by which point the page reading the old cache is already being
replaced. A worker that starts with no window at all purges immediately. At most
one old cache is kept alive at any time. The player is still *offered* the reload
rather than yanked out of a session; this only makes sure the offer can be made.

**Measured:** two reloads from the old build to the new one, which is the floor —
the deployed worker is cache-first for navigations, so reload #1 is always served
the old HTML whatever the new build does.

## 10. `id` was removed from the manifest rather than corrected

`"id": "./"` resolves against the **origin**, not the manifest URL, so it
identified this app as `https://karimeidou.github.io/` — the whole origin, shared
with every other project hosted there. Omitting `id` entirely makes it default to
`start_url`, which resolves against the manifest and is exactly `/Strongest-Man/`
— correct, and with no absolute path anywhere.

## 11. iOS launch images are JPEG, and are not precached

Safari accepts PNG or JPEG for `apple-touch-startup-image`. The artwork is an
opaque gradient with no alpha to preserve, and mozjpeg takes the set from 776 KB
to ~420 KB.

They are **excluded from the service worker precache** because iOS fetches a
launch image when it *launches the app*, before any page or worker exists — it
never passes through the fetch handler, so precaching it is pure weight in every
visitor's first load.

There are 20 of them, one per distinct logical size iOS reports rather than one
per marketing name: a device with no exact `(device-width, device-height, dpr,
orientation)` match gets no launch image and flashes white, so a gap is a visible
defect on that phone.

## 12. The joystick now listens on the document, not on the canvas

The stick used to be claimed only by pointers landing on `#gl`, which made every
`pointer-events: auto` element of the HUD a permanent hole in it — and the holes
were not the buttons, they were the *containers*: the conversation panel is a
307×195 slab in the top-left, 97% of the stick's claim region, and a thumb
landing on it did nothing at all while the world kept simulating.

The listener is on `document` now and skips only real controls
(`button, input, select, textarea, a, label, [data-ui]`). This fixes the class of
bug rather than one instance, and it is why the gallery prompt could move to the
bottom centre where it reads best instead of being jammed into the right-hand
half to dodge the stick.

## 13. Speech bubbles may pass under the notch

`#bubbles` was inset by the safe area while `dialogue/bubbles.js` projects world
positions into it with `clientWidth`/`clientHeight` — so every bubble sat up to
59 px horizontally and 21 px vertically off its speaker's head on a notched
iPhone, and the error swapped sides when the phone was turned. The layer is
full-bleed now.

A transient balloon that strays under the Dynamic Island is a smaller problem
than one that is not attached to the person talking. Clamping to the safe box
would fix the wrong thing.

## 14. Playwright WebKit is not Mobile Safari

It is the closest automatable engine and it catches a different class of bug from
Chromium, and it is still a proxy: different JIT, different compositor, no
Safari-specific PWA behaviour, and no real GPU here (SwiftShader). Both engines
are captured and `VERIFICATION.md` says plainly which claims are emulated.

## 15. Safe-area insets are injected by the harness

No headless browser reports `env(safe-area-inset-*)`. The capture and layout
harnesses inject the real per-device values as the `--sa-*` custom properties the
CSS already reads, **asymmetrically**, and run both landscape orientations so the
notch swapping sides is genuinely exercised. This is emulation of a real
measurement, not the measurement.

## 16. `?capture=1` changes the game, deliberately

Fixed render dt, frozen day cycle, seeded `Math.random`, no camera shake, no
adaptive half-rate, the shadow map refreshed every frame rather than every third,
and the frame loop **suspended after its first render** so that everything
afterwards is driven by `__test.step()` and `__test.renderNow()`. The harness
additionally disables CSS transitions and animations.

Every one of those is there because a clock that is not the fixed step was
getting into the pictures. Measured, before they were: up to 142,000 differing
pixels between two runs of identical code. `VERIFICATION.md` §1 has the table.

The flag is test-and-capture only; nothing in normal play sets it, and the one
thing it changes that a player could notice — the shadow cadence — is a cost, not
an appearance.

## 16a. `tools/` is uploaded to Pages, and that is accepted

The workflow uploads `path: .`, which is what the brief specifies and what keeps
`.nojekyll` and the subpath working. That means `tools/` and the documents are in
the Pages artifact even though nothing ever requests them — about 300 KB of
`.mjs` that no visitor downloads, because the service worker's precache is an
explicit allow-list (`index.html`, `manifest`, `favicon`, `css`, `js`, `vendor`,
`assets`) and the page never links to them.

Staging a subset instead would mean a copy step between checkout and upload, and
a copy step is a place for a file to go missing on a deploy that nothing tests.
The cost of shipping the tools is a few hundred kilobytes in an artifact; the
cost of the alternative is a class of silent deploy bug. Verified: 121 precached
URLs, none of them under `tools/`, `docs/` or `screenshots/`.

## 16b. The screenshot matrix is not committed

602 captures, about 600 MB. This repository **is** the deployed site, so
committing them would put 600 MB into every clone and into the Pages artifact,
and Git LFS is not a way out — Pages serves the pointer file rather than the
object, which is a rule in the brief and would break the site besides.

What is committed is `screenshots/{before,after}/` — the subset the documents
cite, at 1100px WebP, about 2 MB — plus `final-report.json` and
`baseline-report.json`, which list every one of the 602 with its scene, device,
orientation and console output. The reports are the audit trail; the images are
the illustration. `tools/capture/capture.mjs` regenerates the matrix in about an
hour and a half.

## 16c. The plaques say "Undated", and that is not a placeholder

The four works are photographs of graphite drawings on paper — two of them carry
Inder's signature. The plaques carry numerals rather than titles (§8), which
sidesteps the question of putting a reading on someone else's image. A **date**
raises the same question and answers it worse: it is a claim of fact about
someone else's work, it is not known here, and the plaques therefore carry the
ordinary museum convention for that case rather than a year that would be made
up. The medium is a description, not a guess.

## 17. No webfont is bundled

The UI uses the system stack, which on the target device is San Francisco. A
webfont would cost every first load 30–100 KB, add a request that must work
offline, and land the project on a licence to track — to render a handful of
short uppercase labels in a face the phone already draws better. `docs/STYLE.md`
covers the type scale that replaces it.

## 18. The `sm_save_v1_corrupt` quarantine key

When a save blob fails to parse it is moved aside under that key rather than
deleted. It costs a few hundred bytes and it is the only evidence of what went
wrong. Nothing reads it; it is for a person with a console.

## 19. What "zero console errors" means here

Two messages are treated as harness noise and filtered by the capture harness,
each named explicitly in the code:

- `Service Worker registration blocked by Playwright` — Playwright announcing the
  harness's own `serviceWorkers: 'block'`.
- `KHR_parallel_shader_compile extension not supported` — SwiftShader lacking an
  extension real Safari has. The game now asks for the extension before using
  `compileAsync`, so this no longer appears at all.

Everything else counts, including warnings.

## 20. The Groq dialogue key stays a runtime, on-device setting

It is entered in Settings, stored under its own localStorage key, and sent only
to `api.groq.com`. Nothing about it was changed except that a corrupt save can no
longer delete it (see the note in `AUDIT.md`). No key is committed, and with no
key the NPCs use their built-in lines.

---

# The 2026-08-28 cleanup

## 21. The city is always daytime, and that needed TWO clocks rather than one

Pinning `game.timeOfDay` would have frozen more than the sky: `ai/schedule.js`
picks a goal from need curves that read it, so every pedestrian would have walked
towards a diner forever and never gone home, and every conversation would have
reported the same hour.

So `game.timeOfDay` keeps advancing and keeps running daily life, and a second
value, `game.skyTime`, is pinned to 0.50 — the one true-noon key in `SKY_KEYS`,
where `night` is 0.00 and the sun sits about 64 degrees up. `engine/sky.js`
samples that. `?time=` and `?fastday=` therefore move schedules only.

`?skytime=` is a new tooling-only flag that still moves the sky, so the capture
matrix can shoot a night frame; play never reaches it. `__test.setTimeOfDay`
drives both clocks, because it is the only way `tools/test/final.mjs` section 10
can sweep all 24 hours to assert the key light never dips below the horizon.

## 22. The samosa collider follows the crust, not the lot

`physics/collide.js` collides capsules against four bands. Those bands used to be
the LOT RECTANGLE for every building, which is right for a facade that fills its
lot and wrong for a cone inscribed in one: the fence ran the full 38 x 14 m lot
around a shape that reaches 32 x 10.5 m and curves away from it.

The bands now come from `shell.floorSpan`, the crust's own per-floor
cross-section, which `world/shell.js` measures while binning triangles. Columns
are mapped proportionally over the band's own span, which for a uniform taper is
identical to `cellKeyAt`'s radial mapping — so the collider and the visible crust
agree by construction rather than by a fudge factor.

Two things this deliberately does not do. It does not register the bands as
`addStaticBox()` solids, the way the museum's partition is: those have no removal
API and `pointInSolid` makes them permanently opaque to the camera and to
hitscan, and samosas are destructible. And it does not slow the ordinary path —
`bandOf` early-outs on one property read for a lot without a shell, which is
every building but two.

## 23. Nobody keeps score of you, so dialogue resolves on one fixed band

Karma and per-person reputation are gone, and `dialogue/talk.js` and
`dialogue/conversation.js` chose their lines from both. Every lookup now comes in
on `neutral`, which is the band `dialogue/lines.js` has an entry for in every
situation that survived, so the canned corpus still resolves with no key and the
Groq path still builds a prompt.

The corpus loses the situations nothing can reach (`thank`, `monster_spot`,
`insult`, `beg_mercy`, `talk_awe`, `talk_terror`, `monster_realize`,
`shop_closed`) and `greet` collapses to the one band still asked for. Ambient
chatter is chosen by proximity instead of by attitude: close enough and they
greet you, far enough and they talk to each other. `whisper_awe` still fires
occasionally, because watching a man lift a taxi is its own reason to whisper and
does not need a score behind it.

## 24. The rigs do not share a bind pose, and it is NOT corrected at load time

`tools/check-rig.mjs` compared bone names and order and printed MATCH, which is
how `anim/retarget.js`'s claim of an "IDENTICAL skeleton" survived being false.
It compares bind rotations now and prints the table: against the player's rig,
npc_a's Hips bind sits **120.4 degrees** away, its hands 46 and 38; npc_b is
104.4 and 59 / 57.

A clip carries absolute local rotations, so playing one on the wrong rig rotates
those bones by exactly that. It is measurable in play: `__test.skinTwist()`
reports the player's waist sitting 91 to 120 degrees from its own bind through
the whole 1.4 to 3.4 m/s band, where the `walk` and `quick` clips (npc_a's and
npc_b's) carry the weight, and under 20 degrees at a standstill and at a sprint,
where the clips are the player's own.

**A full bind-space retarget was built and measured, and not shipped.** It works
on paper and in the probe — per bone, `q_dst = D(parent)^-1 q_src D(b)` with
`D(b) = Bsrc(b)^-1 Btgt(b)` — and it collapses that 120 degrees to 9 across the
whole band. It also makes the player visibly hunch. Both are true at once because
the 120 degrees is very largely bone ROLL, which the clip's own downstream
rotations already compensate for: the composed pose was already right, and
re-basing it applies the correction twice. Isolating the halves confirmed it —
with the rotation rewrite disabled and only the pelvic-sway change in, the frame
is indistinguishable from the original.

So the mismatch stands, the tool records it, and `final.mjs` section 29 asserts
the two bands where clip and rig DO agree stay clean while recording the middle.
A future fix shows up there as a number that fell.

## 25. Which lots wear a downloaded building, and which keep their facade

`world/shell.js`'s `pickShellModel` fits a model to a lot with an INDEPENDENT
scale per axis, so the footprint comes out exactly the lot rectangle — which is
why the four-band collider is already correct and there is no gap between model
and lot for an invisible wall to live in. The cost is distortion, and two numbers
bound it: at most 1.8 in footprint anisotropy after choosing between the two
90-degree orientations, and at most 1.7x (or 1/1.7) of vertical stretch against
the horizontal mean.

A lot that no model fits inside those bounds keeps its procedural facade. How
many depends on the seed, because the lots do: 17 of 26 wear models on the
capture seed (42), 21 of 24 on the e2e suite's seed (7). **A mixed city is the
intended outcome, not a compromise** — it is identical to a fully converted one
except on the lots that fell back, and forcing a fit would mean either a uniform
inscribe (which is the shape of the samosa's invisible wall) or a model squashed
past what its windows survive. Four of the nine are 12 x 2 m slivers left behind
when a landmark swallowed its neighbour; nothing sensible wears a 2 m lot.

Where the shell has no geometry for a cell — a recess, a setback, or a parapet
the radial binning sent to a neighbouring column, 0 to 20 percent of cells
depending on the model — an ordinary lot gets a plain wall chunk instead. A patch
of blank wall against a modelled facade is a compromise; the black rectangle that
a hole in the facade produces is a bug.

## 26. A shelled building has no lit windows after dark

Lit windows come from `aSurface == SURF.WINDOW`, so a shell would need its
glazing triangles picked out of the palette atlas. **They cannot be, on these
models.** The atlas is a grid of gradient swatches, and measured across three of
the eight, every blue-dominant texel the geometry samples is a desaturated
blue-grey between saturation 0.19 and 0.23 — the walls and the windows are the
same family, and the saturated blue swatch is never used. A first attempt at a
luminance rule tagged 85% of the exterior and lit whole buildings like lanterns.

The state is unreachable in play: the city is always daytime and only `?skytime=`
gets there. The streetlamps still light these facades, because the shells are on
the world material rather than the GLB's own plain Lambert.

## 27. The window rolls are preserved byte for byte, and proven

`world/buildings.js` takes two conditional draws per cell from the seeded stream
it shares with props, traffic and the townspeople. The draw COUNT is load-bearing
— change it and every prop, car and person moves, and every screenshot becomes
unreviewable.

An ordinary lot rolls whether or not it ends up wearing a model, and a landmark
rolls not at all, which is exactly what happened before. Taking them on the
samosa lots too, which an earlier cut did, shifted the props from 126 to 120 and
moved everything else with them.

Proven rather than asserted. Every prop's type, position and scale; every car's
circuit and arc length; every townsperson's rig, archetype and walk speed; and
every interior wall's position, hashed before and after: **all four identical**,
and `propPlacement()` unchanged at 126 / 0 on road / 0 overlapping / 19 dropped.

## 28. The nav lattice was rebuilt, and that DOES move the props

Three defects, measured on the shipped seed: only 4 of 8 crossings existed (a
`Math.round` half-toward-positive-infinity asymmetry meant one kerb merged with
its neighbour and the other did not), the graph was in three disconnected
components, and eight waypoints stood in a traffic lane.

Fixing it changes the node SET, and `world/props.js` rejects any prop within
`r + 0.3` of a nav node — so prop placement legitimately shifts (128 to 126 live,
17 to 19 dropped). The seeded stream itself is untouched: the lattice is built
after `applyLandmarks` and consumes no `rand()`. Nothing on the road, nothing
overlapping, which is what the assertion actually protects.

