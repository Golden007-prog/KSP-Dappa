// /predict — forecast accuracy across the whole crime taxonomy, not one cell.
// The backtest panel answers "how predictable is this district × head?"; this
// answers "which crime heads is the platform actually able to forecast?" by
// replaying an identical 6-month holdout for EVERY head over the live monthly
// aggregates (one /trends/monthly call per head, react-query cached), scoring
// three transparent challengers on each, and putting the winner's MAPE beside
// the deployed model's own backtest MAPE from ForecastMonthly where one exists.
// Heads with too little history are listed as such instead of being hidden.
import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiGet, prune, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import InsightLine from '../trends/InsightLine.jsx';
import { backtestChallengers, trimLeadingZeros } from '../trends/analysis.js';
import { gated } from '../trends/gate.js';
import { downloadCsv, slug } from '../trends/csv.js';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';

const HOLDOUT = 6;
const MIN_HISTORY = 18;

/** MAPE → a quality tier (bands are the usual forecasting rules of thumb). */
function tierOf(m) {
  if (m === null || m === undefined) return { key: 'none', tone: 'slate', bar: 'bg-grid' };
  if (m < 10) return { key: 'excellent', tone: 'teal', bar: 'bg-teal/80' };
  if (m < 20) return { key: 'good', tone: 'teal', bar: 'bg-teal/60' };
  if (m < 50) return { key: 'fair', tone: 'amber', bar: 'bg-amber/70' };
  return { key: 'poor', tone: 'red', bar: 'bg-signal/70' };
}

export default function AccuracyBoard({ districtId }) {
  const toast = useToast();
  const { t, tName } = useI18n();
  const [scope, setScope] = useState(districtId ? 'district' : 'state');
  const lookups = useLookups();
  const heads = lookups.data?.crimeHeads || [];
  const scopedDistrict = scope === 'district' ? districtId : '';

  // A wide explicit window: the endpoint defaults to the trailing 12 months,
  // which is one month short of a seasonal-naive backtest.
  const windowParams = useMemo(() => ({ from: '2019-01-01', to: '2030-12-31' }), []);

  const monthlyQueries = useQueries({
    queries: heads.map((h) => {
      const params = prune({
        ...windowParams,
        districtId: scopedDistrict || undefined,
        crimeHeadId: h.crimeHeadId,
      });
      return {
        queryKey: ['trends-monthly-raw', params],
        queryFn: ({ signal }) => gated(() => apiGet('/trends/monthly', params, { signal })
          .then((r) => (Array.isArray(r.data) ? r.data : []))),
        staleTime: 10 * 60 * 1000,
      };
    }),
  });

  const loading = lookups.isLoading || monthlyQueries.some((q) => q.isLoading);
  // One crime head failing must not blank the board — only a total wipeout is
  // an error state; a partial result is still a ranking worth reading.
  const error = lookups.error
    || (monthlyQueries.length && monthlyQueries.every((q) => q.error) ? monthlyQueries[0].error : null);

  // The deployed model's own backtest, for the heads the pipeline has scored.
  // Held back until the history queries land: the two waves together are 16
  // requests, which is enough to trip the API gateway's rate limiter.
  const serverQueries = useQueries({
    queries: heads.map((h) => {
      const params = prune({ districtId: scopedDistrict || undefined, crimeHeadId: h.crimeHeadId });
      return {
        // Deliberately NOT the useForecast key: this query keeps a different
        // (summary) shape, and sharing the key would hand the explorer a
        // payload without history/forecast arrays.
        queryKey: ['forecast-summary', params],
        queryFn: ({ signal }) => gated(() => apiGet('/forecast', params, { signal }).then((r) => ({
          model: r.data?.model || '',
          mape: r.data?.mape ?? null,
          forecastMonths: (r.data?.forecast || []).length,
        }))),
        enabled: !loading,
        staleTime: 10 * 60 * 1000,
      };
    }),
  });

  const rows = useMemo(() => {
    if (!heads.length) return [];
    return heads.map((h, i) => {
      const raw = monthlyQueries[i]?.data || [];
      const months = raw.map((r) => String(r.ym));
      const values = raw.map((r) => Number(r.caseCount) || 0);
      const trimmed = trimLeadingZeros(months, values);
      // Trailing zero-filled months are future padding, not observations.
      let end = trimmed.values.length;
      while (end > 0 && trimmed.values[end - 1] === 0) end -= 1;
      const hist = trimmed.values.slice(0, end);
      const histMonths = trimmed.months.slice(0, end);
      const bt = backtestChallengers(hist, HOLDOUT, MIN_HISTORY);
      const server = serverQueries[i]?.data || null;
      return {
        id: h.crimeHeadId,
        label: tName('crimeHeads', h.crimeHeadId, h.headName),
        raw: h.headName,
        months: hist.length,
        from: histMonths[0] || '',
        to: histMonths[histMonths.length - 1] || '',
        total: hist.reduce((a, b) => a + b, 0),
        best: bt?.best || null,
        models: bt?.models || [],
        serverMape: server?.mape ?? null,
        serverModel: server?.model || '',
        serverHorizon: server?.forecastMonths || 0,
      };
    });
  }, [heads, monthlyQueries, serverQueries, tName]);

  const scored = useMemo(
    () => rows.filter((r) => r.best).sort((a, b) => a.best.mape - b.best.mape),
    [rows],
  );
  const unscored = useMemo(() => rows.filter((r) => !r.best && r.total > 0), [rows]);
  const maxMape = Math.max(1, ...scored.map((r) => r.best.mape));

  const insight = useMemo(() => {
    if (!scored.length) return null;
    const best = scored[0];
    const worst = scored[scored.length - 1];
    return t('trends.predict.acc.insight', {
      best: best.label,
      bestMape: fmtNum(best.best.mape, 1),
      bestModel: t(`trends.predict.bt.${best.best.key}`),
      worst: worst.label,
      worstMape: fmtNum(worst.best.mape, 1),
      n: fmtInt(scored.length),
      skipped: fmtInt(unscored.length),
    });
  }, [scored, unscored, t]);

  const exportCsv = () => {
    if (!rows.length) return;
    downloadCsv(
      `dappa-forecast-accuracy_${slug(scopedDistrict || 'karnataka')}`,
      ['crime_head', 'history_months', 'from_ym', 'to_ym', 'cases', 'best_challenger', 'best_mape_pct', 'server_model', 'server_mape_pct'],
      rows.map((r) => [
        r.raw, r.months, r.from, r.to, r.total,
        r.best ? r.best.key : '', r.best ? Number(r.best.mape.toFixed(2)) : '',
        r.serverModel, r.serverMape ?? '',
      ]),
    );
    toast.success(t('trends.predict.acc.exported'));
  };

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.predict.acc.title')}
        subtitle={t('trends.predict.acc.subtitle', { n: HOLDOUT })}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Badge tone="slate">{t('trends.predict.acc.badge')}</Badge>
            {districtId && (
              <SegmentedControl
                ariaLabel={t('trends.predict.acc.scopeAria')}
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'state', label: t('trends.predict.acc.scopeState') },
                  { value: 'district', label: t('trends.predict.acc.scopeDistrict') },
                ]}
              />
            )}
            <Tooltip label={t('trends.predict.acc.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!rows.length}>CSV</button>
            </Tooltip>
          </div>
        )}
      >
        {loading ? (
          <LoadingSkeleton lines={6} />
        ) : error ? (
          <EmptyState
            compact
            title={t('trends.chart.errorTitle')}
            message={error.message}
            action={(
              <button type="button" className="btn" onClick={() => monthlyQueries.forEach((q) => q.refetch())}>
                {t('common.action.retry')}
              </button>
            )}
          />
        ) : !scored.length && !unscored.length ? (
          <EmptyState compact title={t('common.state.empty')} message={t('trends.predict.acc.empty')} />
        ) : (
          <>
            <ul className="space-y-1.5">
              {scored.map((r, i) => {
                const tier = tierOf(r.best.mape);
                return (
                  <li key={r.id} className="rounded-lg border border-grid bg-canvas/40 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="num text-[11px] text-muted w-4 shrink-0">{i + 1}</span>
                        <span className="min-w-0 truncate text-xs font-medium text-ink">{r.label}</span>
                        <Badge tone={tier.tone}>{t(`trends.predict.acc.tier.${tier.key}`)}</Badge>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Tooltip label={t('trends.predict.acc.bestTip', { model: t(`trends.predict.bt.${r.best.key}`) })}>
                          <span className="num text-xs font-semibold text-ink">{fmtNum(r.best.mape, 1)}%</span>
                        </Tooltip>
                        {r.serverMape !== null && (
                          <Tooltip label={t('trends.predict.acc.serverTip', { model: r.serverModel })}>
                            <span><Badge tone={r.serverMape <= r.best.mape ? 'teal' : 'amber'}>
                              {t('trends.predict.acc.serverBadge', { value: fmtNum(r.serverMape, 1) })}
                            </Badge></span>
                          </Tooltip>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-grid/60 overflow-hidden" aria-hidden="true">
                      <div className={`h-full rounded-full ${tier.bar}`} style={{ width: `${Math.max(3, (r.best.mape / maxMape) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-muted">
                      {t('trends.predict.acc.rowMeta', {
                        model: t(`trends.predict.bt.${r.best.key}`),
                        months: fmtInt(r.months),
                        cases: fmtInt(r.total),
                        horizon: fmtInt(r.serverHorizon),
                      })}
                    </p>
                  </li>
                );
              })}
            </ul>
            {unscored.length > 0 && (
              <p className="mt-2.5 text-[11px] text-muted">
                {t('trends.predict.acc.tooShort', {
                  n: MIN_HISTORY,
                  heads: unscored.map((r) => r.label).join(', '),
                })}
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted">{t('trends.predict.acc.caveat')}</p>
          </>
        )}
      </Card>
      <InsightLine text={insight} loading={loading} />
    </div>
  );
}
