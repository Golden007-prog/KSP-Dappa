// /copilot — answer read-aloud via the SpeechSynthesis API (offline, no
// network). `supported` is false where the API is missing — the Listen button
// simply doesn't render there. One utterance at a time: starting a new answer
// cancels the previous one, and unmount cancels everything so speech never
// outlives the screen.
import { useCallback, useEffect, useState } from 'react';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
const CAN_SPEAK = !!synth && typeof window !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';

export default function useReadAloud() {
  const [speakingId, setSpeakingId] = useState(null);

  const stop = useCallback(() => {
    try { synth?.cancel(); } catch { /* noop */ }
    setSpeakingId(null);
  }, []);

  /** Toggle reading `text` for message `id`: same id stops, new id switches. */
  const toggle = useCallback((id, text) => {
    if (!CAN_SPEAK) return;
    if (speakingId === id) {
      stop();
      return;
    }
    try { synth.cancel(); } catch { /* noop */ }
    const u = new window.SpeechSynthesisUtterance(String(text || ''));
    u.lang = 'en-IN';
    u.rate = 1.03;
    const clear = () => setSpeakingId((cur) => (cur === id ? null : cur));
    u.onend = clear;
    u.onerror = clear;
    try {
      synth.speak(u);
      setSpeakingId(id);
    } catch {
      setSpeakingId(null);
    }
  }, [speakingId, stop]);

  useEffect(() => () => {
    try { synth?.cancel(); } catch { /* noop */ }
  }, []);

  return { supported: CAN_SPEAK, speakingId, toggle, stop };
}
