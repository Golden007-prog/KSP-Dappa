// Cases-per-year mini bar chart for the Offender 360 identity card.
// Inline SVG (theme-aware via Tailwind fill classes) computed from the case
// timeline's registeredDate years. Renders nothing when no year parses.
import { useMemo } from 'react';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const MAX_YEARS = 12;

export default function YearSparkline({ timeline = [], height = 40 }) {
  const t = useT();
  const data = useMemo(() => {
    const byYear = new Map();
    for (const row of timeline) {
      const y = Number(String(row?.registeredDate || '').slice(0, 4));
      if (y >= 1990 && y <= 2100) byYear.set(y, (byYear.get(y) || 0) + 1);
    }
    if (!byYear.size) return null;
    let years = [...byYear.keys()].sort((a, b) => a - b);
    // Continuous axis (gap years show as zero bars), capped to the last N.
    const span = [];
    for (let y = years[0]; y <= years[years.length - 1]; y += 1) span.push(y);
    years = span.slice(-MAX_YEARS);
    const counts = years.map((y) => byYear.get(y) || 0);
    return { years, counts, max: Math.max(...counts, 1) };
  }, [timeline]);

  if (!data) return null;

  const bw = 100 / data.years.length;
  return (
    <div className="bg-base/60 border border-grid rounded-lg px-3 py-2 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted">{t('network.spark.title')}</p>
      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        className="w-full mt-1"
        style={{ height }}
        role="img"
        aria-label={t('network.spark.aria', {
          list: data.years.map((y, i) => `${y}: ${fmtInt(data.counts[i])}`).join(', '),
        })}
      >
        {data.years.map((y, i) => {
          const h = (data.counts[i] / data.max) * 26;
          return (
            <rect
              key={y}
              x={i * bw + bw * 0.15}
              y={30 - h}
              width={bw * 0.7}
              height={Math.max(h, data.counts[i] ? 1 : 0.4)}
              rx={0.6}
              className={data.counts[i] ? 'fill-amber' : 'fill-grid'}
            >
              <title>
                {t(data.counts[i] === 1 ? 'network.spark.barTitle.one' : 'network.spark.barTitle.other',
                  { year: y, n: fmtInt(data.counts[i]) })}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted num mt-0.5" aria-hidden="true">
        <span>{data.years[0]}</span>
        <span>{data.years[data.years.length - 1]}</span>
      </div>
    </div>
  );
}
