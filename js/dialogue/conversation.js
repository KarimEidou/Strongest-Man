// Live conversations with the townsfolk.
//
// The existing dialogue system is one-shot barks backed by a canned corpus, with
// the model only enriching a cache in the background. This is the other thing:
// you press TALK, type, and get an answer from a model that knows who it is
// talking to and what you have been doing to their city.
//
// Every session is grounded in game state — the speaker's archetype, whether
// they have actually SEEN what you can do, public opinion of you, their district
// and the time of day — so the same NPC answers you differently before and after
// they watch you throw a taxi.
import { chatTurn, chatUnavailable, describeError } from './groq.js';
import { cannedLine } from './lines.js';
import { karmaBand } from '../ai/karma.js';
import { save } from '../core/state.js';
import { BLOCKS } from '../world/city.js';

const MAX_TURNS = 8;
const sessions = new Map();      // npc.id -> { history: [], t }

const KARMA_LINE = {
  saint: 'a beloved local hero',
  good: 'well liked',
  neutral: 'nobody in particular',
  feared: 'feared and distrusted',
  monster: 'a walking catastrophe people blame for everything',
};

const ARCHETYPE_LINE = {
  worker: 'a commuter on your way home from a shift',
  vendor: 'a shopkeeper who works this street',
  kid: 'a teenager who is out later than you should be',
};

// reputation.attitude(n) already decides how this person treats him second to
// second — it drives whether they flee, stare or keep their distance. It was
// being computed in talk.js and then thrown away here, which is why a terrified
// vendor and an adoring kid produced the same neutral voice.
const ATTITUDE_LINE = {
  oblivious: 'He is a stranger to you. You answer him the way you would answer anyone.',
  curious: 'You are curious about him. You would like to know if the stories are true.',
  wary: 'You do not trust him. You keep your answers short and your distance.',
  whisper: 'You know what he is and you talk about him behind his back. To his face you are careful.',
  awe: 'You look up to him. Being spoken to by him is the best thing to happen to you this month.',
  terror: 'You are frightened of him. You want this conversation over.',
};

function knowledgeLine(n) {
  if (n.knowledge >= 55) return 'You have SEEN him do something impossible with his bare hands. You know exactly what he is.';
  if (n.knowledge >= 25) return 'You have heard rumours about this man. You are not sure you believe them.';
  return 'As far as you know he is just some guy in a jacket.';
}

function districtName(x, z) {
  for (const b of BLOCKS) {
    if (x > b.x0 - 9 && x < b.x1 + 9 && z > b.z0 - 9 && z < b.z1 + 9) return b.name;
  }
  return 'downtown';
}

function clockLine(t) {
  const h = Math.floor(t * 24);
  if (h < 5) return 'the small hours';
  if (h < 11) return 'morning';
  if (h < 15) return 'the middle of the day';
  if (h < 19) return 'late afternoon';
  if (h < 22) return 'dusk';
  return 'night';
}

export function systemPrompt(n, ctx) {
  return [
    `You are ${ARCHETYPE_LINE[n.archetype] || 'a passer-by'} in a stylized low-poly city.`,
    `A man in a jacket has stopped you in ${districtName(n.x, n.z)}. It is ${clockLine(ctx.timeOfDay)}.`,
    knowledgeLine(n),
    ATTITUDE_LINE[ctx.attitude] || ATTITUDE_LINE.oblivious,
    `Public opinion of him around here: ${KARMA_LINE[karmaBand()] || 'mixed'}.`,
    ctx.recent ? `Something people are still talking about: ${ctx.recent}.` : '',
    'Answer IN CHARACTER, out loud, as this person. One or two short sentences, under 35 words.',
    'No narration, no stage directions, no asterisks, no quotation marks, no emoji. PG-13.',
  ].filter(Boolean).join(' ');
}

export function sessionFor(n) {
  let s = sessions.get(n.id);
  if (!s) { s = { history: [], t: 0 }; sessions.set(n.id, s); }
  return s;
}

export function endSession(n) { sessions.delete(n.id); }

export function historyOf(n) { return sessionFor(n).history; }

// Returns { text, live, reason } — live=false means the model never answered and
// the line came from the built-in corpus, with `reason` saying why in words the
// player can act on. Degrading silently is what made a bad key look exactly like
// no key at all: the caller MUST show the reason.
export async function ask(n, playerText, ctx) {
  const s = sessionFor(n);
  s.history.push({ role: 'user', content: playerText });
  while (s.history.length > MAX_TURNS * 2) s.history.shift();

  let reason = chatUnavailable();
  if (!reason) {
    const { line, error } = await chatTurn([
      { role: 'system', content: systemPrompt(n, ctx) },
      ...s.history,
    ]);
    if (line) {
      s.history.push({ role: 'assistant', content: line });
      return { text: line, live: true, reason: null };
    }
    reason = describeError(error);
  }

  const att = ctx.attitude || 'oblivious';
  const situation = att === 'terror' ? 'talk_terror' : att === 'awe' ? 'talk_awe' : 'talk_neutral';
  const text = cannedLine(situation, karmaBand()) || cannedLine(situation, 'any') || '…';
  s.history.push({ role: 'assistant', content: text });
  return { text, live: false, reason };
}

// Roughly how long this NPC should keep gesturing: reading speed, clamped.
export function speakDuration(text) {
  return Math.min(6.5, Math.max(1.6, (text.split(/\s+/).length / 2.6)));
}

export function karmaSummary() { return { band: karmaBand(), value: save.karma }; }
