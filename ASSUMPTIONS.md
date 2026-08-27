# Assumptions

Every judgment call made without asking, and the reasoning behind it. Anything
here can be reversed; this file exists so that reversing it is an informed
decision rather than a discovery.

---

## 1. Work was pushed to the feature branch, not to `main`

**The brief says `main`. The session's own git policy says
`claude/strongest-man-overhaul-u3t6bh` and "never push to a different branch
without explicit permission."** Those conflict, and the branch policy is the one
that governs this session, so everything went to the feature branch.

The practical consequence: **the live site at
<https://karimeidou.github.io/Strongest-Man/> has not changed.** The deploy
workflow fires on pushes to `main` only. Merging the branch into `main` — a
one-click fast-forward, since the branch was cut from `main` and nothing else has
touched it — is what publishes this work.

That also means every "verified live" claim in `VERIFICATION.md` is a claim about
a local server mounted at the `/Strongest-Man/` subpath, not about the deployed
artifact. `BLOCKERS.md` says so plainly rather than letting the distinction blur.

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

## 8. Titles were invented from the images

Each of the four names something unambiguously present in its own drawing, and
the reasoning for each is written out in `docs/MUSEUM.md`. There was no case
where the subject could not honestly be read, so no work is `Untitled`. Titles
live in `assets/art/plaques.json` and are editable without touching code.

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
Inder's signature. The titles are the game's invention and `docs/MUSEUM.md` says
so and says what each is drawn from; a title is a reading of an image. A **date**
is a claim of fact about someone else's work, and it is not known here, so the
plaques carry the ordinary museum convention for that case rather than a year
that would be made up. The medium is a description, not a guess.

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
