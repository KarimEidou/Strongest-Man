// Uniform grid for static-world queries. The world is ~180m across and holds
// ~200 props and ~30 building footprints; every capsule query used to scan all
// of them, once per fixed step, per player/monster/panicking NPC. With 48
// people fleeing a collapse that is ~11k iterations a step, sustained for as
// long as the panic lasts — the "it freezes after you knock something down"
// report. Bucketing by 8m cell turns each query into a handful of candidates.
//
// Items are plain objects (prop records, building records); the grid stores
// them by reference and tags them with two hidden fields:
//   _cells  — bucket indices it occupies, so removal is O(cells)
//   _stamp  — dedupe marker, so a query spanning several cells reports an item
//             once without allocating a Set per call.

const CELL = 8;
const HALF = 96;                 // grid covers [-96, +96]
const N = Math.ceil((HALF * 2) / CELL);

export function createGrid() {
  const cells = new Array(N * N);
  let stamp = 0;

  const gi = (v) => {
    const i = Math.floor((v + HALF) / CELL);
    return i < 0 ? 0 : i >= N ? N - 1 : i;
  };

  function bucket(i) {
    let b = cells[i];
    if (!b) cells[i] = b = [];
    return b;
  }

  function addTo(item, gx0, gz0, gx1, gz1) {
    const own = item._cells || (item._cells = []);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const i = gx * N + gz;
        bucket(i).push(item);
        own.push(i);
      }
    }
  }

  return {
    // a prop: a point with a clearance radius
    insertPoint(item, x, z, r = 0) {
      addTo(item, gi(x - r), gi(z - r), gi(x + r), gi(z + r));
    },
    // a building: an axis-aligned footprint
    insertBox(item, x0, z0, x1, z1, pad = 0) {
      addTo(item, gi(x0 - pad), gi(z0 - pad), gi(x1 + pad), gi(z1 + pad));
    },
    remove(item) {
      const own = item._cells;
      if (!own) return;
      for (const i of own) {
        const b = cells[i];
        if (!b) continue;
        const k = b.indexOf(item);
        if (k >= 0) b.splice(k, 1);
      }
      own.length = 0;
    },
    // fills `out` with the distinct items in every cell the query circle touches
    query(x, z, r, out) {
      out.length = 0;
      const s = ++stamp;
      const gx0 = gi(x - r), gx1 = gi(x + r), gz0 = gi(z - r), gz1 = gi(z + r);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const b = cells[gx * N + gz];
          if (!b) continue;
          for (let k = 0; k < b.length; k++) {
            const it = b[k];
            if (it._stamp === s) continue;
            it._stamp = s;
            out.push(it);
          }
        }
      }
      return out;
    },
    stats() {
      let used = 0, max = 0, total = 0;
      for (const b of cells) {
        if (!b || !b.length) continue;
        used++; total += b.length;
        if (b.length > max) max = b.length;
      }
      return { cells: N * N, used, maxBucket: max, avgBucket: used ? +(total / used).toFixed(2) : 0 };
    },
  };
}
