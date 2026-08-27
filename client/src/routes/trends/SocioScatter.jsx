// Trends — socio-economic correlation scatter: case rate per lakh (y, from
// /geo/districts under the current period + crime-head filters) against a
// switchable district indicator from /meta/socio (urbanization, literacy,
// density, income index). Bubble area encodes population; an OLS fit line and
// Pearson-r badge quantify the association, median split lines cut the plane
// into labeled quadrants, and clicking a bubble focuses that district in the
// shared filters. The "why behind the where" — with the causation caveat stated.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from './ChartBody.jsx';
import InsightLine from './InsightLine.jsx';
import { districtKey, olsFit } from './analysis.js';
import { socioInsight } from './insights.js';
import { downloadCsv } from './csv.js';
import { fmtCompact, fmtNum } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';

// `slug` keeps the CSV filename stable across languages (slug() would drop a
// Kannada label entirely); labelKey/shortKey resolve at render time.
const METRICS = [
  { key: 'urbanPct', labelKey: 'urbanPct', shortKey: 'urbanPctShort', slug: 'urban' },
  { key: 'literacyPct', labelKey: 'literacyPct', shortKey: 'literacyPctShort', slug: 'literacy' },
  { key: 'densityPerKm2', labelKey: 'density', shortKey: 'densityShort', slug: 'density' },
  { key: 'perCapitaIncomeIdx', labelKey: 'income', shortKey: 'incomeShort', slug: 'income-idx' },
];

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Pearson |r| → a `trends.socio.*` key suffix. */
function corrKey(r) {
  const a = Math.abs(r);
  return a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'none';
}

export default function SocioScatter({
  geoRows, geoLoading, geoError, onRetryGeo, districtId, setFilter, accent, surface, isNarrow,
}) {
  const toast = useToast();
  const { t, tName } = useI18n();
  const [metricKey, setMetricKey] = useState('urbanPct');
  const metricDef = METRICS.find((m) => m.key === metricKey) || METRICS[0];
  // Memoised: the chart option keys off `metric`, so a fresh object every
  // render would rebuild the whole ECharts option on unrelated state changes.
  const metric = useMemo(() => ({
    ...metricDef,
    label: t(`trends.socio.${metricDef.labelKey}`),
    short: t(`trends.socio.${metricDef.shortKey}`),
  }), [metricDef, t]);

  const socio = useQuery({
    queryKey: ['meta-socio'],
    queryFn: ({ signal }) => apiGet('/meta/socio', {}, { signal })
      .then((r) => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 60 * 60 * 1000,
  });

  const points = useMemo(() => {
    // /geo/districts pads the police code ('0101'); /meta/socio does not
    // ('101'). Joining on the raw strings matched nothing and left this chart
    // permanently empty, so both sides go through the normalised key — which
    // is also what lets the rate be recomputed when the server sends a null
    // ratePerLakh (it resolves population from a differently-keyed lookup).
    const byId = new Map((socio.data || []).map((s) => [districtKey(s.districtId), s]));
    return (geoRows || []).map((r) => {
      const s = byId.get(districtKey(r.districtId));
      const x = Number(s?.[metricKey]);
      const pop = Number(s?.population) || 0;
      const count = Number(r.caseCount) || 0;
      // Number(null) is 0, not NaN — testing the coerced value would have read
      // a missing rate as a real zero and flattened the y-axis to a constant.
      const raw = r.ratePerLakh;
      const serverRate = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
      const y = Number.isFinite(serverRate) ? serverRate : (pop > 0 ? (count / pop) * 100000 : NaN);
      if (!s || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        districtId: districtKey(r.districtId),
        name: tName('districts', r.districtId, r.districtName),
        x,
        y,
        pop,
        socio: s,
        caseCount: count,
        rateDerived: !Number.isFinite(serverRate),
      };
    }).filter(Boolean);
  }, [geoRows, socio.data, metricKey, tName]);

  const fit = useMemo(() => olsFit(points), [points]);

  const option = useMemo(() => {
    if (points.length < 3) return null;
    const maxPop = Math.max(1, ...points.map((p) => p.pop));
    const mx = median(points.map((p) => p.x));
    const my = median(points.map((p) => p.y));
    const xs = points.map((p) => p.x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const byKey = new Map(points.map((p) => [`${p.x}|${p.y}`, p]));
    const quadLabel = (text, left, top, align) => ({
      type: 'text',
      left,
      top,
      style: { text, fill: surface.muted, fontSize: 9, opacity: 0.85, textAlign: align },
      silent: true,
    });
    return {
      tooltip: {
        formatter: (p) => {
          if (p.seriesType !== 'scatter') return '';
          const d = byKey.get(`${p.value[0]}|${p.value[1]}`);
          if (!d) return '';
          return `<b>${d.name}</b><br/>${t('trends.socio.tooltip', {
            rate: fmtNum(d.y, 1), metric: metric.short, value: fmtNum(d.x, 1),
          })}<br/>${t('trends.socio.tooltipPop', { pop: fmtCompact(d.pop) })}`;
        },
      },
      grid: { left: 44, right: 16, top: 26, bottom: 40 },
      xAxis: {
        type: 'value',
        name: metric.label,
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: surface.muted, fontSize: 10 },
        scale: true,
      },
      yAxis: {
        type: 'value',
        name: t('trends.socio.yAxis'),
        nameTextStyle: { color: surface.muted, fontSize: 10, align: 'left' },
        scale: true,
      },
      graphic: isNarrow ? undefined : [
        quadLabel(t('trends.socio.quadHighLow', { metric: metric.short }), 48, 30, 'left'),
        quadLabel(t('trends.socio.quadHighHigh', { metric: metric.short }), '78%', 30, 'left'),
        quadLabel(t('trends.socio.quadLowLow', { metric: metric.short }), 48, '78%', 'left'),
        quadLabel(t('trends.socio.quadLowHigh', { metric: metric.short }), '78%', '78%', 'left'),
      ],
      series: [
        {
          type: 'scatter',
          data: points.map((p) => ({
            value: [p.x, p.y],
            symbolSize: 8 + Math.sqrt(p.pop / maxPop) * (isNarrow ? 14 : 20),
            itemStyle: {
              color: accent,
              opacity: !districtId || districtId === p.districtId ? 0.9 : 0.35,
              borderColor: districtId === p.districtId ? surface.ink : 'transparent',
              borderWidth: districtId === p.districtId ? 2 : 0,
            },
          })),
          // median split lines → quadrants
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: surface.grid, type: 'dashed', width: 1 },
            label: { show: false },
            data: [{ xAxis: mx }, { yAxis: my }],
          },
          z: 3,
        },
        ...(fit ? [{
          name: t('trends.socio.olsFit'),
          type: 'line',
          data: [
            [xMin, fit.slope * xMin + fit.intercept],
            [xMax, fit.slope * xMax + fit.intercept],
          ],
          showSymbol: false,
          lineStyle: { color: surface.muted, width: 1.5, type: 'dashed', opacity: 0.9 },
          tooltip: { show: false },
          silent: true,
          z: 2,
        }] : []),
      ],
    };
  }, [points, fit, metric, districtId, accent, surface, isNarrow, t]);

  const onEvents = useMemo(() => ({
    click: (p) => {
      if (p?.seriesType !== 'scatter' || !Array.isArray(p.value)) return;
      const d = points.find((x) => x.x === p.value[0] && x.y === p.value[1]);
      if (!d) return;
      setFilter('districtId', d.districtId === districtId ? '' : d.districtId);
    },
  }), [points, districtId, setFilter]);

  const insight = useMemo(() => socioInsight(points, metric.short, fit, t), [points, metric, fit, t]);

  const exportCsv = () => {
    if (!points.length) return;
    downloadCsv(
      `dappa-socio-scatter_${metric.slug}`,
      ['district', 'cases', 'rate_per_lakh', 'urban_pct', 'literacy_pct', 'density_per_km2', 'income_idx', 'population'],
      points.map((p) => [
        p.name, p.caseCount, fmtNum(p.y, 1),
        p.socio.urbanPct ?? '', p.socio.literacyPct ?? '', p.socio.densityPerKm2 ?? '',
        p.socio.perCapitaIncomeIdx ?? '', p.pop || '',
      ]),
    );
    toast.success(t('trends.toast.socio'));
  };

  const loading = geoLoading || socio.isLoading;
  const error = geoError || socio.error;

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.socio.title')}
        subtitle={t('trends.socio.subtitle')}
        actions={(
          <div className="trends-no-print flex flex-wrap items-center justify-end gap-1.5">
            {fit && (
              <Tooltip label={t('trends.socio.rTip', { n: fit.n, strength: t(`trends.socio.${corrKey(fit.r)}`) })}>
                <span><Badge tone={Math.abs(fit.r) >= 0.4 ? 'teal' : 'slate'}>r = {fmtNum(fit.r, 2)}</Badge></span>
              </Tooltip>
            )}
            <select
              className="input-dark !py-2 !px-2 text-xs max-w-[9.5rem] min-h-[40px]"
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value)}
              aria-label={t('trends.socio.metricAria')}
            >
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>{t(`trends.socio.${m.labelKey}`)}</option>
              ))}
            </select>
            <Tooltip label={t('trends.socio.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!points.length}>CSV</button>
            </Tooltip>
          </div>
        )}
      >
        <ChartBody
          option={option}
          height={330}
          loading={loading}
          error={error}
          onRetry={() => { if (geoError) onRetryGeo?.(); if (socio.error) socio.refetch(); }}
          emptyMessage={t('trends.socio.empty')}
          onEvents={onEvents}
        />
        <p className="text-[11px] text-muted mt-2">{t('trends.socio.caveat')}</p>
      </Card>
      <InsightLine text={insight} loading={loading} />
    </div>
  );
}
