// Weekday × hour explorer — the temporal half of a spatiotemporal read. The
// 7 × 24 matrix comes from /trends/seasonality for the *current map filters*,
// so narrowing to a district or a crime head redraws it. Clicking a cell drives
// the map: it sets the hour lens (hotspots active at that hour) and the weekday
// lens (incident heat restricted to that day), which is how "Friday 22:00" goes
// from a number in a grid to a picture on the map.
import { fmtInt, fmtNum } from '../../lib/format.js';
import { rampColor } from './utils.js';
import { StatTile } from './AnalysisDock.jsx';
import { useT } from '../../lib/i18n.jsx';

/** 'Mon'/'Monday' → localised 3-glyph weekday label. */
export function dayShort(t, raw) {
  const key = String(raw || '').slice(0, 3).toLowerCase();
  return key ? t(`geointel.day.${key}`) : '';
}

export default function SpaceTimePanel({
  data, loading, error, onRetry, hour, weekday, onPick, onHour, onWeekday, onReset, light,
}) {
  const t = useT();
  if (error) {
    return (
      <div className="text-[11px] text-signal px-1 py-2">
        {t('geointel.spacetime.error')}
        <button type="button" className="underline ml-1 hover:text-ink transition-colors" onClick={onRetry}>
          {t('common.action.retry')}
        </button>
      </div>
    );
  }
  if (loading && !data) {
    return <div className="skeleton h-40 w-full rounded-lg" aria-hidden="true" />;
  }
  const matrix = data?.matrix || [];
  const weekdays = data?.weekdays || [];
  const total = data?.total || 0;
  if (!matrix.length || total === 0) {
    return <p className="text-[11px] text-muted px-1 py-2">{t('geointel.spacetime.empty')}</p>;
  }

  const max = Math.max(1, data.max);
  const dayTotals = matrix.map((row) => row.reduce((a, v) => a + v, 0));
  const hourTotals = Array.from({ length: 24 }, (_, h) => matrix.reduce((a, row) => a + (row[h] || 0), 0));
  const maxDay = Math.max(1, ...dayTotals);
  const maxHour = Math.max(1, ...hourTotals);
  let peak = { d: 0, h: 0, v: -1 };
  matrix.forEach((row, d) => row.forEach((v, h) => {
    if (v > peak.v) peak = { d, h, v };
  }));
  const nightShare = hourTotals.reduce((a, v, h) => a + (h >= 22 || h < 6 ? v : 0), 0) / total;

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <StatTile
          label={t('geointel.spacetime.peak')}
          value={`${dayShort(t, weekdays[peak.d])} ${String(peak.h).padStart(2, '0')}:00`}
          hint={t('geointel.spacetime.peakHint', { n: fmtInt(peak.v), p: fmtNum((peak.v / total) * 100, 1) })}
          tone="amber"
        />
        <StatTile
          label={t('geointel.spacetime.nightShare')}
          value={`${fmtNum(nightShare * 100, 1)}%`}
          hint={t('geointel.spacetime.nightHint')}
          tone={nightShare > 0.35 ? 'signal' : 'ink'}
        />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[19rem]">
          {/* hour ruler */}
          <div className="flex items-end gap-px pl-7 pr-6 mb-0.5" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="flex-1 text-[7px] text-muted num text-center leading-none">
                {h % 6 === 0 ? h : ''}
              </span>
            ))}
          </div>
          {matrix.map((row, d) => (
            <div key={weekdays[d] || d} className="flex items-center gap-px mb-px">
              <span className="w-7 shrink-0 text-[9px] text-muted truncate pr-1">{dayShort(t, weekdays[d])}</span>
              {row.map((v, h) => {
                const active = (weekday === null || weekday === d) && (hour === null || hour === h);
                const dimmed = (weekday !== null && weekday !== d) || (hour !== null && hour !== h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onPick(d, h)}
                    title={t('geointel.spacetime.cellTitle', {
                      day: dayShort(t, weekdays[d]), hour: String(h).padStart(2, '0'), n: fmtInt(v),
                    })}
                    aria-label={t('geointel.spacetime.cellTitle', {
                      day: dayShort(t, weekdays[d]), hour: String(h).padStart(2, '0'), n: fmtInt(v),
                    })}
                    className={`flex-1 h-3.5 rounded-[2px] transition-opacity ${
                      dimmed ? 'opacity-30' : ''
                    } ${active && (weekday !== null || hour !== null) ? 'ring-1 ring-primary' : ''}`}
                    style={{ background: v > 0 ? rampColor(v / max, light) : (light ? '#EEF1F7' : '#141d31') }}
                  />
                );
              })}
              <span className="w-6 shrink-0 pl-1" aria-hidden="true">
                <span className="block h-1 rounded-full bg-grid overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.round((dayTotals[d] / maxDay) * 100)}%` }}
                  />
                </span>
              </span>
            </div>
          ))}
          {/* per-hour marginal */}
          <div className="flex items-end gap-px pl-7 pr-6 mt-1 h-6" aria-hidden="true">
            {hourTotals.map((v, h) => (
              <span key={h} className="flex-1 flex items-end h-full">
                <span
                  className={`block w-full rounded-t-[2px] ${h >= 22 || h < 6 ? 'bg-signal/60' : 'bg-amber/60'}`}
                  style={{ height: `${Math.max(4, Math.round((v / maxHour) * 100))}%` }}
                />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted mr-0.5">{t('geointel.spacetime.dayFilter')}</span>
        <button
          type="button"
          aria-pressed={weekday === null}
          onClick={() => onWeekday(null)}
          className={`chip gi-tap shrink-0 text-[10px] transition-colors ${
            weekday === null ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
          }`}
        >
          {t('geointel.spacetime.allDays')}
        </button>
        {weekdays.map((w, d) => (
          <button
            key={w}
            type="button"
            aria-pressed={weekday === d}
            onClick={() => onWeekday(weekday === d ? null : d)}
            className={`chip gi-tap shrink-0 text-[10px] transition-colors ${
              weekday === d ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
            }`}
          >
            {dayShort(t, w)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="chip gi-tap text-[10px] text-muted hover:text-ink transition-colors"
          onClick={() => onHour(peak.h)}
        >
          {t('geointel.spacetime.jumpPeak')}
        </button>
        <button
          type="button"
          className="chip gi-tap text-[10px] text-muted hover:text-ink transition-colors"
          onClick={onReset}
        >
          {t('geointel.spacetime.reset')}
        </button>
        <span className="text-[9px] text-muted num">
          {t('geointel.spacetime.sample', { n: fmtInt(data.sampleSize || total) })}
        </span>
      </div>
    </>
  );
}
