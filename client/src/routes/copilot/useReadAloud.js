// Read-aloud via the browser SpeechSynthesis API (offline, no network; see
// lib/voice.js and docs/DECISIONS.md D-014). `supported` is true only when the
// device has a voice for the ACTIVE UI language — Kannada UI needs a kn-IN
// voice, English UI an English voice — so a caller hides its button rather
// than reading Kannada text with an English voice. One narration at a time:
// starting a new one cancels the previous (lib/voice.js speak()), and unmount
// cancels everything so speech never outlives the screen. Long text is
// chunked at sentence boundaries by speak() — a single utterance over ~15 s
// is cut off silently in Chromium.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n.jsx';
import { hasSynthesis, speak, speechLangFor, stopSpeaking, watchVoice } from '../../lib/voice.js';

export default function useReadAloud() {
  const { lang } = useI18n();
  const [voice, setVoice] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);
  const handleRef = useRef(null);

  useEffect(() => watchVoice(lang, setVoice), [lang]);

  const stop = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    stopSpeaking();
    setSpeakingId(null);
  }, []);

  /** Toggle reading `text` for message `id`: same id stops, new id switches. */
  const toggle = useCallback((id, text) => {
    if (!hasSynthesis() || !voice) return;
    if (speakingId === id) {
      stop();
      return;
    }
    const clear = () => setSpeakingId((cur) => (cur === id ? null : cur));
    handleRef.current = speak(String(text || ''), {
      voice,
      uiLang: lang,
      onEnd: clear,
      onError: clear,
    });
    setSpeakingId(id);
  }, [speakingId, stop, voice, lang]);

  useEffect(() => () => {
    handleRef.current?.cancel();
    stopSpeaking();
  }, []);

  return { supported: hasSynthesis() && !!voice, voiceName: voice ? voice.name : null, speechLang: speechLangFor(lang), speakingId, toggle, stop };
}
