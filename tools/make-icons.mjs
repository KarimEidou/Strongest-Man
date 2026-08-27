// Builds the PWA icon set from the user-supplied app icon.
// The source has baked rounded corners with black behind them; every output
// is a center zoom-crop so those corners fall outside the frame and iOS/Android
// apply their own masks to a full-bleed image. The source is never redrawn.
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The app-icon source is not in the repo (it is the owner's original artwork),
// so the icon half only runs when it is handed one. The launch images below are
// built from assets/img/title.webp, which IS in the repo, and always run.
//
//   node tools/make-icons.mjs                 -> launch images only
//   node tools/make-icons.mjs <source.png>    -> icons + launch images
const SRC = process.argv[2];
const OUT = join(root, 'assets/icons');
mkdirSync(OUT, { recursive: true });

if (SRC) await makeIcons(SRC);

async function makeIcons(src) {
const meta = await sharp(src).metadata();
const size = Math.min(meta.width, meta.height);
// 112% zoom: crop the middle 1/1.12 so the source's rounded corners are excluded.
const crop = Math.round(size / 1.12);
const off = Math.round((size - crop) / 2);
const base = sharp(src).extract({ left: off, top: off, width: crop, height: crop });

await base.clone().resize(180, 180).png().toFile(join(OUT, 'apple-touch-icon.png'));
await base.clone().resize(192, 192).png().toFile(join(OUT, 'icon-192.png'));
await base.clone().resize(512, 512).png().toFile(join(OUT, 'icon-512.png'));
// Maskable is NOT the same image. A maskable icon is cropped by the platform to
// whatever shape it likes — a circle, a squircle, a teardrop — and only the
// middle 80% is guaranteed to survive. Shipping the full-bleed art as maskable
// (which is what "reuse the same crop" did, byte for byte) means the outer 20%
// of the artwork gets cut off on Android, and it duplicated 384 KB in every
// precache for a file identical to icon-512.png. Inset to the safe circle on the
// theme colour instead.
const MASK_SAFE = 0.8;
const inner = Math.round(512 * MASK_SAFE);
await sharp({
  create: { width: 512, height: 512, channels: 4, background: { r: 13, g: 27, b: 62, alpha: 1 } },
})
  .composite([{
    input: await base.clone().resize(inner, inner).png().toBuffer(),
    left: Math.round((512 - inner) / 2),
    top: Math.round((512 - inner) / 2),
  }])
  .png()
  .toFile(join(OUT, 'icon-512-maskable.png'));
await base.clone().resize(48, 48).png().toFile(join(root, 'favicon.png'));

// Verify no black corners survived: sample 4 corner pixels of the 512 output.
const { data, info } = await sharp(join(OUT, 'icon-512.png')).raw().toBuffer({ resolveWithObject: true });
const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
for (const [x, y] of [[2, 2], [509, 2], [2, 509], [509, 509]]) {
  const [r, g, b] = px(x, y);
  if (r + g + b < 90) { console.error(`FAIL: corner ${x},${y} is near-black (${r},${g},${b})`); process.exit(1); }
}
console.log('icons written, corners are full-bleed');
}

// ---- iOS launch images -----------------------------------------------------
// iPhone Safari does not use the manifest for the standalone launch screen: with
// no apple-touch-startup-image that matches the device AND the orientation, the
// home-screen launch flashes white before the first paint. So one image per
// target device per orientation, sized in DEVICE pixels.
//
// The artwork is deliberately flat — the same navy radial the #loading overlay
// uses, with the title logo centred — rather than a crop of splash.webp. It is
// the honest thing to show before anything has loaded, it matches the first real
// frame so there is no jump, and eight large flat PNGs cost ~10 KB each instead
// of ~250 KB each.
//
// device-width/height are iOS's PORTRAIT logical dimensions in both
// orientations; only the media query's `orientation` differs.
// One profile per DISTINCT logical size iOS reports, not one per marketing name:
// a device with no exact (device-width, device-height, dpr, orientation) match
// gets NO launch image and flashes white, so a gap here is a visible defect on
// that phone. The four in the capture matrix are the targets; the rest are the
// iPhones still in circulation that would otherwise fall through.
const SPLASH_DEVICES = [
  { name: 'se3', w: 375, h: 667, dpr: 2 },      // SE 2nd/3rd gen, 6/7/8
  { name: 'x', w: 375, h: 812, dpr: 3 },        // X, XS, 11 Pro, 12 mini, 13 mini
  { name: 'xr', w: 414, h: 896, dpr: 2 },       // XR, 11
  { name: 'xsmax', w: 414, h: 896, dpr: 3 },    // XS Max, 11 Pro Max
  { name: 'ip14', w: 390, h: 844, dpr: 3 },     // 12, 12 Pro, 13, 13 Pro, 14
  { name: 'ip14max', w: 428, h: 926, dpr: 3 },  // 12/13/14 Pro Max, 14 Plus
  { name: 'ip16pro', w: 393, h: 852, dpr: 3 },  // 14 Pro, 15, 15 Pro, 16
  { name: 'ip16', w: 402, h: 874, dpr: 3 },     // 16 Pro
  { name: 'ip16promax', w: 430, h: 932, dpr: 3 }, // 15 Pro Max, 15 Plus, 16 Plus
  { name: 'ip16max', w: 440, h: 956, dpr: 3 },  // 16 Pro Max
];

const LOGO = join(root, 'assets/img/title.webp');
const SPLASH_OUT = join(root, 'assets/splash');
mkdirSync(SPLASH_OUT, { recursive: true });

const links = [];
for (const d of SPLASH_DEVICES) {
  for (const orientation of ['portrait', 'landscape']) {
    const pw = Math.round((orientation === 'portrait' ? d.w : d.h) * d.dpr);
    const ph = Math.round((orientation === 'portrait' ? d.h : d.w) * d.dpr);
    // radial navy, matching css/main.css #loading
    const bg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">
         <defs><radialGradient id="g" cx="50%" cy="120%" r="95%">
           <stop offset="0%" stop-color="#1848c0"/><stop offset="70%" stop-color="#0d1b3e"/>
         </radialGradient></defs>
         <rect width="${pw}" height="${ph}" fill="url(#g)"/>
       </svg>`,
    );
    const logoW = Math.round(Math.min(pw * 0.62, ph * 0.62));
    const logo = await sharp(LOGO).resize({ width: logoW }).png().toBuffer();
    const logoMeta = await sharp(logo).metadata();
    // JPEG, not PNG. Safari accepts either for a startup image, the artwork is
    // an opaque gradient with no alpha to preserve, and mozjpeg gets the set from
    // 776 KB to ~250 KB — bytes every first-time visitor pays for, since the
    // whole of assets/ is precached for offline play.
    const file = `splash-${d.name}-${orientation}.jpg`;
    await sharp(bg)
      .composite([{
        input: logo,
        left: Math.round((pw - logoMeta.width) / 2),
        top: Math.round((ph - logoMeta.height) / 2),
      }])
      .jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toFile(join(SPLASH_OUT, file));
    links.push(
      `<link rel="apple-touch-startup-image" href="./assets/splash/${file}"`
      + ` media="(device-width: ${d.w}px) and (device-height: ${d.h}px)`
      + ` and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: ${orientation})">`,
    );
  }
}
console.log(`${links.length} launch images written to assets/splash/`);
console.log('\nPaste into index.html <head>:\n');
console.log(links.join('\n'));
