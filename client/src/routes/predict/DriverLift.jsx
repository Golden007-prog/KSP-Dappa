// /predict — what the risk model is actually reacting to, league-wide.
// The station league shows each station's own drivers; this aggregates them:
// how common every driver signal is across the scored league, and how much
// higher (or lower) the mean risk score runs on stations that carry it versus
// those that do not. That gap is a measured association on the current league,
// never a fitted coefficient, and the card says so — the risk model publishes a
// rank-ordered driver list, not weights. Co-occurring driver pairs sit
// underneath because signals that always travel together explain less than two
// independent ones.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from '../trends/ChartBody.jsx';
import InsightLine from '../trends/InsightLine.jsx';
import { driverPairs, driverStats } from '../trends/analysis.js';
import { seriesColors, ANOMALY_COLOR, SURFACE } from '../trends/palettes.js';
import { downloadCsv } from '../trends/csv.js';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';

export default function DriverLift({ rows, loading, error, onRetry }) {
  const t = useT();
  const toast = useToast();
  const { theme } = useTheme();
  const [view, setView] = useState('lift'); // lift | prevalence

  const colors = seriesColors('standard', theme);
  const surface = SURFACE[theme] || SURFACE.dark;
  const alertColor = ANOMALY_COLOR[theme] || ANOMALY_COLOR.dark;

  const stats = useMemo(() => driverStats(rows), [rows]);
  const pairs = useMemo(() => driverPairs(rows, 4), [rows]);
  const league = (rows || []).filter((r) => Array.isArray(r.drivers)).length;
  // A driver every station carries has no comparison group, so no risk gap
  // exists to plot. When that is true of the whole league the Risk-gap mode is
  // disabled rather than rendering an empty chart under an enabled tab.
  const canLift = useMemo(() => stats.some((s) => s.lift !== null), [stats]);
  const effView = canLift ? view : 'prevalence';

  const option = useMemo(() => {
    if (!stats.length) return null;
    const isLift = effView === 'lift';
    const byLift = isLift
      ? [...stats].filter((s) => s.lift !== null).sort((a, b) => a.lift - b.lift)
      : [...stats].sort((a, b) => a.count - b.count);
    if (!byLift.length) return null;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps) => {
          const s = byLift[ps[0].dataIndex];
          if (!s) return '';
          return `<b>${s.driver}</b><br/>${t('trends.predict.dl.tipPrev', {
            n: fmtInt(s.count), pct: fmtNum(s.sharePct, 0),
          })}<br/>${t('trends.predict.dl.tipMean', {
            withMean: fmtNum(s.withMean, 1),
            withoutMean: s.withoutMean === null ? '—' : fmtNum(s.withoutMean, 1),
          })}${s.lift === null ? '' : `<br/>${t('trends.predict.dl.tipLift', {
            lift: `${s.lift >= 0 ? '+' : '−'}${fmtNum(Math.abs(s.lift), 1)}`,
          })}`}`;
        },
      },
      grid: { left: 4, right: 58, top: 10, bottom: 24, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { formatter: (v) => (isLift ? `${v > 0 ? '+' : ''}${v}` : `${v}`) },
      },
      yAxis: {
        type: 'category',
        data: byLift.map((s) => s.driver),
        axisLabel: { width: 150, overflow: 'truncate', fontSize: 10 },
      },
      series: [{
        type: 'bar',
        barMaxWidth: 15,
        data: byLift.map((s) => {
          const value = isLift ? Number(s.lift.toFixed(1)) : s.count;
          return {
            value,
            itemStyle: {
              color: isLift ? (value >= 0 ? alertColor : colors[1]) : colors[0],
              borderRadius: value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
            },
          };
        }),
        label: {
          show: true,
          position: 'right',
          color: surface.muted,
          fontSize: 10,
          formatter: (p) => (isLift
            ? `${p.value >= 0 ? '+' : '−'}${Math.abs(p.value).toFixed(1)}`
            : fmtInt(p.value)),
        },
      }],
    };
  }, [stats, effView, colors, alertColor, surface, t]);

  const insight = useMemo(() => {
    if (!stats.length) return null;
    const lifted = stats.filter((s) => s.lift !== null).sort((a, b) => b.lift - a.lift);
    const common = [...stats].sort((a, b) => b.count - a.count)[0];
    if (!lifted.length) {
      return t('trends.predict.dl.insightPrevOnly', {
        driver: common.driver, pct: fmtNum(common.sharePct, 0), n: fmtInt(league),
      });
    }
    const top = lifted[0];
    return t('trends.predict.dl.insight', {
      driver: top.driver,
      lift: fmtNum(Math.abs(top.lift), 1),
      direction: t(top.lift >= 0 ? 'trends.predict.dl.higher' : 'trends.predict.dl.lower'),
      n: fmtInt(top.count),
      total: fmtInt(league),
      common: common.driver,
      commonPct: fmtNum(common.sharePct, 0),
    });
  }, [stats, league, t]);

  const exportCsv = () => {
    if (!stats.length) return;
    downloadCsv(
      'dappa-risk-driver-lift',
      ['driver', 'stations_with', 'share_pct', 'mean_risk_with', 'mean_risk_without', 'lift_points', 'league_mean'],
      stats.map((s) => [
        s.driver, s.count, Number(s.sharePct.toFixed(1)), Number(s.withMean.toFixed(2)),
        s.withoutMean === null ? '' : Number(s.withoutMean.toFixed(2)),
        s.lift === null ? '' : Number(s.lift.toFixed(2)),
        Number(s.grandMean.toFixed(2)),
      ]),
    );
    toast.success(t('trends.predict.dl.exported'));
  };

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.predict.dl.title')}
        subtitle={t('trends.predict.dl.subtitle', { n: fmtInt(league) })}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Badge tone="slate">{t('trends.predict.dl.badge')}</Badge>
            <SegmentedControl
              ariaLabel={t('trends.predict.dl.viewAria')}
              value={effView}
              onChange={(v) => { if (v !== 'lift' || canLift) setView(v); }}
              options={[
                ...(canLift ? [{ value: 'lift', label: t('trends.predict.dl.viewLift') }] : []),
                { value: 'prevalence', label: t('trends.predict.dl.viewPrev') },
              ]}
            />
            <Tooltip label={t('trends.predict.dl.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!stats.length}>CSV</button>
            </Tooltip>
          </div>
        )}
      >
        {loading ? (
          <LoadingSkeleton height={240} />
        ) : error ? (
          <EmptyState
            compact
            title={t('trends.chart.errorTitle')}
            message={error.message}
            action={onRetry && <button type="button" className="btn" onClick={onRetry}>{t('common.action.retry')}</button>}
          />
        ) : !stats.length ? (
          <EmptyState compact title={t('common.state.empty')} message={t('trends.predict.dl.empty')} />
        ) : (
          <>
            <ChartBody
              option={option}
              height={Math.max(200, Math.min(340, stats.length * 30 + 50))}
              emptyMessage={t('trends.predict.dl.empty')}
            />
            {pairs.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-medium text-ink/80 mb-1.5">{t('trends.predict.dl.pairsTitle')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {pairs.map((p) => (
                    <span key={`${p.a}|${p.b}`} className="chip !py-1.5 text-[11px] max-w-full min-w-0">
                      <span className="truncate min-w-0 max-w-[7rem]" title={p.a}>{p.a}</span>
                      <span className="text-muted shrink-0" aria-hidden="true">+</span>
                      <span className="truncate min-w-0 max-w-[7rem]" title={p.b}>{p.b}</span>
                      <span className="num text-muted shrink-0">×{fmtInt(p.count)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-2.5 text-[11px] text-muted">{t('trends.predict.dl.caveat')}</p>
          </>
        )}
      </Card>
      <InsightLine text={insight} loading={loading} />
    </div>
  );
}
