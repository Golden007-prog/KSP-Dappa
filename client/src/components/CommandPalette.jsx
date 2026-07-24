// Command palette (Ctrl/Cmd-K) — fuzzy jump to routes and actions. Pure React,
// no dependencies. Controlled:
//   <CommandPalette open={open} onClose={fn} actions={[{id, label, section?, hint?, keywords?, perform}]} />
// Layout owns the global hotkey and builds the action list (routes + theme +
// density). Fuzzy match: substring beats subsequence, earlier/denser matches
// score higher. Full keyboard support: ↑↓ Home End Enter Esc.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Substring → strong score by position; else subsequence with streak bonus; -1 = no match. */
export function fuzzyScore(query, text) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, '');
  const t = String(text || '').toLowerCase();
  if (!q) return 0;
  const idx = t.indexOf(q);
  if (idx >= 0) return 1000 - idx;
  let qi = 0; let score = 0; let streak = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) { qi += 1; streak += 1; score += 1 + streak; } else { streak = 0; }
  }
  return qi === q.length ? score : -1;
}

export default function CommandPalette({ open, onClose, actions = [] }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const restoreRef = useRef(null);

  const results = useMemo(() => {
    if (!query.trim()) return actions;
    return actions
      .map((a) => ({ a, s: fuzzyScore(query, `${a.label} ${a.section || ''} ${a.keywords || ''}`) }))
      .filter((r) => r.s >= 0)
      .sort((x, y) => y.s - x.s)
      .map((r) => r.a);
  }, [query, actions]);

  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement;
      setQuery('');
      setActive(0);
      // focus after the portal paints
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (restoreRef.current?.focus) {
      restoreRef.current.focus();
      restoreRef.current = null;
    }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    // keep the active option in view
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  if (!open) return null;

  const run = (action) => {
    onClose();
    // navigate after the dialog unmounts so focus restoration doesn't fight it
    setTimeout(() => action.perform?.(), 0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(Math.max(0, results.length - 1)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); run(results[active]); }
  };

  return createPortal(
    <div className="fixed inset-0 z-70 flex items-start justify-center px-3 pt-[12vh]" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-grid bg-panel shadow-lift animate-scale-in"
      >
        <div className="flex items-center gap-2.5 border-b border-grid px-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted shrink-0" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a view or run an action…"
            aria-label="Search views and actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-${results[active].id}` : undefined}
            className="w-full bg-transparent py-3.5 text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          <kbd className="hidden sm:block shrink-0 rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[10px] text-muted">esc</kbd>
        </div>
        <ul id="cmdk-list" role="listbox" ref={listRef} aria-label="Results" className="max-h-[46vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted" role="presentation">
              Nothing matches “{query}”. Try a view name like <span className="text-ink">alerts</span> or <span className="text-ink">map</span>.
            </li>
          )}
          {results.map((a, i) => (
            <li
              key={a.id}
              id={`cmdk-${a.id}`}
              role="option"
              aria-selected={i === active}
              data-active={i === active || undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(a)}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                i === active ? 'bg-primary/15 text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {a.icon && <span className={`shrink-0 ${i === active ? 'text-primary' : 'text-muted'}`}>{a.icon}</span>}
              <span className="flex-1 truncate text-ink">{a.label}</span>
              {a.section && <span className="eyebrow shrink-0">{a.section}</span>}
              {a.hint && <kbd className="shrink-0 rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[10px] text-muted">{a.hint}</kbd>}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t border-grid px-4 py-2 text-[10px] text-muted">
          <span><kbd className="text-ink">↑↓</kbd> navigate</span>
          <span><kbd className="text-ink">↵</kbd> open</span>
          <span className="ml-auto num">{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
