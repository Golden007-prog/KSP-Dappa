// /predict — model cards: a Sheet documenting every model behind this page in
// the ML-model-card idiom (purpose · inputs · method · metrics · caveats), so
// judges and officers can audit what each number means. Content is static by
// design — it documents the pipeline contract, while live metric badges (AUC,
// MAPE, source) render next to the predictions they belong to.
import { useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';

const CARDS = [
  {
    name: 'Station risk model',
    tone: 'amber',
    purpose: 'Score every police station for expected 30-day crime pressure so patrol resources can be staged ahead of demand.',
    inputs: 'Recent monthly case trend per station, hotspot-cluster proximity, and open anomaly flags. Refreshed by the nightly analytics pass into the StationRisk table.',
    method: 'Composite scoring over trend slope, hotspot intensity and anomaly recency; the rank-ordered signals behind each score are stored verbatim (DriversJson) and shown as driver chips.',
    metrics: 'Relative 0–100-style score; tiers are percentiles of the current league, not absolute thresholds.',
    caveats: 'Synthetic data; scores rank stations against each other and must not be read as incident probabilities. Driver order is a ranking, not fitted weights.',
  },
  {
    name: 'Outcome classifier',
    tone: 'teal',
    purpose: 'Predict whether an FIR profile ends in an A-final (detected) chargesheet, for triage and what-if analysis.',
    inputs: 'District, crime subhead, gravity, hour band, victim / accused / section counts, arrest-within-7-days. Caste and religion are never features anywhere in the pipeline.',
    method: 'Zoho QuickML endpoint when the flag is on; an embedded logistic model is the offline fallback — the source badge on every prediction says which one answered.',
    metrics: 'ROC-AUC reported with each scoring response; A/C class probabilities shown alongside the gauge.',
    caveats: 'Trained on synthetic FIRs, so coefficients reflect the generator\'s correlations. Use the sensitivity sweep to see which levers move a given profile.',
  },
  {
    name: 'Monthly forecast model',
    tone: 'neutral',
    purpose: 'Project monthly FIR volume per district × crime head six months ahead for planning.',
    inputs: 'Monthly registered-case history per district × head (ForecastMonthly), rebuilt by the analytics pipeline.',
    method: 'Holt-Winters-style seasonal exponential smoothing with an 80% confidence band; the explorer\'s backtest panel replays simple challenger models over a 6-month holdout for honesty.',
    metrics: 'Backtest MAPE badge per district × head; the CI band widens with horizon.',
    caveats: 'Short history and regime changes (new stations, reporting drives) break the seasonal assumption — the level-shift markers on /trends flag exactly those months.',
  },
];

export default function ModelCards() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn min-h-[40px]" onClick={() => setOpen(true)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
        </svg>
        Model cards
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Model cards">
        <div className="space-y-3 px-1 pb-1">
          <p className="text-xs text-muted">
            One card per model on this page — what it is for, what goes in, how it works, and where
            it breaks. All data is synthetic; no caste or religion field is used by any model.
          </p>
          {CARDS.map((c) => (
            <section key={c.name} className="rounded-lg border border-grid bg-base/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{c.name}</h3>
                <Badge tone={c.tone}>documented</Badge>
              </div>
              <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
                {[['Purpose', c.purpose], ['Inputs', c.inputs], ['Method', c.method], ['Metrics', c.metrics], ['Caveats', c.caveats]].map(([k, v]) => (
                  <div key={k}>
                    <dt className="inline font-medium text-ink/80">{k}: </dt>
                    <dd className="inline text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}
