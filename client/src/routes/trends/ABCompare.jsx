// Trends — A/B comparator driven by the server's /trends/compare endpoint.
// Unlike the sparkline compare grid (which fans out one request per cell and
// aligns client-side), this asks Catalyst for both sides in a single
// aggregation and gets an aligned month axis back. Three reading modes answer
// three different questions: Levels (who is bigger), Index 100 (who is growing
// faster, regardless of size) and Ratio (how the gap itself moves). The whole
// selection is deep-linked, so a composed comparison is a shareable URL.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiGet, prune, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from './ChartBody.jsx';
import InsightLine from './InsightLine.jsx';
import { indexTo100, pearsonTest } from './analysis.js';
import { downloadCsv, slug } from './csv.js';
import { fmtInt, fmtNum, monthLabel } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';

const PARAM = { aD: 'abAD', aH: 'abAH', bD: 'abBD', bH: 'abBH', view: 'abV' };
const VIEWS = ['levels', 'index', 'ratio'];

export default function ABCompare({ window: win, defaultDistrictIds = [], colors, surface, isNarrow }) {
  const toast = useToast();
  const { t, tName } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const lookups = useLookups();

  const districts = lookups.data?.districts || [];
  const heads = lookups.data?.crimeHeads || [];

  const fallbackA = defaultDistrictIds[0] || districts[0]?.districtId || '';
  const fallbackB = defaultDistrictIds[1] || districts[1]?.districtId || '';
  const aD = searchParams.get(PARAM.aD) ?? fallbackA;
  const bD = searchParams.get(PARAM.bD) ?? fallbackB;
  const aH = searchParams.get(PARAM.aH) || '';
  const bH = searchParams.get(PARAM.bH) || '';
  const view = VIEWS.includes(searchParams.get(PARAM.view)) ? searchParams.get(PARAM.view) : 'levels';

  const setParam = (key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.set(key, ''); // explicit empty beats the seeded default
      return next;
    }, { replace: true });
  };

  const params = useMemo(() => prune({
    from: win?.from,
    to: win?.to,
    aDistrictId: aD || undefined,
    bDistrictId: bD || undefined,
    aCrimeHeadId: aH || undefined,
    bCrimeHeadId: bH || undefined,
  }), [win?.from, win?.to, aD, bD, aH, bH]);

  const compare = useQuery({
    queryKey: ['trends-compare', params],
    queryFn: ({ signal }) => apiGet('/trends/compare', params, { signal }).then((r) => r.data || {}),
    enabled: !!(aD || bD || aH || bH),
    staleTime: 5 * 60 * 1000,
  });

  const nameOfDistrict = (id) => (id
    ? tName('districts', id, districts.find((d) => d.districtId === String(id))?.districtName || String(id))
    : t('trends.ab.karnataka'));
  const nameOfHead = (id) => (id
    ? tName('crimeHeads', id, heads.find((h) => h.crimeHeadId === String(id))?.headName || String(id))
    : t('trends.ab.allHeads'));
  const sideLabel = (d, h) => `${nameOfDistrict(d)} · ${nameOfHead(h)}`;

  const model = useMemo(() => {
    const d = compare.data;
    const series = d?.series || [];
    if (series.length < 2) return null;
    const months = d.categories || series[0].months || [];
    const a = (series[0].data || []).map((v) => Number(v) || 0);
    const b = (series[1].data || []).map((v) => Number(v) || 0);
    if (!months.length || !a.length) return null;
    const totalA = a.reduce((x, y) => x + y, 0);
    const totalB = b.reduce((x, y) => x + y, 0);
    const leadMonths = a.filter((v, i) => v > (b[i] || 0)).length;
    const co = pearsonTest(a, b);
    const ratio = a.map((v, i) => ((b[i] || 0) > 0 ? v / b[i] : null));
    return {
      months,
      a,
      b,
      idxA: indexTo100(a),
      idxB: indexTo100(b),
      ratio,
      totalA,
      totalB,
      gap: totalA - totalB,
      gapPct: totalB > 0 ? ((totalA - totalB) / totalB) * 100 : null,
      leadMonths,
      co,
      sameWindow: d.sameWindow !== false,
    };
  }, [compare.data]);

  const labelA = sideLabel(aD, aH);
  const labelB = sideLabel(bD, bH);

  const option = useMemo(() => {
    if (!model) return null;
    const labels = model.sameWindow ? model.months.map(monthLabel) : model.months;
    const toolbox = {
      right: 0,
      top: 0,
      itemSize: 13,
      iconStyle: { borderColor: surface.muted },
      emphasis: { iconStyle: { borderColor: surface.ink } },
      feature: { saveAsImage: { name: 'dappa-ab-compare', backgroundColor: surface.panel, title: 'PNG' } },
    };
    const base = {
      legend: { bottom: 0, type: 'scroll' },
      toolbox,
      grid: { left: 48, right: 14, top: 28, bottom: 40 },
      xAxis: { type: 'category', boundaryGap: false, data: labels, axisLabel: { interval: isNarrow ? 2 : 'auto' } },
    };
    if (view === 'ratio') {
      return {
        ...base,
        tooltip: { trigger: 'axis', valueFormatter: (v) => (v === null || v === undefined ? '—' : `${fmtNum(v, 2)}×`) },
        legend: { show: false },
        yAxis: { type: 'value', axisLabel: { formatter: (v) => `${v}×` } },
        series: [{
          name: t('trends.ab.ratioSeries', { a: labelA, b: labelB }),
          type: 'line',
          data: model.ratio.map((v) => (v === null ? null : Number(v.toFixed(3)))),
          showSymbol: false,
          smooth: 0.15,
          connectNulls: true,
          lineStyle: { width: 2, color: colors[0] },
          itemStyle: { color: colors[0] },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [{ yAxis: 1, lineStyle: { color: surface.grid, type: 'dashed' }, label: { show: true, formatter: t('trends.ab.parity'), color: surface.muted, fontSize: 9 } }],
          },
        }],
      };
    }
    const isIndex = view === 'index';
    const dataA = isIndex ? model.idxA : model.a;
    const dataB = isIndex ? model.idxB : model.b;
    const fmt = (v) => (v === null || v === undefined ? '—' : isIndex ? fmtNum(v, 1) : fmtInt(v));
    return {
      ...base,
      tooltip: { trigger: 'axis', valueFormatter: fmt },
      yAxis: { type: 'value', ...(isIndex ? { axisLabel: { formatter: (v) => `${v}` } } : {}) },
      series: [
        {
          name: labelA,
          type: 'line',
          data: dataA.map((v) => (v === null ? null : Number(Number(v).toFixed(isIndex ? 1 : 0)))),
          showSymbol: false,
          smooth: 0.15,
          connectNulls: true,
          lineStyle: { width: 2, color: colors[0] },
          itemStyle: { color: colors[0] },
          areaStyle: isIndex ? undefined : { color: colors[0], opacity: 0.1 },
          emphasis: { focus: 'series' },
        },
        {
          name: labelB,
          type: 'line',
          data: dataB.map((v) => (v === null ? null : Number(Number(v).toFixed(isIndex ? 1 : 0)))),
          showSymbol: false,
          smooth: 0.15,
          connectNulls: true,
          lineStyle: { width: 2, color: colors[1] },
          itemStyle: { color: colors[1] },
          areaStyle: isIndex ? undefined : { color: colors[1], opacity: 0.1 },
          emphasis: { focus: 'series' },
        },
        ...(isIndex ? [{
          name: t('trends.ab.baseline'),
          type: 'line',
          data: model.months.map(() => 100),
          showSymbol: false,
          silent: true,
          lineStyle: { width: 1, type: 'dashed', color: surface.grid },
          itemStyle: { color: surface.grid },
          tooltip: { show: false },
        }] : []),
      ],
    };
  }, [model, view, labelA, labelB, colors, surface, isNarrow, t]);

  const insight = useMemo(() => {
    if (!model) return null;
    const leader = model.gap >= 0 ? labelA : labelB;
    const lagger = model.gap >= 0 ? labelB : labelA;
    return t('trends.ab.insight', {
      leader,
      lagger,
      gap: fmtInt(Math.abs(model.gap)),
      gapPct: model.gapPct === null ? '—' : fmtNum(Math.abs(model.gapPct), 1),
      lead: fmtInt(model.gap >= 0 ? model.leadMonths : model.months.length - model.leadMonths),
      n: fmtInt(model.months.length),
      co: model.co ? fmtNum(model.co.r, 2) : '—',
      comove: t(model.co && model.co.r >= 0.5 ? 'trends.ab.comoveYes' : 'trends.ab.comoveNo'),
    });
  }, [model, labelA, labelB, t]);

  const exportCsv = () => {
    if (!model) return;
    downloadCsv(
      `dappa-ab-compare_${slug(`${aD || 'ka'}-${aH || 'all'}_${bD || 'ka'}-${bH || 'all'}`)}`,
      ['period', 'a_cases', 'b_cases', 'a_index100', 'b_index100', 'ratio_a_over_b'],
      model.months.map((m, i) => [
        m, model.a[i], model.b[i],
        model.idxA[i] === null ? '' : Number(model.idxA[i].toFixed(1)),
        model.idxB[i] === null ? '' : Number(model.idxB[i].toFixed(1)),
        model.ratio[i] === null ? '' : Number(model.ratio[i].toFixed(3)),
      ]),
    );
    toast.success(t('trends.toast.ab'));
  };

  const sideSelects = (sideKey, dVal, hVal, dParam, hParam, dot) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} aria-hidden="true" />
        {sideKey}
      </span>
      <select
        className="input-dark !py-2 !px-2 text-xs max-w-[10.5rem] min-h-[40px]"
        value={dVal}
        aria-label={t('trends.ab.districtAria', { side: sideKey })}
        disabled={lookups.isLoading}
        onChange={(e) => setParam(dParam, e.target.value)}
      >
        <option value="">{t('trends.ab.karnataka')}</option>
        {districts.map((d) => (
          <option key={d.districtId} value={d.districtId}>{tName('districts', d.districtId, d.districtName)}</option>
        ))}
      </select>
      <select
        className="input-dark !py-2 !px-2 text-xs max-w-[10.5rem] min-h-[40px]"
        value={hVal}
        aria-label={t('trends.ab.headAria', { side: sideKey })}
        disabled={lookups.isLoading}
        onChange={(e) => setParam(hParam, e.target.value)}
      >
        <option value="">{t('trends.ab.allHeads')}</option>
        {heads.map((h) => (
          <option key={h.crimeHeadId} value={h.crimeHeadId}>{tName('crimeHeads', h.crimeHeadId, h.headName)}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.ab.title')}
        subtitle={t('trends.ab.subtitle')}
        actions={(
          <div className="trends-no-print flex flex-wrap items-center justify-end gap-1.5">
            <Badge tone="slate">{t('trends.ab.serverBadge')}</Badge>
            <SegmentedControl
              ariaLabel={t('trends.ab.viewAria')}
              value={view}
              onChange={(v) => setParam(PARAM.view, v)}
              options={[
                { value: 'levels', label: t('trends.ab.levels') },
                { value: 'index', label: t('trends.ab.index') },
                { value: 'ratio', label: t('trends.ab.ratio') },
              ]}
            />
            {compare.error && (
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={() => compare.refetch()}>
                {t('common.action.retry')}
              </button>
            )}
            <Tooltip label={t('trends.ab.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!model}>CSV</button>
            </Tooltip>
          </div>
        )}
      >
        <div className="trends-no-print flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
          {sideSelects('A', aD, aH, PARAM.aD, PARAM.aH, colors[0])}
          {sideSelects('B', bD, bH, PARAM.bD, PARAM.bH, colors[1])}
        </div>

        <ChartBody
          option={option}
          height={320}
          loading={compare.isLoading}
          error={compare.error}
          onRetry={() => compare.refetch()}
          emptyMessage={t('trends.ab.empty')}
        />

        {model && !compare.isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <div className="rounded-lg border border-grid bg-canvas/40 px-3 py-2">
              <p className="text-[10px] text-muted truncate" title={labelA}>{t('trends.ab.totalA')}</p>
              <p className="num text-base font-semibold text-ink">{fmtInt(model.totalA)}</p>
            </div>
            <div className="rounded-lg border border-grid bg-canvas/40 px-3 py-2">
              <p className="text-[10px] text-muted truncate" title={labelB}>{t('trends.ab.totalB')}</p>
              <p className="num text-base font-semibold text-ink">{fmtInt(model.totalB)}</p>
            </div>
            <div className="rounded-lg border border-grid bg-canvas/40 px-3 py-2">
              <p className="text-[10px] text-muted">{t('trends.ab.gap')}</p>
              <p className="num text-base font-semibold text-ink">
                {model.gap >= 0 ? '+' : '−'}{fmtInt(Math.abs(model.gap))}
                {model.gapPct !== null && (
                  <span className="text-[11px] text-muted font-normal ml-1">({fmtNum(Math.abs(model.gapPct), 1)}%)</span>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-grid bg-canvas/40 px-3 py-2">
              <Tooltip label={t('trends.ab.coTip')}>
                <p className="text-[10px] text-muted cursor-help">{t('trends.ab.comove')}</p>
              </Tooltip>
              <p className="num text-base font-semibold text-ink">
                {model.co ? fmtNum(model.co.r, 2) : '—'}
                <span className="text-[11px] text-muted font-normal ml-1">
                  {t('trends.ab.leadMonths', { n: fmtInt(model.leadMonths), total: fmtInt(model.months.length) })}
                </span>
              </p>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted mt-2">{t('trends.ab.method')}</p>
      </Card>
      <InsightLine text={insight} loading={compare.isLoading} />
    </div>
  );
}
