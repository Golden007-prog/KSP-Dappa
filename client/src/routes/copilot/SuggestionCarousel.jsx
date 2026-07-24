// /copilot — horizontally scrollable suggested-question chip carousel shown
// above the input once a conversation is underway. Touch-scrolls on mobile;
// sm+ gets nudge arrows. Chips come from suggestions.js (all covered by the
// backend's canned-utterance grammar).
import { useRef } from 'react';

const Arrow = ({ dir }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir < 0 ? <path d="m14 6-6 6 6 6" /> : <path d="m10 6 6 6-6 6" />}
  </svg>
);

export default function SuggestionCarousel({ questions = [], onPick, disabled = false }) {
  const trackRef = useRef(null);
  const nudge = (dir) => trackRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });

  if (!questions.length) return null;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Scroll suggestions left"
        className="hidden sm:grid place-items-center h-7 w-7 shrink-0 rounded-lg text-muted hover:text-ink hover:bg-grid/40 transition-colors"
        onClick={() => nudge(-1)}
      >
        <Arrow dir={-1} />
      </button>
      <div
        ref={trackRef}
        className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar"
        role="group"
        aria-label="Suggested questions"
      >
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            className="shrink-0 text-[11px] text-muted border border-grid bg-base/60 rounded-full px-2.5 py-1 hover:border-amber/50 hover:text-ink transition-colors disabled:opacity-50"
            onClick={() => onPick(q)}
            disabled={disabled}
          >
            {q}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Scroll suggestions right"
        className="hidden sm:grid place-items-center h-7 w-7 shrink-0 rounded-lg text-muted hover:text-ink hover:bg-grid/40 transition-colors"
        onClick={() => nudge(1)}
      >
        <Arrow dir={1} />
      </button>
    </div>
  );
}
