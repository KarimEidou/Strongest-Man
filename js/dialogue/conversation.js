// Live conversations with the townsfolk.
//
// The existing dialogue system is one-shot barks backed by a canned corpus, with
// the model only enriching a cache in the background. This is the other thing:
// you press TALK, type, and get an answer from a model that knows who it is
// talking to and what you have been doing to their city.
//
// Every session is grounded in game state — the speaker's archetype, their
// district and the time of day. Nobody keeps a score of you any more, so the
// prompt no longer carries a reputation or a public-opinion line: you are a
// stranger to everyone, every time.
import { chatTurn, chatUnavailable, describeError } from './groq.js';
import { cannedLine } from './lines.js';
import { BLOCKS } from '../world/city.js';

const MAX_TURNS = 8;
const sessions = new Map();      // npc.id -> { history: [], t }

// The one band the canned corpus is indexed on now. lines.js resolves
// `LINES[situation][band] ?? LINES[situation].any`, and 'neutral' has an entry
// for every situation that survived.
const BAND = 'neutral';

const ARCHETYPE_LINE = {
  worker: 'a commuter on your way home from a shift',
  vendor: 'a shopkeeper who works this street',
  kid: 'a teenager who is out later than you should be',
};

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
    'As far as you know he is just some guy in a jacket.',
    'He is a stranger to you. You answer him the way you would answer anyone.',
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

  const text = cannedLine('talk_neutral', BAND) || cannedLine('talk_neutral', 'any') || '…';
  s.history.push({ role: 'assistant', content: text });
  return { text, live: false, reason };
}

// Roughly how long this NPC should keep gesturing: reading speed, clamped.
export function speakDuration(text) {
  return Math.min(6.5, Math.max(1.6, (text.split(/\s+/).length / 2.6)));
}

