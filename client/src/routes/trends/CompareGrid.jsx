// Multi-district × multi-crime-head comparison — a small-multiples grid of
// sparkline cells, one per (district, head) combination. Selections are
// deep-linked in the URL (`cmpD` / `cmpH`, dot-separated ids) so a composed
// comparison is shareable; with nothing chosen it defaults to the top-3
// districts by volume. Each cell shares the react-query cache key format of
// useTrendsMonthly, so cells de-dupe against the main chart for free.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { apiGet, normalizeMonthlyTrends, prune, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { detectAnomalies, recentDeltaPct, toPerLakh } from './analysis.js';
import { riserFallerInsight } from './insights.js';
import { downloadCsv, slug } from './csv.js';
import InsightLine from './InsightLine.jsx';
import Sparkline from './Sparkline.jsx';

const MAX_DISTRICTS = 4;
const MAX_HEADS = 3;

const parseList = (raw, max) => (raw ? raw.split('.').filter(Boolean).slice(0, max) : []);

export default function CompareGrid({ window: win, norm, pops, colors, anomalyColor, defaultDistrictIds = [] }) {
  const toast = useToast();
  const lookups = useLookups();
  const [searchParams, setSearchParams] = useSearchParams();

  const cmpDRaw = searchParams.get('cmpD');
  const cmpH = parseList(searchParams.get('cmpH'), MAX_HEADS);
  // No explicit selection yet → seed from the top districts by case volume.
  const cmpD = cmpDRaw !== null ? parseList(cmpDRaw, MAX_DISTRICTS) : defaultDistrictIds.slice(0, 3);

  const districts = lookups.data?.districts || [];
  const heads = lookups.data?.crimeHeads || [];
  const districtName = (id) => districts.find((d) => d.districtId === String(id))?.districtName || `District ${id}`;
  const headName = (id) => heads.find((h) => h.crimeHeadId === String(id))?.headName || `Head ${id}`;
  // Stable hue per entity — index in the full lookup list, not in the current
  // selection, so removing one series never repaints the survivors.
  const districtColor = (id) => colors[Math.max(0, districts.findIndex((d) => d.districtId === String(id))) % colors.length];
  const headColor = (id) => colors[Math.max(0, heads.findIndex((h) => h.crimeHeadId === String(id))) % colors.length];

  const setList = (key, list) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (list.length) next.set(key, list.join('.'));
      else if (key === 'cmpD') next.set(key, ''); // explicit empty beats the default seed
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  const add = (key, list, max, value, kind) => {
    if (!value || list.includes(value)) return;
    if (list.length >= max) { toast.info(`Compare up to ${max} ${kind} at once — remove one first.`); return; }
    setList(key, [...list, value]);
  };

  // ---- cell definitions (cartesian; null = "All") --------------------------
  const cells = useMemo(() => {
    const dAxis = cmpD.length ? cmpD : [null];
    const hAxis = cmpH.length ? cmpH : [null];
    const out = [];
    dAxis.forEach((d) => hAxis.forEach((h) => out.push({
      d,
      h,
      params: prune({ from: win.from, to: win.to, districtId: d || undefined, crimeHeadId: h || undefined }),
    })));
    return out;
  }, [cmpD.join('.'), cmpH.join('.'), win.from, win.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const queries = useQueries({
    queries: cells.map((c) => ({
      queryKey: ['trends-monthly', c.params],
      queryFn: ({ signal }) => apiGet('/trends/monthly', c.params, { signal }).then((r) => normalizeMonthlyTrends(r.data)),
    })),
  });

  const loading = queries.some((q) => q.isLoading);

  const view = useMemo(() => {
    if (loading) return null;
    const raw = cells.map((c, i) => {
      const t = queries[i].data;
      const months = t?.months || [];
      const values = months.map((_, mi) => (t.series || []).reduce((a, s) => a + (Number(s.data?.[mi]) || 0), 0));
      return { cell: c, months, values, error: queries[i].error };
    });
    const withData = raw.filter((r) => r.months.length);
    if (!withData.length) return { rows: raw, months: [], insight: null };
    // Align every sparkline to one window: cut the shared run of leading months
    // where every compared series is zero (the API zero-fills history).
    const months = withData[0].months;
    let start = months.length - 1;
    for (const r of withData) {
      const first = r.values.findIndex((v) => v > 0);
      if (first >= 0) start = Math.min(start, first);
    }
    if (start >= months.length - 1 || start < 0) start = 0;
    const rows = raw.map((r, i) => {
      const values = r.values.slice(start);
      const pop = r.cell.d ? pops.byDistrict.get(String(r.cell.d)) : pops.statePop;
      const label = r.cell.d && r.cell.h ? `${districtName(r.cell.d)} · ${headName(r.cell.h)}`
        : r.cell.d ? districtName(r.cell.d)
          : r.cell.h ? headName(r.cell.h) : 'Karnataka · all heads';
      return {
        key: `${r.cell.d || 'all'}-${r.cell.h || 'all'}`,
        label,
        error: r.error,
        color: r.cell.d ? districtColor(r.cell.d) : headColor(r.cell.h),
        values,
        display: norm && pop ? toPerLakh(values, pop) : values,
        normApplied: !!(norm && pop),
        total: values.reduce((a, b) => a + b, 0),
        pop,
        deltaPct: recentDeltaPct(values, 3),
        anomalies: detectAnomalies(values),
      };
    });
    return {
      rows,
      months: months.slice(start),
      insight: riserFallerInsight(rows.map((r) => ({ label: r.label, total: r.total, deltaPct: r.deltaPct }))),
    };
  }, [loading, cells, queries, norm, pops, districts, heads]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    if (!view?.months.length) return;
    const headers = ['month', ...view.rows.map((r) => (r.normApplied ? `${r.label} (per lakh)` : r.label))];
    const rows = view.months.map((ym, i) => [
      ym,
      ...view.rows.map((r) => {
        const v = r.display[i];
        return v === null || v === undefined ? '' : r.normApplied ? Number(v.toFixed(2)) : v;
      }),
    ]);
    downloadCsv(`dappa-compare_${slug(view.rows.map((r) => r.label).join('_'))}`, headers, rows);
    toast.success(`Exported ${view.rows.length} series × ${view.months.length} months`);
  };

  const chip = (label, color, onRemove) => (
    // 40px-tall chip; the remove button stretches to the full chip height so
    // the touch target clears the 40px floor without ballooning the visuals.
    <span key={label} className="chip !pr-0.5 min-h-[40px]">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
      {label}
      <button
        type="button"
        className="ml-0.5 flex min-h-[40px] min-w-[32px] items-center justify-center rounded-full -my-2 text-muted hover:text-ink transition-colors"
        onClick={onRemove}
        aria-label={`Remove ${label} from comparison`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </span>
  );

  return (
    <Card
      title="Compare districts × crime heads"
      subtitle="Small multiples on one aligned monthly window — add up to 4 districts and 3 heads"
      actions={(
        <Tooltip label="Download every compared series as CSV">
          <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!view?.months.length}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
            CSV
          </button>
        </Tooltip>
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {cmpD.map((d) => chip(districtName(d), districtColor(d), () => setList('cmpD', cmpD.filter((x) => x !== d))))}
        {cmpH.map((h) => chip(headName(h), headColor(h), () => setList('cmpH', cmpH.filter((x) => x !== h))))}
        <select
          className="input-dark !py-2 !px-2 text-xs max-w-[11rem] min-h-[40px]"
          value=""
          aria-label="Add district to comparison"
          disabled={lookups.isLoading}
          onChange={(e) => add('cmpD', cmpD, MAX_DISTRICTS, e.target.value, 'districts')}
        >
          <option value="">+ district…</option>
          {districts.filter((d) => !cmpD.includes(d.districtId)).map((d) => (
            <option key={d.districtId} value={d.districtId}>{d.districtName}</option>
          ))}
        </select>
        <select
          className="input-dark !py-2 !px-2 text-xs max-w-[11rem] min-h-[40px]"
          value=""
          aria-label="Add crime head to comparison"
          disabled={lookups.isLoading}
          onChange={(e) => add('cmpH', cmpH, MAX_HEADS, e.target.value, 'crime heads')}
        >
          <option value="">+ crime head…</option>
          {heads.filter((h) => !cmpH.includes(h.crimeHeadId)).map((h) => (
            <option key={h.crimeHeadId} value={h.crimeHeadId}>{h.headName}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-hidden="true">
          {cells.map((c) => <div key={`${c.d}-${c.h}`} className="skeleton h-28" />)}
        </div>
      ) : !view?.rows.length ? (
        <EmptyState compact title="Nothing to compare" message="Add a district or a crime head above to build the grid." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {view.rows.map((r) => (
              <div key={r.key} className="rounded-lg border border-grid bg-base/40 px-3 pt-2.5 pb-2">
                {r.error ? (
                  <p className="text-xs text-muted py-4">{r.label}: {r.error.message}</p>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-ink leading-snug min-w-0 truncate" title={r.label}>{r.label}</p>
                      <StatDelta value={r.deltaPct} positiveIsGood={false} label="3m" className="shrink-0" />
                    </div>
                    <p className="num text-lg font-semibold text-ink mt-0.5">
                      {r.normApplied
                        ? <>{fmtNum((r.total / r.pop) * 100000, 1)}<span className="text-xs text-muted font-normal"> /lakh</span></>
                        : fmtInt(r.total)}
                      <span className="text-[10px] text-muted font-normal ml-1.5">
                        {r.anomalies.length > 0 && (
                          <span style={{ color: anomalyColor }}>⚑ {r.anomalies.length} anomal{r.anomalies.length === 1 ? 'y' : 'ies'}</span>
                        )}
                      </span>
                    </p>
                    <Sparkline values={r.display} anomalies={r.anomalies} color={r.color} anomalyColor={anomalyColor} height={40} className="mt-1.5" />
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3">
            <InsightLine text={view.insight} />
          </div>
        </>
      )}
    </Card>
  );
}
