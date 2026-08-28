// Global "speak a question" microphone (topbar, every route; a labelled row in
// the mobile More sheet). One-shot SpeechRecognition in the ACTIVE UI
// language (kn-IN under ಕನ್ನಡ, en-IN otherwise — lib/voice.js), then navigates
// to /copilot?q=<transcript> with the shared filters carried, where Copilot
// auto-asks the ?q= it finds (routes/Copilot.jsx). Renders NOTHING where the
// API is missing (Firefox) and on /copilot itself, which has its own mic wired
// to the input box. Errors follow the copilot's wording: blocked permission →
// error toast, silence → info toast.
// Props: search? (current filter search string), variant? ('icon' default |
// 'row' — full-width labelled button for a sheet), className?, onDone?
// (called after navigating — the More sheet closes itself).
import { useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n.jsx';
import useSpeechInput from '../routes/copilot/useSpeechInput.js';
import Tooltip from './Tooltip.jsx';
import { useToast } from './ToastProvider.jsx';

const MIC = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

export default function VoiceAskButton({ search = '', variant = 'icon', className = '', onDone }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const speech = useSpeechInput({
    onResult: (text) => {
      const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
      params.set('q', text);
      toast.info(t('common.voice.heard', { text }));
      navigate(`/copilot?${params.toString()}`);
      onDone?.();
    },
    onError: (code) => {
      if (code === 'not-allowed' || code === 'service-not-allowed') toast.error(t('copilot.voice.blocked'));
      else if (code === 'no-speech') toast.info(t('copilot.voice.noSpeech'));
      else if (code !== 'aborted') toast.error(t('copilot.voice.failed'));
    },
  });
  if (!speech.supported || location.pathname === '/copilot') return null;
  const label = speech.listening
    ? t('common.voice.askStop')
    : t('common.voice.ask', { lang: speech.speechLang });
  const toggle = () => (speech.listening ? speech.stop() : speech.start());

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-pressed={speech.listening}
        className={`flex w-full min-h-[48px] items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
          speech.listening ? 'bg-signal/10 text-signal' : 'text-ink hover:bg-grid/30'
        } ${className}`}
      >
        <span className={speech.listening ? 'animate-pulse' : ''}>{MIC}</span>
        <span className="flex-1 text-left">{speech.listening ? t('common.voice.listening') : t('common.voice.askShort')}</span>
        <span className="num text-[11px] text-muted">{speech.speechLang}</span>
      </button>
    );
  }

  return (
    <Tooltip label={label} position="bottom" className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-pressed={speech.listening}
        className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
          speech.listening
            ? 'text-signal bg-signal/10 border border-signal/60 animate-pulse'
            : 'text-muted hover:text-primary hover:bg-grid/30'
        }`}
      >
        {MIC}
      </button>
    </Tooltip>
  );
}
