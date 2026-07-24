// /copilot — voice input via the Web Speech API (webkitSpeechRecognition in
// Chromium/Safari). `supported` is false where the API is missing — the mic
// button simply doesn't render there. One-shot recognition, en-IN.
import { useCallback, useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : undefined;

export default function useSpeechInput({ onResult, onError } = {}) {
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
    rec.lang = 'en-IN';
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
  }, []);

  // Abort a dangling session on unmount so the mic indicator never sticks.
  useEffect(() => () => {
    try { recRef.current?.abort(); } catch { /* noop */ }
  }, []);

  return { supported: !!SR, listening, start, stop };
}
