// Command palette (Ctrl/Cmd-K) — fuzzy jump to routes and actions. Pure React,
// no dependencies. Controlled:
//   <CommandPalette open={open} onClose={fn}
//     actions={[{id, label, section?, hint?, keywords?, hidden?, perform}]}
//     remoteSearch={async (query, signal) => actions[]} />
// Layout owns the global hotkey and builds the action list (routes + theme +
// density + filters + saved views). Fuzzy match: substring beats subsequence,
// earlier/denser matches score higher; matched characters are highlighted in
// the result labels. `hidden: true` actions (e.g. the per-district filter
// jumps) only surface once the user types — they never flood the initial list.
// `remoteSearch` (optional) is called debounced (250ms, aborted on newer input)
// once the query is 2+ chars; its actions append below the static matches —
// Layout uses it for live offender lookups and FIR-number jumps.
// With an empty query the last 5 executed actions show first as a "Recent"
// section (persisted in localStorage; Layout also records every page
// navigation via recordRecentAction so recents mirror real usage). Tab is
// trapped inside the dialog and the page behind stops scrolling. Full
// keyboard support: ↑↓ Home End Enter Esc.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap, useScrollLock } from '../lib/modal.js';

const RECENT_KEY = 'dappa-cmdk-recent';

function readRecents() {
  try {
    const a = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(id) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecents().filter((x) => x !== id)].slice(0, 5)));
  } catch { /* private mode */ }
}

/** Record an action id (e.g. `nav-/alerts`) into the palette's Recent section
 * without opening the palette — Layout calls this on every route change so
 * "Recent" reflects where you actually went, not just what you ran from here. */
export function recordRecentAction(id) {
  if (typeof id === 'string' && id) pushRecent(id);
}

/** Indices of `text` to highlight for `query` (substring first, else the
 * greedy subsequence the scorer accepts); empty array = nothing to highlight. */
function matchIndices(query, text) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, '');
  const t = String(text || '').toLowerCase();
  if (!q) return [];
  const idx = t.indexOf(q);
  if (idx >= 0) return Array.from({ length: q.length }, (_, i) => idx + i);
  const out = [];
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) { out.push(i); qi += 1; }
  }
  return qi === q.length ? out : [];
}

/** Result label with the matched characters emphasised. */
function HighlightedLabel({ query, text }) {
  const marks = useMemo(() => new Set(matchIndices(query, text)), [query, text]);
  if (!marks.size) return text;
  const chars = String(text).split('');
  const parts = [];
  let buf = '';
  let marked = marks.has(0);
  chars.forEach((ch, i) => {
    const m = marks.has(i);
    if (m !== marked) {
      parts.push({ marked, s: buf });
      buf = '';
      marked = m;
    }
    buf += ch;
  });
  parts.push({ marked, s: buf });
  return (
    <>
      {parts.map((p, i) => (p.marked
        ? <span key={i} className="text-primary font-semibold">{p.s}</span>
        : <span key={i}>{p.s}</span>))}
    </>
  );
}

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

export default function CommandPalette({ open, onClose, actions = [], remoteSearch }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recentIds, setRecentIds] = useState([]);
  const [remote, setRemote] = useState([]);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  useScrollLock(open);
  useFocusTrap(open, panelRef);

  const staticResults = useMemo(() => {
    if (!query.trim()) {
      const byId = new Map(actions.map((a) => [a.id, a]));
      const recent = recentIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((a) => ({ ...a, section: 'Recent' }));
      const recentSet = new Set(recent.map((a) => a.id));
      return [...recent, ...actions.filter((a) => !a.hidden && !recentSet.has(a.id))];
    }
    return actions
      .map((a) => ({ a, s: fuzzyScore(query, `${a.label} ${a.section || ''} ${a.keywords || ''}`) }))
      .filter((r) => r.s >= 0)
      .sort((x, y) => y.s - x.s)
      .map((r) => r.a);
  }, [query, actions, recentIds]);

  const results = useMemo(() => {
    if (!remote.length) return staticResults;
    const seen = new Set(staticResults.map((a) => a.id));
    return [...staticResults, ...remote.filter((a) => a && a.id && !seen.has(a.id))];
  }, [staticResults, remote]);

  // debounced remote lookup (offenders / FIR numbers via Layout's provider)
  useEffect(() => {
    const q = query.trim();
    if (!open || !remoteSearch || q.length < 2) {
      setRemote([]);
      setRemoteBusy(false);
      return undefined;
    }
    const ctrl = new AbortController();
    setRemoteBusy(true);
    const t = setTimeout(async () => {
      try {
        const found = await remoteSearch(q, ctrl.signal);
        if (!ctrl.signal.aborted) setRemote(Array.isArray(found) ? found : []);
      } catch {
        if (!ctrl.signal.aborted) setRemote([]);
      } finally {
        if (!ctrl.signal.aborted) setRemoteBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open, remoteSearch]);

  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement;
      setQuery('');
      setActive(0);
      setRecentIds(readRecents());
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
    pushRecent(action.id);
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
        ref={panelRef}
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
            placeholder="Jump to a view, filter a district, run an action…"
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
          {results.length === 0 && !remoteBusy && (
            <li className="px-3 py-8 text-center text-sm text-muted" role="presentation">
              Nothing matches “{query}”. Try a view name like <span className="text-ink">alerts</span>, a district, an offender name, or <span className="text-ink">theme</span>.
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
              <span className="flex-1 truncate text-ink">
                <HighlightedLabel query={query} text={a.label} />
              </span>
              {a.section && <span className="eyebrow shrink-0">{a.section}</span>}
              {a.hint && <kbd className="shrink-0 rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[10px] text-muted">{a.hint}</kbd>}
            </li>
          ))}
          {remoteBusy && (
            <li className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted" role="presentation" aria-live="polite">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-grid border-t-primary" aria-hidden="true" />
              Searching offenders and case records…
            </li>
          )}
        </ul>
        <div className="flex items-center gap-3 border-t border-grid px-4 py-2 text-[10px] text-muted">
          <span><kbd className="text-ink">↑↓</kbd> navigate</span>
          <span><kbd className="text-ink">↵</kbd> open</span>
          <span className="ml-auto num">
            {remoteBusy ? 'searching… · ' : ''}{results.length} result{results.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
