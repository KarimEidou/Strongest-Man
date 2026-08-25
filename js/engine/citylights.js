// Streetlamp pools of light, without any lights.
//
// The city has exactly two real lights (engine/sky.js), and it is going to stay
// that way: every extra light is a program permutation and a per-fragment cost on
// a phone. So the lamps that reach the ground are a uniform array the shared
// world shader loops over — see smLampLight in engine/materials.js.
//
// Only the nearest LAMP_SLOTS lamps are loaded. Beyond POOL_R a lamp contributes
// nothing anyway, so the ones that fall out of the list are already invisible;
// SELECT_R is deliberately much larger than the pool radius so a lamp is always
// dropped well before it could pop. It is derived from POOL_R rather than
// written out, because that is the whole invariant: 30m was 5x the old 6m pool
// and only 2.5x the 12m one, which is close enough to the rim that a lamp
// evicted while the camera swung across a junction visibly blinked out. At 4x,
// the 16 nearest lamps around the player still reach out to ~38m even where the
// grid is at its densest, and the falloff has been zero for 26m by then.
import { worldUniforms, LAMP_SLOTS, POOL_R } from './materials.js';

const SELECT_R2 = (POOL_R * 4) * (POOL_R * 4);
const EVERY = 6;              // frames between reselections — the player is slow

export function initCityLights(propsReg) {
  const type = propsReg.types.prop_streetlamp;
  // The head hangs ~1.1m out from the pole on the gooseneck (world/procprops.js),
  // and it is the head the light falls from, not the post.
  const lamps = (type?.list || []).map((p) => {
    const reach = 1.1 * (p.s || 1);
    return { p, x: p.x + Math.sin(p.yaw) * reach, y: (p.y || 0) + 5.4 * (p.s || 1), z: p.z + Math.cos(p.yaw) * reach, d2: 0 };
  });

  const slots = worldUniforms.uLamps.value;
  const near = [];
  let frame = 0;

  function frameUpdate(camera) {
    if (frame++ % EVERY !== 0) return;
    near.length = 0;
    const cx = camera.position.x, cz = camera.position.z;
    for (const l of lamps) {
      // a felled or destroyed lamp goes dark with everything else
      if (!l.p.alive) continue;
      const dx = l.x - cx, dz = l.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > SELECT_R2) continue;
      l.d2 = d2;
      near.push(l);
    }
    near.sort(byDistance);
    const n = Math.min(near.length, LAMP_SLOTS);
    for (let i = 0; i < n; i++) slots[i].set(near[i].x, near[i].y, near[i].z, 1);
    for (let i = n; i < LAMP_SLOTS; i++) slots[i].w = 0;
  }

  window.__test.cityLights = () => ({
    total: lamps.length,
    loaded: slots.filter((v) => v.w > 0.5).length,
  });

  return { frameUpdate, lamps };
}

const byDistance = (a, b) => a.d2 - b.d2;
