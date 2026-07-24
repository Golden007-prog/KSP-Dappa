// /predict — forecast explorer: district × crime-head monthly line with the
// 80% CI band (stacked invisible floor + band area) and a backtest MAPE badge.
// The in-card selection is deep-linked via `fd`/`fh` URL params (shareable +
// reload-safe, matching the app-wide URL-filter convention); with neither set
// it follows the shared FilterBar district / crime head, then the server
// default of Bengaluru City × Property. Series colors resolve per app theme.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForecast, useLookups } from '../../lib/api.js';
import ChartPanel from '../../components/ChartPanel.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { fmtInt, fmtNum, monthLabel } from '../../lib/format.js';
import { downloadCsv, slug } from '../trends/csv.js';

const HISTORY_MONTHS = 18; // keep the tail readable

// Actual/forecast/CI colors per app theme (AA-dark siblings on white).
const SERIES_TOKENS = {
  dark: { actual: '#2DD4BF', forecast: '#F5A623', ci: 'rgba(245,166,35,0.16)', mark: '#3a4663', muted: '#8A94A8' },
  light: { actual: '#0F766E', forecast: '#D97706', ci: 'rgba(217,119,6,0.14)', mark: '#C9D4E8', muted: '#5C6B84' },
};

function buildOption(history, forecast, t) {
  const h = history.slice(-HISTORY_MONTHS);
  const months = [...h.map((r) => r.ym), ...forecast.map((r) => r.ym)];
  if (!months.length) return null;
  const labels = months.map(monthLabel);

  const actual = [...h.map((r) => r.actual), ...forecast.map(() => null)];
  // Connect the forecast line to the last actual point.
  const predicted = h.map((r, i) => (i === h.length - 1 ? r.actual : null))
    .concat(forecast.map((r) => r.predicted));
  const ciFloor = h.map(() => null).concat(forecast.map((r) => r.lo));
  const ciBand = h.map(() => null).concat(forecast.map((r) => Math.max(0, r.hi - r.lo)));

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        if (!params?.length) return '';
        const by = {};
        for (const p of params) by[p.seriesName] = p.value;
        const lines = [`<b>${params[0].axisValue}</b>`];
        if (Number.isFinite(by.Actual)) lines.push(`Actual: <b>${fmtInt(by.Actual)}</b>`);
        if (Number.isFinite(by.Forecast) && !Number.isFinite(by.Actual)) {
          lines.push(`Forecast: <b>${fmtNum(by.Forecast, 1)}</b>`);
        }
        const lo = by['CI floor'];
        const band = by['80% CI'];
        if (Number.isFinite(lo) && Number.isFinite(band)) {
          lines.push(`80% CI: ${fmtNum(lo, 1)} – ${fmtNum(lo + band, 1)}`);
        }
        return lines.join('<br/>');
      },
    },
    legend: { data: ['Actual', 'Forecast'], bottom: 0 },
    grid: { left: 48, right: 16, top: 18, bottom: 34 },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'CI floor', type: 'line', stack: 'ci', data: ciFloor,
        lineStyle: { opacity: 0 }, symbol: 'none', emphasis: { disabled: true },
      },
      {
        name: '80% CI', type: 'line', stack: 'ci', data: ciBand,
        lineStyle: { opacity: 0 }, symbol: 'none', emphasis: { disabled: true },
        areaStyle: { color: t.ci },
      },
      {
        name: 'Actual', type: 'line', data: actual, z: 3,
        symbol: 'circle', symbolSize: 4,
        lineStyle: { width: 2, color: t.actual }, itemStyle: { color: t.actual },
      },
      {
        name: 'Forecast', type: 'line', data: predicted, z: 3,
        symbol: 'circle', symbolSize: 4,
        lineStyle: { width: 2, type: 'dashed', color: t.forecast }, itemStyle: { color: t.forecast },
        markLine: forecast.length ? {
          symbol: 'none', silent: true,
          label: { formatter: 'forecast →', color: t.muted, fontSize: 10, position: 'insideEndTop' },
          lineStyle: { color: t.mark, type: 'dashed' },
          data: [{ xAxis: monthLabel(forecast[0].ym) }],
        } : undefined,
      },
    ],
  };
}

export default function ForecastExplorer({ defaultDistrictId, defaultCrimeHeadId }) {
  const lookups = useLookups();
  const toast = useToast();
  const { theme } = useTheme();
  const tokens = SERIES_TOKENS[theme] || SERIES_TOKENS.dark;
  const [searchParams, setSearchParams] = useSearchParams();

  const fd = searchParams.get('fd') || '';
  const fh = searchParams.get('fh') || '';
  const districtId = fd || defaultDistrictId || '0101';
  const crimeHeadId = fh || defaultCrimeHeadId || '3';
  const q = useForecast({ districtId, crimeHeadId });

  const setParam = (key) => (e) => {
    const v = e.target.value;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(key, v);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  const data = q.data || { history: [], forecast: [], model: '', mape: null };
  const option = useMemo(
    () => buildOption(data.history, data.forecast, tokens),
    [data.history, data.forecast, tokens],
  );

  const districts = lookups.data?.districts || [];
  const heads = lookups.data?.crimeHeads || [];
  const districtName = districts.find((d) => d.districtId === districtId)?.districtName || districtId;
  const headName = heads.find((h) => h.crimeHeadId === String(crimeHeadId))?.headName || `head ${crimeHeadId}`;

  const exportCsv = () => {
    if (!data.history.length && !data.forecast.length) return;
    downloadCsv(
      `dappa-forecast_${slug(`${districtName}-${headName}`)}`,
      ['month', 'actual', 'predicted', 'lo80', 'hi80'],
      [
        ...data.history.map((r) => [r.ym, r.actual, '', '', '']),
        ...data.forecast.map((r) => [r.ym, '', r.predicted, r.lo, r.hi]),
      ],
    );
    toast.success(`Forecast exported — ${districtName} × ${headName}`);
  };

  return (
    <ChartPanel
      title="Forecast explorer"
      subtitle={`Monthly FIRs — ${districtName} × ${headName}, with the model's 80% confidence band`}
      height={320}
      option={option}
      loading={q.isLoading}
      empty={!q.isLoading && !option}
      emptyMessage={q.error ? q.error.message : 'No forecast rows for this district × crime head — run the analytics pass.'}
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          {data.model && <Badge tone="neutral">{data.model}</Badge>}
          {data.mape != null && <Badge tone="teal">backtest MAPE {fmtNum(data.mape, 1)}%</Badge>}
          <select
            className="input-dark !py-2 text-xs max-w-[10.5rem] min-h-[40px]"
            value={districtId}
            onChange={setParam('fd')}
            disabled={lookups.isLoading}
            aria-label="Forecast district"
          >
            {lookups.isLoading && <option>Loading…</option>}
            {districts.map((d) => <option key={d.districtId} value={d.districtId}>{d.districtName}</option>)}
          </select>
          <select
            className="input-dark !py-2 text-xs max-w-[10.5rem] min-h-[40px]"
            value={String(crimeHeadId)}
            onChange={setParam('fh')}
            disabled={lookups.isLoading}
            aria-label="Forecast crime head"
          >
            {lookups.isLoading && <option>Loading…</option>}
            {heads.map((h) => <option key={h.crimeHeadId} value={h.crimeHeadId}>{h.headName}</option>)}
          </select>
          {q.error && (
            <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={() => q.refetch()}>Retry</button>
          )}
          <Tooltip label="Download history + forecast as CSV">
            <button
              type="button"
              className="btn !px-2.5 text-xs min-h-[40px]"
              onClick={exportCsv}
              disabled={q.isLoading || (!data.history.length && !data.forecast.length)}
            >
              CSV
            </button>
          </Tooltip>
        </div>
      )}
    />
  );
}
