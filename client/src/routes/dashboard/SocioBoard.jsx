// Socio-economic correlation board (C3 — the "why" behind the "where").
// Plots every district's crime rate against one of five real census indicators
// from /meta/socio, draws the ordinary-least-squares fit, reports Pearson r,
// and — the part an SP actually acts on — ranks districts by RESIDUAL: how far
// each sits above or below the crime level its own socio-economic profile
// predicts. A district can top the raw leaderboard purely because 1.1 crore
// people live there; the residual list is where genuine outliers surface.
//
// Props: rows (analytics.joinSocio output), loading, error?, onRetry?,
//        onPickDistrict?(districtId), activeDistrictId, chartRef?
import { useMemo } from 'react';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import Badge from '../../components/Badge.jsx';
import DashChart from './DashChart.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { useLocalPref, useMedia } from './lib.js';
import {
  SOCIO_INDICATORS, SOCIO_INDICATOR_KEYS, linearFit, residualRanking, strengthKey, isNum,
} from './analytics.js';

const METRICS = ['rate', 'cases'];
const OUTLIERS = 3;

export default function SocioBoard({
  rows = [], loading = false, error = null, onRetry,
  onPickDistrict, activeDistrictId, chartRef,
}) {
  const t = useT();
  const tName = useNames();
  const narrow = useMedia('(max-width: 640px)');
  const [indicator, setIndicator] = useLocalPref('dappa-dash-socio-ind', 'urbanPct');
  const [metric, setMetric] = useLocalPref('dappa-dash-socio-metric', 'rate');

  const key = SOCIO_INDICATOR_KEYS.includes(indicator) ? indicator : 'urbanPct';
  const yKey = METRICS.includes(metric) ? metric : 'rate';
  const spec = SOCIO_INDICATORS.find((i) => i.key === key);

  const points = useMemo(() => (rows || [])
    .map((r) => {
      const x = r[key];
      const y = yKey === 'rate' ? r.ratePerLakh : r.caseCount;
      if (!isNum(x) || !isNum(y)) return null;
      return {
        x: Number(x),
        y: Number(y),
        districtId: r.districtId,
        name: tName('districts', r.districtId, r.districtName) || r.districtName,
        population: r.population,
        caseCount: r.caseCount,
        alert: r.alert,
      };
    })
    .filter(Boolean), [rows, key, yKey, tName]);

  const fit = useMemo(() => linearFit(points), [points]);
  const ranked = useMemo(() => residualRanking(points, fit), [points, fit]);
  const over = ranked.slice(0, OUTLIERS).filter((p) => p.resid > 0);
  const under = [...ranked].reverse().slice(0, OUTLIERS).filter((p) => p.resid < 0);

  const option = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yLabel = t(`dashboard.socio.metric.${yKey}`);
    const xLabel = t(`dashboard.socio.ind.${key}`);
    // Per-point itemStyle rather than a color callback: an ECharts color
    // callback that returns undefined paints the point black instead of
    // falling back to the theme colour, so the highlight is attached to the
    // one data item that needs it and every other point keeps the palette.
    const series = [{
      name: yLabel,
      type: 'scatter',
      symbolSize: (v) => {
        const arr = Array.isArray(v) ? v : [];
        return Math.max(7, Math.min(20, 7 + Math.sqrt(Number(arr[3]) || 0) / 12));
      },
      data: points.map((p) => {
        const value = [p.x, p.y, p.name, p.caseCount, p.districtId];
        return String(p.districtId) === String(activeDistrictId)
          ? { value, itemStyle: { color: '#2DD4BF', borderColor: '#2DD4BF', borderWidth: 2 } }
          : value;
      }),
      emphasis: { focus: 'series' },
    }];
    if (fit && xMax > xMin) {
      series.push({
        name: t('dashboard.socio.fitLine'),
        type: 'line',
        showSymbol: false,
        smooth: false,
        lineStyle: { type: 'dashed', width: 1.5 },
        tooltip: { show: false },
        data: [[xMin, fit.predict(xMin)], [xMax, fit.predict(xMax)]],
      });
    }
    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (p) => {
          // p.value is the value array whether the item was supplied as a bare
          // array or as an {value, itemStyle} object (the highlighted point).
          const v = Array.isArray(p.value) ? p.value : p.data?.value;
          if (!Array.isArray(v) || v.length < 4) return '';
          const [x, y, name, cases] = v;
          return [
            `<b>${name}</b>`,
            `${xLabel}: ${fmtNum(x, spec?.digits ?? 1)}${spec?.suffix || ''}`,
            `${yLabel}: ${yKey === 'rate' ? fmtNum(y, 1) : fmtInt(y)}`,
            `${t('dashboard.socio.tipCases')}: ${fmtInt(cases)}`,
          ].join('<br/>');
        },
      },
      grid: { left: narrow ? 48 : 56, right: 14, top: 14, bottom: narrow ? 46 : 40 },
      xAxis: {
        type: 'value',
        name: xLabel,
        nameLocation: 'middle',
        nameGap: narrow ? 30 : 26,
        nameTextStyle: { fontSize: 10 },
        scale: true,
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: yLabel,
        nameTextStyle: { fontSize: 10, align: 'left' },
        scale: true,
        axisLabel: { fontSize: 10 },
      },
      series,
    };
  }, [points, fit, key, yKey, narrow, t, spec, activeDistrictId]);

  const indicatorOptions = useMemo(
    () => SOCIO_INDICATORS.map((i) => ({ value: i.key, label: t(`dashboard.socio.indShort.${i.key}`) })),
    [t],
  );
  const metricOptions = useMemo(
    () => METRICS.map((m) => ({ value: m, label: t(`dashboard.socio.metricShort.${m}`) })),
    [t],
  );

  if (loading) return <LoadingSkeleton height={300} />;
  if (error) {
    return (
      <EmptyState
        compact
        title={t('dashboard.socio.error')}
        message={error.message}
        action={onRetry ? <button type="button" className="btn" onClick={onRetry}>{t('common.action.retry')}</button> : undefined}
      />
    );
  }
  if (!points.length) {
    return <EmptyState compact title={t('dashboard.socio.empty')} message={t('dashboard.socio.emptyHint')} />;
  }

  const OutlierRow = ({ p, tone }) => (
    <li>
      <button
        type="button"
        onClick={() => onPickDistrict?.(p.districtId)}
        title={t('dashboard.socio.outlierTitle', { name: p.name })}
        className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-grid/30"
      >
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{p.name}</span>
        <span className="num shrink-0 text-[10px] text-muted">
          {t('dashboard.socio.expected', {
            v: yKey === 'rate' ? fmtNum(p.expected, 1) : fmtInt(Math.round(p.expected)),
          })}
        </span>
        <Badge tone={tone} className="shrink-0">
          {p.residPct === null ? fmtNum(p.resid, 1) : fmtPct(p.residPct, { sign: true, digits: 0 })}
        </Badge>
      </button>
    </li>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        <SegmentedControl
          ariaLabel={t('dashboard.socio.indAria')}
          value={key}
          onChange={setIndicator}
          options={indicatorOptions}
          className="shrink-0"
        />
        <SegmentedControl
          ariaLabel={t('dashboard.socio.metricAria')}
          value={yKey}
          onChange={setMetric}
          options={metricOptions}
          className="shrink-0"
        />
      </div>

      {option && <DashChart ref={chartRef} option={option} height={narrow ? 230 : 268} />}

      {fit && fit.r !== null && (
        <p className="text-[11px] text-muted">
          {t('dashboard.socio.readout', {
            ind: t(`dashboard.socio.ind.${key}`),
            metric: t(`dashboard.socio.metric.${yKey}`),
            strength: t(`dashboard.socio.strength.${strengthKey(fit.r)}`),
            dir: t(fit.slope >= 0 ? 'dashboard.socio.dirUp' : 'dashboard.socio.dirDown'),
            r: fmtNum(fit.r, 2),
            n: fit.n,
          })}
        </p>
      )}

      {(over.length > 0 || under.length > 0) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {over.length > 0 && (
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {t('dashboard.socio.overHeading')}
              </p>
              <ul className="divide-y divide-grid/40">
                {over.map((p) => <OutlierRow key={`o-${p.districtId}`} p={p} tone="red" />)}
              </ul>
            </div>
          )}
          {under.length > 0 && (
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {t('dashboard.socio.underHeading')}
              </p>
              <ul className="divide-y divide-grid/40">
                {under.map((p) => <OutlierRow key={`u-${p.districtId}`} p={p} tone="teal" />)}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted">{t('dashboard.socio.footnote')}</p>
    </div>
  );
}
