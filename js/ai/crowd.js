// Shared spatial hash (8m cells) — used by crowd separation, gossip pairing,
// scream propagation, monster targeting. Rebuilt every third fixed step.
//
// Keys are integers, not `${gx},${gz}` strings: a wide query (a monster looking
// for a victim at 60m) spans 17×17 cells, and building 289 strings per call per
// monster per step was pure garbage.
const CELL = 8;
const map = new Map();
const key = (gx, gz) => (gx + 512) * 1024 + (gz + 512);

export function rebuildHash(npcs) {
  map.clear();
  for (const n of npcs) {
    if (n.state === 'dead') continue;
    const k = key(Math.floor(n.x / CELL), Math.floor(n.z / CELL));
    let arr = map.get(k);
    if (!arr) map.set(k, (arr = []));
    arr.push(n);
  }
}

export function neighbors(x, z, r, out) {
  out.length = 0;
  const c = Math.ceil(r / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  const r2 = r * r;
  for (let ix = cx - c; ix <= cx + c; ix++) {
    for (let iz = cz - c; iz <= cz + c; iz++) {
      const arr = map.get(key(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        const dx = n.x - x, dz = n.z - z;
        if (dx * dx + dz * dz <= r2) out.push(n);
      }
    }
  }
  return out;
}
