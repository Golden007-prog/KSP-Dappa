// Seasonality mini heatmap — day × hour incidence matrix (useSeasonality)
// as a 7×24 CSS grid with an amber intensity ramp (theme-aware via the
// --t-amber token) and a peak-window callout. Horizontally scrollable on
// small screens so the page never scrolls sideways.
import { Fragment, useMemo } from 'react';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt } from '../../lib/format.js';

const hh = (h) => String(h).padStart(2, '0');

export default function SeasonalityPanel({ query }) {
  const s = query.data;

  const peak = useMemo(() => {
    if (!s || !s.max) return null;
    for (let d = 0; d < s.matrix.length; d += 1) {
      const h = s.matrix[d].indexOf(s.max);
      if (h !== -1) return { day: s.days[d], hour: h, value: s.max };
    }
    return null;
  }, [s]);

  if (query.isLoading) return <LoadingSkeleton height={190} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title="Couldn't load seasonality"
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>Retry</button>}
      />
    );
  }
  if (!s || !s.max) {
    return <EmptyState compact title="No seasonality data" message="No day-by-hour counts for the current filters." />;
  }

  return (
    <div className="space-y-2.5">
      {peak && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="amber">Peak window</Badge>
          <span className="text-xs text-muted">
            {peak.day} {hh(peak.hour)}:00–{hh((peak.hour + 1) % 24)}:00 ·{' '}
            <span className="num text-ink">{fmtInt(peak.value)}</span> incidents
          </span>
        </div>
      )}
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
        <div
          className="grid min-w-[430px] gap-[3px]"
          style={{ gridTemplateColumns: '2.4rem repeat(24, minmax(0.7rem, 1fr))' }}
          role="img"
          aria-label={peak
            ? `Incidents by weekday and hour; peak is ${peak.day} at ${hh(peak.hour)}:00`
            : 'Incidents by weekday and hour'}
        >
          <span aria-hidden="true" />
          {s.hours.map((h) => (
            <span key={`h-${h}`} className="num text-center text-[9px] text-muted" aria-hidden="true">
              {h % 6 === 0 ? h : ''}
            </span>
          ))}
          {s.days.map((day, d) => (
            <Fragment key={day}>
              <span className="self-center text-[10px] text-muted" aria-hidden="true">{day}</span>
              {s.hours.map((h) => {
                const v = s.matrix[d]?.[h] || 0;
                const a = v > 0 ? 0.08 + 0.92 * (v / s.max) : 0;
                const isPeak = peak && v === s.max && s.days[d] === peak.day && h === peak.hour;
                return (
                  <span
                    key={h}
                    title={`${day} ${hh(h)}:00 — ${fmtInt(v)} incidents`}
                    className={`h-4 rounded-[3px] border border-grid/40 ${isPeak ? 'outline outline-1 outline-signal' : ''}`}
                    style={a > 0 ? { background: `rgb(var(--t-amber) / ${a.toFixed(2)})` } : undefined}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-muted">Darker amber = more incidents · 24-hour clock, Mon–Sun</p>
    </div>
  );
}
