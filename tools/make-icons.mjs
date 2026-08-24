// Builds the PWA icon set from the user-supplied app icon.
// The source has baked rounded corners with black behind them; every output
// is a center zoom-crop so those corners fall outside the frame and iOS/Android
// apply their own masks to a full-bleed image. The source is never redrawn.
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC) { console.error('usage: node make-icons.mjs <source.png>'); process.exit(1); }
const OUT = join(root, 'assets/icons');
mkdirSync(OUT, { recursive: true });

const meta = await sharp(SRC).metadata();
const size = Math.min(meta.width, meta.height);
// 112% zoom: crop the middle 1/1.12 so the source's rounded corners are excluded.
const crop = Math.round(size / 1.12);
const off = Math.round((size - crop) / 2);
const base = sharp(SRC).extract({ left: off, top: off, width: crop, height: crop });

await base.clone().resize(180, 180).png().toFile(join(OUT, 'apple-touch-icon.png'));
await base.clone().resize(192, 192).png().toFile(join(OUT, 'icon-192.png'));
await base.clone().resize(512, 512).png().toFile(join(OUT, 'icon-512.png'));
// Maskable: full-bleed artwork already fills the safe zone; reuse the same crop.
await base.clone().resize(512, 512).png().toFile(join(OUT, 'icon-512-maskable.png'));
await base.clone().resize(48, 48).png().toFile(join(root, 'favicon.png'));

// Verify no black corners survived: sample 4 corner pixels of the 512 output.
const { data, info } = await sharp(join(OUT, 'icon-512.png')).raw().toBuffer({ resolveWithObject: true });
const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
for (const [x, y] of [[2, 2], [509, 2], [2, 509], [509, 509]]) {
  const [r, g, b] = px(x, y);
  if (r + g + b < 90) { console.error(`FAIL: corner ${x},${y} is near-black (${r},${g},${b})`); process.exit(1); }
}
console.log('icons written, corners are full-bleed');
