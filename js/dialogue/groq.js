// Groq client. Hard rules: canned lines always show instantly (LLM responses
// back-fill a cache for future identical situations); a conservative token
// bucket stays far inside the free tier; the key lives in localStorage and goes
// only to api.groq.com.
//
// Every failure used to collapse into a bare `null`, so a mistyped key, a
// decommissioned model id, a 15s timeout and "no key at all" were the same
// event to the caller — the player just kept getting unrelated canned lines
// with nothing on screen to explain why. Now every path returns the HTTP status
// and the server's own error.message, and the two consumers keep SEPARATE
// clocks: a background bark tripping a 429 must never black out the
// conversation the player is standing in.
import { settings } from '../core/state.js';
import { flags } from '../core/debug.js';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const CATALOGUE = 'https://api.groq.com/openai/v1/models';

// Best chat model first. A hardcoded guess is how the feature broke before: ids
// get retired without notice, so this is only the ORDER of preference — which
// of them actually exists is answered by the catalogue probe below.
const MODEL_PREFERENCE = [
  'llama-3.3-70b-versatile',
  'moonshotai/kimi-k2-instruct',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
];
const PROBE_BUDGET_MS = 1200;  // the probe is a nicety; it never holds a reply
const DAY_CAP = 4000;
const FALLBACK_TAIL = ' — using built-in lines.';

const bucket = { tokens: 5, cap: 5, refill: 0.25 };  // 15 req/min, half the cap
let modelIdx = 0;            // how far down MODEL_PREFERENCE the 400/404 walk got
let resolvedModel = null;    // id confirmed present in this account's catalogue
let modelProbe = null;       // one probe per session, shared by every caller
let inFlight = false;        // background bark enrichment
let chatInFlight = false;    // player-initiated conversation — its own slot, so a
                             // bark in flight can never swallow the player's turn
let barkDisabledUntil = 0;   // 429/5xx back-off for the ambient chatter only
let chatDisabledUntil = 0;   // ...and the player's own, moved independently
let authError = null;        // { status, message, key }: a key the server refused
let dayCount = 0, dayStamp = '';

const cache = new Map();   // key -> [responses]
const CACHE_LIMIT = 200;

function loadCache() {
  try {
    const raw = localStorage.getItem('sm_dlg_cache');
    if (raw) for (const [k, v] of JSON.parse(raw)) cache.set(k, v);
    const day = JSON.parse(localStorage.getItem('sm_dlg_day') || '{}');
    dayStamp = day.d || '';
    dayCount = day.n || 0;
  } catch { /* fine */ }
}
loadCache();

function persistCache() {
  try {
    localStorage.setItem('sm_dlg_cache', JSON.stringify([...cache.entries()].slice(-120)));
    localStorage.setItem('sm_dlg_day', JSON.stringify({ d: dayStamp, n: dayCount }));
  } catch { /* fine */ }
}

export function cachedLine(key) {
  const arr = cache.get(key);
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollDay() {
  const today = new Date().toDateString();
  if (dayStamp !== today) { dayStamp = today; dayCount = 0; }
}

// A refused key is a config error, not a transient one, so it is remembered
// against the key STRING: paste a new one in Settings and it clears itself.
function refusedKey() {
  if (authError && authError.key !== settings.groqKey) authError = null;
  return authError;
}

// ---- model resolution -------------------------------------------------------
// One GET of the account's catalogue per session, cached in memory. Whatever
// happens to any individual model id, the client can no longer be left pointing
// at something that stopped existing.
function probeModels() {
  if (modelProbe) return modelProbe;
  modelProbe = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(CATALOGUE, {
        signal: controller.signal,
        headers: { authorization: `Bearer ${settings.groqKey}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const ids = new Set((data.data || []).map((m) => m.id));
      return MODEL_PREFERENCE.find((id) => ids.has(id)) || null;
    } catch {
      return null;   // the preference list is the fallback; see modelForChat
    } finally {
      clearTimeout(timer);
    }
  })().then((id) => { if (id) resolvedModel = id; return id; });
  return modelProbe;
}

function withBudget(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// Barks never wait on the catalogue — they start the probe and use the current
// best guess, because a 4s bubble that arrives late is worth nothing anyway.
function modelNow() {
  if (resolvedModel) return resolvedModel;
  probeModels();
  return MODEL_PREFERENCE[modelIdx];
}

async function modelForChat() {
  if (resolvedModel) return resolvedModel;
  const id = await withBudget(probeModels(), PROBE_BUDGET_MS);
  return id || MODEL_PREFERENCE[modelIdx];
}

function candidatesFrom(first) {
  const out = [first];
  for (const id of MODEL_PREFERENCE) if (!out.includes(id)) out.push(id);
  return out;
}

// ---- one request ------------------------------------------------------------
async function serverMessage(res) {
  try {
    const body = await res.json();
    return body?.error?.message || body?.message || '';
  } catch {
    return '';
  }
}

// Returns { line, error, badModel, retryAfterMs }. Deliberately POLICY-FREE:
// which clock a failure stops, and whether it is worth another model, is the
// caller's business — the bark path and the player's conversation want opposite
// things out of the same status code.
async function postChat(apiKey, model, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  rollDay();
  dayCount++;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, ...body }),
    });
    if (!res.ok) {
      const retry = parseFloat(res.headers.get('retry-after') || '20');
      return {
        line: null,
        model,
        badModel: res.status === 400 || res.status === 404,
        retryAfterMs: res.status === 429 ? (retry > 0 ? retry : 20) * 1000 : 0,
        error: { status: res.status, message: await serverMessage(res) },
      };
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return { line: null, model, badModel: false, retryAfterMs: 0, error: { status: res.status, message: 'the model returned an empty reply' } };
    }
    return { line: raw.replace(/^["']|["']$/g, ''), model, badModel: false, retryAfterMs: 0, error: null };
  } catch (e) {
    const aborted = e?.name === 'AbortError';
    return {
      line: null,
      model,
      badModel: false,
      retryAfterMs: 0,
      error: { status: 0, message: aborted ? `no answer within ${Math.round(timeoutMs / 1000)}s` : `network error (${e?.message || e})` },
    };
  } finally {
    clearTimeout(timer);
  }
}

// The one sentence the player is shown. It lives here because the mapping from
// status code to cause is Groq's vocabulary, not the dialogue layer's.
export function describeError(err) {
  if (!err) return null;
  const { status, message } = err;
  if (err.blocked) return message;   // the client declined to send; already a sentence
  const detail = message ? `: ${message}` : '';
  if (status === 401 || status === 403) return `Key rejected (${status}${detail})${FALLBACK_TAIL}`;
  if (status === 429) return `Rate limited by Groq (429${detail})${FALLBACK_TAIL}`;
  if (status === 400 || status === 404) return `No usable model (${status}${detail})${FALLBACK_TAIL}`;
  if (status === 200) return `The model answered with nothing${FALLBACK_TAIL}`;
  if (status >= 500) return `Groq server error (${status}${detail})${FALLBACK_TAIL}`;
  if (status > 0) return `Request failed (${status}${detail})${FALLBACK_TAIL}`;
  return `Could not reach api.groq.com — ${message || 'request failed'}${FALLBACK_TAIL}`;
}

export function groqAvailable() {
  rollDay();
  return !!settings.groqKey && !flags.nogroq && !refusedKey()
    && performance.now() > barkDisabledUntil && dayCount < DAY_CAP;
}

// Why the live path is off right now, phrased for a player — null when it is on.
// A conversation the player started is never dropped for rate-limit reasons the
// way a background bark is: it still respects ITS OWN 429 back-off and the daily
// cap, but it does not have to win the token bucket, it waits longer, and a
// refused key does NOT stop it — that has to be said out loud every single time
// or the player has no way to learn their key is bad.
export function chatUnavailable() {
  if (flags.nogroq) return `Live dialogue disabled with ?nogroq=1${FALLBACK_TAIL}`;
  if (!settings.groqKey) return 'No API key set — replies come from built-in lines. Add a Groq key in Settings.';
  rollDay();
  if (dayCount >= DAY_CAP) return `Daily request cap reached (${DAY_CAP})${FALLBACK_TAIL}`;
  const wait = chatDisabledUntil - performance.now();
  if (wait > 0) return `Rate limited by Groq — live replies resume in ${Math.ceil(wait / 1000)}s. Built-in lines until then.`;
  return null;
}
export function chatAvailable() { return !chatUnavailable(); }
export function chatBusy() { return chatInFlight; }

// Returns { line, error } — never a bare null, so the caller can always say what
// went wrong.
export async function chatTurn(messages, { maxTokens = 110, timeoutMs = 15000 } = {}) {
  const blocked = chatUnavailable();
  if (blocked) return { line: null, error: { status: 0, blocked: true, message: blocked } };
  if (chatInFlight) return { line: null, error: { status: 0, blocked: true, message: 'Still waiting on the previous reply.' } };
  chatInFlight = true;
  try {
    // A dead model id used to cost one player turn EACH, silently, and modelIdx
    // reset on every reload — so the same three turns burned every session.
    // Walk the candidates inside this one call instead.
    let last = null;
    for (const model of candidatesFrom(await modelForChat())) {
      const r = await postChat(settings.groqKey, model, {
        temperature: 0.85,
        max_tokens: maxTokens,
        messages,
      }, timeoutMs);
      if (r.line) {
        resolvedModel = model;
        return { line: r.line.slice(0, 400), error: null };
      }
      last = r;
      if (r.error.status === 401 || r.error.status === 403) {
        // No back-off, ever: this is a config error the player must be told
        // about on every turn. Barks stop spending requests on it (see
        // groqAvailable), the conversation keeps asking and keeps reporting.
        authError = { status: r.error.status, message: r.error.message, key: settings.groqKey };
        break;
      }
      if (r.retryAfterMs) { chatDisabledUntil = performance.now() + r.retryAfterMs; break; }
      if (!r.badModel) break;
      modelIdx = Math.min(modelIdx + 1, MODEL_PREFERENCE.length - 1);
    }
    return { line: null, error: last?.error || { status: 0, message: 'no model answered' } };
  } finally {
    chatInFlight = false;
  }
}

// The Settings button. One generation request with the key the owner is holding
// right now — the only way to tell a typo from a revoked key from a firewall,
// on a machine that is not this one. Resolves { ok, model, text }.
export async function testKey(key) {
  const trimmed = (key || '').trim();
  if (!trimmed) return { ok: false, model: null, text: 'No key to test — paste one into the field first.' };
  const model = (trimmed === settings.groqKey && resolvedModel)
    ? resolvedModel
    : (await probeWith(trimmed)) || MODEL_PREFERENCE[0];
  let last = null;
  for (const id of candidatesFrom(model)) {
    const r = await postChat(trimmed, id, {
      temperature: 0,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    }, 12000);
    if (r.line) {
      if (trimmed === settings.groqKey) { resolvedModel = id; authError = null; }
      return { ok: true, model: id, text: `Key works — live dialogue is using ${id}.` };
    }
    last = r;
    if (!r.badModel) break;   // only a dead model id is worth another attempt
  }
  const err = last?.error || { status: 0, message: 'no response' };
  const detail = err.message ? `: ${err.message}` : '';
  return { ok: false, model: null, text: err.status ? `FAILED — HTTP ${err.status}${detail}` : `FAILED — ${err.message || 'no response'}` };
}

// testKey may be handed a key that is not the saved one, so it cannot reuse the
// session probe; this is the same catalogue read without the caching.
async function probeWith(key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(CATALOGUE, { signal: controller.signal, headers: { authorization: `Bearer ${key}` } });
    if (!res.ok) return null;
    const data = await res.json();
    const ids = new Set((data.data || []).map((m) => m.id));
    return MODEL_PREFERENCE.find((id) => ids.has(id)) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function groqTick(dt) {
  bucket.tokens = Math.min(bucket.cap, bucket.tokens + bucket.refill * dt);
}

// fire-and-forget: response lands in the cache; never blocks anything
export function requestLine(key, prompt, onArrive) {
  if (!groqAvailable() || inFlight || bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  inFlight = true;

  postChat(settings.groqKey, modelNow(), {
    temperature: 0.9,
    max_tokens: 45,
    stop: ['\n'],
    messages: [
      {
        role: 'system',
        content: 'You write ONE line of dialogue (max 16 words) spoken aloud by a bystander in a stylized city action game. No quotes, no narration, no emoji. PG-13.',
      },
      { role: 'user', content: prompt },
    ],
  }, 4000).then((r) => {
    if (r.line) {
      const clean = r.line.slice(0, 120);
      const arr = cache.get(key) || [];
      if (arr.length < 5) arr.push(clean);
      cache.set(key, arr);
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
      persistCache();
      onArrive?.(clean);
      return;
    }
    const status = r.error?.status || 0;
    if (status === 401 || status === 403) {
      authError = { status, message: r.error.message, key: settings.groqKey };
      return;   // stop spending requests; the conversation path does the telling
    }
    if (r.badModel) { modelIdx = Math.min(modelIdx + 1, MODEL_PREFERENCE.length - 1); return; }
    // Only ever the BARK clock. The old shared timer meant one failed background
    // line — fired every 3.5-6s — kept the player's conversation offline
    // essentially forever.
    if (r.retryAfterMs) bucket.tokens = 0;
    barkDisabledUntil = performance.now() + (r.retryAfterMs || (status ? 30000 : 15000));
  }).finally(() => { inFlight = false; });
  return true;
}
