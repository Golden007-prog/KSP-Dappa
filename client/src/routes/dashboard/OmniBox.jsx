// Ask-DAPPA omnibox — search box that submits to /copilot?q=…, plus curated
// demo-question chips and a localStorage recent-searches row. `linkSearch`
// (filterSearchString output) is appended so the copilot opens with the same
// global filters. Pass `inputRef` so the '/' shortcut can focus the box.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CURATED_QUESTIONS } from './lib.js';

const RECENT_KEY = 'dappa-omnibox-recent';
const MAX_RECENT = 4;

function readRecents() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(q) {
  try {
    const next = [q, ...readRecents().filter((x) => x !== q)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
}

const ClockIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" className="shrink-0 text-muted" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" />
  </svg>
);

export default function OmniBox({ inputRef, linkSearch = '', className = '' }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [recents, setRecents] = useState(readRecents);

  const go = (text) => {
    const t = String(text || '').trim();
    if (!t) return;
    saveRecent(t);
    setRecents(readRecents());
    const rest = linkSearch ? `&${linkSearch.slice(1)}` : '';
    navigate(`/copilot?q=${encodeURIComponent(t)}${rest}`);
  };

  const submit = (e) => {
    e.preventDefault();
    go(q);
  };

  const suggestions = CURATED_QUESTIONS.filter((c) => !recents.includes(c));

  return (
    <div className={`space-y-2 ${className}`}>
      <form onSubmit={submit} className="relative">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          className="input-dark w-full !pl-10 !pr-20 !py-3 !rounded-xl text-sm"
          placeholder={`Ask DAPPA — e.g. “${CURATED_QUESTIONS[0]}”`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Ask DAPPA"
        />
        <button type="submit" className="btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px]">
          Ask
        </button>
      </form>
      <div
        role="group"
        aria-label="Suggested questions"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1"
      >
        {recents.map((r) => (
          <button
            key={`recent-${r}`}
            type="button"
            onClick={() => go(r)}
            title="Recent search — ask again"
            className="chip min-h-[40px] px-3 shrink-0 hover:border-amber/50 transition-colors"
          >
            {ClockIcon}
            <span className="truncate max-w-[14rem]">{r}</span>
          </button>
        ))}
        {suggestions.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => go(c)}
            title="Ask this question"
            className="chip min-h-[40px] px-3 shrink-0 text-muted hover:text-ink hover:border-amber/50 transition-colors"
          >
            <span className="truncate max-w-[14rem]">{c}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
