// Hotspot cluster drill for the GeoIntel side panel: cluster KPIs (cases /
// intensity / radius), the peak hour band, a 24-hour activity histogram from
// the host district's seasonality (band hours highlighted), the nearest
// station with haversine distance + jump-to-drill, an incidents-within-radius
// readout against the loaded incident window, and a one-click single-cluster
// GeoJSON export.
import { useMemo } from 'react';
import { useToast } from '../../components/ToastProvider.jsx';
import { normalizeUnitCode, unitInfo } from '../../lib/districtGeoMap.js';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { useSeasonalityForUnits } from './hooks.js';
import { haversineKm, hourBand, hourInBand, hourLabel } from './utils.js';
import { buildFeatureCollection, downloadGeoJson } from './geo.js';
import { PanelHeader } from './SidePanel.jsx';
import { hourBucketLabel } from './HourScrubber.jsx';

/** 24 bars, band hours amber, off-band hours muted; tooltip per hour. */
function HourHistogram({ hourly, bandStart, bandEnd }) {
  const max = Math.max(1, ...hourly);
  return (
    <div>
      <div
        className="flex items-end gap-px h-12"
        role="img"
        aria-label="Incident activity by hour of day for this district; the cluster's peak band is highlighted"
      >
        {hourly.map((v, h) => {
          const inBand = hourInBand(bandStart, bandEnd, h);
          return (
            <span
              key={h}
              className={`flex-1 min-w-[2px] rounded-t-[1px] ${inBand ? 'bg-amber' : 'bg-grid'}`}
              style={{ height: `${Math.max(4, Math.round((v / max) * 100))}%`, opacity: inBand ? 1 : 0.55 }}
              title={`${hourLabel(h)} — ${fmtInt(v)} incidents${inBand ? ' · inside peak band' : ''}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[8px] text-muted num pt-0.5">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </div>
  );
}

export default function HotspotPanel({
  hotspot, apiParams, incidentRows = [], stations = [], headNames = {}, onStationSelect, onBack, onClose,
}) {
  const toast = useToast();
  const lat = Number(hotspot.centroidLat);
  const lng = Number(hotspot.centroidLng);
  const radiusKm = Math.max(0.3, (Number(hotspot.radiusM) || 0) / 1000);
  const band = hourBand(hotspot.hourBandStart, hotspot.hourBandEnd);
  const district = unitInfo(hotspot.districtId);

  const unitIds = useMemo(() => {
    const c = normalizeUnitCode(hotspot.districtId);
    return c ? [c] : [];
  }, [hotspot.districtId]);
  const seasParams = useMemo(
    () => (apiParams.crimeHeadId ? { crimeHeadId: apiParams.crimeHeadId } : {}),
    [apiParams.crimeHeadId],
  );
  const seas = useSeasonalityForUnits(unitIds, seasParams);
  const hourly = useMemo(() => {
    if (!seas.matrix.length || !seas.max) return [];
    return seas.hours.map((h) => seas.matrix.reduce((a, row) => a + (Number(row[h]) || 0), 0));
  }, [seas.matrix, seas.hours, seas.max]);

  const nearest = useMemo(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    let best = null;
    let bestKm = Infinity;
    for (const s of stations) {
      const sl = Number(s.lat);
      const sn = Number(s.lng);
      if (!Number.isFinite(sl) || !Number.isFinite(sn)) continue;
      const d = haversineKm(lat, lng, sl, sn);
      if (d < bestKm) { bestKm = d; best = s; }
    }
    return best ? { station: best, km: bestKm } : null;
  }, [stations, lat, lng]);

  const within = useMemo(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    let count = 0;
    const heads = {};
    for (const r of incidentRows) {
      if (haversineKm(lat, lng, r.lat, r.lng) <= radiusKm) {
        count += 1;
        const k = String(r.crimeHeadId ?? '');
        heads[k] = (heads[k] || 0) + 1;
      }
    }
    let topHead = null;
    let topN = 0;
    for (const [k, n] of Object.entries(heads)) {
      if (n > topN) { topN = n; topHead = k; }
    }
    return {
      count,
      topHead: topHead ? headNames[topHead] || `Head ${topHead}` : null,
      topN,
    };
  }, [incidentRows, lat, lng, radiusKm, headNames]);

  const exportCluster = () => {
    const fc = buildFeatureCollection('hotspots', [hotspot]);
    const name = `geointel_cluster_${hotspot.clusterId ?? 'x'}`;
    downloadGeoJson(name, fc);
    toast.success(`Exported cluster → ${name}.geojson`);
  };

  return (
    <>
      <PanelHeader
        title={hotspot.label || hotspot.subHeadName || `Cluster ${hotspot.clusterId ?? '—'}`}
        subtitle={`Hotspot cluster${district ? ` · ${district.name}` : ''}`}
        onBack={onBack}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-grid bg-base/40 p-2">
            <p className="text-[9px] uppercase tracking-wider text-muted">Cases</p>
            <p className="num text-base font-semibold text-ink">{fmtInt(hotspot.caseCount)}</p>
          </div>
          <div className="rounded-lg border border-grid bg-base/40 p-2">
            <p className="text-[9px] uppercase tracking-wider text-muted">Intensity</p>
            <p className="num text-base font-semibold text-amber">{fmtNum(hotspot.intensity, 2)}</p>
          </div>
          <div className="rounded-lg border border-grid bg-base/40 p-2">
            <p className="text-[9px] uppercase tracking-wider text-muted">Radius</p>
            <p className="num text-base font-semibold text-ink">{fmtNum(radiusKm, 1)}<span className="text-[9px] text-muted font-normal"> km</span></p>
          </div>
        </div>

        {band && (
          <p className="text-[11px] text-muted">
            Peak activity <span className="chip !py-0.5 num text-amber">{band}</span>
            {' '}<span className="text-muted">({hourBucketLabel(hotspot.hourBandStart)} band)</span>
          </p>
        )}

        {hourly.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">District activity by hour</p>
            <HourHistogram hourly={hourly} bandStart={hotspot.hourBandStart} bandEnd={hotspot.hourBandEnd} />
          </div>
        )}

        {nearest && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Nearest station</p>
            <button
              type="button"
              onClick={() => onStationSelect(nearest.station)}
              className="w-full text-left rounded-lg border border-grid bg-base/40 hover:border-amber/50 px-2.5 py-2 transition-colors"
              title="Open this station's drill"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink truncate">{nearest.station.unitName || `Unit ${nearest.station.unitId}`}</span>
                <span className="num text-[11px] text-amber shrink-0">
                  {nearest.km < 10 ? nearest.km.toFixed(2) : nearest.km.toFixed(1)} km
                </span>
              </div>
              <p className="text-[10px] text-muted">Closest response unit to the cluster centroid</p>
            </button>
          </div>
        )}

        {within && (
          <div className="rounded-lg border border-grid bg-base/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">Inside the cluster radius</p>
            <p className="text-xs text-ink mt-0.5">
              <span className="num font-semibold">{fmtInt(within.count)}</span> incidents in the loaded window
              {within.topHead && (
                <span className="text-muted"> · mostly {within.topHead} ({fmtInt(within.topN)})</span>
              )}
            </p>
            <p className="text-[9px] text-muted mt-0.5">Counted from the incident layer currently on the map.</p>
          </div>
        )}

        <button type="button" className="btn gi-tap text-xs" onClick={exportCluster}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Export cluster as GeoJSON
        </button>
      </div>
    </>
  );
}
