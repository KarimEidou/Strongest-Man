// Dialogue director: turns game events + ambient life into speech bubbles.
// Every bark is canned-instant; Groq (when a key exists) enriches the cache
// in the background so repeat situations gain variety. Only the TALK button
// ever shows a thinking ellipsis, capped at 1.2s.
import { on, EV } from '../core/events.js';
import { cannedLine } from './lines.js';
import { say, bubblesFrame } from './bubbles.js';
import { cachedLine, requestLine, groqTick, groqAvailable, chatUnavailable, chatBusy } from './groq.js';
import { ask, endSession, speakDuration, historyOf } from './conversation.js';
import { karmaBand } from '../ai/karma.js';
import { neighbors } from '../ai/crowd.js';
import { save, game } from '../core/state.js';
import { input } from '../core/input.js';
import { rand, pick, randRange } from '../core/mathx.js';

const scratch = [];

export function initDialogue(npcSys, monsterSys, reputation, player, cam) {
  const head = (n) => () => (n.state === 'dead' && !n.body ? { x: n.x, y: n.y + 1.2, z: n.z } : { x: n.x, y: n.y + 1.95, z: n.z });
  const mhead = (m) => () => ({ x: m.x, y: m.y + (m.targetH || 3.2) + 0.5, z: m.z });

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
  // The beat before someone notices the monster. This used to be a bare
  // setTimeout, which is wall-clock: pausing inside those 1.2s put a scream
  // bubble over the pause overlay and burned the barked NPC's 6s cooldown on a
  // line the player never saw. The handle was not kept either, so nothing could
  // cancel it, and the closure held a monster that may have been killed and
  // despawned before it fired.
  //
  // On the fixed step instead, so it inherits the pause, the sim clock and
  // slow-motion, and the monster is re-checked at the moment it fires.
  const pendingSpots = [];
  on(EV.MONSTER_SPAWNED, ({ monster }) => { pendingSpots.push({ monster, t: 1.2 }); });
  function spotTick(dt) {
    for (let i = pendingSpots.length - 1; i >= 0; i--) {
      const p = pendingSpots[i];
      if ((p.t -= dt) > 0) continue;
      pendingSpots.splice(i, 1);
      if (p.monster.dead || p.monster.despawned) continue;
      neighbors(p.monster.x, p.monster.z, 45, scratch);
      const n = scratch.find((o) => o.state !== 'dead');
      if (n) bark(n, 'monster_spot', { cls: 'scream', force: true });
    }
  }
  on(EV.MONSTER_DIED, ({ byPlayer, x, z }) => {
    if (!byPlayer) return;
    // Thanking him requires him to be there. One of these lines is "Did you see
    // that?! He took it down with his HANDS!" (dialogue/lines.js) — fine for
    // every kill in the game until this drop gave him a 220m rifle, after which
    // a crowd around a corpse was cheering an empty street.
    if ((player.p.x - x) ** 2 + (player.p.z - z) ** 2 > 900) return;
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
    spotTick(dt);
    // Anything that takes them out of the conversation ends it: fleeing a
    // monster, being grabbed, hiding indoors, dying. Only closeChat() clears
    // input.textFocus, so without this the panel — and the input lock with it —
    // could outlive the conversation indefinitely whenever the NPC panicked but
    // stayed inside the walk-away radius.
    if (chat.npc && chat.npc.state !== 'talking') interrupt();
    // walking away ends it
    if (chat.npc && Math.hypot(chat.npc.x - player.p.x, chat.npc.z - player.p.z) > 7) closeChat();
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

  // ---- TALK: open a real conversation with whoever is in front of you
  const chat = {
    el: null, log: null, form: null, input: null, who: null, hint: null,
    npc: null, live: false,
  };

  // The one place the player is told the model did not answer. Silence here is
  // exactly what made a rejected key indistinguishable from having no key: the
  // reply still arrived, it was just canned and unrelated to what they typed.
  function showHint(reason) {
    if (!chat.hint) return;
    chat.hint.textContent = reason || '';
    chat.hint.classList.toggle('hidden', !reason);
  }

  function bindChat() {
    if (chat.el) return;
    chat.el = document.getElementById('chat');
    chat.log = document.getElementById('chat-log');
    chat.form = document.getElementById('chat-form');
    chat.input = document.getElementById('chat-input');
    chat.who = document.getElementById('chat-who');
    chat.hint = document.getElementById('chat-hint');
    if (!chat.el) return;
    chat.form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    // The world keeps running behind the panel, so the controls have to go quiet
    // while a finger is in the text field or typing would also drive the man.
    chat.input.addEventListener('focus', () => { input.textFocus = true; });
    chat.input.addEventListener('blur', () => { input.textFocus = false; });
    document.getElementById('chat-close').addEventListener('click', () => closeChat());
  }

  function line(cls, text) {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    chat.log.appendChild(d);
    chat.log.scrollTop = chat.log.scrollHeight;
    return d;
  }

  function openChat(n) {
    bindChat();
    if (!chat.el) return false;
    chat.npc = n;
    chat.log.textContent = '';
    chat.who.textContent = (n.archetype || 'stranger').toUpperCase();
    chat.el.hidden = false;
    chat.live = false;
    showHint(chatUnavailable());
    for (const m of historyOf(n)) line(m.role === 'user' ? 'you' : 'them', m.content);
    npcSys.sys.beginTalk?.(n);
    cam.frameTwoShot(player.p, n);
    player.p.talkingTo = n;
    // NOT focused here. openChat is reached from the fixed-step loop (the TALK
    // button sets a flag, pollInput folds it in, the dialogue system acts on
    // it), and a focus() call that far from the tap is not a user gesture — iOS
    // shows no keyboard, while input.textFocus goes true and locks every
    // control. The player is left in a conversation they cannot type in or
    // leave. The field is focused by its own tap instead, and the hint says so.
    return true;
  }

  function closeChat(keepSession = true) {
    if (!chat.npc) return;
    const n = chat.npc;
    chat.npc = null;
    chat.el.hidden = true;
    input.textFocus = false;
    chat.input.blur();
    npcSys.sys.endTalk?.(n);
    if (!keepSession) endSession(n);
    cam.clearFraming();
    player.p.talkingTo = null;
  }

  async function submit() {
    const n = chat.npc;
    const text = chat.input.value.trim();
    if (!n || !text || chatBusy()) return;
    chat.input.value = '';
    line('you', text);
    const pending = line('them pending', '…');
    const { text: reply, live, reason } = await ask(n, text, {
      timeOfDay: game.timeOfDay,
      attitude: reputation.attitude(n),
      recent: lastEvent,
    });
    if (chat.npc !== n) return;              // they died / you walked off
    chat.live = live;
    showHint(live ? null : reason);
    // A fallback line reads differently in the log too, so the difference is
    // visible even after the hint scrolls out of mind.
    pending.className = live ? 'them' : 'them canned';
    pending.textContent = reply;
    chat.log.scrollTop = chat.log.scrollHeight;
    // the physical half: they stop, face you, and visibly say it
    npcSys.sys.speak?.(n, speakDuration(reply));
    say(head(n), reply.length > 90 ? `${reply.slice(0, 88)}…` : reply, { life: speakDuration(reply) + 1.2, key: `npc${n.id}` });
  }

  function onInteract() {
    if (chat.npc) { closeChat(); return true; }
    neighbors(player.p.x, player.p.z, 3.6, scratch);
    const n = scratch.find((o) => o.state !== 'dead' && o.state !== 'carried');
    if (!n) return false;
    n.yaw = Math.atan2(player.p.x - n.x, player.p.z - n.z);
    return openChat(n);
  }

  // A conversation cannot survive the city coming apart around it.
  let lastEvent = '';
  on(EV.BUILDING_COLLAPSED, () => { lastEvent = 'a building came down in the street'; interrupt(); });
  // ...but only when it is coming apart HERE. Spawn frequency is roughly three
  // times what it was, so an unconditional interrupt ended every conversation in
  // the city on a timer. 45m is the monster_spot bark radius above: inside it
  // somebody can see the thing, outside it nothing has happened to them yet.
  on(EV.MONSTER_SPAWNED, ({ monster }) => {
    lastEvent = 'a monster walked in out of the fog';
    if (monster && Math.hypot(monster.x - player.p.x, monster.z - player.p.z) < 45) interrupt();
  });
  on(EV.CAR_EXPLODED, () => { lastEvent = 'a car went up like a bomb'; });
  // Not any more, it wasn't. This line asserts the one thing the premise depends
  // on keeping quiet, and after this drop a sniper round at 200m set it. Held
  // state is an exact proxy at the instant the event fires: combat.js refuses a
  // swing while a gun is out and weapons.js only fires when one is, so the two
  // are mutually exclusive — and a throw or a crush happens with empty hands and
  // correctly keeps the original line.
  on(EV.MONSTER_DIED, () => {
    lastEvent = save.equipped
      ? 'someone shot a monster dead in the street'
      : 'someone killed a monster with their bare hands';
  });
  on(EV.NPC_DIED, ({ npc }) => { if (chat.npc === npc) closeChat(false); });

  function interrupt() {
    if (!chat.npc) return;
    const n = chat.npc;
    closeChat();
    bark(n, 'panic_scream', { cls: 'scream', force: true });
  }

  function frameUpdate(dt) {
    bubblesFrame(dt);
  }


  window.__test.talk = onInteract;
  window.__test.chatSay = async (text) => {
    if (!chat.npc) return null;
    chat.input.value = text;
    await submit();
    return { npc: chat.npc?.id ?? null, state: chat.npc?.state ?? null, log: chat.log.textContent };
  };
  window.__test.chatState = () => ({
    open: !!chat.npc,
    // What the town is currently said to be talking about, verbatim — this goes
    // into the model's system prompt, so it is worth being able to read back.
    lastEvent,
    live: chat.live,
    hint: chat.hint ? chat.hint.textContent : null,
    hintShown: chat.hint ? !chat.hint.classList.contains('hidden') : false,
    npcState: chat.npc?.state ?? null,
    speakT: +(chat.npc?.speakT ?? 0).toFixed(2),
    npcSpeed: +(chat.npc?.speed ?? 0).toFixed(2),
    facing: chat.npc ? +Math.abs(((chat.npc.yaw - Math.atan2(player.p.x - chat.npc.x, player.p.z - chat.npc.z)) + Math.PI) % (Math.PI * 2) - Math.PI).toFixed(3) : null,
    lines: chat.log ? chat.log.children.length : 0,
  });
  return { fixedUpdate, frameUpdate, onInteract };
}
