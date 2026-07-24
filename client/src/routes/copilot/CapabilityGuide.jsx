// /copilot — "What can I ask?" disclosure for the empty state: the 13
// deterministic question families the intent grammar understands, each with a
// clickable example utterance that is guaranteed to answer (they mirror the
// backend's smoke-tested canned set).
import { useState } from 'react';

const FAMILIES = [
  ['Trends', 'monthly trend of cyber crimes in Bengaluru City last 12 months'],
  ['Rankings', 'top 5 districts for vehicle theft this year'],
  ['Comparisons', 'compare murders 2024 vs 2025 in Belagavi'],
  ['Forecasts', 'forecast for property crimes in Mysuru City'],
  ['Station risk', 'which stations are highest risk next month?'],
  ['Detection rate', 'what is the detection rate this year?'],
  ['Seasonality', 'seasonality of house burglary'],
  ['Hotspots', 'hotspots in Bengaluru City'],
  ['Alerts', 'show active alerts'],
  ['Repeat offenders', 'top repeat offenders'],
  ['Crime rate', 'crime rate per lakh in Bengaluru City'],
  ['Heinous share', 'heinous share this year'],
  ['FIR counts', 'total FIRs last month'],
];

export default function CapabilityGuide({ onAsk, disabled = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 w-full max-w-2xl">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 min-h-[40px] px-2 -mx-2 text-[11px] text-muted hover:text-amber transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        What can I ask? · {FAMILIES.length} question families
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {FAMILIES.map(([family, example]) => (
            <button
              key={family}
              type="button"
              className="text-left rounded-lg border border-grid bg-base/40 px-3 py-2 min-h-[44px] hover:border-amber/50 transition-colors disabled:opacity-50"
              onClick={() => onAsk(example)}
              disabled={disabled}
            >
              <span className="block text-[10px] uppercase tracking-wider text-amber">{family}</span>
              <span className="block text-[11px] text-muted mt-0.5">{example}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
