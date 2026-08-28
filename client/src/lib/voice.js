// Browser voice services — the only speech path in DAPPA.
//
// Catalyst has no text-to-speech or speech-to-text service (docs/DECISIONS.md
// D-014), so read-aloud and voice input use the Web Speech API that ships in
// the browser: speechSynthesis / SpeechSynthesisUtterance for output and
// SpeechRecognition (webkit-prefixed in Chromium/Safari) for input. Nothing
// here calls a network endpoint.
//
// Language discipline: the UI language decides the voice. Kannada UI → a
// kn-IN voice; English UI → an en-IN voice (any English voice as a fallback).
// If the device has no voice for the active language the caller HIDES the
// control rather than reading Kannada text with an English voice — a wrong
// language is worse than no button (Round-2 plan, Phase 5).
//
// getVoices() is asynchronous in Chromium: it returns [] until the
// 'voiceschanged' event, so subscribers re-check when it fires.
//
// Exports for other screens (Phase 5 "read this page"):
//   speak(text, { voice, uiLang, rate, onEnd, onError }) → { cancel }
//       chunked utterance queue — Chromium silently stops a single utterance
//       after ~15 s, so long text is split at sentence boundaries.
//   stopSpeaking()            cancel whatever is playing.
//   readableText(rootEl)      collect the visible prose of a DOM subtree in
//       reading order (headings, paragraphs, list items, [data-readable]),
//       skipping aria-hidden / .no-read / [data-no-read] content.
//   components/ReadPageButton.jsx wraps these as a drop-in button.

const SPEECH_LANG = { en: 'en-IN', kn: 'kn-IN' };

export function speechLangFor(uiLang) {
  return SPEECH_LANG[uiLang] || SPEECH_LANG.en;
}

export function hasSynthesis() {
  return typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
}

export function recognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/** Best voice for a UI language, or null when the device has none.
 * kn: only a Kannada voice qualifies. en: prefer en-IN, then any English. */
export function pickVoice(uiLang, voices) {
  const list = voices || (hasSynthesis() ? window.speechSynthesis.getVoices() : []);
  if (!list || !list.length) return null;
  const norm = (v) => String(v.lang || '').toLowerCase().replace('_', '-');
  if (uiLang === 'kn') return list.find((v) => norm(v).startsWith('kn')) || null;
  return list.find((v) => norm(v) === 'en-in')
    || list.find((v) => norm(v).startsWith('en-in'))
    || list.find((v) => norm(v).startsWith('en'))
    || null;
}

/** Subscribe to voice availability for a UI language. Calls cb(voice|null)
 * now and again whenever the voice list changes; returns an unsubscribe. */
export function watchVoice(uiLang, cb) {
  if (!hasSynthesis()) { cb(null); return () => {}; }
  const synth = window.speechSynthesis;
  const emit = () => cb(pickVoice(uiLang, synth.getVoices()));
  emit();
  // Some engines fire voiceschanged once, some never; a short retry covers the
  // "empty list on first call" case without leaving a timer running.
  const t = setTimeout(emit, 300);
  const t2 = setTimeout(emit, 1500);
  synth.addEventListener?.('voiceschanged', emit);
  return () => {
    clearTimeout(t); clearTimeout(t2);
    synth.removeEventListener?.('voiceschanged', emit);
  };
}

// ---------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------

const MAX_CHUNK = 220; // chars — comfortably under the ~15 s Chromium cut-off at rate 1

/** Split prose into utterance-sized chunks at sentence / clause boundaries.
 * Kannada uses the same '.', '।' and '?' terminators as the locale files. */
export function chunkText(text, max = MAX_CHUNK) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  if (!src) return [];
  const sentences = src.split(/(?<=[.!?।])\s+/);
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (!s) continue;
    if (s.length > max) {
      if (cur) { out.push(cur); cur = ''; }
      // long sentence: break at commas / semicolons, then hard-wrap
      for (const part of s.split(/(?<=[,;:—–])\s+/)) {
        if (part.length > max) {
          for (let i = 0; i < part.length; i += max) out.push(part.slice(i, i + max));
        } else if ((cur + ' ' + part).trim().length > max) {
          if (cur) out.push(cur);
          cur = part;
        } else {
          cur = (cur + ' ' + part).trim();
        }
      }
      continue;
    }
    if ((cur + ' ' + s).trim().length > max) {
      if (cur) out.push(cur);
      cur = s;
    } else {
      cur = (cur + ' ' + s).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

let activeQueue = null;

export function stopSpeaking() {
  if (activeQueue) { activeQueue.cancelled = true; activeQueue = null; }
  if (hasSynthesis()) {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  }
}

export function isSpeaking() {
  return !!activeQueue;
}

/**
 * Speak `text` in the given voice, one chunk after another. Starting a new
 * speak() cancels the previous one (one reader at a time — two overlapping
 * narrations are worse than none). Returns { cancel }.
 *   voice   — SpeechSynthesisVoice (from pickVoice/watchVoice); required, the
 *             caller hides its control when null.
 *   uiLang  — 'en' | 'kn' (sets utterance.lang when the voice has none)
 *   rate    — default 0.95 for Kannada, 1.03 for English
 *   onEnd   — called once when every chunk has played (not on cancel)
 *   onError — called with the SpeechSynthesisErrorEvent on failure
 */
export function speak(text, { voice, uiLang = 'en', rate, onEnd, onError } = {}) {
  const chunks = chunkText(text);
  if (!hasSynthesis() || !voice || !chunks.length) {
    onEnd?.();
    return { cancel: () => {} };
  }
  stopSpeaking();
  const synth = window.speechSynthesis;
  const queue = { cancelled: false };
  activeQueue = queue;
  const lang = voice.lang || speechLangFor(uiLang);
  const r = rate || (uiLang === 'kn' ? 0.95 : 1.03);
  let i = 0;
  const next = () => {
    if (queue.cancelled) return;
    if (i >= chunks.length) {
      if (activeQueue === queue) activeQueue = null;
      onEnd?.();
      return;
    }
    const u = new window.SpeechSynthesisUtterance(chunks[i]);
    i += 1;
    u.voice = voice;
    u.lang = lang;
    u.rate = r;
    u.onend = next;
    u.onerror = (e) => {
      if (queue.cancelled || e?.error === 'interrupted' || e?.error === 'canceled') return;
      if (activeQueue === queue) activeQueue = null;
      onError?.(e);
    };
    try {
      synth.speak(u);
    } catch (e) {
      if (activeQueue === queue) activeQueue = null;
      onError?.(e);
    }
  };
  next();
  return {
    cancel: () => {
      if (activeQueue === queue) stopSpeaking();
      else queue.cancelled = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Page text collection
// ---------------------------------------------------------------------------

const READABLE = 'h1, h2, h3, h4, p, li, dt, dd, figcaption, caption, [data-readable]';
const SKIP = '[aria-hidden="true"], .no-read, [data-no-read], script, style, template, [hidden]';

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  return true;
}

/**
 * Visible prose of a subtree in DOM order, as one string of sentences.
 * Nested matches (a <p> inside an <li>) are read once. Elements are joined
 * with '. ' unless they already end in punctuation. `maxChars` caps the read
 * so a 40-row table never becomes a 10-minute monologue.
 */
export function readableText(root, { maxChars = 6000 } = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return '';
  const parts = [];
  const taken = [];
  let total = 0;
  for (const el of root.querySelectorAll(READABLE)) {
    if (el.closest(SKIP)) continue;
    if (!isVisible(el)) continue;
    if (taken.some((t) => t.contains(el))) continue;
    const text = String(el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    taken.push(el);
    parts.push(/[.!?।:]$/.test(text) ? text : `${text}.`);
    total += text.length;
    if (total >= maxChars) break;
  }
  return parts.join(' ');
}
