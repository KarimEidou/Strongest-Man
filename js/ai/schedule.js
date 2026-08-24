// Daily life: time-of-day need curves pick a POI type; BFS over the sidewalk
// lattice produces the path. A game day lasts 24 real minutes.
import { rand, pick } from '../core/mathx.js';
import { nearestNode } from '../world/city.js';

// need weight by time-of-day (0..1 day fraction) per POI type
const CURVES = {
  office: (t) => bump(t, 0.38, 0.16) * 1.2,
  school: (t) => bump(t, 0.36, 0.1),
  diner: (t) => bump(t, 0.52, 0.07) + bump(t, 0.8, 0.06),
  shop: (t) => bump(t, 0.6, 0.12),
  library: (t) => bump(t, 0.55, 0.15) * 0.7,
  apartment: (t) => bump(t, 0.05, 0.12) + bump(t, 0.95, 0.1) + 0.15,
};
const bump = (t, c, w) => Math.exp(-((t - c) ** 2) / (2 * w * w));

export function pickGoal(npc, pois, timeOfDay) {
  let best = null, bs = -1;
  for (let i = 0; i < 6; i++) {
    const poi = pick(pois);
    const w = (CURVES[poi.type]?.(timeOfDay) ?? 0.2) * (0.6 + rand() * 0.8)
      / (1 + Math.hypot(poi.x - npc.x, poi.z - npc.z) / 60);
    if (w > bs) { bs = w; best = poi; }
  }
  return best;
}

// BFS path over the lattice from nearest node to the node nearest the goal.
export function routeTo(nav, fromX, fromZ, toX, toZ) {
  const a = nearestNode(nav, fromX, fromZ);
  const b = nearestNode(nav, toX, toZ);
  if (!a || !b) return [];
  if (a.id === b.id) return [b];
  const prev = new Array(nav.nodes.length).fill(-1);
  prev[a.id] = a.id;
  const q = [a.id];
  while (q.length) {
    const cur = q.shift();
    if (cur === b.id) break;
    for (const e of nav.nodes[cur].adj) {
      if (prev[e.n] === -1) { prev[e.n] = cur; q.push(e.n); }
    }
  }
  if (prev[b.id] === -1) return [b];
  const path = [];
  for (let at = b.id; at !== a.id; at = prev[at]) path.push(nav.nodes[at]);
  path.push(a);
  path.reverse();
  return path;
}
