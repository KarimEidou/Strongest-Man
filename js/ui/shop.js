// The armoury: what the city paid you, spent.
//
// Opens from the HUD or from the pause menu, pauses the world while it is up,
// and is rebuilt from `save` every time it opens rather than kept in sync —
// there are six rows and it is behind a button press, so the simple thing is
// also the correct one.
import { GUNS, GUN_IDS } from '../player/weapons.js';
import { save, game, setGameState, persist } from '../core/state.js';
import { emit, EV } from '../core/events.js';

const el = (id) => document.getElementById(id);

export function initShop(points, weapons) {
  const screen = el('shop-screen');
  const list = el('shop-list');
  // Where DONE goes back to. Opened from the HUD it resumes the game; opened
  // from the pause menu it returns to the pause menu — closing straight to a
  // still-paused world with every overlay hidden is a dead end with no way out.
  let from = 'hud';

  function open(origin = 'hud') {
    from = origin;
    if (game.state === 'playing') setGameState('paused');
    build();
    screen.hidden = false;
  }

  function close() {
    screen.hidden = true;
    if (from === 'pause') el('pause-screen').hidden = false;
    else setGameState('playing');
  }

  function build() {
    el('shop-points').textContent = save.points.toLocaleString('en-US');
    list.textContent = '';
    for (const id of GUN_IDS) {
      const g = GUNS[id];
      const owned = save.owned.includes(id);
      const equipped = save.equipped === id;
      const afford = save.points >= g.price;

      const row = document.createElement('div');
      row.className = `gun-row${owned ? ' owned' : ''}${equipped ? ' on' : ''}`;

      // Name and blurb share a line: six weapons at three lines each does not
      // fit a landscape phone above the DONE button, and a shop you have to
      // scroll to leave is a shop people stop opening.
      const head = document.createElement('div');
      head.className = 'gun-head';
      const name = document.createElement('span');
      name.className = 'gun-name';
      name.textContent = g.name;
      const blurb = document.createElement('span');
      blurb.className = 'gun-blurb';
      blurb.textContent = g.blurb;
      head.append(name, blurb);
      row.appendChild(head);

      const stats = document.createElement('div');
      stats.className = 'gun-stats';
      const dps = Math.round(g.dmg * (g.pellets || 1) * (g.rpm / 60));
      stats.innerHTML = `DMG <b>${g.dmg}${g.pellets ? `×${g.pellets}` : ''}</b>`
        + ` · RPM <b>${g.rpm}</b>`
        + ` · DPS <b>${dps}</b>`
        + ` · RANGE <b>${g.range}m</b>`
        + ` · MAG <b>${g.mag}</b>`
        + (g.pierce ? ` · PIERCES <b>${g.pierce + 1}</b>` : '')
        + (g.blast ? ' · <b>EXPLOSIVE</b>' : '');
      row.appendChild(stats);

      const btn = document.createElement('button');
      btn.className = 'gun-buy';
      btn.dataset.id = id;
      if (equipped) {
        btn.classList.add('equipped');
        btn.textContent = 'EQUIPPED';
        btn.disabled = true;
      } else if (owned) {
        btn.classList.add('ghost');
        btn.textContent = 'EQUIP';
        btn.addEventListener('click', () => { weapons.equip(id); build(); });
      } else {
        btn.textContent = `${g.price.toLocaleString('en-US')}`;
        btn.disabled = !afford;
        btn.addEventListener('click', () => buy(id));
      }
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  function buy(id) {
    const g = GUNS[id];
    if (!g || save.owned.includes(id)) return;
    if (save.points < g.price) return;
    // Build the gun BEFORE taking the money. buildGun reaches into the model
    // registry and the weapon pools; if anything in there throws, the old order
    // had already debited and persisted, so the player was charged for a gun
    // they did not get and the panel never refreshed to show it.
    try {
      weapons.buildGun(id);
    } catch (err) {
      console.error(`shop: could not build ${id}`, err);
      const btn = list.querySelector(`.gun-buy[data-id="${id}"]`);
      if (btn) { btn.textContent = 'UNAVAILABLE'; btn.disabled = true; }
      return;
    }
    if (!points.spend(g.price)) return;
    save.owned.push(id);
    persist();
    emit(EV.WEAPON_BOUGHT, { id, price: g.price });
    weapons.equip(id);
    build();
  }

  el('btn-shop')?.addEventListener('click', () => open('hud'));
  el('btn-pause-shop')?.addEventListener('click', () => {
    el('pause-screen').hidden = true;
    open('pause');
  });
  el('btn-shop-done')?.addEventListener('click', close);

  window.__test.shop = { open, close, buy, isOpen: () => !screen.hidden };
  return { open, close, buy };
}
