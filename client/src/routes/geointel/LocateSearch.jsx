// Locate-district/station search box for GeoIntel. Combobox over the 38 pinned
// police units plus the currently loaded station list; picking a result flies
// the map there and opens the matching drill. Keyboard: ↑/↓ move, Enter picks,
// Esc closes. Dependency-free (no portal — sits inside a map overlay pill).
import { useMemo, useRef, useState } from 'react';
import { CITY_UNIT_IDS, UNITS, unitInfo } from '../../lib/districtGeoMap.js';

const SearchIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" aria-hidden="true" className="shrink-0 text-muted">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </svg>
);

export default function LocateSearch({ stations = [], onPickUnit, onPickStation, className = '' }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
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
    if (!needle) return [];
    return index.filter((r) => r.label.toLowerCase().includes(needle)).slice(0, 8);
  }, [q, index]);

  const pick = (r) => {
    if (!r) return;
    if (r.kind === 'unit') onPickUnit?.(r.payload);
    else onPickStation?.(r.payload);
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

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-1.5 bg-panel/95 border border-grid rounded-xl px-2.5 py-1.5 shadow-lg">
        {SearchIcon}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls="geointel-locate-list"
          aria-autocomplete="list"
          aria-label="Locate district or station"
          placeholder="Locate district / station…"
          className="bg-transparent text-xs text-ink placeholder:text-muted focus:outline-none w-40 sm:w-48"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {q && (
          <button
            type="button"
            className="text-muted hover:text-ink transition-colors"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQ(''); setOpen(false); inputRef.current?.focus(); }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        )}
      </div>
      {listOpen && (
        <ul
          id="geointel-locate-list"
          role="listbox"
          aria-label="Locations"
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-panel border border-grid rounded-xl shadow-lift overflow-hidden max-h-64 overflow-y-auto"
        >
          {results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`w-full text-left px-2.5 py-2 transition-colors ${i === active ? 'bg-grid/40' : 'hover:bg-grid/25'}`}
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
      )}
      {open && q.trim() && !results.length && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-panel border border-grid rounded-xl shadow-lift px-2.5 py-2 text-[11px] text-muted">
          No district or station matches “{q.trim()}”.
        </div>
      )}
    </div>
  );
}
