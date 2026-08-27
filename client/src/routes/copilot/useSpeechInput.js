// Voice input via the browser Web Speech API (SpeechRecognition,
// webkit-prefixed in Chromium/Safari; see lib/voice.js and docs/DECISIONS.md
// D-014). `supported` is false where the API is missing — the mic button
// simply doesn't render there. One-shot recognition in the ACTIVE UI language:
// kn-IN when the interface is Kannada, so an officer can ask
// "ಈ ವಾರ ನನ್ನ ಠಾಣೆಯಲ್ಲಿ ಏನಾಗಿದೆ?" without typing; en-IN otherwise.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n.jsx';
import { recognitionCtor, speechLangFor } from '../../lib/voice.js';

const SR = recognitionCtor();

export default function useSpeechInput({ onResult, onError } = {}) {
  const { lang } = useI18n();
  const recRef = useRef(null);
  const cbRef = useRef({ onResult, onError });
  cbRef.current = { onResult, onError };
  const [listening, setListening] = useState(false);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const start = useCallback(() => {
    if (!SR || recRef.current) return;
    const rec = new SR();
    rec.lang = speechLangFor(lang);
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript;
      if (transcript) cbRef.current.onResult?.(String(transcript).trim());
    };
    rec.onerror = (e) => cbRef.current.onError?.(e?.error || 'unknown');
    rec.onend = () => { recRef.current = null; setListening(false); };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }, [lang]);

  // Abort a dangling session on unmount so the mic indicator never sticks.
  useEffect(() => () => {
    try { recRef.current?.abort(); } catch { /* noop */ }
  }, []);

  return { supported: !!SR, listening, speechLang: speechLangFor(lang), start, stop };
}
