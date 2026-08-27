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
