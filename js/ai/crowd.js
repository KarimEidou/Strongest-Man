// Shared spatial hash (8m cells) — used by crowd separation, gossip pairing,
// scream propagation, monster targeting. Rebuilt every third fixed step.
const CELL = 8;
const map = new Map();
const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

export function rebuildHash(npcs) {
  map.clear();
  for (const n of npcs) {
    if (n.state === 'dead') continue;
    const k = key(n.x, n.z);
    let arr = map.get(k);
    if (!arr) map.set(k, (arr = []));
    arr.push(n);
  }
}

export function neighbors(x, z, r, out) {
  out.length = 0;
  const c = Math.ceil(r / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let ix = cx - c; ix <= cx + c; ix++) {
    for (let iz = cz - c; iz <= cz + c; iz++) {
      const arr = map.get(`${ix},${iz}`);
      if (!arr) continue;
      for (const n of arr) {
        const dx = n.x - x, dz = n.z - z;
        if (dx * dx + dz * dz <= r * r) out.push(n);
      }
    }
  }
  return out;
}
