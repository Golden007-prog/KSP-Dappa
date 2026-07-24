// /predict — what-if scenario planner on the district × head forecast. A
// ±30% uplift slider (plus named presets like a festival-season surge) scales
// the model's 6-month projection and its 80% band; the impact strip translates
// the curve into planning numbers — base total, scenario total, extra cases.
// Pure client-side arithmetic on the already-fetched forecast: the model is
// never re-run, and the card says so.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForecast, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import ChartBody from '../trends/ChartBody.jsx';
import { seriesColors, SURFACE } from '../trends/palettes.js';
import { fmtInt, fmtNum, monthLabel } from '../../lib/format.js';

const HISTORY_TAIL = 9;

const PRESETS = [
  { label: 'Festival surge +12%', value: 12 },
  { label: 'Awareness drive −10%', value: -10 },
  { label: 'Monsoon lull −5%', value: -5 },
];

export default function ScenarioPanel({ defaultDistrictId, defaultCrimeHeadId }) {
  const lookups = useLookups();
  const { theme } = useTheme();
  const surface = SURFACE[theme] || SURFACE.dark;
  const colors = seriesColors('standard', theme);
  const [searchParams] = useSearchParams();
  const [uplift, setUplift] = useState(0);

  const districtId = searchParams.get('fd') || defaultDistrictId || '0101';
  const crimeHeadId = searchParams.get('fh') || defaultCrimeHeadId || '3';
  const q = useForecast({ districtId, crimeHeadId });

  const districtName = (lookups.data?.districts || []).find((d) => d.districtId === districtId)?.districtName || districtId;
  const headName = (lookups.data?.crimeHeads || []).find((h) => h.crimeHeadId === String(crimeHeadId))?.headName || `head ${crimeHeadId}`;

  const forecast = q.data?.forecast || [];
  const history = q.data?.history || [];
  const factor = 1 + uplift / 100;

  const totals = useMemo(() => {
    if (!forecast.length) return null;
    const base = forecast.reduce((a, r) => a + (Number(r.predicted) || 0), 0);
    return { base, scenario: base * factor, delta: base * (factor - 1) };
  }, [forecast, factor]);

  const option = useMemo(() => {
    if (!forecast.length) return null;
    const tail = history.slice(-HISTORY_TAIL);
    const labels = [...tail.map((r) => r.ym), ...forecast.map((r) => r.ym)].map(monthLabel);
    const pad = (arr) => [...tail.map(() => null), ...arr];
    const bridge = (arr) => tail.map((r, i) => (i === tail.length - 1 ? r.actual : null)).concat(arr);
    const scenLo = forecast.map((r) => Number((Math.max(0, r.lo * factor)).toFixed(1)));
    const scenBand = forecast.map((r) => Number((Math.max(0, (r.hi - r.lo) * factor)).toFixed(1)));
    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v) => (v === null || v === undefined ? '—' : fmtNum(v, 1)),
      },
      legend: { data: ['Actual', 'Base forecast', `Scenario ${uplift >= 0 ? '+' : ''}${uplift}%`], bottom: 0 },
      grid: { left: 44, right: 14, top: 18, bottom: 36 },
      xAxis: { type: 'category', boundaryGap: false, data: labels },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'band floor', type: 'line', stack: 'scen', data: pad(scenLo),
          lineStyle: { opacity: 0 }, symbol: 'none', emphasis: { disabled: true }, tooltip: { show: false },
        },
        {
          name: 'scenario 80% band', type: 'line', stack: 'scen', data: pad(scenBand),
          lineStyle: { opacity: 0 }, symbol: 'none', emphasis: { disabled: true }, tooltip: { show: false },
          areaStyle: { color: colors[1], opacity: 0.14 },
        },
        {
          name: 'Actual', type: 'line', data: [...tail.map((r) => r.actual), ...forecast.map(() => null)],
          showSymbol: false, z: 3, lineStyle: { width: 2, color: surface.muted }, itemStyle: { color: surface.muted },
        },
        {
          name: 'Base forecast', type: 'line',
          data: bridge(forecast.map((r) => Number(Number(r.predicted).toFixed(1)))),
          showSymbol: false, z: 3,
          lineStyle: { width: 1.5, type: 'dashed', color: colors[0] }, itemStyle: { color: colors[0] },
        },
        {
          name: `Scenario ${uplift >= 0 ? '+' : ''}${uplift}%`, type: 'line',
          data: bridge(forecast.map((r) => Number((r.predicted * factor).toFixed(1)))),
          showSymbol: true, symbol: 'circle', symbolSize: 4, z: 4,
          lineStyle: { width: 2.5, color: colors[1] }, itemStyle: { color: colors[1] },
        },
      ],
    };
  }, [forecast, history, factor, uplift, colors, surface]);

  return (
    <Card
      title="Scenario planner — what if demand shifts?"
      subtitle={`Scales the 6-month forecast for ${districtName} × ${headName} (and its 80% band) without re-running the model`}
      actions={<Badge tone="slate">client-side arithmetic</Badge>}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <label className="flex-1 min-w-0 text-xs text-muted">
          <span className="flex items-center justify-between mb-1">
            <span>Seasonal uplift</span>
            <span className="num font-semibold text-ink">{uplift >= 0 ? '+' : ''}{uplift}%</span>
          </span>
          <input
            type="range"
            min={-30}
            max={30}
            step={1}
            value={uplift}
            onChange={(e) => setUplift(Number(e.target.value))}
            className="w-full accent-amber h-2 cursor-pointer"
            aria-label="Scenario uplift percent"
            aria-valuetext={`${uplift >= 0 ? '+' : ''}${uplift} percent`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip !px-3 min-h-[40px] transition-colors ${uplift === p.value ? '!border-amber/60 !text-amber bg-amber/10' : 'hover:border-amber/40'}`}
              aria-pressed={uplift === p.value}
              onClick={() => setUplift(p.value)}
            >
              {p.label}
            </button>
          ))}
          <button type="button" className="chip !px-3 min-h-[40px] hover:border-amber/40" onClick={() => setUplift(0)} disabled={uplift === 0}>
            Reset
          </button>
        </div>
      </div>

      <ChartBody
        option={option}
        height={280}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        emptyMessage="No forecast months for this district × crime head — run the analytics pass."
      />

      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3">
          <div className="rounded-lg border border-grid bg-base/40 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted">Base — next {forecast.length} months</p>
            <p className="num text-xl font-semibold text-ink mt-0.5">{fmtInt(totals.base)}</p>
          </div>
          <div className="rounded-lg border border-grid bg-base/40 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted">Scenario total</p>
            <p className="num text-xl font-semibold text-ink mt-0.5 flex items-baseline gap-2">
              {fmtInt(totals.scenario)}
              <StatDelta value={uplift} positiveIsGood={false} />
            </p>
          </div>
          <div className="rounded-lg border border-grid bg-base/40 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted">{totals.delta >= 0 ? 'Additional expected cases' : 'Cases avoided'}</p>
            <p className={`num text-xl font-semibold mt-0.5 ${totals.delta > 0 ? 'text-signal' : totals.delta < 0 ? 'text-teal' : 'text-ink'}`}>
              {totals.delta >= 0 ? '+' : '−'}{fmtInt(Math.abs(totals.delta))}
            </p>
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted mt-2.5">
        A uniform uplift is a planning heuristic — real shocks are month-shaped. Pair with the
        festival bands on /trends before committing deployment numbers.
      </p>
    </Card>
  );
}
