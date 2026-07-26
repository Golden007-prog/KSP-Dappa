// Recurring-location panels for the Network Explorer.
//
// The challenge treats locations as entities in their own right, not as a
// column on a case row. Two location classes are modelled here:
//
//   police units    — 359 live units; a unit becomes an entity as soon as the
//                     sampled FIRs put a known suspect in it, and carries its
//                     own suspect roster, crime mix and StationRisk score
//   hotspot clusters— the 17 real HotspotCluster rows, joined to the offenders
//                     whose sampled FIRs were registered in the same district
//
// Two of the panels below (the offender footprint and the community/district
// matrix) do NOT depend on the FIR sample: the first reads the offender's own
// case timeline from GET /offenders/:personKey, the second reads DistrictsJson
// off the registry. They therefore cover far more than the sample and say so.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { fmtInt, fmtNum, fmtPct, dateLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useOffender } from '../../lib/api.js';
import { communityColor } from './graphUtils.js';
import { locationRows, locationAffiliation, communityColocation, communityDistrictMatrix } from './entityGraph.js';
import { downloadCsv } from './download.js';

// Theme-safe heat ramp (see the note in VictimPanels.jsx — the amber token
// changes between themes, so the ramp has to be Tailwind opacity, not rgba).
const heat = (v) => {
  if (!(v > 0)) return '';
  if (v > 0.66) return 'bg-amber/60';
  if (v > 0.33) return 'bg-amber/35';
  return 'bg-amber/15';
};

// ── recurring locations ──────────────────────────────────────────────────────

export function RecurringLocationPanel({ index, activeUnit = '', onPickLocation, riskByUnit = new Map() }) {
  const t = useT();
  const [sort, setSort] = useState('suspects');
  const rows = useMemo(() => {
    const list = locationRows(index, { limit: 60 });
    if (sort === 'cases') return [...list].sort((a, b) => b.cases - a.cases);
    if (sort === 'victims') return [...list].sort((a, b) => b.victims - a.victims);
    if (sort === 'risk') {
      return [...list].sort((a, b) => (riskByUnit.get(b.unitName) ?? -1) - (riskByUnit.get(a.unitName) ?? -1));
    }
    return list;
  }, [index, sort, riskByUnit]);

  const exportCsv = () => {
    downloadCsv(`dappa-network-locations-${new Date().toISOString().slice(0, 10)}.csv`, [
      { key: 'unitName', label: t('network.loc.csv.unit') },
      { key: 'districtName', label: t('network.loc.csv.district') },
      { key: 'suspects', label: t('network.loc.csv.suspects') },
      { key: 'cases', label: t('network.loc.csv.firs') },
      { key: 'victims', label: t('network.loc.csv.victims') },
      { key: 'topHead', label: t('network.loc.csv.topHead') },
      { label: t('network.loc.csv.risk'), map: (r) => riskByUnit.get(r.unitName) ?? '' },
      { key: 'firstSeen', label: t('network.loc.csv.first') },
      { key: 'lastSeen', label: t('network.loc.csv.last') },
    ], rows);
  };

  return (
    <Card
      title={t('network.loc.recurring.title')}
      subtitle={t('network.loc.recurring.subtitle')}
      padded={false}
      actions={(
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted">
            <span className="sr-only">{t('network.loc.recurring.sortAria')}</span>
            <select className="input-dark !py-1 text-[11px]" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('network.loc.recurring.sortAria')}>
              <option value="suspects">{t('network.loc.recurring.sortSuspects')}</option>
              <option value="cases">{t('network.loc.recurring.sortCases')}</option>
              <option value="victims">{t('network.loc.recurring.sortVictims')}</option>
              <option value="risk">{t('network.loc.recurring.sortRisk')}</option>
            </select>
          </label>
          {rows.length > 0 && (
            <button type="button" className="btn-ghost !py-1 !px-2 text-[11px] min-h-[36px]" onClick={exportCsv}>
              {t('network.loc.recurring.csv')}
            </button>
          )}
        </div>
      )}
    >
      {rows.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.loc.recurring.emptyTitle')} message={t('network.loc.recurring.emptyMsg')} />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-grid/50 max-h-[22rem] overflow-y-auto">
            {rows.map((r) => {
              const risk = riskByUnit.get(r.unitName);
              const active = activeUnit === r.unitName;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-2 min-h-[52px] transition-colors ${active ? 'bg-grid/40' : 'hover:bg-grid/30'}`}
                    onClick={() => onPickLocation?.(active ? '' : r.unitName)}
                    aria-pressed={active}
                    title={t('network.loc.recurring.rowHint')}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 rotate-45 bg-amber shrink-0" aria-hidden="true" />
                      <span className="text-xs text-ink truncate min-w-0">{r.unitName}</span>
                      {risk !== undefined && risk !== null && (
                        <Badge tone={risk >= 70 ? 'red' : risk >= 40 ? 'amber' : 'slate'}>
                          {t('network.loc.recurring.risk', { n: fmtNum(risk, 0) })}
                        </Badge>
                      )}
                      <span className="num text-[11px] text-muted ml-auto shrink-0">
                        {t('network.loc.recurring.counts', { s: fmtInt(r.suspects), c: fmtInt(r.cases) })}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted mt-0.5 truncate">
                      {[r.districtName, r.topHead, r.victims ? t('network.loc.recurring.victims', { n: fmtInt(r.victims) }) : ''].filter(Boolean).join(' · ')}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
            {t('network.loc.recurring.footnote')}
          </p>
        </>
      )}
    </Card>
  );
}

// ── offender ↔ location affiliation ──────────────────────────────────────────

export function LocationAffiliationPanel({ index, nodesById, onPickPerson }) {
  const t = useT();
  const rows = useMemo(() => locationAffiliation(index, { limit: 40 }), [index]);
  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);

  return (
    <Card title={t('network.loc.affil.title')} subtitle={t('network.loc.affil.subtitle')} padded={false}>
      {rows.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.loc.affil.emptyTitle')} message={t('network.loc.affil.emptyMsg')} />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-grid/50 max-h-[22rem] overflow-y-auto">
            {rows.map((r) => (
              <li key={r.personKey} className="px-4 py-2 min-h-[48px]">
                <div className="flex items-center gap-2 min-w-0">
                  <button type="button" className="text-xs text-ink truncate min-w-0 hover:text-amber underline-offset-2 hover:underline" onClick={() => onPickPerson?.(r.personKey)}>
                    {nameOf(r.personKey)}
                  </button>
                  <Badge tone={r.share >= 0.75 ? 'teal' : r.share >= 0.4 ? 'amber' : 'slate'}>
                    {r.share >= 0.75 ? t('network.loc.affil.anchored') : r.share >= 0.4 ? t('network.loc.affil.leaning') : t('network.loc.affil.roaming')}
                  </Badge>
                  <span className="num text-[11px] text-amber ml-auto shrink-0">{fmtPct(r.share * 100, { digits: 0 })}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-grid/50 overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-amber/70" style={{ width: `${Math.round(r.share * 100)}%` }} />
                </div>
                <p className="text-[10px] text-muted mt-0.5 truncate">
                  {t('network.loc.affil.line', {
                    unit: r.topUnit,
                    n: fmtInt(r.topCount),
                    total: fmtInt(r.cases),
                    units: fmtInt(r.units),
                  })}
                </p>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
            {t('network.loc.affil.footnote')}
          </p>
        </>
      )}
    </Card>
  );
}

// ── shared turf: two or more groups in one unit ──────────────────────────────

export function ColocationPanel({ index, commOf, edges = [], onPickLocation, activeUnit = '' }) {
  const t = useT();
  const rows = useMemo(
    () => communityColocation(index, commOf, { limit: 25, edges }),
    [index, commOf, edges],
  );

  return (
    <Card title={t('network.loc.shared.title')} subtitle={t('network.loc.shared.subtitle')} padded={false}>
      {rows.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.loc.shared.emptyTitle')} message={t('network.loc.shared.emptyMsg')} />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-grid/50 max-h-[20rem] overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`w-full text-left px-4 py-2 min-h-[48px] transition-colors ${activeUnit === r.unitName ? 'bg-grid/40' : 'hover:bg-grid/30'}`}
                  onClick={() => onPickLocation?.(activeUnit === r.unitName ? '' : r.unitName)}
                  aria-pressed={activeUnit === r.unitName}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-xs text-ink truncate min-w-0">{r.unitName}</span>
                    {r.groups > 1 && (
                      <Badge tone={r.groups > 2 ? 'red' : 'amber'}>{t('network.loc.shared.groups', { n: fmtInt(r.groups) })}</Badge>
                    )}
                    {r.unlinked > 0 && (
                      <Tooltip label={t('network.loc.shared.unlinkedHint')}>
                        <Badge tone="teal">{t('network.loc.shared.unlinked', { n: fmtInt(r.unlinked) })}</Badge>
                      </Tooltip>
                    )}
                    <span className="num text-[10px] text-muted ml-auto shrink-0">
                      {t('network.loc.recurring.counts', { s: fmtInt(r.suspects), c: fmtInt(r.cases) })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {r.groupList.slice(0, 5).map((g) => (
                      <span key={g.communityId} className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: communityColor(g.communityId) }} aria-hidden="true" />
                        #{g.communityId}
                        <span className="num">{fmtInt(g.members)}</span>
                      </span>
                    ))}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
            {t('network.loc.shared.footnote')}
          </p>
        </>
      )}
    </Card>
  );
}

// ── community × district footprint (registry-wide, no sample needed) ─────────

export function CommunityDistrictPanel({ nodes, districtsByPerson, onIsolate }) {
  const t = useT();
  const m = useMemo(
    () => communityDistrictMatrix(nodes, districtsByPerson, { topDistricts: 10 }),
    [nodes, districtsByPerson],
  );

  if (!m.rows.length || !m.districts.length) {
    return (
      <Card title={t('network.loc.matrix.title')} subtitle={t('network.loc.matrix.subtitle')}>
        <EmptyState compact title={t('network.loc.matrix.emptyTitle')} message={t('network.loc.matrix.emptyMsg')} />
      </Card>
    );
  }

  return (
    <Card title={t('network.loc.matrix.title')} subtitle={t('network.loc.matrix.subtitle')} padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] min-w-[32rem]">
          <caption className="sr-only">{t('network.loc.matrix.caption')}</caption>
          <thead>
            <tr className="text-muted text-[10px] uppercase tracking-wide">
              <th scope="col" className="text-left font-normal px-4 py-1.5">{t('network.loc.matrix.group')}</th>
              {m.districts.map((d) => (
                <th key={d} scope="col" className="font-normal px-1.5 py-1.5 text-right whitespace-nowrap max-w-[5rem] truncate" title={d}>
                  {d.length > 10 ? `${d.slice(0, 9)}…` : d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-grid/40">
            {m.rows.slice(0, 12).map((r) => (
              <tr key={r.communityId}>
                <th scope="row" className="text-left font-normal px-4 py-1.5">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-ink hover:text-amber"
                    onClick={() => onIsolate?.(r.communityId)}
                    title={t('network.loc.matrix.isolateHint')}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: communityColor(r.communityId) }} aria-hidden="true" />
                    #{r.communityId}
                  </button>
                </th>
                {r.cells.map((v, i) => (
                  <td
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${r.communityId}-${i}`}
                    className={`num text-right px-1.5 py-1.5 ${v ? 'text-ink' : 'text-muted/40'} ${heat(v / m.max)}`}
                    title={`#${r.communityId} · ${m.districts[i]}: ${fmtInt(v)}`}
                  >
                    {v ? fmtInt(v) : '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
        {t('network.loc.matrix.footnote')}
      </p>
    </Card>
  );
}

// ── one offender's location footprint (independent of the FIR sample) ────────

export function LocationFootprintPanel({ personKey, personName, onOpenUnit }) {
  const t = useT();
  const q = useOffender(personKey);

  const rows = useMemo(() => {
    const timeline = q.data?.timeline || [];
    const byUnit = new Map();
    for (const c of timeline) {
      const u = String(c.unitName || '').trim();
      if (!u) continue;
      let r = byUnit.get(u);
      if (!r) { r = { unitName: u, cases: 0, first: '', last: '', heads: new Set() }; byUnit.set(u, r); }
      r.cases += 1;
      if (c.headName) r.heads.add(c.headName);
      const d = c.registeredDate || '';
      if (d) {
        if (!r.first || d < r.first) r.first = d;
        if (!r.last || d > r.last) r.last = d;
      }
    }
    const total = timeline.length;
    return {
      total,
      units: [...byUnit.values()]
        .map((r) => ({ ...r, heads: [...r.heads], share: total ? r.cases / total : 0 }))
        .sort((a, b) => b.cases - a.cases || a.unitName.localeCompare(b.unitName)),
    };
  }, [q.data]);

  if (!personKey) return null;

  return (
    <Card
      title={t('network.loc.footprint.title')}
      subtitle={t('network.loc.footprint.subtitle', { name: personName || personKey })}
      padded={false}
      actions={rows.units.length > 1 ? <Badge tone="amber">{t('network.loc.footprint.units', { n: fmtInt(rows.units.length) })}</Badge> : null}
    >
      {q.isLoading ? (
        <div className="px-4 py-3"><LoadingSkeleton lines={4} /></div>
      ) : q.error ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.loc.footprint.errorTitle')} message={q.error.message} />
        </div>
      ) : rows.units.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.loc.footprint.emptyTitle')} message={t('network.loc.footprint.emptyMsg')} />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-grid/50 max-h-[18rem] overflow-y-auto">
            {rows.units.map((u) => (
              <li key={u.unitName} className="px-4 py-2 min-h-[44px]">
                <div className="flex items-center gap-2 min-w-0">
                  <button type="button" className="text-xs text-ink truncate min-w-0 hover:text-amber underline-offset-2 hover:underline" onClick={() => onOpenUnit?.(u.unitName)}>
                    {u.unitName}
                  </button>
                  {u.cases > 1 && <Badge tone="amber">{t('network.loc.footprint.recurring', { n: fmtInt(u.cases) })}</Badge>}
                  <span className="num text-[11px] text-muted ml-auto shrink-0">{fmtPct(u.share * 100, { digits: 0 })}</span>
                </div>
                <p className="text-[10px] text-muted mt-0.5 truncate">
                  {[u.heads.slice(0, 2).join(', '), u.first && u.last && u.first !== u.last
                    ? `${dateLabel(u.first)} → ${dateLabel(u.last)}`
                    : dateLabel(u.first)].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
            {t('network.loc.footprint.footnote', { n: fmtInt(rows.total) })}
          </p>
        </>
      )}
    </Card>
  );
}

// ── hotspot clusters as location entities ────────────────────────────────────

export function HotspotEntityPanel({ hotspots = [], loading = false, districtNameById = new Map(), index }) {
  const t = useT();

  // Sampled FIRs give each cluster's district a live suspect roster: the people
  // in this view whose sampled cases were registered in the same district.
  const suspectsByDistrict = useMemo(() => {
    const m = new Map();
    if (!index) return m;
    for (const c of index.caseById.values()) {
      const d = c.districtName;
      if (!d) continue;
      if (!m.has(d)) m.set(d, new Set());
      const set = m.get(d);
      for (const pk of c.suspects) set.add(pk);
    }
    return m;
  }, [index]);

  const rows = useMemo(() => hotspots.map((h) => {
    const districtName = districtNameById.get(String(h.districtId)) || '';
    return {
      clusterId: h.clusterId,
      label: h.label || h.subHeadName || h.clusterId,
      subHeadName: h.subHeadName || '',
      districtName,
      caseCount: Number(h.caseCount) || 0,
      intensity: Number(h.intensity) || 0,
      radiusM: Number(h.radiusM) || 0,
      band: [h.hourBandStart, h.hourBandEnd],
      linkedSuspects: (suspectsByDistrict.get(districtName) || new Set()).size,
    };
  }).sort((a, b) => b.linkedSuspects - a.linkedSuspects || b.intensity - a.intensity), [hotspots, districtNameById, suspectsByDistrict]);

  return (
    <Card title={t('network.loc.hotspot.title')} subtitle={t('network.loc.hotspot.subtitle')} padded={false}>
      {loading ? (
        <div className="px-4 py-3"><LoadingSkeleton lines={4} /></div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.loc.hotspot.emptyTitle')} message={t('network.loc.hotspot.emptyMsg')} />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-grid/50 max-h-[20rem] overflow-y-auto">
            {rows.map((r) => (
              <li key={r.clusterId} className="px-4 py-2 min-h-[48px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-ink truncate min-w-0">{r.subHeadName || r.label}</span>
                  {r.linkedSuspects > 0 && (
                    <Tooltip label={t('network.loc.hotspot.linkedHint')}>
                      <Badge tone="teal">{t('network.loc.hotspot.linked', { n: fmtInt(r.linkedSuspects) })}</Badge>
                    </Tooltip>
                  )}
                  <span className="num text-[11px] text-muted ml-auto shrink-0">{t('network.loc.hotspot.cases', { n: fmtInt(r.caseCount) })}</span>
                </div>
                <p className="text-[10px] text-muted mt-0.5 truncate">
                  {[r.districtName,
                    Number.isFinite(r.band[0]) ? t('network.loc.hotspot.band', { a: String(r.band[0]).padStart(2, '0'), b: String(r.band[1]).padStart(2, '0') }) : '',
                    r.radiusM ? t('network.loc.hotspot.radius', { n: fmtInt(r.radiusM) }) : ''].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
            {t('network.loc.hotspot.footnote')}
          </p>
        </>
      )}
    </Card>
  );
}
