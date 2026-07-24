// Filter strips for the Offenders registry:
//   RiskBandStrip — High/Med/Low counts over the loaded slice with a
//                   proportional bar; chips click-apply the band filter.
//   MoTagChips    — MO-tag universe (top by frequency) as multi-select chips
//                   (AND semantics; URL-synced by the parent via 'mo').
//   RecentRow     — recently-viewed offender chips from the localStorage ring.
import { Link } from 'react-router-dom';
import { fmtInt } from '../../lib/format.js';

const BAND_META = [
  { id: 'high', label: 'High', dot: 'bg-signal', text: 'text-signal', chip: '!border-signal/60' },
  { id: 'med', label: 'Med', dot: 'bg-amber', text: 'text-amber', chip: '!border-amber/60' },
  { id: 'low', label: 'Low', dot: 'bg-teal', text: 'text-teal', chip: '!border-teal/60' },
];

export function RiskBandStrip({ counts = {}, band = 'all', onBand }) {
  const total = (counts.high || 0) + (counts.med || 0) + (counts.low || 0);
  if (!total) return null;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="hidden sm:flex h-1.5 w-24 rounded-full overflow-hidden bg-grid/40 shrink-0" aria-hidden="true">
        {BAND_META.map((b) => (
          <span key={b.id} className={b.dot} style={{ width: `${(100 * (counts[b.id] || 0)) / total}%` }} />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {BAND_META.map((b) => {
          const active = band === b.id;
          return (
            <button
              key={b.id}
              type="button"
              className={`chip !py-1 min-h-[36px] transition-colors hover:border-amber/50 ${active ? `${b.chip} ${b.text}` : ''}`}
              onClick={() => onBand?.(active ? 'all' : b.id)}
              aria-pressed={active}
              title={active ? 'Clear the risk-band filter' : `Show only ${b.label.toLowerCase()}-risk offenders`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${b.dot}`} aria-hidden="true" />
              {b.label}
              <span className="num text-muted">{fmtInt(counts[b.id] || 0)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MoTagChips({ tags = [], selected = [], onToggle }) {
  if (!tags.length) return null;
  return (
    <div
      className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible py-0.5"
      role="group"
      aria-label="Filter by modus-operandi tag"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">MO</span>
      {tags.map(({ tag, count }) => {
        const active = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            className={`chip !py-1 min-h-[36px] shrink-0 transition-colors hover:border-amber/50 ${active ? '!border-amber text-amber' : ''}`}
            onClick={() => onToggle?.(tag)}
            aria-pressed={active}
            title={active ? `Stop filtering by “${tag}”` : `Only offenders tagged “${tag}”`}
          >
            {tag}
            <span className="num text-muted">{fmtInt(count)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RecentRow({ items = [], onClear }) {
  if (!items.length) return null;
  return (
    <div
      className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible py-0.5"
      aria-label="Recently viewed offenders"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">Recent</span>
      {items.map((r) => (
        <Link
          key={r.key}
          to={`/offenders/${encodeURIComponent(r.key)}`}
          className="chip !py-1 min-h-[36px] shrink-0 hover:border-amber/50 hover:text-amber transition-colors"
          title={r.key}
        >
          <span className="truncate max-w-[9rem]">{r.name || r.key}</span>
        </Link>
      ))}
      <button
        type="button"
        className="btn-ghost !px-2 !py-1 text-[11px] min-h-[36px] shrink-0"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  );
}
