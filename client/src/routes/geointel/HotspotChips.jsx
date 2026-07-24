// Hotspot chips row — top clusters ranked by intensity, each with a rank
// number and a relative score bar. Clicking a chip flies the map to the
// cluster and opens its hour-band annotation popup.
import { unitInfo } from '../../lib/districtGeoMap.js';
import { fmtInt } from '../../lib/format.js';
import { hourBand } from './utils.js';

export default function HotspotChips({ hotspots, loading, error, onRetry, onSelect, selectedId }) {
  if (error) {
    return (
      <div className="pointer-events-auto chip self-start !border-signal/50 bg-panel/95 text-signal shadow-lg">
        Hotspots failed to load
        <button type="button" className="underline ml-1 hover:text-ink transition-colors" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex gap-1.5 self-start" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton h-7 w-36 rounded-full" />
        ))}
      </div>
    );
  }
  if (!hotspots.length) return null;
  const maxIntensity = Math.max(1e-9, ...hotspots.map((h) => Number(h.intensity) || 0));
  return (
    <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 max-w-full" role="list" aria-label="Top hotspots">
      {hotspots.map((h, i) => {
        const band = hourBand(h.hourBandStart, h.hourBandEnd);
        const district = unitInfo(h.districtId)?.name;
        const selected = selectedId != null && String(h.clusterId) === String(selectedId);
        const score = Math.max(0.08, (Number(h.intensity) || 0) / maxIntensity);
        return (
          <button
            key={h.clusterId}
            type="button"
            role="listitem"
            onClick={() => onSelect(h)}
            title={`Fly to hotspot · intensity ${h.intensity}${band ? ` · active ${band}` : ''}`}
            className={`chip shrink-0 bg-panel/95 shadow-lg transition-colors ${
              selected ? '!border-amber/70 !text-amber' : 'hover:border-amber/50'
            }`}
          >
            <span className="num text-[10px] text-muted">#{i + 1}</span>
            <span className="truncate max-w-[9rem]">{h.label || h.subHeadName || `Cluster ${h.clusterId}`}</span>
            {district && <span className="text-muted hidden sm:inline">· {district}</span>}
            <span className="num text-muted">{fmtInt(h.caseCount)}</span>
            <span className="h-1 w-9 rounded-full bg-grid overflow-hidden shrink-0" aria-hidden="true">
              <span
                className={`block h-full rounded-full ${score >= 0.66 ? 'bg-signal' : 'bg-amber'}`}
                style={{ width: `${Math.round(score * 100)}%` }}
              />
            </span>
            {band && <span className="num text-amber/80 hidden sm:inline">{band}</span>}
          </button>
        );
      })}
    </div>
  );
}
