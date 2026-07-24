// /copilot — full question-history browser in a Sheet: every persisted
// question (latest first, deduped), searchable, with per-row re-ask,
// pin-to-suggestions star, and delete; footer clears everything. Complements
// the 4-chip "recent questions" teaser in the empty state.
import { useMemo, useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Tooltip from '../../components/Tooltip.jsx';

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export default function HistoryPanel({
  open, onClose, items = [], pinned = [], onAsk, onTogglePin, onDelete, onClearAll,
}) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? items.filter((q) => q.toLowerCase().includes(needle)) : items;
  }, [items, filter]);

  return (
    <Sheet open={open} onClose={onClose} title="Question history">
      {items.length === 0 ? (
        <p className="text-xs text-muted px-1 py-2">
          No questions asked yet — everything you ask is kept here (locally, on this device) for quick re-asking.
        </p>
      ) : (
        <div className="space-y-2">
          <input
            className="input-dark w-full !py-2 text-xs"
            placeholder={`Search ${items.length} question${items.length === 1 ? '' : 's'}…`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Search question history"
          />
          {filtered.length === 0 ? (
            <p className="text-xs text-muted px-1 py-2">No questions match “{filter.trim()}”.</p>
          ) : (
            <ul className="divide-y divide-grid/40" aria-label="Past questions">
              {filtered.map((q) => {
                const isPinned = pinned.includes(q);
                return (
                  <li key={q} className="flex items-center gap-0.5 py-0.5">
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left text-xs text-ink rounded-lg px-2 py-2.5 min-h-[44px] hover:bg-grid/30 transition-colors"
                      onClick={() => { onAsk(q); onClose(); }}
                      title="Ask this again"
                    >
                      {q}
                    </button>
                    <Tooltip label={isPinned ? 'Unpin from suggestions' : 'Pin to suggestions'}>
                      <button
                        type="button"
                        className={`grid place-items-center h-10 w-10 shrink-0 rounded-lg transition-colors ${isPinned ? 'text-amber' : 'text-muted/60 hover:text-amber'}`}
                        onClick={() => onTogglePin(q)}
                        aria-pressed={isPinned}
                        aria-label={isPinned ? `Unpin question: ${q}` : `Pin question: ${q}`}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" {...ICON} fill={isPinned ? 'currentColor' : 'none'} aria-hidden="true">
                          <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8L12 3Z" />
                        </svg>
                      </button>
                    </Tooltip>
                    <Tooltip label="Remove from history">
                      <button
                        type="button"
                        className="grid place-items-center h-10 w-10 shrink-0 rounded-lg text-muted/60 hover:text-signal transition-colors"
                        onClick={() => onDelete(q)}
                        aria-label={`Remove question from history: ${q}`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                      </button>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-grid/60">
            <p className="text-[11px] text-muted px-1">
              {filtered.length === items.length
                ? `${items.length} question${items.length === 1 ? '' : 's'} kept locally`
                : `${filtered.length} of ${items.length} shown`}
            </p>
            <button
              type="button"
              className="text-[11px] text-muted hover:text-signal transition-colors min-h-[40px] px-2"
              onClick={onClearAll}
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
