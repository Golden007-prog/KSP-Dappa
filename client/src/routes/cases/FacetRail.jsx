// Faceted filter rail with LIVE counts.
//
// Every count here is an exact server count, not a guess off the scanned page:
// each facet value fires GET /cases with the current filters plus that value and
// perPage=1, then reads meta.total. One row on the wire per facet, so the rail
// costs ~12–19 tiny requests and stays truthful against all 45,000 FIRs.
//
// Facets are the dimensions the API can actually filter on (crime head, gravity,
// and — once a head is picked — its subheads). Client-only refinements (status,
// text, age) deliberately have no facet: their counts would be scan-bounded and
// would lie about the corpus.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, prune, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { readJson, writeJson } from './explorerState.js';

const STORAGE_KEY = 'dappa-cases-facets';
const CHUNK = 4;

/**
 * Resolve one facet value's exact match count (meta.total of a 1-row page).
 * A burst of parallel probes occasionally drops one on the Catalyst dev tier —
 * observed live — so a single miss is retried rather than failing the rail.
 */
async function countFor(params, signal) {
  const read = async () => {
    const r = await apiGet('/cases', { ...params, page: 1, perPage: 1 }, { signal });
    const n = Number(r.meta?.total);
    return Number.isFinite(n) ? n : 0;
  };
  try {
    return await read();
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    return read();
  }
}

/** Run the count probes a few at a time — parallel, but not a thundering herd. */
async function countAll(jobs, signal) {
  const out = [];
  for (let i = 0; i < jobs.length; i += CHUNK) {
    // eslint-disable-next-line no-await-in-loop
    const slice = await Promise.all(jobs.slice(i, i + CHUNK).map((j) => countFor(j.params, signal)));
    slice.forEach((count, k) => out.push({ ...jobs[i + k], count }));
  }
  return out;
}

function Row({ label, count, max, active, onClick, title }) {
  const pct = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`relative block w-full overflow-hidden rounded-md border px-2 py-1.5 text-left transition-colors min-h-[38px] ${
        active ? 'border-amber/60 text-amber bg-amber/10' : 'border-grid/60 text-ink hover:border-amber/40 hover:text-amber'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 ${active ? 'bg-amber/25' : 'bg-grid/50'}`}
        style={{ width: `${pct}%` }}
      />
      <span className="relative flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{label}</span>
        <span className="num shrink-0 tabular-nums">{fmtInt(count)}</span>
      </span>
    </button>
  );
}

/**
 * props:
 *   params  — the server filter params currently in force (districtId/unitId/from/to/…)
 *   values  — {crimeHeadId, crimeSubHeadId, gravityId} as selected
 *   onApply — setMany({crimeHeadId|crimeSubHeadId|gravityId})
 */
export default function FacetRail({ params = {}, values = {}, onApply }) {
  const t = useT();
  const tName = useNames();
  const lookups = useLookups();
  const lk = lookups.data;
  const [open, setOpen] = useState(() => readJson(STORAGE_KEY, true) !== false);

  const heads = lk?.crimeHeads || [];
  const gravities = lk?.gravities || [];
  // /meta/lookups returns subheads keyed `headId`, which api.js does not map onto
  // crimeHeadId — the id convention (head*100 + n) is the reliable parent link.
  const subHeads = useMemo(
    () => (lk?.crimeSubHeads || []).filter((s) => !values.crimeHeadId
      || Math.floor(Number(s.crimeSubHeadId) / 100) === Number(values.crimeHeadId)),
    [lk, values.crimeHeadId],
  );

  const jobs = useMemo(() => {
    if (!heads.length) return [];
    const base = { ...params };
    delete base.crimeHeadId;
    delete base.crimeSubHeadId;
    delete base.gravityId;
    const list = heads.map((h) => ({
      group: 'head', id: String(h.crimeHeadId), name: h.headName,
      params: { ...base, gravityId: params.gravityId, crimeHeadId: h.crimeHeadId },
    }));
    for (const g of gravities) {
      list.push({
        group: 'gravity', id: String(g.id), name: g.name,
        params: {
          ...base, gravityId: g.id,
          crimeHeadId: params.crimeHeadId, crimeSubHeadId: params.crimeSubHeadId,
        },
      });
    }
    if (values.crimeHeadId) {
      for (const s of subHeads) {
        list.push({
          group: 'subHead', id: String(s.crimeSubHeadId), name: s.subHeadName,
          params: { ...base, gravityId: params.gravityId, crimeSubHeadId: s.crimeSubHeadId },
        });
      }
    }
    return list.map((j) => ({ ...j, params: prune(j.params) }));
  }, [heads, gravities, subHeads, params, values.crimeHeadId]);

  const facets = useQuery({
    queryKey: ['cases-facets', jobs.map((j) => `${j.group}:${j.id}`).join(','), prune(params)],
    enabled: open && jobs.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
    queryFn: ({ signal }) => countAll(jobs, signal),
  });

  const toggle = () => setOpen((o) => { writeJson(STORAGE_KEY, !o); return !o; });

  const groups = useMemo(() => {
    const rows = facets.data || [];
    const pick = (g) => rows.filter((r) => r.group === g).sort((a, b) => b.count - a.count);
    return { head: pick('head'), gravity: pick('gravity'), subHead: pick('subHead') };
  }, [facets.data]);

  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3 -my-1.5">
          <p className="text-xs text-muted truncate">{t('cases.facet.collapsed')}</p>
          <button type="button" className="btn !py-1 !px-2 text-xs shrink-0" onClick={toggle} aria-expanded={false}>
            {t('cases.profile.show')}
          </button>
        </div>
      </Card>
    );
  }

  const section = (key, titleKey, items, activeId, apply) => {
    if (!items.length) return null;
    const max = items.reduce((m, r) => Math.max(m, r.count), 0);
    return (
      <div key={key} className="min-w-0">
        <p className="eyebrow mb-1.5">{t(titleKey)}</p>
        <div className="space-y-1">
          {items.map((r) => {
            const label = key === 'gravity'
              ? tName('gravities', r.id, r.name)
              : key === 'head'
                ? tName('crimeHeads', r.id, r.name)
                : tName('crimeSubHeads', r.id, r.name);
            const active = String(activeId || '') === r.id;
            return (
              <Row
                key={r.id}
                label={label}
                count={r.count}
                max={max}
                active={active}
                title={t(active ? 'cases.facet.clear' : 'cases.facet.apply', { name: label, n: fmtInt(r.count) })}
                onClick={() => apply(active ? '' : r.id)}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card
      title={t('cases.facet.title')}
      subtitle={t('cases.facet.subtitle')}
      actions={(
        <div className="flex items-center gap-2">
          {facets.isFetching && <span className="text-[11px] text-muted">{t('cases.facet.counting')}</span>}
          <Tooltip label={t('cases.facet.tip')}>
            <span className="eyebrow cursor-help underline decoration-dotted underline-offset-2">{t('cases.facet.exact')}</span>
          </Tooltip>
          <button type="button" className="btn !py-1 !px-2 text-xs" onClick={toggle} aria-expanded>
            {t('cases.profile.hide')}
          </button>
        </div>
      )}
    >
      {facets.error ? (
        <p className="text-xs text-muted">
          {t('cases.facet.error')}
          <button type="button" className="btn-ghost !py-0.5 !px-1.5 text-xs ml-2" onClick={() => facets.refetch()}>
            {t('common.action.retry')}
          </button>
        </p>
      ) : facets.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-md" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {section('head', 'cases.facet.heads', groups.head, values.crimeHeadId, (v) => onApply({ crimeHeadId: v }))}
          {section('subHead', 'cases.facet.subHeads', groups.subHead, values.crimeSubHeadId, (v) => onApply({ crimeSubHeadId: v }))}
          {section('gravity', 'cases.facet.gravities', groups.gravity, values.gravityId, (v) => onApply({ gravityId: v }))}
        </div>
      )}
    </Card>
  );
}
