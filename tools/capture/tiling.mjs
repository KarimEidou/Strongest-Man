// Is this frame the same picture repeated, rather than one picture?
//
// A capture can come back as the frame tiled across itself — the same block two
// or three times each way, with everything the scene was for missing. It has
// happened twice in this project. Neither time did anything say so: a mosaic is
// a valid PNG of the right size with high detail and high edge energy, so it
// passes every is-this-blank test there is and lands in the report like any
// other row.
//
// The measurement is a RATIO, and that is the whole of it. Asking only whether
// the frame differs little from itself under a w/k shift flags a nearly-empty
// screen just as readily as a mosaic — the portrait rotate overlay is a navy
// field with one centred glyph, where every shift is near zero because there is
// almost nothing there to differ. So the shifted difference is divided by the
// difference under a shift that CANNOT be a tile period. A repeating frame has
// a small numerator and a large denominator; an empty one has both small.
//
// Measured on this project: a genuinely mosaiced capture scores 0.006, and the
// least self-different of 622 good ones scores 0.657.
//
// Lives in its own file because two callers need it and they must not drift:
// scan.mjs sweeps a finished set, and capture.mjs asks at the shutter so a bad
// frame costs one retry instead of a re-run discovered an hour later.
import sharp from '../node_modules/sharp/lib/index.js';

export const TILE_RATIO = 0.25;   // below this, the frame repeats
const WIDTH = 240;                // thumbnail the measurement runs on

// mean |difference| between the image and itself shifted s pixels left
export function shiftDiff(data, w, h, s) {
  let acc = 0, cnt = 0;
  for (let y = 0; y < h; y += 2) {
    const row = y * w;
    for (let x = 0; x + s < w; x += 2) { acc += Math.abs(data[row + x] - data[row + x + s]); cnt++; }
  }
  return cnt ? acc / cnt : 0;
}

// Returns { ratio, k } — k is the period that fitted best. ratio >= 1 means
// "no period found", which is also what a perfectly uniform image returns:
// there is nothing to find in it and no denominator to divide by, and a blank
// frame is scan.mjs's other measurement's business, not this one's.
export async function tiling(file) {
  const { data, info } = await sharp(file).resize(WIDTH, null, { fit: 'inside' })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const ref = Math.max(shiftDiff(data, w, h, Math.round(w * 0.29)),
                       shiftDiff(data, w, h, Math.round(w * 0.41)));
  if (ref <= 0) return { ratio: 1, k: 0 };
  let best = { k: 0, d: Infinity };
  for (const k of [2, 3, 4]) {
    const step = Math.round(w / k);
    if (step < 8) continue;
    const d = shiftDiff(data, w, h, step);
    if (d < best.d) best = { k, d };
  }
  return { ratio: best.d / ref, k: best.k };
}

// The convenience form, for callers that only want the verdict. Never throws:
// a checker that can fail a run on its own read error is worse than no checker.
export async function looksTiled(file) {
  try {
    return (await tiling(file)).ratio < TILE_RATIO;
  } catch {
    return false;
  }
}
