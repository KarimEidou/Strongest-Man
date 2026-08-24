// 2D art pipeline: skybox (equirect 2:1 with a horizontal seam crossfade so the
// panorama tiles), splash and title art as WebP. Run: node process-textures.mjs <artDir>
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = process.argv[2];
if (!ART) { console.error('usage: node process-textures.mjs <artDir>'); process.exit(1); }
mkdirSync(join(root, 'assets/tex'), { recursive: true });
mkdirSync(join(root, 'assets/img'), { recursive: true });

// --- skybox: resize to 2048x1024, then crossfade the right edge into the left
const W = 2048, H = 1024, BLEND = 96;
const raw = await sharp(join(ART, '9_skybox.png')).removeAlpha().resize(W + BLEND, H, { fit: 'fill' }).raw().toBuffer();
const ch = 3;
const out = Buffer.alloc(W * H * ch);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const src = (y * (W + BLEND) + x) * ch;
    const dst = (y * W + x) * ch;
    if (x < BLEND) {
      // blend the strip that extends past x=W back into the left edge
      const tail = (y * (W + BLEND) + W + x) * ch;
      const t = x / BLEND; // 0 at edge -> use tail; 1 -> use own pixel
      for (let c = 0; c < ch; c++) out[dst + c] = Math.round(raw[tail + c] * (1 - t) + raw[src + c] * t);
    } else {
      out[dst] = raw[src]; out[dst + 1] = raw[src + 1]; out[dst + 2] = raw[src + 2];
    }
  }
}
await sharp(out, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 88 }).toFile(join(root, 'assets/tex/sky_equirect.webp'));

// sample the horizon band color for scene fog (middle of the orange band)
const { data: hb } = await sharp(out, { raw: { width: W, height: H, channels: 3 } })
  .extract({ left: 0, top: Math.round(H * 0.86), width: W, height: 8 }).raw().toBuffer({ resolveWithObject: true });
let r = 0, g = 0, b = 0, n = hb.length / 3;
for (let i = 0; i < hb.length; i += 3) { r += hb[i]; g += hb[i + 1]; b += hb[i + 2]; }
const hex = '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
console.log('skybox written; horizon fog color =', hex);

// --- splash + title
await sharp(join(ART, '7_splash.png')).resize(1920, 1080, { fit: 'cover' }).webp({ quality: 82 }).toFile(join(root, 'assets/img/splash.webp'));
await sharp(join(ART, '8_title.png')).resize(1280, 720, { fit: 'cover' }).webp({ quality: 90 }).toFile(join(root, 'assets/img/title.webp'));
console.log('splash + title written');
