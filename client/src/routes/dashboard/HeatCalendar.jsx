// Year × month heat calendar (C4 — temporal hotspots).
// The 12-month trend line shows the recent shape; this shows the whole history
// as a grid, which is where seasonality that repeats every year (festival
// months, monsoon dips, exam-season cyber spikes) becomes obvious. Every cell
// carries a z-score against the full series, so a month running ≥2σ hot is
// outlined red and one running ≥2σ cold is outlined teal.
//
// Clicking a cell rewrites the GLOBAL date filter to that calendar month, so
// the whole dashboard re-scopes to the month you spotted.
//
// Props: query (useMonthlyRaw over a multi-year window), onPickMonth(ym),
//        activeFrom, activeTo
import { useMemo } from 'react';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { fmtInt, fmtNum, fmtPct, monthLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useLocalPref } from './lib.js';
import { monthCalendar } from './analytics.js';

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export default function HeatCalendar({ query, onPickMonth, activeFrom, activeTo }) {
  const t = useT();
  const [metric, setMetric] = useLocalPref('dappa-dash-calendar-metric', 'caseCount');
  const metricKey = metric === 'heinousCount' ? 'heinousCount' : 'caseCount';
  const cal = useMemo(() => monthCalendar(query.data, { metric: metricKey }), [query.data, metricKey]);

  const activeYm = useMemo(() => {
    const f = String(activeFrom || '').slice(0, 7);
    const to = String(activeTo || '').slice(0, 7);
    return f && f === to ? f : null;
  }, [activeFrom, activeTo]);

  const metricOptions = useMemo(() => ([
    { value: 'caseCount', label: t('dashboard.calendar.metricAll') },
    { value: 'heinousCount', label: t('dashboard.calendar.metricHeinous') },
  ]), [t]);

  if (query.isLoading) return <LoadingSkeleton lines={6} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title={t('dashboard.calendar.error')}
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }
  if (!cal) {
    return <EmptyState compact title={t('dashboard.calendar.empty')} message={t('dashboard.calendar.emptyHint')} />;
  }

  return (
    <div className="space-y-2.5">
      <SegmentedControl
        ariaLabel={t('dashboard.calendar.metricAria')}
        value={metricKey}
        onChange={setMetric}
        options={metricOptions}
      />

      {/* The grid is intentionally allowed to scroll inside its own box: 12
          month columns plus a year label never fit 360px. The cell buttons carry
          their own min-width so the column can never squeeze below the WCAG
          2.5.8 target size — at the old 22rem table width they measured 20 × 24
          on a 360 px phone and axe failed target-size; the table min-width alone
          could not guarantee it, because the year and total columns size to
          their content. The box scrolls, but its buttons are focusable, so it
          stays keyboard-reachable without a tabindex of its own. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[25rem] border-separate border-spacing-[2px] text-[10px]">
          <caption className="sr-only">{t('dashboard.calendar.tableAria')}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-8 text-left font-normal text-muted">{t('dashboard.calendar.yearCol')}</th>
              {MONTH_KEYS.map((m) => (
                <th key={m} scope="col" className="font-normal text-muted">{t(`dashboard.calendar.m.${m}`)}</th>
              ))}
              <th scope="col" className="w-10 text-right font-normal text-muted">{t('dashboard.calendar.totalCol')}</th>
            </tr>
          </thead>
          <tbody>
            {cal.years.map((y, yi) => {
              const prev = yi > 0 ? cal.years[yi - 1].total : null;
              const yoy = prev > 0 ? ((y.total - prev) / prev) * 100 : null;
              return (
                <tr key={y.year}>
                  <th scope="row" className="num text-left font-semibold text-ink">{y.year}</th>
                  {y.cells.map((c, mi) => {
                    if (!c) {
                      return (
                        <td key={mi} className="p-0">
                          <span className="block h-6 min-w-[24px] rounded-sm border border-dashed border-grid/50 bg-transparent" aria-hidden="true" />
                        </td>
                      );
                    }
                    const alpha = cal.max > 0 ? Math.max(0.08, Math.min(1, c.value / cal.max)) : 0.08;
                    const hot = c.z >= 2;
                    const cold = c.z <= -2;
                    const on = activeYm === c.ym;
                    return (
                      <td key={mi} className="p-0">
                        <button
                          type="button"
                          onClick={() => onPickMonth?.(c.ym)}
                          title={t('dashboard.calendar.cellTitle', {
                            month: monthLabel(c.ym),
                            n: fmtInt(c.value),
                            z: fmtNum(c.z, 1),
                          })}
                          aria-label={t('dashboard.calendar.cellTitle', {
                            month: monthLabel(c.ym),
                            n: fmtInt(c.value),
                            z: fmtNum(c.z, 1),
                          })}
                          className={`block h-6 w-full min-w-[24px] rounded-sm border transition-transform hover:scale-110 focus:outline-none focus:ring-1 focus:ring-amber ${
                            on ? 'border-teal ring-1 ring-teal'
                              : hot ? 'border-signal'
                                : cold ? 'border-teal/70'
                                  : 'border-grid/40'
                          }`}
                          style={{ backgroundColor: `rgb(var(--t-amber) / ${alpha.toFixed(2)})` }}
                        />
                      </td>
                    );
                  })}
                  <td className="num text-right text-muted">
                    <span className="block leading-tight text-ink">{fmtInt(y.total)}</span>
                    {yoy !== null && (
                      <span className={`block leading-tight ${yoy >= 0 ? 'text-signal' : 'text-teal'}`}>
                        {fmtPct(yoy, { sign: true, digits: 0 })}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
        {cal.hottest && (
          <span>{t('dashboard.calendar.hottest', { month: monthLabel(cal.hottest.ym), n: fmtInt(cal.hottest.value) })}</span>
        )}
        {cal.coldest && (
          <span>{t('dashboard.calendar.coldest', { month: monthLabel(cal.coldest.ym), n: fmtInt(cal.coldest.value) })}</span>
        )}
        <span className="num">{t('dashboard.calendar.baseline', { mean: fmtNum(cal.mean, 0), sd: fmtNum(cal.sd, 0) })}</span>
      </div>
      <p className="text-[10px] text-muted">{t('dashboard.calendar.footnote')}</p>
    </div>
  );
}
