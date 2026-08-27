// Imports the four supplied artworks into assets/art/.
//
// Each source produces TWO derivatives, and the split is deliberate:
//   <slug>.webp       long edge 1024 — the DOM <img> used by inspect mode, where
//                     the picture fills a 430pt-tall viewport at DPR 3 and costs
//                     no WebGL texture memory at all.
//   <slug>_512.webp   long edge 512  — the in-world wall texture. At gallery
//                     viewing distance a canvas covers at most ~300 screen px on
//                     the largest device, so 512 is already oversampled, and it
//                     keeps four framed paintings at ~3 MB of VRAM instead of ~12.
//
// Neither derivative is padded to a power of two. §7.4 asks for POT, but these
// are 0.549–0.577 aspect and the only way to reach POT is to squash them, which
// §8.4 forbids outright. WebGL2 samples and mipmaps NPOT textures natively, so
// the native aspect wins. See ASSUMPTIONS.md.
//
//   node tools/import-art.mjs <sourceDir>
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'art');
mkdirSync(outDir, { recursive: true });

const srcDir = process.argv[2];
if (!srcDir) { console.error('usage: node tools/import-art.mjs <sourceDir>'); process.exit(1); }

// slug -> source filename. Titles live in assets/art/plaques.json, not here.
const WORKS = [
  { slug: 'the-visitor', src: 'e25b883b-image.jpg' },
  { slug: 'riverbank', src: '42ea8e1c-image.jpg' },
  { slug: 'reach', src: '98c7492b-image.jpg' },
  { slug: 'the-reader', src: 'd0ec60bc-image.jpg' },
];

const meta = [];
for (const w of WORKS) {
  const src = join(srcDir, w.src);
  const info = await sharp(src).metadata();
  for (const [suffix, edge, quality] of [['', 1024, 88], ['_512', 512, 86]]) {
    const scale = edge / Math.max(info.width, info.height);
    const width = Math.round(info.width * scale);
    const height = Math.round(info.height * scale);
    const file = `${w.slug}${suffix}.webp`;
    await sharp(src)
      .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
      .webp({ quality, effort: 6 })
      .toFile(join(outDir, file));
    console.log(`${file}  ${width}x${height}  ratio ${(width / height).toFixed(4)}`);
    if (!suffix) meta.push({ slug: w.slug, width, height, aspect: +(width / height).toFixed(6) });
  }
  // the source ratio must survive both derivatives to 3 decimals, or a rounding
  // slip has quietly squashed a painting
  const a = info.width / info.height;
  const m = meta[meta.length - 1];
  if (Math.abs(a - m.aspect) > 0.001) {
    console.error(`${w.slug}: aspect drifted ${a.toFixed(4)} -> ${m.aspect.toFixed(4)}`);
    process.exit(1);
  }
}
writeFileSync(join(outDir, 'sources.json'), JSON.stringify(meta, null, 2) + '\n');
console.log('wrote assets/art/sources.json');
