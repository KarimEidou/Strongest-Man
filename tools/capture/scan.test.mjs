// Self-test for the structural checks in scan.mjs.
//
//   node tools/capture/scan.test.mjs
//
// The tiling check is a threshold, and a threshold with no test is a number
// somebody will nudge. It was set from two real measurements — a genuinely
// mosaiced capture at 0.006 and the least self-different of 622 good ones at
// 0.657 — but neither of those files belongs in the repository: one is 575 KB
// of corrupt PNG and the other is part of a matrix that deliberately stays out
// of git.
//
// So the fixtures are synthesised here instead, and they cover both directions:
// a frame that IS tiled must be caught, and the flat, near-symmetric frame that
// the first version of this check got wrong must NOT be. That second case is
// the one that matters — the portrait `rotate` overlay is a navy field with one
// centred glyph, every shift of it is near zero, and an unnormalised test calls
// it a mosaic.
import sharp from '../node_modules/sharp/lib/index.js';
import { looksTiled } from './tiling.mjs';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const W = 852, H = 393;

// A frame with the sort of broadband detail a rendered city has.
function noisy(w, h, seed) {
  const px = Buffer.alloc(w * h * 3);
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      // large-scale structure plus per-pixel grain, so both the edge test and
      // the shift test see a real image rather than a gradient
      const v = 90 + 70 * Math.sin(x / 23 + y / 17) + 40 * Math.sin(x / 5.5) + 60 * rnd();
      px[i] = Math.max(0, Math.min(255, v));
      px[i + 1] = Math.max(0, Math.min(255, v * 0.9 + 20));
      px[i + 2] = Math.max(0, Math.min(255, v * 0.8 + 40));
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } });
}

const cases = [];

// 1. a good frame — must pass
cases.push(['good.png', await noisy(W, H, 7).png().toBuffer()]);

// 2. the same frame tiled 3 across and 4 down — must be caught. This is exactly
//    the shape the real corruption took.
const tileW = Math.round(W / 3), tileH = Math.round(H / 4);
const tile = await noisy(tileW, tileH, 11).png().toBuffer();
const composite = [];
for (let ty = 0; ty < 4; ty++) {
  for (let tx = 0; tx < 3; tx++) composite.push({ input: tile, left: tx * tileW, top: ty * tileH });
}
cases.push(['tiled.png', await sharp({
  create: { width: tileW * 3, height: tileH * 4, channels: 3, background: { r: 0, g: 0, b: 0 } },
}).composite(composite).png().toBuffer()]);

// 3. the false positive the first version produced: a near-flat field with one
//    small centred mark, which is legitimately self-similar under a w/2 shift.
const navy = await sharp({
  create: { width: W, height: H, channels: 3, background: { r: 15, g: 27, b: 56 } },
}).composite([{
  input: await sharp({
    create: { width: 90, height: 26, channels: 3, background: { r: 240, g: 168, b: 96 } },
  }).png().toBuffer(),
  left: Math.round(W / 2 - 45),
  top: Math.round(H / 2 - 13),
}]).png().toBuffer();
cases.push(['rotate-like.png', navy]);

const dir = mkdtempSync(join(tmpdir(), 'scan-selftest-'));
let failures = 0;
let checks = 0;
try {
  for (const [name, buf] of cases) await sharp(buf).toFile(join(dir, name));

  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [join(here, 'scan.mjs'), dir], { encoding: 'utf8' });
  } catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`;
    code = e.status;
  }
  process.stdout.write(out);

  const check = (label, ok) => {
    checks++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
    if (!ok) failures++;
  };
  check('the tiled frame is caught', /TILED\s+tiled\.png/.test(out));
  check('the good frame is not called tiled', !/TILED\s+good\.png/.test(out));
  check('the flat centred-glyph frame is not called tiled', !/TILED\s+rotate-like\.png/.test(out));
  check('the good frame is not called blank', !/BLANK\s+good\.png/.test(out));
  check('a tiled frame fails the run', code === 1);

  // capture.mjs gates its one retry on looksTiled() rather than on scan.mjs's
  // CLI, so the wrapper gets its own checks — including the one that matters
  // most in a two-hour run: a checker that throws on its own read error and
  // takes the harness down with it is worse than no checker.
  check('looksTiled() agrees on the tiled frame', await looksTiled(join(dir, 'tiled.png')) === true);
  check('looksTiled() agrees on the good frame', await looksTiled(join(dir, 'good.png')) === false);
  check('looksTiled() agrees on the flat frame', await looksTiled(join(dir, 'rotate-like.png')) === false);
  check('looksTiled() returns false rather than throwing on a missing file',
    await looksTiled(join(dir, 'does-not-exist.png')) === false);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} of ${checks} check(s) failed` : `\n${checks}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
