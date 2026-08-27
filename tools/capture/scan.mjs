// Structural check over a capture set.
//
//   node tools/capture/scan.mjs [screenshots/final]
//
// Six hundred screenshots is more than anyone reviews honestly by eye, and the
// failure that matters most is also the easiest to miss in a contact sheet: a
// frame that did not render. A blank capture is still a valid PNG, still the
// right size, and still counted in the report — it just has nothing in it.
//
// So every image is measured twice: the largest per-channel standard deviation
// (is there more than one colour here?) and the mean absolute horizontal
// gradient (is there any structure?). Both are cheap on a 160px thumbnail.
//
// This is a SMELL test, not a pass/fail: a settings panel on a 1920x1080 desktop
// is legitimately flat, and it will be listed. What it is for is the case that
// caught a real defect — one `loading` capture out of 602 came out as bare navy
// with no panel in it, because the boot's own hide-the-overlay timer fired after
// the scene had made it visible again. Nothing else in the run said a word.
import sharp from '../node_modules/sharp/lib/index.js';
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const DIR = process.argv[2] ? join(root, process.argv[2]) : join(root, 'screenshots', 'final');
if (!existsSync(DIR)) { console.error(`no such directory: ${DIR}`); process.exit(2); }

// Below either of these, a frame is worth a human look.
const SD_FLOOR = 6;      // largest channel stdev, 0-255
const EDGE_FLOOR = 1.0;  // mean |dx| in greyscale levels

const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
if (!files.length) { console.error(`no PNGs in ${DIR}`); process.exit(2); }

const flagged = [];
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
  if (++n % 100 === 0) process.stdout.write(`${n} `);
}

const blank = flagged.filter((x) => x.blank);
console.log(`\n${files.length} scanned, ${flagged.length} low-detail, ${blank.length} effectively blank`);
for (const x of flagged) {
  console.log(`  ${x.blank ? 'BLANK  ' : 'flat   '}${x.f}  sd=${x.sd} edge=${x.edge}`);
}
if (!flagged.length) console.log('  (nothing to look at)');

// Only a genuinely blank frame fails the run. "Flat" is a prompt to look, and
// panels on a desktop viewport are flat on purpose.
process.exit(blank.length ? 1 : 0);
