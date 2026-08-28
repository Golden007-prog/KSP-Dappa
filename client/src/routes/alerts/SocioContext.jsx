// /alerts — the "why behind the where" for one alert's district.
//
// A spike of 42 cases means something different in Bengaluru City (11 million
// people, 100% urban) than in a rural district of 900,000. This panel pulls the
// district's socio-economic profile from GET /meta/socio, normalises the
// alert's observed count to cases per lakh, and places each indicator as a
// percentile across every district that reports it — so the reader sees not
// just the value but whether it is high FOR KARNATAKA.
//
// Protected personal attributes are not part of this dataset and are never
// referenced here; these are district-level census-style indicators only.
import Tooltip from '../../components/Tooltip.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { fmtInt, fmtNum, fmtCompact } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { ratePerLakh, indicatorPercentile } from './explain.js';

/** Indicator key → {label key, formatter}. Order is the display order. */
const INDICATORS = [
  { key: 'population', label: 'population', fmt: (v) => fmtCompact(v) },
  { key: 'urbanPct', label: 'urban', fmt: (v) => `${fmtNum(v, 0)}%` },
  { key: 'literacyPct', label: 'literacy', fmt: (v) => `${fmtNum(v, 1)}%` },
  { key: 'densityPerKm2', label: 'density', fmt: (v) => fmtInt(v) },
  { key: 'perCapitaIncomeIdx', label: 'income', fmt: (v) => fmtNum(v, 1) },
];

/** Percentile → a four-step word so the reader gets a verdict, not a number. */
function rankWord(p, t) {
  if (p === null) return '';
  if (p >= 80) return t('alerts.socio.rank.top');
  if (p >= 55) return t('alerts.socio.rank.upper');
  if (p >= 25) return t('alerts.socio.rank.middle');
  return t('alerts.socio.rank.lower');
}

export default function SocioContext({ query, alert: a }) {
  const t = useT();
  const tName = useNames();

  if (query.isLoading) return <LoadingSkeleton lines={3} />;
  if (query.error) return null;

  const { rows = [], byId } = query.data || {};
  const raw = String(a?.districtId ?? '');
  const s = byId?.get(raw) || byId?.get(raw.replace(/^0+(?=\d)/, ''));
  if (!s) return null;

  const rate = ratePerLakh(a?.observed, s.population);
  const name = tName('districts', s.districtId, s.districtName || raw) || s.districtName || raw;

  return (
    <div className="rounded-lg border border-grid/70 bg-canvas/20 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t('alerts.socio.title')}
        </span>
        <span className="truncate text-[11px] text-ink">{name}</span>
      </div>

      {rate !== null && (
        <Tooltip label={t('alerts.socio.rateTip')}>
          <p tabIndex={0} className="num mb-1.5 cursor-default rounded text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            {t('alerts.socio.rate', { v: fmtNum(rate, 2) })}
          </p>
        </Tooltip>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
        {INDICATORS.map((ind) => {
          const v = Number(s[ind.key]);
          if (!Number.isFinite(v)) return null;
          const pct = indicatorPercentile(rows, ind.key, v);
          const word = rankWord(pct, t);
          return (
            <div key={ind.key} className="min-w-0 border-b border-grid/30 py-1 last:border-0">
              <div className="truncate text-[10px] uppercase tracking-wider text-muted">
                {t(`alerts.socio.ind.${ind.label}`)}
              </div>
              <div className="num text-xs font-medium text-ink">{ind.fmt(v)}</div>
              {word && (
                <div className={`text-[10px] ${pct >= 80 ? 'text-amber' : 'text-muted'}`}>{word}</div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] leading-tight text-muted">{t('alerts.socio.note')}</p>
    </div>
  );
}
