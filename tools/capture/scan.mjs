// Structural check over a capture set.
//
//   node tools/capture/scan.mjs [screenshots/final]
//
// Six hundred screenshots is more than anyone reviews honestly by eye, and the
// failures that matter most are also the easiest to miss in a contact sheet: a
// frame that did not render, and a frame that rendered the same tile over and
// over. Both are valid PNGs of the right size, and both are counted in the
// report like any other capture.
//
// So every image is measured three ways, all cheap on a small thumbnail:
//
//   1. the largest per-channel standard deviation  — is there more than one
//      colour here?
//   2. the mean absolute horizontal gradient       — is there any structure?
//   3. self-similarity under a w/k horizontal shift, normalised against the
//      same image shifted by a non-period fraction — is this one frame, or the
//      same frame repeated?
//
// (1) and (2) are a SMELL test, not a pass/fail: a settings panel on a
// 1920x1080 desktop is legitimately flat, and it will be listed. What they are
// for is the case that caught a real defect — one `loading` capture out of 602
// came out as bare navy with no panel in it, because the boot's own
// hide-the-overlay timer fired after the scene had made it visible again.
// Nothing else in the run said a word.
//
// (3) is a pass/fail, and it is normalised for a reason. The first version of
// it simply asked whether the mean |Δ| under a w/k shift was small, and flagged
// the two portrait `rotate` captures — a navy field with one centred glyph and
// one line of text, where EVERY shift is near zero because there is almost
// nothing there to differ. The signal is not "the shifted difference is small",
// it is "the shifted difference is small compared to this image's own". A
// genuinely mosaiced frame scores 0.006 on that ratio; the least self-different
// real capture in a 622-frame matrix scores 0.657.
import sharp from '../node_modules/sharp/lib/index.js';
import { readdirSync, existsSync } from 'fs';
import { join, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
// A relative argument is relative to the repo root, so `scan.mjs
// screenshots/final` works from anywhere. An absolute one is taken as given —
// joining it onto root silently turned /tmp/x into <root>/tmp/x, which reads as
// "no such directory" for a directory that is right there.
const arg = process.argv[2];
const DIR = arg ? (isAbsolute(arg) ? arg : join(root, arg)) : join(root, 'screenshots', 'final');
if (!existsSync(DIR)) { console.error(`no such directory: ${DIR}`); process.exit(2); }

// Below either of these, a frame is worth a human look.
const SD_FLOOR = 6;      // largest channel stdev, 0-255
const EDGE_FLOOR = 1.0;  // mean |dx| in greyscale levels

// Above this ratio a frame is not a mosaic. Measured: 0.006 for a real
// 3x4-tiled capture, 0.657 for the least self-different of 622 good ones.
const TILE_RATIO = 0.25;
const TILE_W = 240;      // thumbnail width for the shift test

// mean |difference| between the image and itself shifted s pixels left
const shiftDiff = (data, w, h, s) => {
  let acc = 0, cnt = 0;
  for (let y = 0; y < h; y += 2) {
    const row = y * w;
    for (let x = 0; x + s < w; x += 2) { acc += Math.abs(data[row + x] - data[row + x + s]); cnt++; }
  }
  return cnt ? acc / cnt : 0;
};

const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
if (!files.length) { console.error(`no PNGs in ${DIR}`); process.exit(2); }

const flagged = [];
const tiled = [];
let n = 0;
for (const f of files) {
  const thumb = sharp(join(DIR, f)).resize(160, null, { fit: 'inside' }).removeAlpha();
  const stats = await thumb.stats();
  const { data, info } = await thumb.greyscale().raw().toBuffer({ resolveWithObject: true });
  let edge = 0;
  for (let y = 0; y < info.height; y++) {
    const row = y * info.width;
    for (let x = 1; x < info.width; x++) edge += Math.abs(data[row + x] - data[row + x - 1]);
  }
  edge /= info.width * info.height;
  const sd = Math.max(...stats.channels.map((c) => c.stdev));
  if (sd < SD_FLOOR || edge < EDGE_FLOOR) {
    flagged.push({ f, sd: +sd.toFixed(1), edge: +edge.toFixed(2), blank: sd < SD_FLOOR });
  }

  // the repeat test, on its own slightly larger thumbnail
  const t = await sharp(join(DIR, f)).resize(TILE_W, null, { fit: 'inside' })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const tw = t.info.width, th = t.info.height;
  // 0.29w and 0.41w cannot be a tile period for k = 2, 3 or 4, so they measure
  // how different this image is from itself in general
  const ref = Math.max(shiftDiff(t.data, tw, th, Math.round(tw * 0.29)),
                       shiftDiff(t.data, tw, th, Math.round(tw * 0.41)));
  let best = { k: 0, d: Infinity };
  for (const k of [2, 3, 4]) {
    const s = Math.round(tw / k);
    if (s < 8) continue;
    const d = shiftDiff(t.data, tw, th, s);
    if (d < best.d) best = { k, d };
  }
  // ref === 0 means a perfectly uniform image, which (1) already reports as
  // blank; there is no period to find in it and no denominator to divide by.
  const ratio = ref > 0 ? best.d / ref : 1;
  if (ratio < TILE_RATIO) tiled.push({ f, k: best.k, ratio: +ratio.toFixed(3) });

  if (++n % 100 === 0) process.stdout.write(`${n} `);
}

const blank = flagged.filter((x) => x.blank);
console.log(`\n${files.length} scanned, ${flagged.length} low-detail, ${blank.length} effectively blank, ${tiled.length} tiled`);
for (const x of flagged) {
  console.log(`  ${x.blank ? 'BLANK  ' : 'flat   '}${x.f}  sd=${x.sd} edge=${x.edge}`);
}
for (const x of tiled) {
  console.log(`  TILED  ${x.f}  repeats at w/${x.k} (ratio ${x.ratio})`);
}
if (!flagged.length && !tiled.length) console.log('  (nothing to look at)');

// A blank frame and a mosaiced frame both fail the run: neither is a picture of
// the thing it claims to be. "Flat" is a prompt to look, and panels on a
// desktop viewport are flat on purpose.
process.exit(blank.length || tiled.length ? 1 : 0);
