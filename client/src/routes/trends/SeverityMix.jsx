// Trends — severity mix over time. /trends/monthly returns a heinousCount
// alongside every month's caseCount, but the shared normalizer folds the rows
// into a single count series and drops it, so this card reads the endpoint
// directly (same params, its own query key) and puts the severity split back on
// screen: heinous vs other volumes, the heinous share of the caseload with a
// 3-month rolling mean, the least-squares direction of that share, and share
// outliers flagged against their own trailing baseline.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, prune } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from './ChartBody.jsx';
import InsightLine from './InsightLine.jsx';
import { detectAnomalies, linearTrend, rollingMean, trimLeadingZeros } from './analysis.js';
import { downloadCsv, slug } from './csv.js';
import { fmtInt, fmtNum, monthLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const MAX_MONTHS = 36;

export default function SeverityMix({ apiParams, districtId, colors, anomalyColor, surface, isNarrow }) {
  const toast = useToast();
  const t = useT();
  const [view, setView] = useState('mix'); // mix | share

  const params = useMemo(() => prune(apiParams || {}), [apiParams]);
  const monthly = useQuery({
    // Shares the app's raw-monthly cache entry (same endpoint, same untouched
    // row shape) instead of paying for a second identical fetch.
    queryKey: ['trends-monthly-raw', params],
    queryFn: ({ signal }) => apiGet('/trends/monthly', params, { signal })
      .then((r) => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 5 * 60 * 1000,
  });

  const model = useMemo(() => {
    const rows = monthly.data || [];
    if (!rows.length) return null;
    // The endpoint zero-fills the whole requested span, so cut the padding at
    // both ends — but only at the ends: a genuinely quiet month in the middle
    // is data, and dropping it would silently splice the month axis.
    const allMonths = rows.map((r) => String(r.ym));
    const allTotals = rows.map((r) => Number(r.caseCount) || 0);
    const trimmed = trimLeadingZeros(allMonths, allTotals);
    const start = allMonths.length - trimmed.months.length;
    let end = rows.length;
    while (end > start && (Number(rows[end - 1].caseCount) || 0) === 0) end -= 1;
    const kept = rows.slice(start, end).slice(-MAX_MONTHS);
    if (kept.length < 2) return null;
    const months = kept.map((r) => String(r.ym));
    const total = kept.map((r) => Number(r.caseCount) || 0);
    const heinous = kept.map((r) => Math.max(0, Number(r.heinousCount) || 0));
    const other = total.map((v, i) => Math.max(0, v - heinous[i]));
    const share = total.map((v, i) => (v > 0 ? (heinous[i] / v) * 100 : 0));
    const smoothed = rollingMean(share, 3);
    const outliers = detectAnomalies(share, { minBaseline: 6 });
    const fit = linearTrend(share);
    const latest = share[share.length - 1];
    const yoy = share.length >= 13 && share[share.length - 13] > 0
      ? ((latest - share[share.length - 13]) / share[share.length - 13]) * 100
      : null;
    const windowShare = total.reduce((a, b) => a + b, 0) > 0
      ? (heinous.reduce((a, b) => a + b, 0) / total.reduce((a, b) => a + b, 0)) * 100
      : 0;
    return {
      months, total, heinous, other, share, smoothed, outliers, fit, latest, yoy, windowShare,
      heinousTotal: heinous.reduce((a, b) => a + b, 0),
    };
  }, [monthly.data]);

  const option = useMemo(() => {
    if (!model) return null;
    const labels = model.months.map(monthLabel);
    const toolbox = {
      right: 0,
      top: 0,
      itemSize: 13,
      iconStyle: { borderColor: surface.muted },
      emphasis: { iconStyle: { borderColor: surface.ink } },
      feature: { saveAsImage: { name: 'dappa-severity-mix', backgroundColor: surface.panel, title: 'PNG' } },
    };
    if (view === 'share') {
      const markPoints = model.outliers.map((o) => ({
        xAxis: labels[o.index],
        yAxis: Number(model.share[o.index].toFixed(2)),
        value: o.dir === 'up' ? '▲' : '▼',
      }));
      return {
        tooltip: {
          trigger: 'axis',
          valueFormatter: (v) => (v === null || v === undefined ? '—' : `${fmtNum(v, 1)}%`),
        },
        legend: { bottom: 0 },
        toolbox,
        grid: { left: 44, right: 14, top: 28, bottom: 40 },
        xAxis: { type: 'category', boundaryGap: false, data: labels },
        yAxis: { type: 'value', axisLabel: { formatter: (v) => `${v}%` } },
        series: [
          {
            name: t('trends.sev.shareSeries'),
            type: 'line',
            data: model.share.map((v) => Number(v.toFixed(2))),
            showSymbol: false,
            smooth: 0.15,
            lineStyle: { width: 2, color: anomalyColor },
            itemStyle: { color: anomalyColor },
            areaStyle: { color: anomalyColor, opacity: 0.1 },
            markPoint: {
              symbol: 'circle',
              symbolSize: 12,
              data: markPoints,
              itemStyle: { color: 'transparent', borderColor: anomalyColor, borderWidth: 1.5 },
              label: { color: anomalyColor, fontSize: 9 },
            },
          },
          {
            name: t('trends.sev.rolling'),
            type: 'line',
            data: model.smoothed.map((v) => (v === null ? null : Number(v.toFixed(2)))),
            showSymbol: false,
            smooth: 0.3,
            lineStyle: { width: 1.5, type: 'dashed', color: colors[2] || colors[0] },
            itemStyle: { color: colors[2] || colors[0] },
          },
        ],
      };
    }
    return {
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtInt(v) },
      legend: { bottom: 0 },
      toolbox,
      grid: { left: 48, right: 14, top: 28, bottom: 40 },
      xAxis: { type: 'category', boundaryGap: false, data: labels, axisLabel: { interval: isNarrow ? 3 : 'auto' } },
      yAxis: { type: 'value' },
      series: [
        {
          name: t('trends.sev.heinous'),
          type: 'line',
          stack: 'sev',
          data: model.heinous,
          showSymbol: false,
          lineStyle: { width: 1, color: anomalyColor },
          itemStyle: { color: anomalyColor },
          areaStyle: { color: anomalyColor, opacity: 0.55 },
          emphasis: { focus: 'series' },
        },
        {
          name: t('trends.sev.other'),
          type: 'line',
          stack: 'sev',
          data: model.other,
          showSymbol: false,
          lineStyle: { width: 1, color: colors[0] },
          itemStyle: { color: colors[0] },
          areaStyle: { color: colors[0], opacity: 0.35 },
          emphasis: { focus: 'series' },
        },
      ],
    };
  }, [model, view, colors, anomalyColor, surface, isNarrow, t]);

  const insight = useMemo(() => {
    if (!model) return null;
    const dir = model.fit && Math.abs(model.fit.slope) > 0.01
      ? t(model.fit.slope > 0 ? 'trends.sev.dirUp' : 'trends.sev.dirDown')
      : t('trends.sev.dirFlat');
    const peakIdx = model.share.indexOf(Math.max(...model.share));
    return t('trends.sev.insight', {
      share: fmtNum(model.windowShare, 1),
      n: fmtInt(model.heinousTotal),
      direction: dir,
      slope: fmtNum(Math.abs((model.fit?.slope || 0) * 12), 2),
      peak: monthLabel(model.months[peakIdx]),
      peakShare: fmtNum(model.share[peakIdx], 1),
    });
  }, [model, t]);

  const exportCsv = () => {
    if (!model) return;
    downloadCsv(
      `dappa-severity-mix_${slug(districtId || 'karnataka')}`,
      ['month', 'cases', 'heinous', 'other', 'heinous_share_pct', 'rolling3_share_pct'],
      model.months.map((ym, i) => [
        ym, model.total[i], model.heinous[i], model.other[i],
        Number(model.share[i].toFixed(2)),
        model.smoothed[i] === null ? '' : Number(model.smoothed[i].toFixed(2)),
      ]),
    );
    toast.success(t('trends.toast.severity'));
  };

  const trendTone = model?.fit
    ? (model.fit.slope > 0.01 ? 'red' : model.fit.slope < -0.01 ? 'teal' : 'slate')
    : 'slate';

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.sev.title')}
        subtitle={view === 'share' ? t('trends.sev.subtitleShare') : t('trends.sev.subtitleMix')}
        actions={(
          <div className="trends-no-print flex flex-wrap items-center justify-end gap-1.5">
            {model && (
              <Tooltip label={t('trends.sev.latestTip')}>
                <span><Badge tone={trendTone}>{t('trends.sev.latestBadge', { pct: fmtNum(model.latest, 1) })}</Badge></span>
              </Tooltip>
            )}
            <SegmentedControl
              ariaLabel={t('trends.sev.viewAria')}
              value={view}
              onChange={setView}
              options={[
                { value: 'mix', label: t('trends.sev.viewMix') },
                { value: 'share', label: t('trends.sev.viewShare') },
              ]}
            />
            {monthly.error && (
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={() => monthly.refetch()}>
                {t('common.action.retry')}
              </button>
            )}
            <Tooltip label={t('trends.sev.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!model}>CSV</button>
            </Tooltip>
          </div>
        )}
      >
        <ChartBody
          option={option}
          height={310}
          loading={monthly.isLoading}
          error={monthly.error}
          onRetry={() => monthly.refetch()}
          emptyMessage={t('trends.sev.empty')}
        />
        {model && !monthly.isLoading && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5" aria-label={t('trends.sev.statsAria')}>
            <span className="inline-flex items-center gap-1 rounded-full border border-grid bg-base/60 px-2.5 py-1 text-[11px] text-muted">
              {t('trends.sev.windowShare')} <span className="num font-semibold text-ink">{fmtNum(model.windowShare, 1)}%</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-grid bg-base/60 px-2.5 py-1 text-[11px] text-muted">
              {t('trends.sev.heinousTotal')} <span className="num font-semibold text-ink">{fmtInt(model.heinousTotal)}</span>
            </span>
            {model.yoy !== null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-grid bg-base/60 px-2.5 py-1 text-[11px] text-muted">
                {t('trends.sev.yoy')}
                <StatDelta value={model.yoy} positiveIsGood={false} label={t('trends.sev.yoyLabel')} />
              </span>
            )}
            {model.outliers.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-grid bg-base/60 px-2.5 py-1 text-[11px] text-muted">
                {t('trends.sev.outliers')} <span className="num font-semibold text-ink">{fmtInt(model.outliers.length)}</span>
              </span>
            )}
          </div>
        )}
      </Card>
      <InsightLine text={insight} loading={monthly.isLoading} />
    </div>
  );
}
