// "Read this page" — speaks the visible prose of a DOM subtree in the active
// UI language. Drop it into any screen (the tier homes, a report, a case):
//
//   <ReadPageButton targetId="beat-home" />          // reads #beat-home
//   <ReadPageButton text={() => summarySentence} />  // or a string / getter
//
// Collection rules live in lib/voice.js readableText(): headings, paragraphs,
// list items, dt/dd, captions and anything marked data-readable, in DOM
// order; aria-hidden, .no-read and [data-no-read] subtrees are skipped, so a
// screen can fence off a dense table with one attribute. Hidden when the
// device has no voice for the UI language (a Kannada UI needs a kn-IN voice —
// see D-014). Long text is chunked; a second press stops.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { hasSynthesis, readableText, speak, stopSpeaking, watchVoice } from '../lib/voice.js';

const SPEAKER = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
  </svg>
);
const STOP = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);

export default function ReadPageButton({ targetId, text, className = '', size = 'sm' }) {
  const { t, lang } = useI18n();
  const [voice, setVoice] = useState(null);
  const [reading, setReading] = useState(false);
  const handleRef = useRef(null);

  useEffect(() => watchVoice(lang, setVoice), [lang]);
  useEffect(() => () => { handleRef.current?.cancel(); }, []);

  const resolveText = useCallback(() => {
    if (typeof text === 'function') return String(text() || '');
    if (typeof text === 'string') return text;
    const root = targetId ? document.getElementById(targetId) : document.getElementById('main-content');
    return readableText(root);
  }, [text, targetId]);

  const toggle = () => {
    if (reading) {
      handleRef.current?.cancel();
      handleRef.current = null;
      stopSpeaking();
      setReading(false);
      return;
    }
    const body = resolveText();
    if (!body) return;
    setReading(true);
    handleRef.current = speak(body, {
      voice,
      uiLang: lang,
      onEnd: () => setReading(false),
      onError: () => setReading(false),
    });
  };

  if (!hasSynthesis() || !voice) return null;
  const label = reading ? t('common.voice.stop') : t('common.voice.readPage', { lang: voice.lang || lang });
  const h = size === 'md' ? 'h-10' : 'h-8';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={reading}
      className={`no-print inline-flex ${h} items-center gap-1.5 rounded-lg border border-control/60 px-2.5 text-xs text-muted hover:text-primary hover:bg-grid/30 transition-colors ${reading ? '!border-amber/60 text-amber' : ''} ${className}`}
    >
      {reading ? STOP : SPEAKER}
      <span>{reading ? t('common.voice.stopShort') : t('common.voice.readPageShort')}</span>
    </button>
  );
}
