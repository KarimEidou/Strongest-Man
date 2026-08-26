// Player health.
//
// He is the strongest man in the universe, so the bar is not a difficulty knob —
// it is the thing that makes the first monster's punch mean something. One
// monster cannot kill him: MAX is 200, a swing is 9, and out of contact he heals
// 14/s after a two-second gap, so a lone attacker loses ground. Three of them
// working at once out-damage the regeneration, and a collapsing building or his
// own thrown car does not care how strong he is.
//
// Going down is a setback, never a game over: he gets up where he fell, at half
// health, having dropped a tenth of his points. There is no score to protect and
// no run to lose, so a death screen would only be a wall between the player and
// the next thing he wanted to hit.
import { emit, on, EV } from '../core/events.js';
import { save } from '../core/state.js';
import { flashVignette } from '../ui/hud.js';
import { clamp } from '../core/mathx.js';

export const MAX_HP = 200;
const REGEN = 14;             // hp per second
const REGEN_DELAY = 2.0;      // seconds of no damage before it starts
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
      emit(EV.PLAYER_HEALTH, { hp: st.hp, max: st.max, healing: true });
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
  on(EV.BUILDING_COLLAPSED, ({ building }) => {
    if (!building?.spec) return;
    const s = building.spec;
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const r = Math.max(s.x1 - s.x0, s.z1 - s.z0) * 0.5 + 6;
    const d = Math.hypot(p.x - cx, p.z - cz);
    if (d < r) damage(28 * (1 - d / r), 'rubble', 0.7);
  });

  window.__test.health = () => ({
    hp: +st.hp.toFixed(1), max: st.max, down: st.downT > 0,
    downT: +Math.max(st.downT, 0).toFixed(2), cause: st.lastCause,
  });
  window.__test.hurtPlayer = (n) => damage(n, 'test');

  return { st, fixedUpdate, damage, heal, get down() { return st.downT > 0; } };
}
