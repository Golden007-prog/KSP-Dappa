// Seasonality mini heatmap — day × hour incidence matrix (useSeasonality)
// as a 7×24 CSS grid with an amber intensity ramp (theme-aware via the
// --t-amber token), a peak-window callout plus night-share and
// weekend-vs-weekday split chips. Horizontally scrollable on small screens
// so the page never scrolls sideways.
import { Fragment, useMemo } from 'react';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { seasonalitySplits } from './insights.js';

const hh = (h) => String(h).padStart(2, '0');

// The API/normalizer emits English weekday abbreviations; they stay the data
// key (peak matching) and only the rendered label is translated.
const DAY_KEY = {
  Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
};

export default function SeasonalityPanel({ query }) {
  const t = useT();
  const s = query.data;
  const dayLabel = (d) => (DAY_KEY[d] ? t(`dashboard.day.${DAY_KEY[d]}`) : d);

  const peak = useMemo(() => {
    if (!s || !s.max) return null;
    for (let d = 0; d < s.matrix.length; d += 1) {
      const h = s.matrix[d].indexOf(s.max);
      if (h !== -1) return { day: s.days[d], hour: h, value: s.max };
    }
    return null;
  }, [s]);

  const splits = useMemo(() => seasonalitySplits(s), [s]);

  if (query.isLoading) return <LoadingSkeleton height={190} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title={t('dashboard.seasonality.error')}
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }
  if (!s || !s.max) {
    return (
      <EmptyState
        compact
        title={t('dashboard.seasonality.empty')}
        message={t('dashboard.seasonality.emptyHint')}
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {peak && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="amber">{t('dashboard.seasonality.peakWindow')}</Badge>
          <span className="text-xs text-muted">
            {t('dashboard.seasonality.peakDetail', {
              day: dayLabel(peak.day),
              from: `${hh(peak.hour)}:00`,
              to: `${hh((peak.hour + 1) % 24)}:00`,
              n: fmtInt(peak.value),
            })}
          </span>
        </div>
      )}
      {splits && (
        <div className="flex flex-wrap items-center gap-1.5">
          {splits.nightPct !== null && (
            <Badge tone={splits.nightPct >= 40 ? 'red' : 'neutral'}>
              {t('dashboard.seasonality.night', { pct: fmtPct(splits.nightPct, { digits: 0 }) })}
            </Badge>
          )}
          {splits.weekendDeltaPct !== null && (
            <Badge tone={splits.weekendDeltaPct > 0 ? 'amber' : 'teal'}>
              {t('dashboard.seasonality.weekend', {
                pct: fmtPct(splits.weekendDeltaPct, { sign: true, digits: 0 }),
              })}
            </Badge>
          )}
        </div>
      )}
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
        <div
          className="grid min-w-[430px] gap-[3px]"
          style={{ gridTemplateColumns: '2.4rem repeat(24, minmax(0.7rem, 1fr))' }}
          role="img"
          aria-label={peak
            ? t('dashboard.seasonality.gridAriaPeak', { day: dayLabel(peak.day), hour: `${hh(peak.hour)}:00` })
            : t('dashboard.seasonality.gridAria')}
        >
          <span aria-hidden="true" />
          {s.hours.map((h) => (
            <span key={`h-${h}`} className="num text-center text-[9px] text-muted" aria-hidden="true">
              {h % 6 === 0 ? h : ''}
            </span>
          ))}
          {s.days.map((day, d) => (
            <Fragment key={day}>
              <span className="self-center text-[10px] text-muted" aria-hidden="true">{dayLabel(day)}</span>
              {s.hours.map((h) => {
                const v = s.matrix[d]?.[h] || 0;
                const a = v > 0 ? 0.08 + 0.92 * (v / s.max) : 0;
                const isPeak = peak && v === s.max && s.days[d] === peak.day && h === peak.hour;
                return (
                  <span
                    key={h}
                    title={t('dashboard.seasonality.cellTitle', {
                      day: dayLabel(day), hour: `${hh(h)}:00`, n: fmtInt(v),
                    })}
                    className={`h-4 rounded-[3px] border border-grid/40 ${isPeak ? 'outline outline-1 outline-signal' : ''}`}
                    style={a > 0 ? { background: `rgb(var(--t-amber) / ${a.toFixed(2)})` } : undefined}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-muted">{t('dashboard.seasonality.footnote')}</p>
    </div>
  );
}
