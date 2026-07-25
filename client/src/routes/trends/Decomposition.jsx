// Trends — STL-style decomposition of the monthly total series into trend /
// seasonal / residual, all computed client-side (2×12 centered MA + centered
// calendar-month means; see analysis.js). Three stacked, axis-linked grids:
// observed+trend with level-shift changepoint markers, the repeating seasonal
// component, and the residual with |z| ≥ 2 outlier dots. Strength badges use
// the Hyndman F-statistics; everything is deterministic and CSV-exportable.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from './ChartBody.jsx';
import InsightLine from './InsightLine.jsx';
import { decomposeSeries, detectChangepoints, monthShortNames } from './analysis.js';
import { decompositionInsight } from './insights.js';
import { downloadCsv, slug } from './csv.js';
import { fmtNum, monthLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const MIN_MONTHS = 18;

/** Hyndman F-strength → a `trends.decomp.*` key suffix. */
function strengthKey(v) {
  return v >= 0.66 ? 'strong' : v >= 0.33 ? 'moderate' : 'weak';
}

export default function Decomposition({
  months = [], values = [], loading = false, error = null, onRetry,
  scope, colors, surface, anomalyColor, isNarrow,
}) {
  const toast = useToast();
  const t = useT();

  const dec = useMemo(() => decomposeSeries(months, values), [months, values]);
  const changepoints = useMemo(
    () => (dec ? detectChangepoints(values) : []),
    [dec, values],
  );

  const option = useMemo(() => {
    if (!dec) return null;
    const labels = months.map(monthLabel);
    const round1 = (v) => (v === null ? null : Number(Number(v).toFixed(1)));
    const grids = [
      { top: 26, height: '34%' },
      { top: '48%', height: '18%' },
      { top: '74%', height: '18%' },
    ];
    const titleStyle = { color: surface.muted, fontSize: 10, fontWeight: 600 };
    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v) => (v === null || v === undefined ? '—' : fmtNum(v, 1)),
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      title: [
        { text: t('trends.decomp.observedTrend'), left: 0, top: 4, textStyle: titleStyle },
        { text: t('trends.decomp.seasonalPanel'), left: 0, top: '42.5%', textStyle: titleStyle },
        { text: t('trends.decomp.residualPanel'), left: 0, top: '68.5%', textStyle: titleStyle },
      ],
      grid: grids.map((g) => ({ left: 46, right: 12, ...g })),
      xAxis: grids.map((_, i) => ({
        type: 'category',
        gridIndex: i,
        data: labels,
        axisLabel: { show: i === 2, interval: isNarrow ? 5 : 2, fontSize: 10 },
        axisTick: { show: false },
      })),
      yAxis: grids.map((_, i) => ({
        type: 'value',
        gridIndex: i,
        axisLabel: { fontSize: 10 },
        splitNumber: i === 0 ? 3 : 2,
      })),
      series: [
        {
          name: t('trends.decomp.observed'),
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: values,
          showSymbol: false,
          lineStyle: { width: 1, color: surface.muted, opacity: 0.7 },
          itemStyle: { color: surface.muted },
          markLine: changepoints.length ? {
            silent: true,
            symbol: 'none',
            data: changepoints.map((c) => ({
              xAxis: c.index,
              lineStyle: { color: colors[1], type: 'solid', width: 1.5 },
              label: {
                show: true,
                formatter: Number.isFinite(c.shiftPct)
                  ? `${c.dir === 'up' ? '+' : '−'}${Math.round(Math.abs(c.shiftPct))}%`
                  : t('trends.monthly.shift'),
                color: colors[1],
                fontSize: 9,
                position: 'insideEndTop',
              },
            })),
          } : undefined,
        },
        {
          name: t('trends.decomp.trend'),
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: dec.trend.map(round1),
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 2.5, color: colors[0] },
          itemStyle: { color: colors[0] },
        },
        {
          name: t('trends.decomp.seasonal'),
          type: 'line',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: dec.seasonal.map(round1),
          showSymbol: false,
          areaStyle: { color: colors[2], opacity: 0.18 },
          lineStyle: { width: 1.5, color: colors[2] },
          itemStyle: { color: colors[2] },
        },
        {
          name: t('trends.decomp.residual'),
          type: 'bar',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: dec.residual.map(round1),
          barMaxWidth: 6,
          itemStyle: { color: surface.muted, opacity: 0.65, borderRadius: 1 },
        },
        {
          name: t('trends.decomp.outlier'),
          type: 'scatter',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: dec.outliers.map((o) => [o.index, round1(dec.residual[o.index])]),
          symbolSize: 7,
          itemStyle: { color: anomalyColor },
          tooltip: {
            formatter: (p) => t('trends.decomp.outlierTooltip', {
              month: labels[p.value[0]],
              value: fmtNum(p.value[1], 1),
            }),
          },
          z: 5,
        },
      ],
    };
  }, [dec, changepoints, months, values, colors, surface, anomalyColor, isNarrow, t]);

  const insight = useMemo(
    () => (dec ? decompositionInsight(months, dec, changepoints, monthShortNames(t), t) : null),
    [dec, months, changepoints, t],
  );

  const exportCsv = () => {
    if (!dec) return;
    downloadCsv(
      `dappa-decomposition_${slug(scope || 'karnataka')}`,
      ['month', 'observed', 'trend', 'seasonal', 'residual'],
      months.map((ym, i) => [
        ym,
        values[i],
        dec.trend[i] === null ? '' : Number(dec.trend[i].toFixed(2)),
        Number(dec.seasonal[i].toFixed(2)),
        dec.residual[i] === null ? '' : Number(dec.residual[i].toFixed(2)),
      ]),
    );
    toast.success(t('trends.toast.decomp'));
  };

  const short = !loading && !error && months.length > 0 && months.length < MIN_MONTHS;

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.decomp.title')}
        subtitle={t('trends.decomp.subtitle')}
        actions={(
          <div className="trends-no-print flex flex-wrap items-center justify-end gap-1.5">
            {dec && (
              <>
                <Tooltip label={t('trends.decomp.trendTip', { strength: t(`trends.decomp.${strengthKey(dec.strengthTrend)}`) })}>
                  <span><Badge tone="amber">{t('trends.decomp.trendBadge', { pct: fmtNum(dec.strengthTrend * 100, 0) })}</Badge></span>
                </Tooltip>
                <Tooltip label={t('trends.decomp.seasonTip', { strength: t(`trends.decomp.${strengthKey(dec.strengthSeasonal)}`) })}>
                  <span><Badge tone="teal">{t('trends.decomp.seasonBadge', { pct: fmtNum(dec.strengthSeasonal * 100, 0) })}</Badge></span>
                </Tooltip>
              </>
            )}
            <Tooltip label={t('trends.decomp.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!dec}>CSV</button>
            </Tooltip>
          </div>
        )}
      >
        <ChartBody
          option={short ? null : option}
          height={400}
          loading={loading}
          error={error}
          onRetry={onRetry}
          emptyMessage={short
            ? t('trends.decomp.needMonths', { n: MIN_MONTHS })
            : t('trends.decomp.empty')}
        />
      </Card>
      <InsightLine text={insight} loading={loading} />
    </div>
  );
}
