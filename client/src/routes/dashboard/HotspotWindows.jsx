// Hotspot windows — top spatiotemporal clusters (where AND when) from
// /geo/hotspots: rank, sub-head label, police unit, active hour band chip and
// a relative intensity bar. Rows deep-link into GeoIntel with the cluster's
// district merged into the current filters.
// Props: query (useHotspots result), linkSearch, onDrill?(polygonName).
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { unitInfo } from '../../lib/districtGeoMap.js';
import { fmtInt } from '../../lib/format.js';
import { hourBandLabel } from './insights.js';

const SHOW = 6;
const isNight = (h) => Number(h) >= 20 || Number(h) < 6;

export default function HotspotWindows({ query, linkSearch = '' }) {
  const top = useMemo(
    () => [...(query.data || [])]
      .sort((a, b) => (Number(b.intensity) || 0) - (Number(a.intensity) || 0))
      .slice(0, SHOW),
    [query.data],
  );
  const nightCount = useMemo(
    () => (query.data || []).filter((h) => isNight(h.hourBandStart)).length,
    [query.data],
  );

  if (query.isLoading) return <LoadingSkeleton lines={6} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title="Couldn't load hotspots"
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>Retry</button>}
      />
    );
  }
  if (!top.length) {
    return <EmptyState compact title="No hotspot clusters" message="No spatiotemporal clusters for the current window." />;
  }

  const maxIntensity = Math.max(1e-9, ...top.map((h) => Number(h.intensity) || 0));

  const linkTo = (districtId) => {
    const qs = new URLSearchParams(linkSearch ? linkSearch.slice(1) : '');
    if (districtId) qs.set('districtId', districtId);
    const s = qs.toString();
    return `/map${s ? `?${s}` : ''}`;
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted">
        <span className="num text-ink">{fmtInt((query.data || []).length)}</span> clusters ·{' '}
        <span className="num text-ink">{fmtInt(nightCount)}</span> active at night (20:00–06:00)
      </p>
      <ol className="divide-y divide-grid/50">
        {top.map((h, i) => {
          const band = hourBandLabel(h.hourBandStart, h.hourBandEnd);
          const unit = unitInfo(h.districtId);
          const t = (Number(h.intensity) || 0) / maxIntensity;
          return (
            <li key={h.clusterId || i}>
              <Link
                to={linkTo(h.districtId)}
                title="Open this cluster's district in GeoIntel"
                className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-grid/30"
              >
                <span className="num w-5 shrink-0 text-center text-[11px] text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-ink">{h.subHeadName || h.label || 'Cluster'}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="truncate text-[10px] text-muted">{unit?.name || h.districtId || '—'}</span>
                    <span className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-grid/50" aria-hidden="true">
                      <span className="block h-full rounded-full bg-signal/80" style={{ width: `${Math.max(8, Math.round(t * 100))}%` }} />
                    </span>
                  </span>
                </span>
                {band && (
                  <Badge tone={isNight(h.hourBandStart) ? 'red' : 'amber'} className="shrink-0">
                    {band}
                  </Badge>
                )}
                <span className="num shrink-0 text-xs text-muted">{fmtInt(h.caseCount)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="text-[10px] text-muted">Ranked by cluster intensity · red band = night-active · tap to open in GeoIntel</p>
    </div>
  );
}
