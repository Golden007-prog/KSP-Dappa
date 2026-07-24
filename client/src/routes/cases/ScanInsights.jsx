// Scan insights — client-aggregated intelligence over the rows the explorer is
// currently scanning: four KPI tiles (anomaly share, heinous share, median
// pending age, busiest month), a status mix with one-tap filter chips, and two
// temporal strips (monthly registration density with click-to-filter, and a
// day-of-week profile with the peak day highlighted). Hour-of-day is shown on
// the case detail instead — list rows carry a date-only registeredDate.
// Collapsible; state persists like the filter-profile bar.
import { useMemo, useState } from 'react';
import { parse, isValid, getDay } from 'date-fns';
import Card from '../../components/Card.jsx';
import ChartPanel from '../../components/ChartPanel.jsx';
import KpiTile from '../../components/KpiTile.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { fmtInt, fmtPct, monthLabel } from '../../lib/format.js';
import { readJson, writeJson } from './explorerState.js';

const STORAGE_KEY = 'dappa-cases-insights';
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_STATUS_CHIPS = 6;

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export default function ScanInsights({ rows, scopeLabel, statuses = [], statusId, onStatus, onMonthClick }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(() => readJson(STORAGE_KEY, true) !== false);

  const agg = useMemo(() => {
    const list = rows || [];
    const months = new Map();
    const weekdays = Array(7).fill(0);
    const statusCounts = new Map();
    let anomalies = 0;
    let heinous = 0;
    const ages = [];
    for (const r of list) {
      if (r.anomalyFlag) anomalies += 1;
      if (/hein/i.test(String(r.gravityName || ''))) heinous += 1;
      if (Number.isFinite(r.ageDays)) ages.push(r.ageDays);
      const sName = String(r.statusName || '').trim();
      if (sName) statusCounts.set(sName, (statusCounts.get(sName) || 0) + 1);
      const iso = String(r.registeredDate || '').slice(0, 10);
      const ym = iso.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) months.set(ym, (months.get(ym) || 0) + 1);
      const d = parse(iso, 'yyyy-MM-dd', new Date());
      if (isValid(d)) weekdays[(getDay(d) + 6) % 7] += 1; // Mon-first
    }
    const monthList = [...months.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const busiest = monthList.reduce((acc, m) => (m[1] > (acc?.[1] ?? -1) ? m : acc), null);
    const peakDay = weekdays.reduce((acc, v, i) => (v > weekdays[acc] ? i : acc), 0);
    const statusList = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_STATUS_CHIPS);
    return {
      total: list.length,
      anomalies,
      heinous,
      medianAge: median(ages),
      months: monthList,
      weekdays,
      peakDay,
      busiest,
      statusList,
    };
  }, [rows]);

  if (agg.total < 2) return null;

  const toggle = () => {
    setOpen((o) => {
      writeJson(STORAGE_KEY, !o);
      return !o;
    });
  };

  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3 -my-1.5">
          <p className="text-xs text-muted truncate">Scan insights — anomaly / heinous share, status mix, temporal profile · {scopeLabel}</p>
          <button type="button" className="btn !py-1 !px-2 text-xs shrink-0" onClick={toggle} aria-expanded={false}>Show</button>
        </div>
      </Card>
    );
  }

  const pct = (n) => (agg.total ? (n / agg.total) * 100 : 0);
  const labelInk = theme === 'light' ? '#5C6B84' : '#8A94A8';
  const peakColor = theme === 'light' ? '#DC2626' : '#E5484D';

  const monthOption = agg.months.length >= 2 ? {
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: agg.months.map(([ym]) => monthLabel(ym)), axisLabel: { interval: Math.max(0, Math.ceil(agg.months.length / 10) - 1) } },
    yAxis: { type: 'value', minInterval: 1 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [{
      type: 'bar',
      data: agg.months.map(([, count]) => count),
      barMaxWidth: 26,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      cursor: 'pointer',
    }],
  } : null;

  const weekdayOption = {
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: DAY_LABELS },
    yAxis: { type: 'value', minInterval: 1 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [{
      type: 'bar',
      data: agg.weekdays.map((v, i) => (i === agg.peakDay && v > 0
        ? { value: v, itemStyle: { color: peakColor } }
        : v)),
      barMaxWidth: 30,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      label: { show: true, position: 'top', fontSize: 10, color: labelInk },
    }],
  };

  return (
    <div className="space-y-3 animate-fade-in" aria-label="Scan insights">
      <Card>
        <div className="flex items-center justify-between gap-3 -mt-1 mb-3">
          <p className="text-xs text-muted truncate">Scan insights · {scopeLabel}</p>
          <button type="button" className="btn !py-1 !px-2 text-xs shrink-0" onClick={toggle} aria-expanded>Hide</button>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiTile
            label="Anomalies"
            value={agg.anomalies}
            accent={agg.anomalies > 0 ? 'red' : 'teal'}
            pulse={agg.anomalies > 0}
            hint={`${fmtPct(pct(agg.anomalies))} of ${fmtInt(agg.total)} scanned`}
          />
          <KpiTile
            label="Heinous"
            value={agg.heinous}
            accent={pct(agg.heinous) > 25 ? 'amber' : 'teal'}
            hint={`${fmtPct(pct(agg.heinous))} of scanned cases`}
          />
          <KpiTile
            label="Median age"
            value={agg.medianAge === null ? '—' : `${fmtInt(agg.medianAge)}d`}
            accent={agg.medianAge !== null && agg.medianAge > 90 ? 'amber' : 'teal'}
            hint="days since registration (scanned rows)"
          />
          <KpiTile
            label="Busiest month"
            value={agg.busiest ? monthLabel(agg.busiest[0]) : '—'}
            accent="amber"
            hint={agg.busiest ? `${fmtInt(agg.busiest[1])} registrations` : 'no dated rows'}
          />
        </div>
        {agg.statusList.length > 1 && (
          <div className="mt-3 pt-3 border-t border-grid/60 flex flex-wrap items-center gap-1.5" aria-label="Status mix — tap to filter">
            <span className="eyebrow">Status mix</span>
            {agg.statusList.map(([name, count]) => {
              const lk = statuses.find((s) => s.name === name);
              const active = !!lk && statusId === lk.id;
              return (
                <button
                  key={name}
                  type="button"
                  className={`chip !py-1 num transition-colors ${active ? '!border-amber/70 !text-amber' : lk ? 'hover:border-amber/50 hover:text-amber' : 'opacity-70 cursor-default'}`}
                  aria-pressed={active}
                  disabled={!lk}
                  title={lk ? (active ? `Clear the ${name} filter` : `Filter to ${name}`) : `${name} (not in lookups)`}
                  onClick={() => lk && onStatus(active ? '' : lk.id)}
                >
                  {name} · {fmtInt(count)}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChartPanel
          title="Registration density"
          subtitle={monthOption ? 'per month · click a bar to filter that month' : 'per month'}
          option={monthOption}
          empty={!monthOption}
          emptyMessage="Not enough dated rows for a monthly profile."
          height={190}
          onEvents={monthOption ? {
            click: (p) => {
              const hit = agg.months[p?.dataIndex];
              if (hit) onMonthClick(hit[0]);
            },
          } : undefined}
        />
        <ChartPanel
          title="Day-of-week profile"
          subtitle={`registrations by weekday · peak ${DAY_LABELS[agg.peakDay]} highlighted`}
          option={weekdayOption}
          height={190}
        />
      </div>
    </div>
  );
}
