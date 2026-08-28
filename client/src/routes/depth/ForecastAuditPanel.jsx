// Forecast audit beside the AccuracyBoard — the headline backtest numbers
// (228 series, median MAPE, p90, ETS vs seasonal-naive), the 80 % band coverage
// check (should sit near 80 %), and the drift monitor: realised MAPE and
// coverage by horizon step and by calendar month, replayed offline; plus the
// live series count and band width read from ForecastMonthly.
// Data: GET /depth/forecast-audit.
import StatusPill from '../../components/StatusPill.jsx';
import PlainTerm from '../../components/PlainTerm.jsx';
import { useDepthForecastAudit } from '../../lib/depthApi.js';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, fmtPct, monthLabel } from '../../lib/format.js';
import { PanelFrame, StatTile, Bars } from './DepthBits.jsx';

export default function ForecastAuditPanel() {
  const t = useT();
  const q = useDepthForecastAudit();
  const d = q.data;
  const head = d?.headline;
  const cov = d?.coverage?.summary;
  const live = d?.live;
  const covStatus = !cov ? 'nodata' : Math.abs(cov.coverageGap) <= 0.05 ? 'stable' : cov.coverageGap < -0.15 ? 'rising' : 'watch';
  const drift = d?.coverage?.byHorizon || [];
  const byMonth = d?.coverage?.byMonth || [];
  const byModel = d?.coverage?.byModel || [];
  return (
    <PanelFrame
      title={t('depth.fa.title')}
      subtitle={head ? t('depth.fa.subtitle', { n: fmtInt(head.series), h: fmtInt(head.backtestMonths) }) : undefined}
      term="coverage"
      termVars={{ pct: cov ? Math.round(cov.coverage80 * 100) : '—' }}
      method={t('depth.fa.method')}
      methodDetail={d?.method}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(d) && !head && !live}
      emptyMessage={t('depth.fa.empty')}
    >
      {d && (
        <div className="space-y-3">
          {head && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatTile label={<PlainTerm term="mape" />} value={fmtPct(head.medianMape, { digits: 1 })} hint={t('depth.fa.kpiMedianHint')} />
              <StatTile label={t('depth.fa.kpiP90')} value={fmtPct(head.p90Mape, { digits: 1 })} hint={t('depth.fa.kpiP90Hint')} />
              <StatTile label={t('depth.fa.kpiEts')} value={fmtInt(head.etsSeries)} hint={t('depth.fa.kpiEtsHint', { n: fmtInt(head.naiveSeries) })} />
              <StatTile label={t('depth.fa.kpiSeries')} value={fmtInt(head.series)} hint={live ? t('depth.fa.kpiSeriesHint', { n: fmtInt(live.forecastSeries) }) : undefined} />
            </div>
          )}
          {cov ? (
            <div className="bg-canvas/60 border border-grid rounded-lg px-3 py-2 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={covStatus} label={t(`depth.fa.covStatus.${covStatus}`)} />
                <span className="text-[12px] text-ink">{t('depth.fa.covLine', { pct: fmtPct(cov.coverage80 * 100, { digits: 1 }), gap: fmtPct(cov.coverageGap * 100, { digits: 1, sign: true }), n: fmtInt(cov.holdoutPoints) })}</span>
              </div>
              <p className="text-[11px] text-muted">{t('depth.fa.covModels', { ets: byModel.find((m) => m.model.startsWith('ETS')) ? fmtPct(byModel.find((m) => m.model.startsWith('ETS')).coverage80 * 100, { digits: 0 }) : '—', naive: byModel.find((m) => m.model === 'seasonal-naive') ? fmtPct(byModel.find((m) => m.model === 'seasonal-naive').coverage80 * 100, { digits: 0 }) : '—', under: fmtInt(cov.seriesUnderCovered), n: fmtInt(cov.series) })}</p>
            </div>
          ) : (
            <p className="text-[11px] text-muted">{t('depth.fa.covMissing')}</p>
          )}
          {drift.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-ink mb-1">{t('depth.fa.driftTitle')}</h3>
              <Bars rows={drift.map((h) => ({ label: t('depth.fa.horizonLabel', { h: h.h }), value: h.mape, hint: t('depth.fa.horizonHint', { cov: fmtPct(h.coverage80 * 100, { digits: 0 }) }), tone: 'bg-amber/60' }))} min={0} max={Math.max(10, ...drift.map((h) => h.mape || 0)) * 1.1} unit="%" />
              <p className="text-[11px] text-muted mt-1">{t('depth.fa.driftLine', { d: cov ? fmtPct(cov.driftH1ToH6, { digits: 1, sign: true }) : '—' })}</p>
            </div>
          )}
          {byMonth.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <caption className="sr-only">{t('depth.fa.monthCaption')}</caption>
                <thead><tr><th scope="col" className="text-left text-muted font-normal px-1">{t('depth.fa.colMonth')}</th><th scope="col" className="text-right text-muted font-normal px-1">MAPE</th><th scope="col" className="text-right text-muted font-normal px-1">{t('depth.fa.colCoverage')}</th></tr></thead>
                <tbody>
                  {byMonth.map((m) => (
                    <tr key={m.ym} className="border-t border-grid/40">
                      <th scope="row" className="text-left font-normal text-ink px-1 num">{monthLabel(m.ym)}</th>
                      <td className="text-right num px-1">{m.mape === null ? '—' : fmtPct(m.mape, { digits: 1 })}</td>
                      <td className={`text-right num px-1 ${m.coverage80 < 0.7 ? 'text-signal' : ''}`}>{fmtPct(m.coverage80 * 100, { digits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* One holdout from one origin: h = 1..6 and the calendar months
                  are the same six points, so the table relabels the bars. */}
              <p className="text-[11px] text-muted mt-1">{t('depth.fa.monthSameAxis', { first: monthLabel(byMonth[0].ym) })}</p>
            </div>
          )}
          {live && (
            <p className="text-[11px] text-muted">
              {t('depth.fa.liveLine', { n: fmtInt(live.forecastSeries), w: live.meanBandWidthPct === null ? '—' : fmtPct(live.meanBandWidthPct, { digits: 0 }), models: (live.modelsInUse || []).map((m) => `${m.model} ${fmtInt(m.series)}`).join(', ') || '—' })}
              {live.storedBacktestRows > 0 && <span> · {t('depth.fa.liveStored', { n: fmtInt(live.storedBacktestRows), cov: fmtPct(live.storedCoverage80 * 100, { digits: 0 }), mape: live.storedMape === null ? '—' : fmtPct(live.storedMape, { digits: 1 }) })}</span>}
            </p>
          )}
        </div>
      )}
    </PanelFrame>
  );
}
