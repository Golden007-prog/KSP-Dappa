// /predict — forecast accuracy backtest. Replays the last 6 months as a
// holdout: three transparent challenger models (seasonal-naive, drift,
// 3-month mean) are fitted client-side on the earlier history only, their
// holdout predictions are drawn against what actually happened, and a
// scoreboard ranks them by MAPE / MAE / bias next to the server model's own
// backtest MAPE. Follows the same fd/fh deep-link params as the explorer, so
// the two cards always describe the same district × crime head.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForecast, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from '../trends/ChartBody.jsx';
import { seriesColors, SURFACE } from '../trends/palettes.js';
import { downloadCsv, slug } from '../trends/csv.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, monthLabel } from '../../lib/format.js';

const HOLDOUT = 6;
const MIN_HISTORY = 18;
const WINDOW = 18; // months drawn

// CSV column names are data keys, so they stay English whatever the UI shows.
const CSV_HEADER = { seasonal: 'seasonal-naive', drift: 'drift', mean3: '3-month-mean' };

function runBacktest(history, t) {
  if (!history || history.length < MIN_HISTORY) return null;
  const vals = history.map((r) => Number(r.actual) || 0);
  const n = vals.length;
  const train = vals.slice(0, n - HOLDOUT);
  const drift = (train[train.length - 1] - train[0]) / Math.max(1, train.length - 1);
  const mean3 = train.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, train.length);
  const models = [
    {
      key: 'seasonal',
      name: t('trends.predict.bt.seasonal'),
      note: t('trends.predict.bt.seasonalNote'),
      preds: Array.from({ length: HOLDOUT }, (_, i) => vals[n - HOLDOUT + i - 12]),
    },
    {
      key: 'drift',
      name: t('trends.predict.bt.drift'),
      note: t('trends.predict.bt.driftNote'),
      preds: Array.from({ length: HOLDOUT }, (_, i) => Math.max(0, train[train.length - 1] + drift * (i + 1))),
    },
    {
      key: 'mean3',
      name: t('trends.predict.bt.mean3'),
      note: t('trends.predict.bt.mean3Note'),
      preds: Array.from({ length: HOLDOUT }, () => mean3),
    },
  ];
  const actualHold = vals.slice(n - HOLDOUT);
  for (const m of models) {
    let ape = 0;
    let apeN = 0;
    let ae = 0;
    let err = 0;
    m.preds.forEach((p, i) => {
      const a = actualHold[i];
      ae += Math.abs(p - a);
      err += p - a;
      if (a > 0) { ape += Math.abs(p - a) / a; apeN += 1; }
    });
    m.mape = apeN ? (ape / apeN) * 100 : null;
    m.mae = ae / HOLDOUT;
    m.bias = err / HOLDOUT;
  }
  const best = [...models].sort((a, b) => (a.mape ?? Infinity) - (b.mape ?? Infinity))[0];
  return { models, best: best.key, holdStart: n - HOLDOUT };
}

export default function BacktestPanel({ defaultDistrictId, defaultCrimeHeadId }) {
  const t = useT();
  const tName = useNames();
  const toast = useToast();
  const lookups = useLookups();
  const { theme } = useTheme();
  const surface = SURFACE[theme] || SURFACE.dark;
  const colors = seriesColors('standard', theme);
  const [searchParams] = useSearchParams();

  const districtId = searchParams.get('fd') || defaultDistrictId || '0101';
  const crimeHeadId = searchParams.get('fh') || defaultCrimeHeadId || '3';
  const q = useForecast({ districtId, crimeHeadId });

  const history = q.data?.history || [];
  const bt = useMemo(() => runBacktest(history, t), [history, t]);

  // Raw API names feed the CSV filename slug; translated ones feed the card.
  const districtRaw = (lookups.data?.districts || []).find((d) => d.districtId === districtId)?.districtName || districtId;
  const headRaw = (lookups.data?.crimeHeads || []).find((h) => h.crimeHeadId === String(crimeHeadId))?.headName || '';
  const districtName = tName('districts', districtId, districtRaw);
  const headName = headRaw
    ? tName('crimeHeads', crimeHeadId, headRaw)
    : t('trends.predict.headFallback', { id: crimeHeadId });

  const option = useMemo(() => {
    if (!bt) return null;
    const start = Math.max(0, history.length - WINDOW);
    const win = history.slice(start);
    const labels = win.map((r) => monthLabel(r.ym));
    const holdAt = bt.holdStart - start; // index of first holdout month in window
    const modelSeries = bt.models.map((m, mi) => ({
      name: m.name,
      type: 'line',
      data: win.map((_, i) => (i >= holdAt ? Number(m.preds[i - holdAt].toFixed(1)) : null)),
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: m.key === bt.best ? 2.5 : 1.5, type: 'dashed', color: colors[mi + 1] },
      itemStyle: { color: colors[mi + 1] },
      emphasis: { focus: 'series' },
    }));
    return {
      tooltip: { trigger: 'axis', valueFormatter: (v) => (v === null || v === undefined ? '—' : fmtNum(v, 1)) },
      legend: { bottom: 0, type: 'scroll' },
      grid: { left: 44, right: 14, top: 20, bottom: 40 },
      xAxis: { type: 'category', boundaryGap: false, data: labels },
      yAxis: { type: 'value' },
      series: [
        {
          name: t('trends.predict.bt.actual'),
          type: 'line',
          data: win.map((r) => r.actual),
          showSymbol: false,
          z: 3,
          lineStyle: { width: 2, color: colors[0] },
          itemStyle: { color: colors[0] },
          markArea: {
            silent: true,
            itemStyle: { color: surface.grid, opacity: 0.25 },
            label: { show: true, position: 'insideTop', color: surface.muted, fontSize: 9, formatter: t('trends.predict.bt.holdout') },
            data: [[{ xAxis: Math.max(0, holdAt - 0.5) }, { xAxis: labels.length - 0.5 }]],
          },
        },
        ...modelSeries,
      ],
    };
  }, [bt, history, colors, surface, t]);

  const exportCsv = () => {
    if (!bt) return;
    const holdRows = history.slice(bt.holdStart);
    downloadCsv(
      `dappa-backtest_${slug(`${districtRaw}-${headRaw || crimeHeadId}`)}`,
      ['month', 'actual', ...bt.models.map((m) => CSV_HEADER[m.key] || m.key)],
      holdRows.map((r, i) => [r.ym, r.actual, ...bt.models.map((m) => fmtNum(m.preds[i], 1))]),
    );
    toast.success(t('trends.predict.toast.backtest'));
  };

  return (
    <Card
      title={t('trends.predict.bt.title')}
      subtitle={t('trends.predict.bt.subtitle', { district: districtName, head: headName })}
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {q.data?.model && q.data?.mape != null && (
            <Tooltip label={t('trends.predict.bt.serverTip')}>
              <span>
                <Badge tone="neutral">
                  {t('trends.predict.bt.serverBadge', { model: q.data.model, value: fmtNum(q.data.mape, 1) })}
                </Badge>
              </span>
            </Tooltip>
          )}
          <Tooltip label={t('trends.predict.bt.csvTip')}>
            <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!bt}>CSV</button>
          </Tooltip>
        </div>
      )}
    >
      <ChartBody
        option={option}
        height={280}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        emptyMessage={history.length && history.length < MIN_HISTORY
          ? t('trends.predict.bt.needMonths', { n: fmtInt(MIN_HISTORY) })
          : t('trends.predict.bt.empty')}
      />
      {bt && (
        <div
          className="mt-3 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={t('a11y.scroll.table', { name: t('trends.predict.bt.title') })}
        >
          <table className="w-full text-xs border-collapse min-w-[420px]">
            <thead>
              <tr className="border-b border-grid text-[11px] uppercase tracking-wide text-muted">
                <th scope="col" className="text-left py-1.5 pr-2 font-semibold">{t('trends.predict.bt.colModel')}</th>
                <th scope="col" className="text-right py-1.5 px-2 font-semibold">MAPE</th>
                <th scope="col" className="text-right py-1.5 px-2 font-semibold">MAE</th>
                <th scope="col" className="text-right py-1.5 pl-2 font-semibold">
                  <Tooltip label={t('trends.predict.bt.biasTip')}>
                    <span className="cursor-help underline decoration-dotted">{t('trends.predict.bt.colBias')}</span>
                  </Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {bt.models.map((m) => (
                <tr key={m.key} className={`border-b border-grid/40 ${m.key === bt.best ? 'bg-amber/5' : ''}`}>
                  <td className="py-1.5 pr-2">
                    <span className="text-ink font-medium">{m.name}</span>
                    <span className="text-muted"> — {m.note}</span>
                    {m.key === bt.best && <Badge tone="teal" className="ml-1.5">{t('trends.predict.bt.best')}</Badge>}
                  </td>
                  <td className="num text-right py-1.5 px-2 text-ink">{m.mape === null ? '—' : `${fmtNum(m.mape, 1)}%`}</td>
                  <td className="num text-right py-1.5 px-2 text-ink">{fmtNum(m.mae, 1)}</td>
                  <td className="num text-right py-1.5 pl-2 text-ink">{m.bias >= 0 ? '+' : '−'}{fmtNum(Math.abs(m.bias), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted mt-2">
            {t('trends.predict.bt.caveat')}
          </p>
        </div>
      )}
    </Card>
  );
}
