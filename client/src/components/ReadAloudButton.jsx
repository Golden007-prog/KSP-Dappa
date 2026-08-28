// Speaker button that reads a plain-language summary aloud in the active UI
// language (Kannada voice for ಕನ್ನಡ, English voice otherwise). Renders
// NOTHING when the device has no voice for that language — see lib/voice.js.
// Props: id (stable per summary), text (what to read; pass the plain-language
// sentence, never the raw table), className?, size? ('sm' | 'md'),
// variant? ('icon' default | 'text' — icon plus a visible label, for places
// where an unlabeled speaker glyph would be ambiguous, e.g. a brief header).
import { useT } from '../lib/i18n.jsx';
import useReadAloud from '../routes/copilot/useReadAloud.js';
import Tooltip from './Tooltip.jsx';

const SPEAKER = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
  </svg>
);
const STOP = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);

export default function ReadAloudButton({ id, text, className = '', size = 'sm', variant = 'icon' }) {
  const t = useT();
  const readAloud = useReadAloud();
  if (!readAloud.supported || !text) return null;
  const speaking = readAloud.speakingId === id;
  const label = speaking ? t('common.voice.stop') : t('common.voice.listen', { lang: readAloud.speechLang });
  const dim = size === 'md' ? 'h-9 min-w-[2.25rem]' : 'h-7 min-w-[1.75rem]';
  const pad = variant === 'text' ? 'px-2 gap-1.5' : 'w-7';
  const button = (
    <button
      type="button"
      onClick={() => readAloud.toggle(id, text)}
      aria-label={label}
      aria-pressed={speaking}
      className={`no-print inline-flex ${dim} ${variant === 'text' ? pad : (size === 'md' ? 'w-9' : 'w-7')} items-center justify-center rounded-md border border-control/60 text-muted hover:text-primary hover:bg-grid/30 transition-colors text-xs ${speaking ? '!border-amber/60 text-amber' : ''} ${className}`}
    >
      {speaking ? STOP : SPEAKER}
      {variant === 'text' && <span>{speaking ? t('common.voice.stopShort') : t('common.voice.listenShort')}</span>}
    </button>
  );
  if (variant === 'text') return button;
  return <Tooltip label={label} position="bottom">{button}</Tooltip>;
}
