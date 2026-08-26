// Player health.
//
// He is the strongest man in the universe, so the bar is not a difficulty knob —
// it is the thing that makes the first monster's punch mean something.
//
// MAX is 200 and he heals 26/s once he has been clear for 0.7s. Measured against
// each attacker's real cadence, over a minute apiece:
//
//   one monster that has NOT realized (9 every 1.2s)   200 -> 191, and holds
//   two of them                                        floored in ~28s
//   one that HAS realized, in a rage (13 every 0.9s)   floored inside its window
//
// So a monster that still thinks he is prey cannot meaningfully hurt him — it
// gives back more between swings than it takes with them, which is the joke the
// whole game is built on. Two of them can. And one that has SEEN what he is and
// come at him anyway can put him on the floor before its 26 seconds of rage run
// out, which is the point of the realization being worth anything at all. A
// collapsing building and his own thrown car do not care how strong he is either.
//
// Those numbers are load-bearing on each other, so change none of them alone:
// the delay in particular has to sit INSIDE a swing cadence or regeneration
// never runs during a fight at all. It was 2.0s against a 1.2s cadence, which
// meant `sinceHit` was reset before it could ever reach it — every sentence
// above was false, and the bar only ever went one way.
//
// Going down is a setback, never a game over: he gets up where he fell, at half
// health, having dropped a tenth of his points. There is no score to protect and
// no run to lose, so a death screen would only be a wall between the player and
// the next thing he wanted to hit.
import { emit, on, EV } from '../core/events.js';
import { save, persist } from '../core/state.js';
import { flashVignette } from '../ui/hud.js';
import { clamp } from '../core/mathx.js';

export const MAX_HP = 200;
const REGEN = 26;             // hp per second
const REGEN_DELAY = 0.7;      // seconds of no damage before it starts — must be
                              // shorter than a monster's swing cadence (1.2s)
const REGEN_TICK = 0.12;      // matches #hp-fill's width transition in the CSS
const DOWN_TIME = 2.6;        // seconds on the floor
const REVIVE_FRACTION = 0.5;

export function createHealth(player, cam) {
  const p = player.p;
  const st = {
    hp: MAX_HP,
    max: MAX_HP,
    sinceHit: 99,
    downT: 0,
    lastCause: '',
  };
  let regenT = REGEN_TICK;     // so the first step of a regen posts immediately
  p.hp = st.hp;
  p.maxHp = MAX_HP;

  function fixedUpdate(dt) {
    if (st.downT > 0) {
      st.downT -= dt;
      if (st.downT <= 0) revive();
      return;
    }
    st.sinceHit += dt;
    if (st.hp < st.max && st.sinceHit > REGEN_DELAY) {
      st.hp = Math.min(st.max, st.hp + REGEN * dt);
      p.hp = st.hp;
      // Posted at the rate the bar can actually animate, not once per fixed
      // step. hud.js setHealth does five DOM writes an event, and #hp-fill and
      // #hp-ghost carry 0.12s and 0.55s width transitions — emitting at 60Hz
      // restarted both every 16ms for the whole regen window, so the fill
      // crawled and the ghost never played at all.
      regenT += dt;
      if (regenT >= REGEN_TICK || st.hp >= st.max) {
        regenT = 0;
        emit(EV.PLAYER_HEALTH, { hp: st.hp, max: st.max, healing: true });
      }
    } else {
      regenT = REGEN_TICK;
    }
  }

  // `severity` 0..1 drives the screen and the camera; damage alone is a poor
  // proxy because a hydrant bursting under you and a monster landing a hit are
  // the same number and nothing like the same event.
  function damage(amount, cause = 'hit', severity = 0) {
    if (st.downT > 0 || amount <= 0) return 0;
    const before = st.hp;
    st.hp = Math.max(0, st.hp - amount);
    p.hp = st.hp;
    st.sinceHit = 0;
    st.lastCause = cause;
    const sev = severity || clamp(amount / 40, 0.15, 1);
    flashVignette(0.35 + sev * 0.5);
    cam.shake(0.1 + sev * 0.35);
    emit(EV.PLAYER_HURT, { amount: before - st.hp, hp: st.hp, max: st.max, cause });
    emit(EV.PLAYER_HEALTH, { hp: st.hp, max: st.max, healing: false });
    if (st.hp <= 0) goDown(cause);
    return before - st.hp;
  }

  function heal(amount) {
    st.hp = Math.min(st.max, st.hp + amount);
    p.hp = st.hp;
    emit(EV.PLAYER_HEALTH, { hp: st.hp, max: st.max, healing: true });
  }

  function goDown(cause) {
    st.downT = DOWN_TIME;
    p.dead = true;
    // Losing a tenth is enough to sting without ever undoing an evening's work,
    // and it is taken from the SPENDABLE balance only — nothing already bought
    // can be taken back.
    const lost = Math.floor(save.points * 0.1);
    save.points = Math.max(0, save.points - lost);
    // The readout only ever moves on EV.POINTS, and core/points.js only writes
    // through on award()'s 2.5s batch timer or on a purchase. Without both of
    // these the HUD went on showing the old balance until the next kill, and a
    // reload handed the points straight back.
    if (lost) { emit(EV.POINTS, { delta: -lost, total: save.points, label: null }); persist(); }
    p.loco?.playOneshot?.('die', { timeScale: 1, clamp: true, hold: true });
    cam.shake(0.9);
    flashVignette(1);
    emit(EV.PLAYER_DOWN, { cause, lostPoints: lost });
  }

  function revive() {
    st.hp = st.max * REVIVE_FRACTION;
    p.hp = st.hp;
    p.dead = false;
    st.sinceHit = 0;
    p.loco?.reset?.();
    emit(EV.PLAYER_REVIVED, { hp: st.hp, max: st.max });
    emit(EV.PLAYER_HEALTH, { hp: st.hp, max: st.max, healing: true });
  }

  // Debris and thrown props hurt too — the physics world already knows when
  // something heavy lands on you, it just had nothing to tell.
  // `building` on this event is a numeric spec id (world/city.js), not the
  // building — `(3)?.spec` is undefined, so this handler returned on every
  // single collapse and the rubble never touched him. The event already carries
  // the footprint centre and half-span, which is all that was wanted.
  on(EV.BUILDING_COLLAPSED, ({ x, z, r }) => {
    if (x === undefined) return;
    const reach = (r || 7) + 6;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < reach) damage(28 * (1 - d / reach), 'rubble', 0.7);
  });

  window.__test.health = () => ({
    hp: +st.hp.toFixed(1), max: st.max, down: st.downT > 0,
    downT: +Math.max(st.downT, 0).toFixed(2), cause: st.lastCause,
  });
  window.__test.hurtPlayer = (n) => damage(n, 'test');

  return { st, fixedUpdate, damage, heal, get down() { return st.downT > 0; } };
}
