// Trends — the "why behind the where" as a matrix instead of one scatter.
// Every crime head is re-aggregated per district for the current window
// (/geo/districts?crimeHeadId=…, one Catalyst query per head, all cached by
// react-query), converted to a rate per lakh against the SocioEconomic
// population, and correlated with each socio-economic indicator. Each cell
// carries an exact two-tailed significance test, so an eye-catching r on five
// districts is labelled as what it is rather than sold as a finding.
import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { apiGet, prune, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from './ChartBody.jsx';
import InsightLine from './InsightLine.jsx';
import { districtKey, pearsonTest, sigStars } from './analysis.js';
import { gated } from './gate.js';
import { downloadCsv } from './csv.js';
import { fmtNum } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';

// Indicator keys are the /meta/socio field names; labels reuse the socio card's
// strings so the scatter and the matrix always name a variable the same way.
const INDICATORS = [
  { key: 'urbanPct', labelKey: 'urbanPct', shortKey: 'urbanPctShort' },
  { key: 'literacyPct', labelKey: 'literacyPct', shortKey: 'literacyPctShort' },
  { key: 'densityPerKm2', labelKey: 'density', shortKey: 'densityShort' },
  { key: 'perCapitaIncomeIdx', labelKey: 'income', shortKey: 'incomeShort' },
];

const ALL_HEADS = '__all__';

/** |r| → a trends.socio.* strength key (shared wording with the scatter). */
function strengthKey(r) {
  const a = Math.abs(r);
  return a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'none';
}

export default function CorrelationMatrix({
  window: win, crimeHeadId, setFilter, surface, divergingRamp, isNarrow,
}) {
  const toast = useToast();
  const { t, tName } = useI18n();
  const [sigOnly, setSigOnly] = useState(false);

  const lookups = useLookups();
  const socio = useQuery({
    queryKey: ['meta-socio'],
    queryFn: ({ signal }) => apiGet('/meta/socio', {}, { signal })
      .then((r) => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 60 * 60 * 1000,
  });

  const heads = lookups.data?.crimeHeads || [];
  // Row order: "All crimes" first, then every head in lookup order.
  const rowDefs = useMemo(() => [
    { id: ALL_HEADS, label: t('trends.corr.allCrimes'), raw: 'All crimes' },
    ...heads.map((h) => ({
      id: h.crimeHeadId,
      label: tName('crimeHeads', h.crimeHeadId, h.headName),
      raw: h.headName,
    })),
  ], [heads, t, tName]);

  const queries = useQueries({
    queries: rowDefs.map((row) => {
      const params = prune({
        from: win?.from,
        to: win?.to,
        crimeHeadId: row.id === ALL_HEADS ? undefined : row.id,
      });
      return {
        // Same key shape as useDistrictsGeo, so the "All crimes" row is free.
        queryKey: ['geo-districts', params],
        queryFn: ({ signal }) => gated(() => apiGet('/geo/districts', params, { signal })
          .then((r) => (Array.isArray(r.data) ? r.data : []))),
        staleTime: 5 * 60 * 1000,
      };
    }),
  });

  const loading = socio.isLoading || lookups.isLoading || queries.some((q) => q.isLoading);
  // A single crime head failing leaves a blank row, not a blank matrix — only
  // the shared inputs (socio, lookups) or a total wipeout are error states.
  const error = socio.error || lookups.error
    || (queries.length && queries.every((q) => q.error) ? queries[0].error : null);

  const model = useMemo(() => {
    const socioRows = socio.data || [];
    if (!socioRows.length || !rowDefs.length) return null;
    const socioByKey = new Map(socioRows.map((s) => [districtKey(s.districtId), s]));
    const cells = [];
    let maxN = 0;
    rowDefs.forEach((row, ri) => {
      const geoRows = queries[ri]?.data || [];
      // Join on the normalised district key — /geo/* pads, /meta/socio does not.
      const paired = geoRows.map((g) => {
        const s = socioByKey.get(districtKey(g.districtId));
        const pop = Number(s?.population);
        const count = Number(g.caseCount);
        if (!s || !(pop > 0) || !Number.isFinite(count)) return null;
        return { socio: s, rate: (count / pop) * 100000, count, name: g.districtName, id: g.districtId };
      }).filter(Boolean);
      INDICATORS.forEach((ind, ci) => {
        const usable = paired.filter((p) => Number.isFinite(Number(p.socio[ind.key])));
        const test = pearsonTest(
          usable.map((p) => p.rate),
          usable.map((p) => Number(p.socio[ind.key])),
        );
        if (usable.length > maxN) maxN = usable.length;
        cells.push({
          row: ri,
          col: ci,
          rowId: row.id,
          rowLabel: row.label,
          rowRaw: row.raw,
          indKey: ind.key,
          indLabel: t(`trends.socio.${ind.shortKey}`),
          indFull: t(`trends.socio.${ind.labelKey}`),
          r: test ? test.r : null,
          p: test ? test.p : null,
          n: test ? test.n : usable.length,
        });
      });
    });
    const scored = cells.filter((c) => c.r !== null);
    if (!scored.length) return null;
    const ranked = [...scored].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    return { cells, ranked, maxN, significant: scored.filter((c) => c.p < 0.05).length };
  }, [socio.data, rowDefs, queries, t]);

  const option = useMemo(() => {
    if (!model) return null;
    const shown = model.cells.filter((c) => c.r !== null && (!sigOnly || c.p < 0.05));
    if (!shown.length) return null;
    return {
      tooltip: {
        position: 'top',
        formatter: (p) => {
          const c = shown[p.dataIndex];
          if (!c) return '';
          return t('trends.corr.tooltip', {
            head: c.rowLabel,
            indicator: c.indFull,
            r: fmtNum(c.r, 2),
            p: c.p < 0.001 ? '<0.001' : fmtNum(c.p, 3),
            n: c.n,
            strength: t(`trends.socio.${strengthKey(c.r)}`),
          });
        },
      },
      grid: { left: isNarrow ? 4 : 130, right: 12, top: 10, bottom: 56, containLabel: isNarrow },
      xAxis: {
        type: 'category',
        data: INDICATORS.map((i) => t(`trends.socio.${i.shortKey}`)),
        axisLabel: { fontSize: 10, interval: 0, width: 70, overflow: 'break' },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category',
        data: model.cells.filter((c) => c.col === 0).map((c) => c.rowLabel),
        inverse: true,
        axisLabel: { fontSize: 10, width: isNarrow ? 76 : 122, overflow: 'truncate' },
      },
      visualMap: {
        min: -1,
        max: 1,
        orient: 'horizontal',
        right: 0,
        bottom: 0,
        itemWidth: 10,
        itemHeight: 90,
        precision: 2,
        text: [t('trends.corr.scalePos'), t('trends.corr.scaleNeg')],
        textStyle: { color: surface.muted, fontSize: 10 },
        inRange: { color: divergingRamp },
      },
      series: [{
        type: 'heatmap',
        data: shown.map((c) => [c.col, c.row, Number(c.r.toFixed(3))]),
        itemStyle: { borderColor: surface.panel, borderWidth: 2, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: surface.ink, borderWidth: 1 } },
        label: {
          show: !isNarrow,
          fontSize: 10,
          color: surface.ink,
          formatter: (p) => {
            const c = shown[p.dataIndex];
            return c ? `${c.r >= 0 ? '' : '−'}${Math.abs(c.r).toFixed(2)}${sigStars(c.p)}` : '';
          },
        },
      }],
    };
  }, [model, sigOnly, surface, divergingRamp, isNarrow, t]);

  const onEvents = useMemo(() => ({
    click: (p) => {
      const shown = (model?.cells || []).filter((c) => c.r !== null && (!sigOnly || c.p < 0.05));
      const c = shown[p?.dataIndex];
      if (!c || c.rowId === ALL_HEADS) return;
      setFilter('crimeHeadId', String(c.rowId) === String(crimeHeadId) ? '' : String(c.rowId));
    },
  }), [model, sigOnly, crimeHeadId, setFilter]);

  const insight = useMemo(() => {
    if (!model?.ranked.length) return null;
    const top = model.ranked[0];
    return t('trends.corr.insight', {
      head: top.rowLabel,
      indicator: top.indFull,
      direction: t(top.r >= 0 ? 'trends.corr.dirPos' : 'trends.corr.dirNeg'),
      r: fmtNum(top.r, 2),
      strength: t(`trends.socio.${strengthKey(top.r)}`),
      n: top.n,
      verdict: t(top.p < 0.05 ? 'trends.corr.verdictSig' : 'trends.corr.verdictNs'),
    });
  }, [model, t]);

  const exportCsv = () => {
    if (!model) return;
    downloadCsv(
      'dappa-socio-correlation-matrix',
      ['crime_head', 'indicator', 'pearson_r', 'p_value', 'n_districts', 'significant_p05'],
      model.cells.map((c) => [
        c.rowRaw, c.indKey,
        c.r === null ? '' : Number(c.r.toFixed(4)),
        c.p === null ? '' : Number(c.p.toFixed(4)),
        c.n, c.p !== null && c.p < 0.05 ? 'yes' : 'no',
      ]),
    );
    toast.success(t('trends.toast.corr'));
  };

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.corr.title')}
        subtitle={t('trends.corr.subtitle')}
        actions={(
          <div className="trends-no-print flex flex-wrap items-center justify-end gap-1.5">
            {model && (
              <Tooltip label={t('trends.corr.nTip', { n: model.maxN })}>
                <span><Badge tone={model.maxN >= 20 ? 'teal' : 'slate'}>{t('trends.corr.nBadge', { n: model.maxN })}</Badge></span>
              </Tooltip>
            )}
            <button
              type="button"
              className={`chip !px-3 min-h-[40px] transition-colors ${sigOnly ? '!border-amber/60 !text-amber bg-amber/10' : 'hover:border-amber/40'}`}
              aria-pressed={sigOnly}
              onClick={() => setSigOnly((v) => !v)}
              title={t('trends.corr.sigOnlyTip')}
            >
              {t('trends.corr.sigOnly')}
            </button>
            <Tooltip label={t('trends.corr.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!model}>CSV</button>
            </Tooltip>
          </div>
        )}
      >
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3">
            <ChartBody
              option={option}
              height={330}
              loading={loading}
              error={error}
              onRetry={() => { socio.refetch(); queries.forEach((q) => q.refetch()); }}
              emptyMessage={sigOnly ? t('trends.corr.emptySig') : t('trends.corr.empty')}
              onEvents={onEvents}
            />
          </div>
          <div className="xl:col-span-2">
            <p className="text-[11px] font-medium text-ink/80 mb-1.5">{t('trends.corr.rankTitle')}</p>
            {loading ? (
              <div className="space-y-1.5" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-8" />)}
              </div>
            ) : !model ? (
              <p className="text-xs text-muted">{t('trends.corr.empty')}</p>
            ) : (
              <ul className="space-y-1.5">
                {model.ranked.slice(0, 5).map((c) => (
                  <li key={`${c.rowId}-${c.indKey}`} className="rounded-lg border border-grid bg-base/40 px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-[11px] text-ink truncate">{c.rowLabel}</span>
                      <span className={`num shrink-0 text-[11px] font-semibold ${c.r >= 0 ? 'text-signal' : 'text-teal'}`}>
                        r = {fmtNum(c.r, 2)}{sigStars(c.p)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted truncate">
                      {t('trends.corr.rankLine', {
                        indicator: c.indFull,
                        strength: t(`trends.socio.${strengthKey(c.r)}`),
                        direction: t(c.r >= 0 ? 'trends.corr.dirPos' : 'trends.corr.dirNeg'),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted mt-2">{t('trends.corr.legend')}</p>
          </div>
        </div>
        <p className="text-[11px] text-muted mt-2">{t('trends.corr.caveat')}</p>
      </Card>
      <InsightLine text={insight} loading={loading} />
    </div>
  );
}
