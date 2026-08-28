// /predict — horizon reliability. A forecast is only as useful as the honesty
// of its uncertainty, so this card reads the SAME district × head the explorer
// is showing (fd/fh deep-link params) and unpacks the 80% band the model
// returned: how wide it is at each step ahead, how that width grows relative to
// the point forecast, and what the whole horizon adds up to as a planning range
// (lo … predicted … hi). The widening rate is the number that tells an officer
// how far out the projection is still worth staging resources against.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForecast, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import PlainSentence from '../../components/PlainSentence.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from '../trends/ChartBody.jsx';
import InsightLine from '../trends/InsightLine.jsx';
import { seriesColors, SURFACE } from '../trends/palettes.js';
import { downloadCsv, slug } from '../trends/csv.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, monthLabel } from '../../lib/format.js';

export default function HorizonPanel({ defaultDistrictId, defaultCrimeHeadId }) {
  const t = useT();
  const tName = useNames();
  const toast = useToast();
  const { theme } = useTheme();
  const [searchParams] = useSearchParams();
  const lookups = useLookups();

  const colors = seriesColors('standard', theme);
  const surface = SURFACE[theme] || SURFACE.dark;

  // Same resolution order as the explorer and the backtest card, so all three
  // always describe one district × crime head.
  const districtId = searchParams.get('fd') || defaultDistrictId || '';
  const crimeHeadId = searchParams.get('fh') || defaultCrimeHeadId || '';
  const forecast = useForecast({
    ...(districtId ? { districtId } : {}),
    ...(crimeHeadId ? { crimeHeadId } : {}),
  });

  const districtLabel = useMemo(() => {
    const row = (lookups.data?.districts || []).find((d) => d.districtId === String(districtId));
    return districtId
      ? tName('districts', districtId, row?.districtName || String(districtId))
      : t('trends.predict.hz.defaultScope');
  }, [districtId, lookups.data, tName, t]);
  const headLabel = useMemo(() => {
    const row = (lookups.data?.crimeHeads || []).find((h) => h.crimeHeadId === String(crimeHeadId));
    return crimeHeadId
      ? tName('crimeHeads', crimeHeadId, row?.headName || String(crimeHeadId))
      : t('trends.predict.hz.defaultHead');
  }, [crimeHeadId, lookups.data, tName, t]);

  const model = useMemo(() => {
    const rows = (forecast.data?.forecast || []).filter((r) => Number.isFinite(Number(r.predicted)));
    if (!rows.length) return null;
    const steps = rows.map((r, i) => {
      const predicted = Number(r.predicted);
      const lo = Number.isFinite(Number(r.lo)) ? Number(r.lo) : null;
      const hi = Number.isFinite(Number(r.hi)) ? Number(r.hi) : null;
      const width = lo !== null && hi !== null ? hi - lo : null;
      return {
        step: i + 1,
        ym: r.ym,
        predicted,
        lo,
        hi,
        width,
        relPct: width !== null && predicted > 0 ? (width / predicted) * 100 : null,
      };
    });
    const withWidth = steps.filter((s) => s.width !== null);
    const first = withWidth[0] || null;
    const last = withWidth[withWidth.length - 1] || null;
    const growthPct = first && last && first.width > 0
      ? ((last.width - first.width) / first.width) * 100
      : null;
    const perStepPct = growthPct !== null && withWidth.length > 1
      ? growthPct / (withWidth.length - 1)
      : null;
    return {
      steps,
      totalPredicted: steps.reduce((a, s) => a + s.predicted, 0),
      totalLo: steps.reduce((a, s) => a + (s.lo === null ? s.predicted : s.lo), 0),
      totalHi: steps.reduce((a, s) => a + (s.hi === null ? s.predicted : s.hi), 0),
      growthPct,
      perStepPct,
      first,
      last,
      // A band that never widens is a red flag, not a strength.
      flat: growthPct !== null && Math.abs(growthPct) < 1,
    };
  }, [forecast.data]);

  const option = useMemo(() => {
    if (!model) return null;
    const labels = model.steps.map((s) => monthLabel(s.ym));
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (ps) => {
          const s = model.steps[ps[0].dataIndex];
          if (!s) return '';
          return `<b>${monthLabel(s.ym)}</b> · ${t('trends.predict.hz.stepLabel', { n: s.step })}<br/>${
            t('trends.predict.hz.tipPredicted', { value: fmtNum(s.predicted, 1) })}<br/>${
            s.width === null ? '' : t('trends.predict.hz.tipBand', {
              lo: fmtNum(s.lo, 1), hi: fmtNum(s.hi, 1), width: fmtNum(s.width, 1),
            })}<br/>${
            s.relPct === null ? '' : t('trends.predict.hz.tipRel', { pct: fmtNum(s.relPct, 1) })}`;
        },
      },
      legend: { bottom: 0 },
      grid: { left: 48, right: 52, top: 26, bottom: 42 },
      xAxis: { type: 'category', data: labels },
      yAxis: [
        { type: 'value', name: t('trends.predict.hz.axisWidth'), nameTextStyle: { color: surface.muted, fontSize: 10 } },
        {
          type: 'value',
          name: '%',
          position: 'right',
          nameTextStyle: { color: surface.muted, fontSize: 10 },
          axisLabel: { formatter: (v) => `${v}%` },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t('trends.predict.hz.bandWidth'),
          type: 'bar',
          barMaxWidth: 26,
          data: model.steps.map((s) => (s.width === null ? null : Number(s.width.toFixed(1)))),
          itemStyle: { color: colors[0], opacity: 0.75, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: t('trends.predict.hz.relWidth'),
          type: 'line',
          yAxisIndex: 1,
          data: model.steps.map((s) => (s.relPct === null ? null : Number(s.relPct.toFixed(1)))),
          showSymbol: true,
          symbolSize: 6,
          lineStyle: { width: 2, color: colors[1] },
          itemStyle: { color: colors[1] },
        },
      ],
    };
  }, [model, colors, surface, t]);

  const insight = useMemo(() => {
    if (!model) return null;
    if (model.growthPct === null) return t('trends.predict.hz.insightNoBand');
    if (model.flat) return t('trends.predict.hz.insightFlat', { n: fmtInt(model.steps.length) });
    return t('trends.predict.hz.insight', {
      n: fmtInt(model.steps.length),
      growth: fmtNum(Math.abs(model.growthPct), 0),
      direction: t(model.growthPct >= 0 ? 'trends.predict.hz.widens' : 'trends.predict.hz.narrows'),
      perStep: fmtNum(Math.abs(model.perStepPct || 0), 1),
      firstRel: model.first?.relPct === null || model.first?.relPct === undefined ? '—' : fmtNum(model.first.relPct, 0),
      lastRel: model.last?.relPct === null || model.last?.relPct === undefined ? '—' : fmtNum(model.last.relPct, 0),
    });
  }, [model, t]);

  const exportCsv = () => {
    if (!model) return;
    downloadCsv(
      `dappa-forecast-horizon_${slug(`${districtId || 'ka'}-${crimeHeadId || 'all'}`)}`,
      ['step', 'month', 'predicted', 'lo', 'hi', 'band_width', 'band_width_pct_of_point'],
      model.steps.map((s) => [
        s.step, s.ym, s.predicted, s.lo ?? '', s.hi ?? '',
        s.width === null ? '' : Number(s.width.toFixed(2)),
        s.relPct === null ? '' : Number(s.relPct.toFixed(2)),
      ]),
    );
    toast.success(t('trends.predict.hz.exported'));
  };

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.predict.hz.title')}
        subtitle={t('trends.predict.hz.subtitle', { district: districtLabel, head: headLabel })}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {model?.growthPct !== null && model?.growthPct !== undefined && (
              <Tooltip label={t('trends.predict.hz.growthTip')}>
                <span><Badge tone={model.flat ? 'amber' : 'slate'}>
                  {t('trends.predict.hz.growthBadge', {
                    value: `${model.growthPct >= 0 ? '+' : '−'}${fmtNum(Math.abs(model.growthPct), 0)}`,
                  })}
                </Badge></span>
              </Tooltip>
            )}
            <Tooltip label={t('trends.predict.hz.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!model}>CSV</button>
            </Tooltip>
          </div>
        )}
      >
        <ChartBody
          option={option}
          height={280}
          loading={forecast.isLoading}
          error={forecast.error}
          onRetry={() => forecast.refetch()}
          emptyMessage={t('trends.predict.hz.empty')}
        />

        {model && !forecast.isLoading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
              <div className="rounded-lg border border-grid bg-base/40 px-3 py-2">
                <p className="text-[10px] text-muted">{t('trends.predict.hz.outlook', { n: model.steps.length })}</p>
                <p className="num text-base font-semibold text-ink">{fmtInt(Math.round(model.totalPredicted))}</p>
              </div>
              <div className="rounded-lg border border-grid bg-base/40 px-3 py-2">
                <p className="text-[10px] text-muted">{t('trends.predict.hz.planningRange')}</p>
                <p className="num text-base font-semibold text-ink">
                  {fmtInt(Math.round(model.totalLo))} – {fmtInt(Math.round(model.totalHi))}
                </p>
              </div>
              <div className="rounded-lg border border-grid bg-base/40 px-3 py-2">
                <p className="text-[10px] text-muted">{t('trends.predict.hz.spread')}</p>
                <p className="num text-base font-semibold text-ink">
                  ±{fmtInt(Math.round((model.totalHi - model.totalLo) / 2))}
                  <span className="text-[11px] text-muted font-normal ml-1">
                    {model.totalPredicted > 0
                      ? `(${fmtNum(((model.totalHi - model.totalLo) / 2 / model.totalPredicted) * 100, 1)}%)`
                      : ''}
                  </span>
                </p>
              </div>
            </div>

            {model.steps[0]?.lo !== null && model.steps[0]?.hi !== null && (
              <PlainSentence term="interval" vars={{ mid: fmtInt(Math.round(model.steps[0].predicted)), lo: fmtInt(Math.round(model.steps[0].lo)), hi: fmtInt(Math.round(model.steps[0].hi)) }} className="mt-3 text-muted" />
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[380px] text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                    <th scope="col" className="py-1.5 pr-2 font-medium">{t('trends.predict.hz.colStep')}</th>
                    <th scope="col" className="py-1.5 pr-2 font-medium">{t('trends.predict.hz.colMonth')}</th>
                    <th scope="col" className="py-1.5 pr-2 font-medium text-right">{t('trends.predict.hz.colPredicted')}</th>
                    <th scope="col" className="py-1.5 pr-2 font-medium text-right">{t('trends.predict.hz.colBand')}</th>
                    <th scope="col" className="py-1.5 font-medium text-right">{t('trends.predict.hz.colRel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.steps.map((s) => (
                    <tr key={s.ym} className="border-t border-grid/70">
                      <td className="num py-1.5 pr-2 text-muted">+{s.step}</td>
                      <td className="py-1.5 pr-2 text-ink">{monthLabel(s.ym)}</td>
                      <td className="num py-1.5 pr-2 text-right text-ink">{fmtNum(s.predicted, 1)}</td>
                      <td className="num py-1.5 pr-2 text-right text-muted">
                        {s.width === null ? '—' : `${fmtNum(s.lo, 0)} – ${fmtNum(s.hi, 0)}`}
                      </td>
                      <td className="num py-1.5 text-right text-ink">
                        {s.relPct === null ? '—' : `${fmtNum(s.relPct, 0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted">{t('trends.predict.hz.caveat')}</p>
          </>
        )}
      </Card>
      <InsightLine text={insight} loading={forecast.isLoading} />
    </div>
  );
}
