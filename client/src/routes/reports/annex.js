// Methodology annex for the Weekly Brief — numbered notes explaining how each
// analytic in the brief is produced, phrased for a reader who did not build
// the system. Dynamic where it can be (forecast model + backtest MAPE come
// from the live payload); shared by BriefContent (print) and markdown.js.
import { fmtNum } from '../../lib/format.js';

export function annexNotes(brief) {
  const model = brief.forecast.data?.model;
  const mape = brief.forecast.data?.mape;
  return [
    {
      title: 'Anomaly alerts',
      body: 'Case counts per district × crime head are compared against the expected level derived from '
        + 'recent history; the z-score is (observed − expected) / σ. Severity bands: |z| ≥ 2 medium, '
        + '≥ 3 high, ≥ 4 critical. The band on each alert sparkline shows expected ± 2σ.',
    },
    {
      title: 'Hotspot clusters',
      body: 'Spatiotemporal clusters group incidents by location AND time-of-day, so a hotspot is a '
        + 'place-plus-hour-band (e.g. 21:00–02:00 around a market), not just a point on the map. '
        + 'Intensity is the density score used for ranking.',
    },
    {
      title: 'Forecast',
      body: `Monthly FIR volume forecast${model ? ` (model: ${model})` : ''} with a backtested interval`
        + `${mape !== null && mape !== undefined ? `; backtest MAPE ${fmtNum(mape, 1)}%` : ''}. `
        + 'Treat the interval, not the point value, as the planning envelope.',
    },
    {
      title: 'Station risk scores',
      body: 'A 30-day risk score per police station combining recent volume, trend and crime-mix signals; '
        + '"drivers" name the strongest contributing components. Scores rank stations for resource '
        + 'deployment — they are never predictions about individuals.',
    },
    {
      title: 'Network analysis',
      body: 'Co-offending links come from identity-resolved accused appearing in shared cases; communities '
        + 'are detected on that graph and association strength is the number of shared cases.',
    },
    {
      title: 'Escalation SLAs',
      body: 'Alert triage SLAs in the console count from first sighting: critical 4h, high 12h, '
        + 'medium 24h, low 48h. Breaches are flagged, never auto-closed.',
    },
    {
      title: 'Data & ethics',
      body: 'All figures derive from synthetic demonstration data for KSP Datathon 2026 — not real crime '
        + 'records. Caste and religion are never used in any feature, model, or analytic.',
    },
  ];
}
