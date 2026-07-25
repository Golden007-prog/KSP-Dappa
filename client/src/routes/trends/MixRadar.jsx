// Trends — crime-mix radar: a district's category-share profile (share of its
// own cases per crime head) traced against the Karnataka baseline, with an
// optional second district overlay. The similarity finder fetches every
// district's profile on demand (one small cached request each — the keys match
// useCategoryShare so repeat visits are free) and ranks the closest mixes by
// cosine similarity, answering "which districts police the same crime blend?".
import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiGet, normalizeCategoryShare, prune, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import ChartBody from './ChartBody.jsx';
import InsightLine from './InsightLine.jsx';
import { cosineSim } from './analysis.js';
import { mixInsight } from './insights.js';
import { downloadCsv, slug } from './csv.js';
import { fmtNum } from '../../lib/format.js';
import { useI18n } from '../../lib/i18n.jsx';

const MAX_AXES = 8;

const shareQuery = (params) => ({
  queryKey: ['trends-category-share', prune(params)],
  queryFn: ({ signal }) => apiGet('/trends/category-share', params, { signal })
    .then((r) => normalizeCategoryShare(r.data)),
});

export default function MixRadar({ window: win, districtId, colors, otherColor, surface }) {
  const toast = useToast();
  const lookups = useLookups();
  const { t, tName } = useI18n();
  const districts = lookups.data?.districts || [];

  const [selA, setSelA] = useState('');
  const [selB, setSelB] = useState('');
  const [simOn, setSimOn] = useState(false);

  // A follows the shared district filter until the user picks explicitly.
  const idA = selA || districtId || districts[0]?.districtId || '';
  const idB = selB && selB !== idA ? selB : '';
  // Raw = the API's English name; slug() strips non-Latin script, so CSV
  // filenames have to be built from this rather than the translated label.
  const rawNameOf = (id) => districts.find((d) => d.districtId === String(id))?.districtName
    || t('trends.compare.districtFallback', { id });
  const nameOf = (id) => tName('districts', id, rawNameOf(id));

  const base = { from: win.from || undefined, to: win.to || undefined };
  const mainDefs = useMemo(() => {
    const defs = [
      { role: 'state', params: prune(base) },
      ...(idA ? [{ role: 'A', params: prune({ ...base, districtId: idA }) }] : []),
      ...(idB ? [{ role: 'B', params: prune({ ...base, districtId: idB }) }] : []),
    ];
    return defs;
  }, [win.from, win.to, idA, idB]); // eslint-disable-line react-hooks/exhaustive-deps

  const mainQueries = useQueries({ queries: mainDefs.map((d) => shareQuery(d.params)) });
  const byRole = {};
  mainDefs.forEach((d, i) => { byRole[d.role] = mainQueries[i]; });

  const loading = mainQueries.some((q) => q.isLoading);
  const error = mainQueries.find((q) => q.error)?.error || null;

  // Axes: the state's top heads by volume (stable regardless of district).
  const axes = useMemo(() => {
    const items = [...(byRole.state?.data || [])].sort((a, b) => b.count - a.count);
    return items.slice(0, MAX_AXES).filter((r) => r.count > 0);
  }, [byRole.state?.data]);

  const shareMap = (items) => new Map((items || []).map((r) => [r.name, Number(r.sharePct) || 0]));

  const model = useMemo(() => {
    if (loading || !axes.length || !idA || !byRole.A?.data) return null;
    const state = shareMap(byRole.state?.data);
    const a = shareMap(byRole.A.data);
    const b = idB ? shareMap(byRole.B?.data) : null;
    const rows = axes.map((h) => ({
      head: h.name,
      headLabel: tName('crimeHeads', h.id, h.name),
      a: a.get(h.name) || 0,
      base: state.get(h.name) || 0,
      b: b ? (b.get(h.name) || 0) : null,
      ratio: (state.get(h.name) || 0) > 0 ? (a.get(h.name) || 0) / state.get(h.name) : null,
    }));
    const max = Math.max(5, ...rows.flatMap((r) => [r.a, r.base, r.b || 0])) * 1.15;
    return { rows, max };
  }, [loading, axes, idA, idB, byRole.state?.data, byRole.A?.data, byRole.B?.data, tName]); // eslint-disable-line react-hooks/exhaustive-deps

  const option = useMemo(() => {
    if (!model) return null;
    const series = [
      { name: nameOf(idA), value: model.rows.map((r) => Number(r.a.toFixed(1))), color: colors[0] },
      { name: t('trends.radar.karnataka'), value: model.rows.map((r) => Number(r.base.toFixed(1))), color: otherColor },
      ...(idB ? [{ name: nameOf(idB), value: model.rows.map((r) => Number((r.b || 0).toFixed(1))), color: colors[2] }] : []),
    ];
    return {
      tooltip: { trigger: 'item', valueFormatter: (v) => `${fmtNum(v, 1)}%` },
      legend: { bottom: 0, type: 'scroll' },
      radar: {
        indicator: model.rows.map((r) => ({ name: r.headLabel || r.head, max: model.max })),
        radius: '62%',
        center: ['50%', '46%'],
        axisName: { color: surface.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: surface.grid } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: surface.grid } },
      },
      series: [{
        type: 'radar',
        data: series.map((s) => ({
          name: s.name,
          value: s.value,
          lineStyle: { color: s.color, width: 2 },
          itemStyle: { color: s.color },
          areaStyle: { color: s.color, opacity: 0.12 },
          symbolSize: 3,
        })),
      }],
    };
  }, [model, idA, idB, colors, otherColor, surface, districts, t, tName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- similarity finder (on demand: one profile fetch per district) -------
  const simDefs = useMemo(
    () => (simOn ? districts.filter((d) => d.districtId !== idA)
      .map((d) => ({ id: d.districtId, params: prune({ ...base, districtId: d.districtId }) })) : []),
    [simOn, districts, idA, win.from, win.to], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const simQueries = useQueries({ queries: simDefs.map((d) => shareQuery(d.params)) });
  const simDone = simQueries.filter((q) => q.isSuccess || q.isError).length;

  const similar = useMemo(() => {
    if (!simOn || !byRole.A?.data || simDone < simDefs.length || !simDefs.length) return null;
    const headNames = (byRole.state?.data || []).map((r) => r.name);
    if (!headNames.length) return [];
    const vec = (items) => {
      const m = shareMap(items);
      return headNames.map((h) => m.get(h) || 0);
    };
    const target = vec(byRole.A.data);
    return simDefs
      .map((d, i) => ({
        districtId: d.id,
        name: nameOf(d.id),
        sim: simQueries[i].data?.length ? cosineSim(target, vec(simQueries[i].data)) : null,
      }))
      .filter((r) => Number.isFinite(r.sim))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);
  }, [simOn, simDone, simDefs, simQueries, byRole.A?.data, byRole.state?.data, districts, tName]); // eslint-disable-line react-hooks/exhaustive-deps

  const insight = useMemo(
    () => (model ? mixInsight(nameOf(idA), model.rows, t) : null),
    [model, idA, districts, t, tName], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const exportCsv = () => {
    if (!model) return;
    downloadCsv(
      `dappa-crime-mix_${slug(rawNameOf(idA))}`,
      ['crime_head', `${nameOf(idA)}_share_pct`, 'karnataka_share_pct', ...(idB ? [`${nameOf(idB)}_share_pct`] : [])],
      model.rows.map((r) => [
        r.headLabel || r.head, fmtNum(r.a, 1), fmtNum(r.base, 1), ...(idB ? [fmtNum(r.b || 0, 1)] : []),
      ]),
    );
    toast.success(t('trends.toast.radar'));
  };

  return (
    <div className="space-y-2">
      <Card
        title={t('trends.radar.title')}
        subtitle={t('trends.radar.subtitle')}
        actions={(
          <div className="trends-no-print flex flex-wrap items-center justify-end gap-1.5">
            <select
              className="input-dark !py-2 !px-2 text-xs max-w-[9.5rem] min-h-[40px]"
              value={idA}
              onChange={(e) => setSelA(e.target.value)}
              disabled={lookups.isLoading}
              aria-label={t('trends.radar.districtAria')}
            >
              {districts.map((d) => (
                <option key={d.districtId} value={d.districtId}>
                  {tName('districts', d.districtId, d.districtName)}
                </option>
              ))}
            </select>
            <select
              className="input-dark !py-2 !px-2 text-xs max-w-[9.5rem] min-h-[40px]"
              value={idB}
              onChange={(e) => setSelB(e.target.value)}
              disabled={lookups.isLoading}
              aria-label={t('trends.radar.compareAria')}
            >
              <option value="">{t('trends.radar.addCompare')}</option>
              {districts.filter((d) => d.districtId !== idA).map((d) => (
                <option key={d.districtId} value={d.districtId}>
                  {tName('districts', d.districtId, d.districtName)}
                </option>
              ))}
            </select>
            <Tooltip label={t('trends.radar.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!model}>CSV</button>
            </Tooltip>
          </div>
        )}
      >
        <ChartBody
          option={option}
          height={300}
          loading={loading || lookups.isLoading}
          error={error}
          onRetry={() => mainQueries.forEach((q) => { if (q.error) q.refetch(); })}
          emptyMessage={t('trends.radar.empty')}
        />

        <div className="trends-no-print mt-3 border-t border-grid/60 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn !px-3 text-xs min-h-[40px]"
              onClick={() => setSimOn(true)}
              disabled={simOn || !model}
            >
              {t('trends.radar.findSimilar')}
            </button>
            <span className="text-[11px] text-muted">
              {simOn
                ? (similar
                  ? t('trends.radar.simDone', { name: nameOf(idA) })
                  : t('trends.radar.simFetching', { done: simDone, total: simDefs.length }))
                : t('trends.radar.simHint')}
            </span>
          </div>
          {similar && (
            similar.length === 0 ? (
              <p className="text-xs text-muted mt-2">{t('trends.radar.simEmpty')}</p>
            ) : (
              <ul className="mt-2.5 space-y-1.5">
                {similar.map((r) => (
                  <li key={r.districtId} className="flex items-center gap-2">
                    <button
                      type="button"
                      className="min-h-[40px] flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-grid bg-base/40 px-2.5 text-left hover:border-amber/40 transition-colors"
                      onClick={() => setSelB(r.districtId)}
                      title={t('trends.radar.overlayTip', { name: r.name })}
                    >
                      <span className="text-xs text-ink truncate flex-1">{r.name}</span>
                      <span className="h-1.5 w-24 shrink-0 rounded-full bg-grid overflow-hidden" aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, r.sim * 100)}%`, background: colors[0] }} />
                      </span>
                      <span className="num text-xs text-muted w-10 text-right shrink-0">{fmtNum(r.sim * 100, 0)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <InsightLine text={insight} loading={loading} />
        {model && <Badge tone="slate" className="trends-no-print">{t('trends.radar.badge')}</Badge>}
      </div>
    </div>
  );
}
