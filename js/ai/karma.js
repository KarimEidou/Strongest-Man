// Karma: one public-opinion scalar (−100…+100), persisted across sessions.
// Deeds move it; behavior thresholds read the band. The game never judges —
// it just remembers.
import { on, emit, EV } from '../core/events.js';
import { save, persist } from '../core/state.js';
import { clamp } from '../core/mathx.js';

export const BANDS = [
  [60, 'saint'], [20, 'good'], [-19, 'neutral'], [-59, 'feared'], [-Infinity, 'monster'],
];

export function karmaBand(v = save.karma) {
  for (const [min, name] of BANDS) if (v >= min) return name;
  return 'monster';
}

let sinceDeed = 0;

export function initKarma() {
  const add = (dv) => {
    const prevBand = karmaBand();
    save.karma = clamp(save.karma + dv, -100, 100);
    sinceDeed = 0;
    const band = karmaBand();
    emit(EV.KARMA_CHANGED, { value: save.karma, band, prevBand });
    persist();
  };

  on(EV.NPC_DIED, ({ cause }) => {
    if (cause === 'player') add(-8);
    else if (cause === 'thrown') add(-6);
    else if (cause === 'explosion') add(-3);
  });
  on(EV.BUILDING_COLLAPSED, ({ byPlayer }) => { if (byPlayer) add(-15); });
  on(EV.CAR_EXPLODED, ({ byPlayer }) => { if (byPlayer) add(-2); });
  on(EV.PROP_DESTROYED, () => add(-0.5));
  on(EV.MONSTER_DIED, ({ byPlayer, nearNpcs }) => {
    if (byPlayer) add(20 + (nearNpcs >= 3 ? 8 : 0));
  });

  // slow drift toward zero when behaving
  let acc = 0;
  return {
    fixedUpdate(dt) {
      sinceDeed += dt;
      acc += dt;
      if (acc >= 5) {
        acc = 0;
        if (sinceDeed > 60 && save.karma !== 0) {
          save.karma += save.karma > 0 ? -0.04 * 5 : 0.04 * 5;
          if (Math.abs(save.karma) < 0.3) save.karma = 0;
        }
      }
    },
    fire() { emit(EV.KARMA_CHANGED, { value: save.karma, band: karmaBand(), prevBand: karmaBand() }); },
  };
}
