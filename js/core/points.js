// Points: what the city pays you for, and what guns cost.
//
// The whole economy is driven off the event bus rather than by calls scattered
// through the systems that cause the events — combat, destruction and the AI all
// already announce exactly what happened, and none of them should have to know
// there is a shop. Adding a new payout is one line in AWARDS.
//
// Karma is deliberately NOT the same axis. Levelling an occupied building pays
// well and costs you everything the city thinks of you; killing the monster
// eating a pedestrian pays better and costs nothing. The player chooses.
import { on, emit, EV } from './events.js';
import { save, persist } from './state.js';

// Payouts, in points. A monster is the top of the board on purpose: it is the
// only thing in the city that fights back, and the shop is priced so that
// clearing a wave or two buys the next weapon.
export const AWARDS = {
  monster_kill: 300,
  monster_realize: 40,        // the moment it understands what it picked a fight with
  building: 450,
  car: 90,
  prop: 12,
  chunk: 2,                   // per wall cell, and there are thousands
  charged_punch: 18,
  swing: 10,
  throw: 8,
  civilian: -25,              // the city does not pay you for this one
};

const CHUNK_CAP = 60;         // most points a single collapse can pay in chunks

export function initPoints() {
  const st = { session: 0 };   // this run's net, for the test hook
  let saveT = 0;

  // Every award goes through here so the HUD only has one thing to listen to.
  function award(n, label) {
    if (!n) return;
    save.points = Math.max(0, save.points + n);
    save.earned += Math.max(0, n);
    st.session += n;
    emit(EV.POINTS, { delta: n, total: save.points, label });
    saveT = 2.5;              // batch writes; localStorage on a phone is not free
  }

  on(EV.MONSTER_DIED, ({ byPlayer }) => { if (byPlayer) award(AWARDS.monster_kill, 'MONSTER DOWN'); });
  on(EV.MONSTER_REALIZED, () => award(AWARDS.monster_realize, 'IT KNOWS'));
  on(EV.BUILDING_COLLAPSED, ({ byPlayer }) => { if (byPlayer) award(AWARDS.building, 'BUILDING DOWN'); });
  on(EV.CAR_EXPLODED, ({ byPlayer }) => { if (byPlayer) award(AWARDS.car, 'WRECKED'); });
  on(EV.PROP_DESTROYED, () => award(AWARDS.prop, null));
  on(EV.CHUNK_DESTROYED, ({ count }) => award(Math.min(count * AWARDS.chunk, CHUNK_CAP), null));
  on(EV.NPC_DIED, ({ cause }) => {
    if (cause === 'player' || cause === 'thrown' || cause === 'swung') award(AWARDS.civilian, 'CIVILIAN');
  });
  on(EV.FEAT, ({ type }) => {
    const n = AWARDS[type];
    if (n && type !== 'monster_kill') award(n, null);
  });

  function fixedUpdate(dt) {
    if (saveT > 0) {
      saveT -= dt;
      if (saveT <= 0) persist();
    }
  }

  // Bought something: spend, and write through immediately — a purchase is the
  // one transaction nobody wants to lose to a killed tab.
  function spend(n) {
    if (save.points < n) return false;
    save.points -= n;
    persist();
    emit(EV.POINTS, { delta: -n, total: save.points, label: null });
    return true;
  }

  window.__test.points = () => ({ points: save.points, earned: save.earned, session: st.session });
  window.__test.grantPoints = (n) => { award(n, 'TEST'); return save.points; };
  // Deterministic balance, so a test can assert what the shop refuses as well as
  // what it sells.
  window.__test.setPoints = (n) => {
    save.points = Math.max(0, n);
    persist();
    emit(EV.POINTS, { delta: 0, total: save.points, label: null });
    return save.points;
  };

  return { st, fixedUpdate, award, spend };
}
