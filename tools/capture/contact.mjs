// The committed evidence set.
//
//   node tools/capture/contact.mjs
//
// The full matrix is 602 PNGs and roughly 600 MB. None of that belongs in a
// public repository that is also the deployed site — and Git LFS is not an
// option here, because GitHub Pages serves the pointer file rather than the
// object. So the matrix stays local (it is in .gitignore) and this writes the
// subset that the documents actually cite, downscaled and re-encoded, plus the
// two report.json files that ARE the audit trail: every capture, its scene, its
// device, its orientation and whether it logged anything.
//
// The pairs come first, because a before/after is the only kind of screenshot
// that proves something on its own. Everything after them is a single frame of
// something that did not previously exist.
import sharp from '../node_modules/sharp/lib/index.js';
import { readdirSync, mkdirSync, existsSync, rmSync, copyFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const FINAL = join(root, 'screenshots', 'final');
const BASE = join(root, 'screenshots', 'baseline');
const OUT = join(root, 'screenshots');

const WIDTH = 1100;      // legible on a laptop, ~70 KB a frame
const QUALITY = 80;

// scene -> which viewport tells its story best
const PAIRS = [
  ['hud-idle', 'ip16pro', 'landscape-left', 'The HUD at rest. Before: the crosshair is centred on the safe box, not the canvas.'],
  ['hud-bright', 'se3', 'landscape-right', 'Midday, smallest screen. Before: the karma and reputation readouts sit at 1.90:1 and 1.66:1 against the sky.'],
  ['shop', 'se3', 'landscape-left', 'The armoury at 667x375. Before: DONE — the only way out — is entirely below the fold.'],
  ['pause', 'ip16pro', 'landscape-left', 'Paused. Before: the panel is 20px taller than the viewport and loses its top and bottom borders.'],
  ['settings', 'ip14', 'landscape-left', 'Settings. Before: every row control is under the 44pt minimum.'],
  ['street', 'ip16pro', 'landscape-right', 'The city at dusk. Before: no specular anywhere — the lobe never compiled.'],
  ['hud-dark', 'ip16pro', 'landscape-left', 'Night. The floor under the night keyframes, and HUD contrast against the darkest the city gets.'],
  ['title', 'ip16promax', 'landscape-right', 'The title screen.'],
  ['loading', 'ip14', 'landscape-left', 'Boot. Before: a progress bar with no way out if boot throws.'],
];

// new-build-only: there was nothing to photograph before
const SOLO = [
  ['museum-exterior', 'ip16pro', 'landscape-left', 'The City Gallery from the street.'],
  ['museum-entrance', 'ip16pro', 'landscape-left', 'The doorway.'],
  ['museum-hall', 'ip16pro', 'landscape-left', 'The main hall: two works, picture lights, benches, stanchions.'],
  ['museum-hall-wide', 'ip16pro', 'landscape-left', 'The hall from the door — floor, lining, picture rail, cornice, ceiling.'],
  ['museum-alcove', 'ip16pro', 'landscape-left', 'Through the partition into the alcove, and the prompt.'],
  ['museum-prompt', 'se3', 'landscape-left', 'The prompt on the smallest screen, clear of the ammo readout.'],
  ['art-the-visitor', 'ip16pro', 'landscape-left', 'The Visitor, head on.'],
  ['art-riverbank', 'ip16pro', 'landscape-left', 'Riverbank, head on.'],
  ['art-reach', 'ip16pro', 'landscape-left', 'Reach, head on.'],
  ['art-the-reader', 'ip16pro', 'landscape-left', 'The Reader, head on.'],
  ['plaque-the-visitor', 'ip16pro', 'landscape-left', 'A plaque up close: title, artist, date, medium.'],
  ['inspect-the-visitor', 'ip16pro', 'landscape-left', 'Inspect mode: The Visitor at its own aspect ratio.'],
  ['inspect-riverbank', 'ip16pro', 'landscape-left', 'Inspect mode: Riverbank.'],
  ['inspect-reach', 'ip16pro', 'landscape-left', 'Inspect mode: Reach.'],
  ['inspect-the-reader', 'ip16pro', 'landscape-left', 'Inspect mode: The Reader.'],
  ['hud-stress', 'ip16pro', 'landscape-left', 'Everything that can overflow, at once: 1 hp, eight digits, the full weapon rail, an empty magazine, the longest reputation string and the longest toast.'],
  ['hud-down', 'se3', 'landscape-left', 'Going down, and what it costs.'],
  ['landmark', 'ip16pro', 'landscape-left', 'One of the two giant samosas.'],
  ['rotate', 'ip16pro', 'portrait', 'Portrait: a hard input block, and the only thing on screen.'],
  ['wk_museum-hall', 'ip16pro', 'landscape-left', 'The same hall in WebKit, which is the engine an iPhone actually uses.'],
];

if (existsSync(join(OUT, 'after'))) rmSync(join(OUT, 'after'), { recursive: true, force: true });
if (existsSync(join(OUT, 'before'))) rmSync(join(OUT, 'before'), { recursive: true, force: true });
mkdirSync(join(OUT, 'after'), { recursive: true });
mkdirSync(join(OUT, 'before'), { recursive: true });

const shrink = async (src, dst) => {
  await sharp(src).resize(WIDTH, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY }).toFile(dst);
  return statSync(dst).size;
};

let bytes = 0, wrote = 0, missing = [];
const rows = [];

for (const [scene, device, orientation, note] of PAIRS) {
  const name = `${scene}_${device}_${orientation}`;
  const a = join(FINAL, `${name}.png`);
  const b = join(BASE, `${name}.png`);
  if (!existsSync(a)) { missing.push(`final/${name}`); continue; }
  bytes += await shrink(a, join(OUT, 'after', `${name}.webp`)); wrote++;
  let hasBefore = false;
  if (existsSync(b)) { bytes += await shrink(b, join(OUT, 'before', `${name}.webp`)); wrote++; hasBefore = true; }
  else missing.push(`baseline/${name}`);
  rows.push({ scene, device, orientation, note, before: hasBefore });
}

for (const [scene, device, orientation, note] of SOLO) {
  const name = `${scene}_${device}_${orientation}`;
  const a = join(FINAL, `${name}.png`);
  if (!existsSync(a)) { missing.push(`final/${name}`); continue; }
  bytes += await shrink(a, join(OUT, 'after', `${name}.webp`)); wrote++;
  rows.push({ scene, device, orientation, note, before: false });
}

// the audit trail: which captures ran and what they logged
for (const [dir, dst] of [[FINAL, 'final-report.json'], [BASE, 'baseline-report.json']]) {
  const src = join(dir, 'report.json');
  if (existsSync(src)) { copyFileSync(src, join(OUT, dst)); bytes += statSync(join(OUT, dst)).size; }
  else missing.push(`${dir}/report.json`);
}

console.log(`${wrote} images -> screenshots/{before,after}/  (${(bytes / 1048576).toFixed(2)} MB total)`);
console.log(`${readdirSync(FINAL).filter((f) => f.endsWith('.png')).length} in the full local matrix, which stays out of git`);
if (missing.length) {
  console.log(`\n${missing.length} missing:`);
  for (const m of missing) console.log(`  ${m}`);
}

// The index the documents link to.
const md = ['# Screenshot index', '',
  'The full matrix is 602 captures and about 600 MB; it is generated by',
  '`tools/capture/capture.mjs` and deliberately not committed. `final-report.json`',
  'and `baseline-report.json` list every one of them with its scene, device,',
  'orientation and console output — that is the record. What is committed here is',
  'the subset the documents cite, at ' + WIDTH + 'px.', '',
  '## Before and after', '',
  '`before/` is the pre-overhaul build (`pre-overhaul-2026-08-26`), captured by',
  '`tools/capture/baseline.mjs` at the same viewport with the same safe-area',
  'insets. Same scene, same device, same insets; only the code differs.', '',
  '| Scene | Device | Orientation | What it shows |', '|---|---|---|---|'];
for (const r of rows.filter((x) => x.before)) {
  md.push(`| \`${r.scene}\` | ${r.device} | ${r.orientation} | ${r.note} |`);
}
md.push('', '## New in this build', '',
  'No pair exists for these, and the reason is not a gap in the method: there was',
  'nothing there to photograph.', '',
  '| Scene | Device | Orientation | What it shows |', '|---|---|---|---|');
for (const r of rows.filter((x) => !x.before)) {
  md.push(`| \`${r.scene}\` | ${r.device} | ${r.orientation} | ${r.note} |`);
}
md.push('');
const { writeFileSync } = await import('fs');
writeFileSync(join(OUT, 'README.md'), `${md.join('\n')}\n`);
console.log('screenshots/README.md written');
