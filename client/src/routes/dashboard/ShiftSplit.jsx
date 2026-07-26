// Shift-wise split (C1 — time of day layered onto the week).
// Karnataka Police run three eight-hour shifts; this folds the raw day × hour
// seasonality matrix into exactly those buckets so the panel answers a roster
// question rather than a statistics question: which shift carries the load,
// and on which days does the night shift take over.
//
// It reads the RAW /trends/seasonality payload because the server orders the
// matrix by getDay() (Sunday first) and publishes that order under `weekdays`;
// the shared normalizer looks for a `days` key instead and relabels the rows
// Mon-first, shifting every weekday by one.
//
// Props: query (useSeasonalityRaw result)
import { useMemo } from 'react';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { shiftAnalysis } from './analytics.js';
import { hh } from './insights.js';

const TONE = { day: 'bg-teal/70', evening: 'bg-amber/75', night: 'bg-signal/75' };
const TEXT = { day: 'text-teal', evening: 'text-amber', night: 'text-signal' };
const DAY_KEYS = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };

export default function ShiftSplit({ query }) {
  const t = useT();
  const analysis = useMemo(() => shiftAnalysis(query.data), [query.data]);
  const dayLabel = (d) => (DAY_KEYS[d] ? t(`dashboard.day.${DAY_KEYS[d]}`) : String(d || ''));

  if (query.isLoading) return <LoadingSkeleton lines={6} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title={t('dashboard.shift.error')}
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }
  if (!analysis) {
    return <EmptyState compact title={t('dashboard.shift.empty')} message={t('dashboard.shift.emptyHint')} />;
  }

  const maxDay = Math.max(1e-9, ...analysis.byDay.map((d) => d.total));

  return (
    <div className="space-y-2.5">
      {/* three shift tiles */}
      <div className="grid grid-cols-3 gap-1.5">
        {analysis.shifts.map((s) => (
          <div
            key={s.key}
            className={`rounded-lg border p-2 ${
              analysis.dominant?.key === s.key ? 'border-amber/50 bg-amber/5' : 'border-grid/60 bg-base/30'
            }`}
          >
            <p className="truncate text-[10px] uppercase tracking-wide text-muted">
              {t(`dashboard.shift.name.${s.key}`)}
            </p>
            <p className={`num text-base font-bold leading-tight ${TEXT[s.key]}`}>{fmtNum(s.pct, 1)}%</p>
            <p className="num truncate text-[10px] text-muted">
              {t('dashboard.shift.band', { from: `${hh(s.from)}:00`, to: `${hh(s.to)}:00` })}
            </p>
            <p className="num truncate text-[10px] text-muted">{fmtInt(s.count)}</p>
          </div>
        ))}
      </div>

      {analysis.dominant && (
        <p className="text-[11px] text-muted">
          {t('dashboard.shift.dominant', {
            shift: t(`dashboard.shift.name.${analysis.dominant.key}`),
            pct: fmtNum(analysis.dominant.pct, 1),
          })}
        </p>
      )}

      {/* per-weekday stacked bars */}
      <ul className="space-y-1" aria-label={t('dashboard.shift.byDayAria')}>
        {analysis.byDay.map((d) => {
          const width = Math.max(4, Math.round((d.total / maxDay) * 100));
          const seg = (v) => (d.total > 0 ? (v / d.total) * 100 : 0);
          return (
            <li key={d.dayIndex} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-[10px] text-muted">{dayLabel(d.weekday)}</span>
              <span
                className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-grid/40"
                title={t('dashboard.shift.dayTitle', {
                  weekday: dayLabel(d.weekday),
                  day: fmtInt(d.day),
                  eve: fmtInt(d.evening),
                  night: fmtInt(d.night),
                })}
              >
                <span className="flex h-full" style={{ width: `${width}%` }}>
                  <span className={`h-full ${TONE.day}`} style={{ width: `${seg(d.day)}%` }} />
                  <span className={`h-full ${TONE.evening}`} style={{ width: `${seg(d.evening)}%` }} />
                  <span className={`h-full ${TONE.night}`} style={{ width: `${seg(d.night)}%` }} />
                </span>
              </span>
              <span className="num w-9 shrink-0 text-right text-[10px] text-muted">{fmtInt(d.total)}</span>
            </li>
          );
        })}
      </ul>

      {analysis.peak && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="amber">
            {t('dashboard.shift.peak', {
              day: dayLabel(analysis.peak.weekday),
              from: `${hh(analysis.peak.hour)}:00`,
              to: `${hh((analysis.peak.hour + 1) % 24)}:00`,
            })}
          </Badge>
          <Badge tone="slate">{t('dashboard.shift.sample', { n: fmtInt(analysis.sampleSize || analysis.total) })}</Badge>
        </div>
      )}

      <p className="text-[10px] text-muted">{t('dashboard.shift.footnote')}</p>
    </div>
  );
}
