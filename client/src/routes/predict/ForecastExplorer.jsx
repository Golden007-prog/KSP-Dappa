// /predict — forecast explorer: district × crime-head monthly line with the
// 80% CI band (stacked invisible floor + band area) and a backtest MAPE badge.
// In-card selects override the shared FilterBar values; the server defaults to
// Bengaluru City × Property when nothing is chosen.
import { useMemo, useState } from 'react';
import { useForecast, useLookups } from '../../lib/api.js';
import ChartPanel from '../../components/ChartPanel.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt, fmtNum, monthLabel } from '../../lib/format.js';

const HISTORY_MONTHS = 18; // keep the tail readable

function buildOption(history, forecast) {
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
        areaStyle: { color: 'rgba(245,166,35,0.16)' },
      },
      {
        name: 'Actual', type: 'line', data: actual, z: 3,
        symbol: 'circle', symbolSize: 4,
        lineStyle: { width: 2, color: '#2DD4BF' }, itemStyle: { color: '#2DD4BF' },
      },
      {
        name: 'Forecast', type: 'line', data: predicted, z: 3,
        symbol: 'circle', symbolSize: 4,
        lineStyle: { width: 2, type: 'dashed', color: '#F5A623' }, itemStyle: { color: '#F5A623' },
        markLine: forecast.length ? {
          symbol: 'none', silent: true,
          label: { formatter: 'forecast →', color: '#8A94A8', fontSize: 10, position: 'insideEndTop' },
          lineStyle: { color: '#3a4663', type: 'dashed' },
          data: [{ xAxis: monthLabel(forecast[0].ym) }],
        } : undefined,
      },
    ],
  };
}

export default function ForecastExplorer({ defaultDistrictId, defaultCrimeHeadId }) {
  const lookups = useLookups();
  const [localDistrict, setLocalDistrict] = useState('');
  const [localHead, setLocalHead] = useState('');

  const districtId = localDistrict || defaultDistrictId || '0101';
  const crimeHeadId = localHead || defaultCrimeHeadId || '3';
  const q = useForecast({ districtId, crimeHeadId });

  const data = q.data || { history: [], forecast: [], model: '', mape: null };
  const option = useMemo(() => buildOption(data.history, data.forecast), [data.history, data.forecast]);

  const districts = lookups.data?.districts || [];
  const heads = lookups.data?.crimeHeads || [];
  const districtName = districts.find((d) => d.districtId === districtId)?.districtName || districtId;
  const headName = heads.find((h) => h.crimeHeadId === String(crimeHeadId))?.headName || `head ${crimeHeadId}`;

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
            className="input-dark !py-1 text-xs max-w-[11rem]"
            value={districtId}
            onChange={(e) => setLocalDistrict(e.target.value)}
            disabled={lookups.isLoading}
            aria-label="Forecast district"
          >
            {lookups.isLoading && <option>Loading…</option>}
            {districts.map((d) => <option key={d.districtId} value={d.districtId}>{d.districtName}</option>)}
          </select>
          <select
            className="input-dark !py-1 text-xs max-w-[11rem]"
            value={String(crimeHeadId)}
            onChange={(e) => setLocalHead(e.target.value)}
            disabled={lookups.isLoading}
            aria-label="Forecast crime head"
          >
            {lookups.isLoading && <option>Loading…</option>}
            {heads.map((h) => <option key={h.crimeHeadId} value={h.crimeHeadId}>{h.headName}</option>)}
          </select>
          {q.error && (
            <button type="button" className="btn !py-1 text-xs" onClick={() => q.refetch()}>Retry</button>
          )}
        </div>
      )}
    />
  );
}
