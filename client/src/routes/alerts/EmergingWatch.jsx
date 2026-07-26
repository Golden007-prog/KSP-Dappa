// /alerts — emerging-category watchlist (GET /insight/emerging).
//
// An alert fires on one district × head in one week. This is the slower signal
// underneath: which crime SUB-heads are running above their own 12-month
// baseline across the state, and which are receding. It is the bridge between
// "a spike happened here" and "this category is trending", which is what a
// weekly tasking meeting actually decides on.
//
// Rows carry a 12-point spark from the server; drawn as a bare inline SVG
// rather than an ECharts instance because there can be a dozen of them and they
// are decorative next to the numbers.
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { fmtNum, fmtPct, monthLabel } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';

/** 12 numbers → a 60×18 polyline. Flat series render as a mid-height line. */
function Spark({ values, tone }) {
  const vals = (values || []).map((v) => Number(v) || 0);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * 58 + 1;
    const y = 17 - ((v - lo) / span) * 16;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width="60" height="18" viewBox="0 0 60 18" aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" className={tone} />
    </svg>
  );
}

function Row({ r, rising, t, tName, onPick }) {
  const name = tName('crimeHeads', r.headId, r.headName) || r.headName || '';
  const growth = Number(r.growthPct);
  const tone = rising ? 'text-signal' : 'text-teal';
  return (
    <button
      type="button"
      onClick={() => onPick?.(r)}
      className="flex w-full min-h-[44px] items-center gap-2 rounded-lg border border-grid/70 px-2.5 py-1.5 text-left transition-colors hover:border-primary/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-ink">{r.subHeadName || '—'}</span>
        <span className="block truncate text-[10px] text-muted">{name}</span>
      </span>
      <Spark values={r.spark} tone={tone} />
      <span className="w-[6.5rem] shrink-0 text-right">
        <span className={`num block text-xs font-semibold ${tone}`}>
          {Number.isFinite(growth) ? fmtPct(growth, { sign: true }) : '—'}
        </span>
        <span className="num block text-[10px] text-muted">
          {fmtNum(r.recentAvg, 0)} {t('alerts.emerging.vs')} {fmtNum(r.baselineAvg, 0)}
        </span>
      </span>
      {r.emerging && <Badge tone="red" pulse>{t('alerts.emerging.flag')}</Badge>}
    </button>
  );
}

export default function EmergingWatch({ query, onPick }) {
  const t = useT();
  const tName = useNames();

  if (query.isLoading) return <LoadingSkeleton lines={4} />;
  if (query.error) return <p className="text-xs text-muted">{t('alerts.emerging.unavailable', { msg: query.error.message })}</p>;

  const d = query.data || {};
  const rising = (d.rising || []).slice(0, 6);
  const falling = (d.falling || []).slice(0, 4);
  if (!rising.length && !falling.length) return <p className="text-xs text-muted">{t('alerts.emerging.empty')}</p>;

  const flagged = rising.filter((r) => r.emerging).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        {d.anchorYm && (
          <Tooltip label={t('alerts.emerging.windowTip')}>
            <span tabIndex={0} className="num cursor-default rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              {t('alerts.emerging.window', { from: monthLabel(d.fromYm), to: monthLabel(d.anchorYm) })}
            </span>
          </Tooltip>
        )}
        {flagged > 0 && <Badge tone="red">{t('alerts.emerging.flagged', { n: flagged })}</Badge>}
      </div>

      {rising.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('alerts.emerging.rising')}</p>
          {rising.map((r) => (
            <Row key={`r-${r.subHeadId}`} r={r} rising t={t} tName={tName} onPick={onPick} />
          ))}
        </div>
      )}

      {falling.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('alerts.emerging.falling')}</p>
          {falling.map((r) => (
            <Row key={`f-${r.subHeadId}`} r={r} rising={false} t={t} tName={tName} onPick={onPick} />
          ))}
        </div>
      )}

      <p className="text-[10px] leading-tight text-muted">{t('alerts.emerging.note')}</p>
    </div>
  );
}
