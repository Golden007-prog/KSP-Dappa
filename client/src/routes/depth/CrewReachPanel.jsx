// Crew reach map + crew ⇄ hotspot overlap board. Reads the MO-derived crews the
// page already computed (useMoAnalysis) and the live hotspot clusters
// (/geo/hotspots): each crew's member districts become a footprint (centroid +
// spread radius = farthest member district), and a hotspot "overlaps" a crew
// when it sits in one of the crew's districts AND its offence matches the
// crew's binding MO signature (token overlap between the cluster's sub-head
// name and the crew's shared tags).
import { useMemo, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import { useHotspots } from '../../lib/api.js';
import { UNITS, normalizeUnitCode } from '../../lib/districtGeoMap.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { haversineKm } from '../geointel/utils.js';
import ArcMap from './ArcMap.jsx';
import { PanelFrame, StatTile } from './DepthBits.jsx';

const byName = new Map(UNITS.map((u) => [u.name.toLowerCase(), u]));
const byId = new Map(UNITS.map((u) => [u.unitId, u]));

/** Crew districts arrive as names (live) or ids (fixture); resolve either. */
function unitOf(token) {
  const s = String(token || '').trim();
  return byName.get(s.toLowerCase()) || byId.get(normalizeUnitCode(s)) || byId.get(s.padStart(4, '0')) || null;
}

const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z]+/).filter((x) => x.length >= 4);

export function crewFootprints(crews, hotspots) {
  return crews.map((c) => {
    const units = (c.districts || []).map(unitOf).filter(Boolean);
    const lat = units.length ? units.reduce((s, u) => s + u.lat, 0) / units.length : null;
    const lng = units.length ? units.reduce((s, u) => s + u.lng, 0) / units.length : null;
    const spreadKm = units.length && lat !== null ? Math.max(0, ...units.map((u) => haversineKm(lat, lng, u.lat, u.lng))) : 0;
    const districtIds = new Set(units.map((u) => normalizeUnitCode(u.unitId)));
    const tagTokens = new Set((c.sharedTags || []).slice(0, 6).flatMap((s) => tokens(s.tag)));
    const inReach = hotspots.filter((h) => districtIds.has(normalizeUnitCode(h.districtId)));
    const matching = inReach.filter((h) => tokens(h.subHeadName).some((tk) => tagTokens.has(tk)));
    return { crew: c, units, lat, lng, spreadKm, inReach, matching };
  });
}

export default function CrewReachPanel({ analysis }) {
  const t = useT();
  const tName = useNames();
  const hotspots = useHotspots();
  const crews = analysis?.crews || [];
  const rows = useMemo(() => crewFootprints(crews.slice(0, 40), hotspots.data || []), [crews, hotspots.data]);
  const [sel, setSel] = useState(null);
  const active = rows.find((r) => r.crew.id === sel) || rows[0] || null;
  const overlapCrews = rows.filter((r) => r.matching.length > 0).length;
  const loading = analysis?.isLoading || hotspots.isLoading;

  const columns = [
    { key: 'crew', label: t('depth.reach.colCrew'), render: (r) => <button type="button" className="text-left text-primary hover:underline min-h-[44px] sm:min-h-0" onClick={() => setSel(r.crew.id)}>{r.crew.sharedTags.slice(0, 2).map((x) => x.tag).join(' + ') || r.crew.id}</button> },
    { key: 'size', label: t('depth.reach.colMembers'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtInt(r.crew.size)}</span> },
    { key: 'districts', label: t('depth.reach.colDistricts'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtInt(r.units.length)}</span> },
    { key: 'spreadKm', label: t('depth.reach.colSpread'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtNum(r.spreadKm, 0)}</span> },
    { key: 'inReach', label: t('depth.reach.colInReach'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtInt(r.inReach.length)}</span> },
    { key: 'matching', label: t('depth.reach.colMatching'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtInt(r.matching.length)}</span> },
    { key: 'status', label: t('depth.reach.colStatus'), render: (r) => <StatusPill status={r.matching.length ? 'rising' : r.inReach.length ? 'watch' : 'stable'} label={t(r.matching.length ? 'depth.reach.overlap' : r.inReach.length ? 'depth.reach.nearby' : 'depth.reach.none')} /> },
  ];
  const tableRows = rows.map((r) => ({ ...r, size: r.crew.size, districts: r.units.length, inReach: r.inReach.length, matching: r.matching.length, id: r.crew.id }));

  return (
    <PanelFrame
      title={t('depth.reach.title')}
      subtitle={t('depth.reach.subtitle', { n: fmtInt(rows.length), h: fmtInt((hotspots.data || []).length) })}
      term="reach"
      termVars={{ n: fmtInt(overlapCrews), total: fmtInt(rows.length) }}
      method={t('depth.reach.method')}
      loading={loading}
      error={analysis?.error || hotspots.error}
      onRetry={() => { analysis?.refetch?.(); hotspots.refetch(); }}
      empty={!loading && rows.length === 0}
      emptyMessage={t('depth.reach.empty')}
    >
      {active && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <StatTile label={t('depth.reach.kpiCrews')} value={fmtInt(rows.length)} />
              <StatTile label={t('depth.reach.kpiOverlap')} value={fmtInt(overlapCrews)} tone={overlapCrews ? 'text-signal' : ''} />
              <StatTile label={t('depth.reach.kpiSpread')} value={t('depth.common.kmN', { n: fmtNum(active.spreadKm, 0) })} hint={active.crew.sharedTags.slice(0, 2).map((x) => x.tag).join(' + ')} />
            </div>
            <ArcMap
              height={240}
              fit="points"
              ariaLabel={t('depth.reach.mapAria', { n: fmtInt(active.units.length) })}
              points={active.units.map((u) => ({ lat: u.lat, lng: u.lng, label: tName('districts', u.unitId, u.name), tone: 'alt', radius: 5 }))}
              circles={[
                ...(active.lat !== null ? [{ lat: active.lat, lng: active.lng, radiusM: Math.max(8000, active.spreadKm * 1000), label: t('depth.reach.spreadLabel', { n: fmtNum(active.spreadKm, 0) }), tone: 'alt' }] : []),
                ...active.matching.slice(0, 20).map((h) => ({ lat: h.centroidLat, lng: h.centroidLng, radiusM: Math.max(1500, h.radiusM * 3), label: h.label })),
              ]}
            />
            {active.matching.length > 0 && (
              <ul className="text-[11px] text-ink space-y-0.5">
                {active.matching.slice(0, 5).map((h) => <li key={h.clusterId}>· {h.label} <span className="text-muted num">({fmtInt(h.caseCount)})</span></li>)}
              </ul>
            )}
          </div>
          <DataTable columns={columns} rows={tableRows} rowKey="id" dense exportable exportFilename="dappa-crew-reach" onRowClick={(r) => setSel(r.id)} />
        </div>
      )}
    </PanelFrame>
  );
}
