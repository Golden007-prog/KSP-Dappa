// /copilot — contextual follow-up chips shown under the newest assistant
// answer. The suggestions come from answerMeta.followUpsFor (crime/district
// extracted from the original question + intent-specific next steps), so every
// chip is guaranteed to parse into a real answer.
export default function FollowUpChips({ items = [], onPick, disabled = false }) {
  if (!items.length) return null;
  return (
    <div className="no-print flex flex-wrap items-center gap-1.5 pl-9" aria-label="Follow-up suggestions">
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.2 2.2m8.4 8.4 2.2 2.2m0-12.8-2.2 2.2M7.8 16.2l-2.2 2.2" />
        </svg>
        Follow up
      </span>
      {items.map((q) => (
        <button
          key={q}
          type="button"
          className="text-left text-[11px] text-primary border border-primary/40 bg-primary/5 rounded-full px-3 min-h-[40px] hover:border-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          onClick={() => onPick(q)}
          disabled={disabled}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
