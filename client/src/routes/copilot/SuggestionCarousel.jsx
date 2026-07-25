// /copilot — horizontally scrollable suggested-question chip carousel shown
// above the input once a conversation is underway. Pinned questions (starred
// from a user bubble or the chip's star) render first in amber; chips and the
// sm+ nudge arrows are all ≥40px touch targets. Touch-scrolls on mobile.
import { useRef } from 'react';
import { useT } from '../../lib/i18n.jsx';

const Arrow = ({ dir }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir < 0 ? <path d="m14 6-6 6 6 6" /> : <path d="m10 6 6 6-6 6" />}
  </svg>
);

const Star = ({ filled }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8L12 3Z" />
  </svg>
);

export default function SuggestionCarousel({ questions = [], pinned = [], onPick, onTogglePin, disabled = false }) {
  const t = useT();
  const trackRef = useRef(null);
  const nudge = (dir) => trackRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });

  const items = [...pinned, ...questions.filter((q) => !pinned.includes(q))];
  if (!items.length) return null;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={t('copilot.carousel.left')}
        className="hidden sm:grid place-items-center h-10 w-10 shrink-0 rounded-lg text-muted hover:text-ink hover:bg-grid/40 transition-colors"
        onClick={() => nudge(-1)}
      >
        <Arrow dir={-1} />
      </button>
      <div
        ref={trackRef}
        className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar"
        role="group"
        aria-label={t('copilot.carousel.aria')}
      >
        {items.map((q) => {
          const isPinned = pinned.includes(q);
          return (
            <span
              key={q}
              className={`shrink-0 inline-flex items-center rounded-full border transition-colors ${
                isPinned ? 'border-amber/60 bg-amber/5' : 'border-grid bg-base/60'
              }`}
            >
              <button
                type="button"
                className={`min-h-[40px] pl-3 ${onTogglePin ? 'pr-1.5' : 'pr-3'} text-[11px] transition-colors disabled:opacity-50 ${
                  isPinned ? 'text-amber' : 'text-muted hover:text-ink'
                }`}
                onClick={() => onPick(q)}
                disabled={disabled}
              >
                {q}
              </button>
              {onTogglePin && (
                <button
                  type="button"
                  className={`grid place-items-center min-h-[40px] w-8 pr-1 transition-colors ${
                    isPinned ? 'text-amber hover:text-muted' : 'text-muted/60 hover:text-amber'
                  }`}
                  onClick={() => onTogglePin(q)}
                  aria-pressed={isPinned}
                  aria-label={t(isPinned ? 'copilot.pin.unpinQuestionAria' : 'copilot.pin.pinQuestionAria', { q })}
                >
                  <Star filled={isPinned} />
                </button>
              )}
            </span>
          );
        })}
      </div>
      <button
        type="button"
        aria-label={t('copilot.carousel.right')}
        className="hidden sm:grid place-items-center h-10 w-10 shrink-0 rounded-lg text-muted hover:text-ink hover:bg-grid/40 transition-colors"
        onClick={() => nudge(1)}
      >
        <Arrow dir={1} />
      </button>
    </div>
  );
}
