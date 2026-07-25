// /copilot — "What can I ask?" disclosure for the empty state: the 13
// deterministic question families the intent grammar understands, each with a
// clickable example utterance that is guaranteed to answer (they mirror the
// backend's smoke-tested canned set). Only the family label is translated —
// the example is the literal text sent to the English intent grammar.
import { useState } from 'react';
import { useI18n } from '../../lib/i18n.jsx';

const FAMILIES = [
  ['trends', 'monthly trend of cyber crimes in Bengaluru City last 12 months'],
  ['rankings', 'top 5 districts for vehicle theft this year'],
  ['comparisons', 'compare murders 2024 vs 2025 in Belagavi'],
  ['forecasts', 'forecast for property crimes in Mysuru City'],
  ['stationRisk', 'which stations are highest risk next month?'],
  ['detectionRate', 'what is the detection rate this year?'],
  ['seasonality', 'seasonality of house burglary'],
  ['hotspots', 'hotspots in Bengaluru City'],
  ['alerts', 'show active alerts'],
  ['offenders', 'top repeat offenders'],
  ['crimeRate', 'crime rate per lakh in Bengaluru City'],
  ['heinousShare', 'heinous share this year'],
  ['firCounts', 'total FIRs last month'],
];

export default function CapabilityGuide({ onAsk, disabled = false }) {
  const { lang, t } = useI18n();
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
        {t('copilot.guide.toggle', { n: FAMILIES.length })}
      </button>
      {open && (
        <>
          {lang !== 'en' && (
            <p className="mt-2 text-[10px] text-muted/80 leading-relaxed">{t('copilot.guide.englishNote')}</p>
          )}
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {FAMILIES.map(([family, example]) => (
              <button
                key={family}
                type="button"
                className="text-left rounded-lg border border-grid bg-base/40 px-3 py-2 min-h-[44px] hover:border-amber/50 transition-colors disabled:opacity-50"
                onClick={() => onAsk(example)}
                disabled={disabled}
              >
                <span className="block text-[10px] uppercase tracking-wider text-amber">{t(`copilot.guide.${family}`)}</span>
                <span className="block text-[11px] text-muted mt-0.5">{example}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
