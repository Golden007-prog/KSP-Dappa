// Locate-district/station search box for GeoIntel. Combobox over the 38 pinned
// police units plus the currently loaded station list; picking a result flies
// the map there and opens the matching drill. Matching is substring-first with
// an in-order subsequence fallback ('mysct' finds 'Mysuru City'); focusing the
// empty box shows the last five picks (localStorage). Keyboard: ↑/↓ move,
// Enter picks, Esc closes. Dependency-free (no portal — sits inside a map
// overlay pill). `inputId` lets the route's '/' shortcut focus this input.
import { useMemo, useRef, useState } from 'react';
import { CITY_UNIT_IDS, UNITS, unitInfo } from '../../lib/districtGeoMap.js';
import { fuzzyRank } from './utils.js';
import { loadPrefs, savePrefs } from './prefs.js';

const MAX_RECENTS = 5;

const SearchIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" aria-hidden="true" className="shrink-0 text-muted">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </svg>
);

function readRecents() {
  const r = loadPrefs().recentLocates;
  return Array.isArray(r) ? r : [];
}

export default function LocateSearch({ stations = [], onPickUnit, onPickStation, className = '', inputId }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState(readRecents);
  const inputRef = useRef(null);

  const index = useMemo(() => {
    const units = UNITS.map((u) => ({
      kind: 'unit',
      id: `u-${u.unitId}`,
      label: u.name,
      sub: CITY_UNIT_IDS.includes(u.unitId) ? 'City commissionerate' : 'Police district',
      payload: u,
    }));
    const seen = new Set();
    const st = [];
    for (const s of stations) {
      const key = String(s.unitId);
      if (seen.has(key)) continue;
      seen.add(key);
      st.push({
        kind: 'station',
        id: `s-${key}`,
        label: s.unitName || `Unit ${key}`,
        sub: `Station · ${unitInfo(s.districtId)?.name || s.districtId || ''}`,
        payload: s,
      });
    }
    return [...units, ...st];
  }, [stations]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      // empty query → recent picks that still resolve against the live index
      return recents
        .map((r) => index.find((x) => x.id === r.id))
        .filter(Boolean)
        .slice(0, MAX_RECENTS)
        .map((r) => ({ ...r, recent: true }));
    }
    return index
      .map((r) => ({ r, rank: fuzzyRank(needle, r.label) }))
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 8)
      .map((x) => x.r);
  }, [q, index, recents]);

  const remember = (r) => {
    const next = [{ id: r.id }, ...recents.filter((x) => x.id !== r.id)].slice(0, MAX_RECENTS);
    setRecents(next);
    savePrefs({ recentLocates: next });
  };

  const pick = (r) => {
    if (!r) return;
    if (r.kind === 'unit') onPickUnit?.(r.payload);
    else onPickStation?.(r.payload);
    remember(r);
    setQ(r.label);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[Math.min(active, results.length - 1)]); }
  };

  const listOpen = open && results.length > 0;
  const showingRecents = listOpen && !q.trim();

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-1.5 bg-panel/95 border border-grid rounded-xl px-2.5 py-1.5 shadow-lg gi-tap">
        {SearchIcon}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls="geointel-locate-list"
          aria-autocomplete="list"
          aria-label="Locate district or station"
          placeholder="Locate district / station…"
          className="bg-transparent text-xs text-ink placeholder:text-muted focus:outline-none w-40 sm:w-48 flex-1"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => { setOpen(true); setActive(0); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {q && (
          <button
            type="button"
            className="text-muted hover:text-ink transition-colors gi-tap gi-tap-w flex items-center justify-center -my-1"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQ(''); setOpen(false); inputRef.current?.focus(); }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        )}
      </div>
      {listOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-panel border border-grid rounded-xl shadow-lift overflow-hidden">
          {showingRecents && (
            <p className="px-2.5 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-muted">Recent</p>
          )}
          <ul
            id="geointel-locate-list"
            role="listbox"
            aria-label={showingRecents ? 'Recent locations' : 'Locations'}
            className="max-h-64 overflow-y-auto"
          >
            {results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`w-full text-left px-2.5 py-2 gi-tap transition-colors ${i === active ? 'bg-grid/40' : 'hover:bg-grid/25'}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r)}
                >
                  <span className="block text-xs text-ink truncate">{r.label}</span>
                  <span className="block text-[10px] text-muted truncate">{r.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && q.trim() && !results.length && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-panel border border-grid rounded-xl shadow-lift px-2.5 py-2 text-[11px] text-muted">
          No district or station matches “{q.trim()}”.
        </div>
      )}
    </div>
  );
}
