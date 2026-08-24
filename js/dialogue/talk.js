// Dialogue director: turns game events + ambient life into speech bubbles.
// Every bark is canned-instant; Groq (when a key exists) enriches the cache
// in the background so repeat situations gain variety. Only the TALK button
// ever shows a thinking ellipsis, capped at 1.2s.
import { on, EV } from '../core/events.js';
import { cannedLine } from './lines.js';
import { say, bubblesFrame } from './bubbles.js';
import { cachedLine, requestLine, groqTick, groqAvailable } from './groq.js';
import { karmaBand } from '../ai/karma.js';
import { neighbors } from '../ai/crowd.js';
import { save } from '../core/state.js';
import { rand, pick, randRange } from '../core/mathx.js';

const scratch = [];

export function initDialogue(npcSys, monsterSys, reputation, player, cam) {
  const head = (n) => () => (n.state === 'dead' && !n.body ? { x: n.x, y: n.y + 1.2, z: n.z } : { x: n.x, y: n.y + 1.95, z: n.z });
  const mhead = (m) => () => ({ x: m.x, y: m.y + 3.2, z: m.z });

  const lastBark = new Map(); // npc -> time
  let now = 0;

  function bark(n, situation, { cls = '', force = false, life } = {}) {
    if (!n || (n.dead && situation !== 'witness_feat')) return;
    if (!force && now - (lastBark.get(n.id) ?? -99) < 6) return;
    lastBark.set(n.id, now);
    const band = karmaBand();
    const key = `${situation}|${band}|${repBand(n)}|${n.archetype}`;
    const line = cachedLine(key) || cannedLine(situation, band) || cannedLine(situation, 'any');
    if (!line) return;
    say(head(n), line, { cls, life, key: `npc${n.id}` });
    // enrich the cache in the background for next time
    maybeAsk(key, situation, n);
  }

  function repBand(n) {
    return n.knowledge >= 55 ? 'legend' : n.knowledge >= 25 ? 'rumored' : 'unknown';
  }

  function maybeAsk(key, situation, n) {
    if (!groqAvailable() || rand() > 0.5) return;
    const band = karmaBand();
    const repLine = { legend: 'the strongest man alive', rumored: 'someone people whisper about', unknown: 'a nobody' }[repBand(n)];
    const karmaLine = {
      saint: 'a beloved hero', good: 'well liked', neutral: 'unknown',
      feared: 'feared and distrusted', monster: 'a walking catastrophe',
    }[band];
    const situationLine = {
      greet: 'The player walks past them on the street.',
      thank: 'The player just killed a monster and saved them.',
      witness_feat: 'They just watched the player do something impossible with one punch.',
      whisper_awe: 'They spot the player nearby and whisper to a friend.',
      panic_scream: 'A monster attack — they are fleeing for their lives.',
      monster_spot: 'A huge monster just appeared down the street.',
      hide_talk: 'They are hiding indoors from the chaos outside.',
      idle_chatter: 'Ordinary small talk with a neighbor in the city.',
      gossip_give: 'They are telling a neighbor a rumor about the quiet strong man.',
      insult: 'They hate the player for the destruction he caused.',
      beg_mercy: 'The player is close and they are terrified of him.',
      talk_neutral: 'The player stopped to say hello.',
      talk_awe: 'Their hero stopped to talk to them.',
      talk_terror: 'The man who destroys buildings stopped in front of them.',
    }[situation] || 'City life.';
    const prompt = `Speaker: ${n.archetype}. Mood: ${situation.includes('panic') || situation.includes('terror') ? 'terrified' : 'candid'}.
Context: ${situationLine}
The player is known here as: ${repLine}. Public opinion of the player: ${karmaLine}.
Line:`;
    requestLine(key, prompt);
  }

  // ---- event barks
  on(EV.WITNESS, ({ npc, magnitude }) => {
    if (magnitude >= 30 && rand() < 0.65) bark(npc, 'witness_feat', { force: true });
  });
  on(EV.SCREAM, ({ x, z }) => {
    neighbors(x, z, 12, scratch);
    const n = scratch.find((o) => o.panicLevel > 0 && o.state !== 'dead');
    if (n && rand() < 0.4) bark(n, 'panic_scream', { cls: 'scream' });
  });
  on(EV.MONSTER_SPAWNED, ({ monster }) => {
    setTimeout(() => {
      neighbors(monster.x, monster.z, 45, scratch);
      const n = scratch.find((o) => o.state !== 'dead');
      if (n) bark(n, 'monster_spot', { cls: 'scream', force: true });
    }, 1200);
  });
  on(EV.MONSTER_DIED, ({ byPlayer, x, z }) => {
    if (!byPlayer) return;
    neighbors(x, z, 18, scratch);
    let count = 0;
    for (const n of scratch) {
      if (n.state === 'dead' || count >= 2) continue;
      bark(n, 'thank', { force: true });
      count++;
    }
  });
  on(EV.MONSTER_REALIZED, ({ monster }) => {
    say(mhead(monster), '?!', { cls: 'scream', life: 1.6 });
  });

  // ---- ambient life
  let ambientT = 0;
  function fixedUpdate(dt) {
    now += dt;
    groqTick(dt);
    ambientT -= dt;
    if (ambientT > 0) return;
    ambientT = randRange(3.5, 6);

    // nearest talking-distance NPCs to the player get ambient lines
    neighbors(player.p.x, player.p.z, 16, scratch);
    if (!scratch.length) return;
    const n = pick(scratch);
    if (!n || n.state === 'dead') return;
    const att = reputation.attitude(n);
    if (n.state === 'hide') { if (rand() < 0.5) bark(n, 'hide_talk'); return; }
    if (n.panicLevel > 0) return; // screams come from events
    const d = Math.hypot(n.x - player.p.x, n.z - player.p.z);

    if (d < 6.5) {
      if (att === 'terror') bark(n, save.karma <= -60 && rand() < 0.4 ? 'insult' : 'beg_mercy');
      else if (att === 'awe') bark(n, 'whisper_awe');
      else if (att === 'wary') bark(n, 'shop_closed');
      else if (rand() < 0.55) bark(n, 'greet');
    } else if (n.state === 'chat' && n.chatPartner) {
      bark(n, n.knowledge >= 25 && rand() < 0.5 ? 'gossip_give' : 'idle_chatter');
    }
  }

  // ---- TALK button: the one place a short "…" wait is allowed
  function onInteract() {
    neighbors(player.p.x, player.p.z, 3.2, scratch);
    const n = scratch.find((o) => o.state !== 'dead' && o.state !== 'carried');
    if (!n) return false;
    n.yaw = Math.atan2(player.p.x - n.x, player.p.z - n.z);
    const att = reputation.attitude(n);
    const situation = att === 'terror' ? 'talk_terror' : att === 'awe' ? 'talk_awe' : 'talk_neutral';
    const band = karmaBand();
    const key = `${situation}|${band}|${repBand(n)}|${n.archetype}`;
    const cached = cachedLine(key);
    if (cached) { say(head(n), cached, { key: `npc${n.id}` }); maybeAsk(key, situation, n); return true; }
    if (groqAvailable()) {
      say(head(n), '…', { life: 1.5, key: `npc${n.id}` });
      let answered = false;
      maybeAskDirect(key, situation, n, (line) => { answered = true; say(head(n), line, { key: `npc${n.id}` }); });
      setTimeout(() => { if (!answered) say(head(n), cannedLine(situation, band) || cannedLine(situation, 'any'), { key: `npc${n.id}` }); }, 1200);
    } else {
      say(head(n), cannedLine(situation, band) || cannedLine(situation, 'any'), { key: `npc${n.id}` });
    }
    return true;
  }

  function maybeAskDirect(key, situation, n, onArrive) {
    // like maybeAsk but always fires and reports back
    const saved = rand; // (no-op; direct request below)
    const band = karmaBand();
    const repLine = { legend: 'the strongest man alive', rumored: 'someone people whisper about', unknown: 'a nobody' }[repBand(n)];
    const prompt = `Speaker: ${n.archetype}. Mood: candid.
Context: The player stopped to talk to them on the street.
The player is known here as: ${repLine}. Public opinion of the player: ${band}.
Line:`;
    requestLine(key, prompt, onArrive);
  }

  function frameUpdate(dt) {
    bubblesFrame(dt);
  }

  window.__test.talk = onInteract;
  return { fixedUpdate, frameUpdate, onInteract };
}
