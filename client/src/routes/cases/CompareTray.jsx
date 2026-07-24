// Sticky compare tray — appears once at least one case is check-selected in
// the explorer table. Shows the selected CrimeNo tails as removable chips and
// opens the side-by-side CompareSheet ('c' shortcut). Sticky above the bottom
// edge so it stays reachable while the table scrolls; 360px-safe wrapping.
import { COMPARE_CAP } from './compare.js';

/** 18-digit CrimeNos are too wide for a chip — show the 9-digit CaseNo tail. */
function shortNo(item) {
  const digits = String(item.crimeNo || '').replace(/\D/g, '');
  if (digits.length === 18) return `…${digits.slice(-9)}`;
  return item.crimeNo || `#${item.caseMasterId}`;
}

export default function CompareTray({ items, onRemove, onClear, onOpen }) {
  if (!items.length) return null;
  return (
    <div className="sticky bottom-3 z-30 animate-fade-in" role="region" aria-label="Compare tray">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber/40 bg-panel/95 backdrop-blur-sm shadow-lift px-3 py-2">
        <span className="eyebrow shrink-0">Compare {items.length}/{COMPARE_CAP}</span>
        {items.map((it) => (
          <span key={it.caseMasterId} className="chip num !pr-0.5 max-w-full">
            <span className="truncate">{shortNo(it)}</span>
            <button
              type="button"
              aria-label={`Remove case ${it.crimeNo || it.caseMasterId} from compare`}
              className="ml-0.5 -my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-signal hover:bg-signal/10 transition-colors"
              onClick={() => onRemove(it)}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </span>
        ))}
        <span className="flex-1" />
        <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={onClear}>Clear</button>
        <button
          type="button"
          className="btn-primary !py-1.5 !px-3 text-xs"
          disabled={items.length < 2}
          onClick={onOpen}
          title={items.length < 2 ? 'Select at least two cases' : 'Open side-by-side comparison (c)'}
        >
          Compare →
        </button>
      </div>
    </div>
  );
}
