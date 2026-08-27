// Read-aloud via the browser SpeechSynthesis API (offline, no network; see
// lib/voice.js and docs/DECISIONS.md D-014). `supported` is true only when the
// device has a voice for the ACTIVE UI language — Kannada UI needs a kn-IN
// voice, English UI an English voice — so a caller hides its button rather
// than reading Kannada text with an English voice. One utterance at a time:
// starting a new one cancels the previous, and unmount cancels everything so
// speech never outlives the screen.
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n.jsx';
import { hasSynthesis, speechLangFor, watchVoice } from '../../lib/voice.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export default function useReadAloud() {
  const { lang } = useI18n();
  const [voice, setVoice] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);

  useEffect(() => watchVoice(lang, setVoice), [lang]);

  const stop = useCallback(() => {
    try { synth?.cancel(); } catch { /* noop */ }
    setSpeakingId(null);
  }, []);

  /** Toggle reading `text` for message `id`: same id stops, new id switches. */
  const toggle = useCallback((id, text) => {
    if (!hasSynthesis() || !voice) return;
    if (speakingId === id) {
      stop();
      return;
    }
    try { synth.cancel(); } catch { /* noop */ }
    const u = new window.SpeechSynthesisUtterance(String(text || ''));
    u.voice = voice;
    u.lang = voice.lang || speechLangFor(lang);
    u.rate = lang === 'kn' ? 0.95 : 1.03;
    const clear = () => setSpeakingId((cur) => (cur === id ? null : cur));
    u.onend = clear;
    u.onerror = clear;
    try {
      synth.speak(u);
      setSpeakingId(id);
    } catch {
      setSpeakingId(null);
    }
  }, [speakingId, stop, voice, lang]);

  useEffect(() => () => {
    try { synth?.cancel(); } catch { /* noop */ }
  }, []);

  return { supported: hasSynthesis() && !!voice, voiceName: voice ? voice.name : null, speechLang: speechLangFor(lang), speakingId, toggle, stop };
}
