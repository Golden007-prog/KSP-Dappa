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
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, monthLabel } from '../../lib/format.js';
import { downloadCsv, slug } from '../trends/csv.js';

const HISTORY_MONTHS = 18; // keep the tail readable

// Actual/forecast/CI colors per app theme (AA-dark siblings on white).
const SERIES_TOKENS = {
  dark: { actual: '#2DD4BF', forecast: '#F5A623', ci: 'rgba(245,166,35,0.16)', mark: '#3a4663', muted: '#8A94A8' },
  light: { actual: '#0F766E', forecast: '#D97706', ci: 'rgba(217,119,6,0.14)', mark: '#C9D4E8', muted: '#5C6B84' },
};

function buildOption(history, forecast, tok, t) {
  const h = history.slice(-HISTORY_MONTHS);
  const months = [...h.map((r) => r.ym), ...forecast.map((r) => r.ym)];
  if (!months.length) return null;
  const labels = months.map(monthLabel);

  // Series names are the tooltip lookup keys as well as the legend labels, so
  // they resolve once and every reference goes through this map.
  const name = {
    actual: t('trends.predict.fc.actual'),
    forecast: t('trends.predict.fc.forecast'),
    ciFloor: t('trends.predict.fc.ciFloor'),
    ci: t('trends.predict.fc.ci'),
  };

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
        if (Number.isFinite(by[name.actual])) {
          lines.push(t('trends.predict.fc.actualLine', { value: fmtInt(by[name.actual]) }));
        }
        if (Number.isFinite(by[name.forecast]) && !Number.isFinite(by[name.actual])) {
          lines.push(t('trends.predict.fc.forecastLine', { value: fmtNum(by[name.forecast], 1) }));
        }
        const lo = by[name.ciFloor];
        const band = by[name.ci];
        if (Number.isFinite(lo) && Number.isFinite(band)) {
          lines.push(t('trends.predict.fc.ciLine', { lo: fmtNum(lo, 1), hi: fmtNum(lo + band, 1) }));
        }
        return lines.join('<br/>');
      },
    },
    legend: { data: [name.actual, name.forecast], bottom: 0 },
    grid: { left: 48, right: 16, top: 18, bottom: 34 },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: { type: 'value' },
    series: [
      {
        name: name.ciFloor, type: 'line', stack: 'ci', data: ciFloor,
        lineStyle: { opacity: 0 }, symbol: 'none', emphasis: { disabled: true },
      },
      {
        name: name.ci, type: 'line', stack: 'ci', data: ciBand,
        lineStyle: { opacity: 0 }, symbol: 'none', emphasis: { disabled: true },
        areaStyle: { color: tok.ci },
      },
      {
        name: name.actual, type: 'line', data: actual, z: 3,
        symbol: 'circle', symbolSize: 4,
        lineStyle: { width: 2, color: tok.actual }, itemStyle: { color: tok.actual },
      },
      {
        name: name.forecast, type: 'line', data: predicted, z: 3,
        symbol: 'circle', symbolSize: 4,
        lineStyle: { width: 2, type: 'dashed', color: tok.forecast }, itemStyle: { color: tok.forecast },
        markLine: forecast.length ? {
          symbol: 'none', silent: true,
          label: { formatter: t('trends.predict.fc.marker'), color: tok.muted, fontSize: 10, position: 'insideEndTop' },
          lineStyle: { color: tok.mark, type: 'dashed' },
          data: [{ xAxis: monthLabel(forecast[0].ym) }],
        } : undefined,
      },
    ],
  };
}

export default function ForecastExplorer({ defaultDistrictId, defaultCrimeHeadId }) {
  const t = useT();
  const tName = useNames();
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
    () => buildOption(data.history, data.forecast, tokens, t),
    [data.history, data.forecast, tokens, t],
  );

  const districts = lookups.data?.districts || [];
  const heads = lookups.data?.crimeHeads || [];
  // Raw API names stay behind the CSV filename slug (which strips non-ASCII);
  // the translated ones are what the card and the toast show.
  const districtRaw = districts.find((d) => d.districtId === districtId)?.districtName || districtId;
  const headRaw = heads.find((h) => h.crimeHeadId === String(crimeHeadId))?.headName || '';
  const districtName = tName('districts', districtId, districtRaw);
  const headName = headRaw
    ? tName('crimeHeads', crimeHeadId, headRaw)
    : t('trends.predict.headFallback', { id: crimeHeadId });

  const exportCsv = () => {
    if (!data.history.length && !data.forecast.length) return;
    downloadCsv(
      `dappa-forecast_${slug(`${districtRaw}-${headRaw || crimeHeadId}`)}`,
      ['month', 'actual', 'predicted', 'lo80', 'hi80'],
      [
        ...data.history.map((r) => [r.ym, r.actual, '', '', '']),
        ...data.forecast.map((r) => [r.ym, '', r.predicted, r.lo, r.hi]),
      ],
    );
    toast.success(t('trends.predict.toast.forecast', { district: districtName, head: headName }));
  };

  return (
    <ChartPanel
      title={t('trends.predict.fc.title')}
      subtitle={t('trends.predict.fc.subtitle', { district: districtName, head: headName })}
      height={320}
      option={option}
      loading={q.isLoading}
      empty={!q.isLoading && !option}
      emptyMessage={q.error ? q.error.message : t('trends.predict.fc.empty')}
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          {data.model && <Badge tone="neutral">{data.model}</Badge>}
          {data.mape != null && (
            <Badge tone="teal">{t('trends.predict.fc.mape', { value: fmtNum(data.mape, 1) })}</Badge>
          )}
          <select
            className="input-dark !py-2 text-xs max-w-[10.5rem] min-h-[40px]"
            value={districtId}
            onChange={setParam('fd')}
            disabled={lookups.isLoading}
            aria-label={t('trends.predict.fc.districtAria')}
          >
            {lookups.isLoading && <option>{t('common.state.loading')}</option>}
            {districts.map((d) => (
              <option key={d.districtId} value={d.districtId}>
                {tName('districts', d.districtId, d.districtName)}
              </option>
            ))}
          </select>
          <select
            className="input-dark !py-2 text-xs max-w-[10.5rem] min-h-[40px]"
            value={String(crimeHeadId)}
            onChange={setParam('fh')}
            disabled={lookups.isLoading}
            aria-label={t('trends.predict.fc.headAria')}
          >
            {lookups.isLoading && <option>{t('common.state.loading')}</option>}
            {heads.map((h) => (
              <option key={h.crimeHeadId} value={h.crimeHeadId}>
                {tName('crimeHeads', h.crimeHeadId, h.headName)}
              </option>
            ))}
          </select>
          {q.error && (
            <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={() => q.refetch()}>
              {t('common.action.retry')}
            </button>
          )}
          <Tooltip label={t('trends.predict.fc.csvTip')}>
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
