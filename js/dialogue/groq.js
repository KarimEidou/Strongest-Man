// Groq client. Hard rules: canned lines always show instantly (LLM responses
// back-fill a cache for future identical situations); a conservative token
// bucket stays far inside the free tier; no key or any failure → silently
// canned-only. The key lives in localStorage and goes only to api.groq.com.
import { settings } from '../core/state.js';
import { flags } from '../core/debug.js';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const FALLBACK_MODELS = ['llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];

const bucket = { tokens: 5, cap: 5, refill: 0.25 };  // 15 req/min, half the cap
let modelIdx = 0;
let inFlight = false;
let disabledUntil = 0;
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

export function groqAvailable() {
  return !!settings.groqKey && !flags.nogroq && performance.now() > disabledUntil && dayCount < 4000;
}

export function groqTick(dt) {
  bucket.tokens = Math.min(bucket.cap, bucket.tokens + bucket.refill * dt);
}

// fire-and-forget: response lands in the cache; never blocks anything
export function requestLine(key, prompt, onArrive) {
  if (!groqAvailable() || inFlight || bucket.tokens < 1) return false;
  const today = new Date().toDateString();
  if (dayStamp !== today) { dayStamp = today; dayCount = 0; }
  bucket.tokens -= 1;
  dayCount++;
  inFlight = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  fetch(ENDPOINT, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.groqKey}`,
    },
    body: JSON.stringify({
      model: FALLBACK_MODELS[modelIdx],
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
    }),
  }).then(async (res) => {
    if (res.status === 429) {
      const retry = parseFloat(res.headers.get('retry-after') || '20');
      disabledUntil = performance.now() + retry * 1000;
      bucket.tokens = 0;
      return null;
    }
    if (res.status === 404 || res.status === 400) {
      modelIdx = Math.min(modelIdx + 1, FALLBACK_MODELS.length - 1);
      return null;
    }
    if (!res.ok) { disabledUntil = performance.now() + 30000; return null; }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  }).then((line) => {
    if (line) {
      const clean = line.replace(/^["']|["']$/g, '').slice(0, 120);
      const arr = cache.get(key) || [];
      if (arr.length < 5) arr.push(clean);
      cache.set(key, arr);
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
      persistCache();
      onArrive?.(clean);
    }
  }).catch(() => {
    disabledUntil = performance.now() + 15000;
  }).finally(() => {
    clearTimeout(timeout);
    inFlight = false;
  });
  return true;
}
