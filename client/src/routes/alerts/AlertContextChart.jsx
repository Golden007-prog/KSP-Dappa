// /alerts — the real 12-month context behind one alert.
//
// The card sparkline is a synthetic shape the API derives from observed/expected
// so the feed has something to draw cheaply. THIS chart is the actual series:
// GET /alerts/:id recomputes 12 months of SUM(CaseCount) from AggMonthly for
// the alert's district × crime head and returns a robust baseline median
// alongside it. Drawn as bars with the baseline as a reference line and the
// alert's own month picked out, because a month-over-month bar chart is what
// the reader can actually count.
//
// Inline SVG, not ECharts: it lives inside a bottom sheet that can be opened
// and closed dozens of times during a demo, and a 12-bar chart does not justify
// mounting a chart engine each time.
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt, fmtNum, monthLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const H = 92;
const GAP = 3;

export default function AlertContextChart({ query, alertYm }) {
  const t = useT();

  if (query.isLoading) return <LoadingSkeleton lines={3} />;
  if (query.error) {
    return <p className="text-[11px] text-muted">{t('alerts.context.unavailable', { msg: query.error.message })}</p>;
  }

  const d = query.data || {};
  const series = Array.isArray(d.series) ? d.series : [];
  if (series.length < 2) return <p className="text-[11px] text-muted">{t('alerts.context.empty')}</p>;

  const baseline = Number(d.baselineMedian);
  const hasBaseline = Number.isFinite(baseline);
  const vals = series.map((p) => Number(p.caseCount) || 0);
  const peak = Math.max(...vals, hasBaseline ? baseline : 0, 1);
  const width = series.length * (12 + GAP);
  const anchor = String(alertYm || series[series.length - 1]?.ym || '').slice(0, 7);
  const last = vals[vals.length - 1];
  const vsBaseline = hasBaseline && baseline > 0 ? ((last - baseline) / baseline) * 100 : null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">
        <span className="font-semibold uppercase tracking-wider text-muted">{t('alerts.context.title')}</span>
        {hasBaseline && (
          <span className="num text-muted">{t('alerts.context.baseline', { v: fmtNum(baseline, 1) })}</span>
        )}
        {vsBaseline !== null && (
          <span className={`num ${vsBaseline >= 0 ? 'text-signal' : 'text-teal'}`}>
            {t('alerts.context.vsBaseline', { pct: `${vsBaseline >= 0 ? '+' : ''}${vsBaseline.toFixed(0)}` })}
          </span>
        )}
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={t('alerts.context.aria', { n: series.length, from: monthLabel(series[0].ym), to: monthLabel(series[series.length - 1].ym) })}
          className="min-w-full"
        >
          {hasBaseline && (
            <line
              x1="0"
              x2={width}
              y1={H - (baseline / peak) * (H - 6)}
              y2={H - (baseline / peak) * (H - 6)}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 3"
              className="text-muted/70"
            />
          )}
          {series.map((p, i) => {
            const v = Number(p.caseCount) || 0;
            const h = Math.max(2, (v / peak) * (H - 6));
            const isAnchor = String(p.ym) === anchor;
            const above = hasBaseline && v > baseline;
            return (
              <rect
                key={p.ym}
                x={i * (12 + GAP)}
                y={H - h}
                width="12"
                height={h}
                rx="1.5"
                className={isAnchor ? 'fill-signal' : above ? 'fill-amber/70' : 'fill-grid'}
              >
                <title>{`${monthLabel(p.ym)} — ${fmtInt(v)}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted">
        <span className="num">{monthLabel(series[0].ym)}</span>
        <Tooltip label={t('alerts.context.tip')}>
          <span tabIndex={0} className="cursor-default rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            {t('alerts.context.legend')}
          </span>
        </Tooltip>
        <span className="num">{monthLabel(series[series.length - 1].ym)}</span>
      </div>
    </div>
  );
}
