// Trends — emerging vs cooling crime patterns. The server's /insight/emerging
// endpoint scores every crime sub-head by its last-3-month average against the
// prior 9-month baseline over the live AggMonthly aggregates and hands back a
// 12-month spark per mover; this card turns that into the organiser's
// "emerging-trend alert" surface: a diverging momentum bar chart, a mover board
// with red-pulsing EMERGING badges at >= 15% growth, and a click-through that
// drops the mover's crime head into the shared filters so the rest of the page
// re-reads around the signal.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, prune } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from './ChartBody.jsx';
import InsightLine from './InsightLine.jsx';
import Sparkline from './Sparkline.jsx';
import { detectAnomalies } from './analysis.js';
import { downloadCsv, slug } from './csv.js';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';

const EMERGING_AT = 15; // matches the server's `emerging` flag threshold

export default function EmergingPanel({
  districtId, setFilter, colors, anomalyColor, surface, isNarrow,
}) {
  const toast = useToast();
  const { t, tName } = useI18n();
  const [view, setView] = useState('both'); // rising | cooling | both

  // Only districtId is honoured server-side; the key + normalized shape match
  // the dashboard's useEmerging exactly so the two share one cache entry.
  const params = useMemo(() => prune({ districtId }), [districtId]);
  const emerging = useQuery({
    queryKey: ['insight-emerging', params],
    queryFn: ({ signal }) => apiGet('/insight/emerging', params, { signal }).then((r) => ({
      anchorYm: r.data?.anchorYm || '',
      fromYm: r.data?.fromYm || '',
      rising: Array.isArray(r.data?.rising) ? r.data.rising : [],
      falling: Array.isArray(r.data?.falling) ? r.data.falling : [],
    })),
    staleTime: 5 * 60 * 1000,
  });

  const movers = useMemo(() => {
    const d = emerging.data;
    if (!d) return [];
    const shape = (row, dir) => ({
      ...row,
      dir,
      key: `${dir}-${row.subHeadId}`,
      label: tName('crimeSubHeads', row.subHeadId, row.subHeadName),
      head: row.headId === null || row.headId === undefined
        ? null
        : tName('crimeHeads', row.headId, row.headName),
      spark: Array.isArray(row.spark) ? row.spark.map((v) => Number(v) || 0) : [],
    });
    const rising = (d.rising || []).map((r) => shape(r, 'up'));
    const falling = (d.falling || []).map((r) => shape(r, 'down'));
    if (view === 'rising') return rising;
    if (view === 'cooling') return falling;
    return [...rising, ...falling];
  }, [emerging.data, view, tName]);

  const emergingCount = useMemo(
    () => (emerging.data?.rising || []).filter((r) => Number(r.growthPct) >= EMERGING_AT).length,
    [emerging.data],
  );

  // Diverging momentum bars — red rising (crime up is bad), teal cooling.
  const option = useMemo(() => {
    if (!movers.length) return null;
    const sorted = [...movers].sort((a, b) => Number(a.growthPct) - Number(b.growthPct));
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps) => {
          const row = sorted[ps[0].dataIndex];
          return t('trends.emerging.barTooltip', {
            name: row.label,
            growth: `${row.growthPct >= 0 ? '+' : '−'}${fmtNum(Math.abs(row.growthPct), 1)}`,
            recent: fmtNum(row.recentAvg, 1),
            baseline: fmtNum(row.baselineAvg, 1),
          });
        },
      },
      grid: isNarrow
        ? { left: 4, right: 46, top: 10, bottom: 26, containLabel: true }
        : { left: 158, right: 56, top: 10, bottom: 26 },
      xAxis: { type: 'value', axisLabel: { formatter: (v) => `${v}%` } },
      yAxis: {
        type: 'category',
        data: sorted.map((m) => m.label),
        axisLabel: { width: isNarrow ? 88 : 148, overflow: 'truncate', fontSize: isNarrow ? 10 : 11 },
      },
      series: [{
        type: 'bar',
        barMaxWidth: 14,
        data: sorted.map((m) => ({
          value: Number(Number(m.growthPct).toFixed(1)),
          itemStyle: {
            color: m.growthPct >= 0 ? anomalyColor : colors[1],
            opacity: m.growthPct >= EMERGING_AT ? 1 : 0.7,
            borderRadius: m.growthPct >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
          },
        })),
        label: {
          show: true,
          position: 'right',
          color: surface.muted,
          fontSize: 10,
          formatter: (p) => `${p.value >= 0 ? '+' : '−'}${Math.abs(p.value).toFixed(1)}%`,
        },
      }],
    };
  }, [movers, colors, anomalyColor, surface, isNarrow, t]);

  const insight = useMemo(() => {
    const rising = emerging.data?.rising || [];
    const falling = emerging.data?.falling || [];
    if (!rising.length && !falling.length) return null;
    const top = rising[0];
    const cool = falling[0];
    const topLabel = top ? tName('crimeSubHeads', top.subHeadId, top.subHeadName) : null;
    const coolLabel = cool ? tName('crimeSubHeads', cool.subHeadId, cool.subHeadName) : null;
    if (top && cool) {
      return t('trends.emerging.insightBoth', {
        rise: topLabel,
        risePct: fmtNum(Math.abs(top.growthPct), 1),
        fall: coolLabel,
        fallPct: fmtNum(Math.abs(cool.growthPct), 1),
        n: fmtInt(emergingCount),
      });
    }
    if (top) {
      return t('trends.emerging.insightRise', {
        rise: topLabel, risePct: fmtNum(Math.abs(top.growthPct), 1),
      });
    }
    return t('trends.emerging.insightFall', {
      fall: coolLabel, fallPct: fmtNum(Math.abs(cool.growthPct), 1),
    });
  }, [emerging.data, emergingCount, t, tName]);

  const exportCsv = () => {
    const rows = [...(emerging.data?.rising || []), ...(emerging.data?.falling || [])];
    if (!rows.length) return;
    downloadCsv(
      `dappa-emerging_${slug(districtId || 'karnataka')}`,
      ['crime_subhead', 'crime_head', 'recent_3m_avg', 'baseline_9m_avg', 'growth_pct', 'emerging'],
      rows.map((r) => [
        r.subHeadName, r.headName || '', r.recentAvg, r.baselineAvg, r.growthPct,
        Number(r.growthPct) >= EMERGING_AT ? 'yes' : 'no',
      ]),
    );
    toast.success(t('trends.toast.emerging'));
  };

  const onMoverClick = (m) => {
    if (m.headId === null || m.headId === undefined) return;
    setFilter('crimeHeadId', String(m.headId));
  };

  const window = emerging.data
    ? t('trends.emerging.window', { from: emerging.data.fromYm, to: emerging.data.anchorYm })
    : null;

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.emerging.title')}
        subtitle={window || t('trends.emerging.subtitle')}
        actions={(
          <div className="trends-no-print flex flex-wrap items-center justify-end gap-1.5">
            {emergingCount > 0 && (
              <Tooltip label={t('trends.emerging.badgeTip', { n: EMERGING_AT })}>
                <span><Badge tone="red" pulse>{t('trends.emerging.badge', { n: fmtInt(emergingCount) })}</Badge></span>
              </Tooltip>
            )}
            <SegmentedControl
              ariaLabel={t('trends.emerging.viewAria')}
              value={view}
              onChange={setView}
              options={[
                { value: 'rising', label: t('trends.emerging.rising') },
                { value: 'cooling', label: t('trends.emerging.cooling') },
                { value: 'both', label: t('trends.emerging.both') },
              ]}
            />
            {emerging.error && (
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={() => emerging.refetch()}>
                {t('common.action.retry')}
              </button>
            )}
            <Tooltip label={t('trends.emerging.csvTip')}>
              <button
                type="button"
                className="btn !px-2.5 text-xs min-h-[40px]"
                onClick={exportCsv}
                disabled={!emerging.data}
              >
                CSV
              </button>
            </Tooltip>
          </div>
        )}
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartBody
            option={option}
            height={Math.max(220, Math.min(360, movers.length * 34 + 60))}
            loading={emerging.isLoading}
            error={emerging.error}
            onRetry={() => emerging.refetch()}
            emptyMessage={t('trends.emerging.empty')}
          />
          <div className="space-y-2">
            {emerging.isLoading ? (
              <LoadingSkeleton lines={4} />
            ) : !movers.length ? (
              <EmptyState compact title={t('common.state.empty')} message={t('trends.emerging.empty')} />
            ) : movers.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => onMoverClick(m)}
                disabled={m.headId === null || m.headId === undefined}
                className="w-full min-h-[40px] text-left rounded-lg border border-grid bg-base/40 px-3 py-2 transition-colors hover:border-amber/40 disabled:pointer-events-none"
                title={m.head ? t('trends.emerging.rowTip', { head: m.head }) : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink truncate">{m.label}</span>
                    {m.head && <span className="block text-[10px] text-muted truncate">{m.head}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {Number(m.growthPct) >= EMERGING_AT && (
                      <Badge tone="red" pulse>{t('trends.emerging.flag')}</Badge>
                    )}
                    <StatDelta value={m.growthPct} positiveIsGood={false} label={t('trends.emerging.vsBaseline')} />
                  </span>
                </div>
                <div className="mt-1 flex items-end gap-2">
                  <span className="num text-[11px] text-muted shrink-0">
                    {t('trends.emerging.avgPair', {
                      recent: fmtNum(m.recentAvg, 1), baseline: fmtNum(m.baselineAvg, 1),
                    })}
                  </span>
                  <Sparkline
                    values={m.spark}
                    anomalies={detectAnomalies(m.spark, { minBaseline: 4 })}
                    color={m.dir === 'up' ? anomalyColor : colors[1]}
                    anomalyColor={anomalyColor}
                    height={26}
                    className="flex-1 min-w-[70px]"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted mt-2.5">{t('trends.emerging.method')}</p>
      </Card>
      <InsightLine text={insight} loading={emerging.isLoading} />
    </div>
  );
}
