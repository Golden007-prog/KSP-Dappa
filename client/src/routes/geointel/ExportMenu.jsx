// CSV export menu for GeoIntel — downloads the currently visible stations,
// hotspots, or incident window as CSV (client-side blob; filename embeds the
// active filters + scrub month). Counts shown per row so an empty export is
// obvious before clicking.
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/ToastProvider.jsx';
import { fmtInt } from '../../lib/format.js';
import { downloadCsv, exportName } from './csv.js';

const STATION_COLS = [
  { key: 'unitId', label: 'unitId' },
  { key: 'unitName', label: 'unitName' },
  { key: 'districtId', label: 'districtId' },
  { key: 'caseCount', label: 'caseCount' },
  { key: 'riskScore', label: 'riskScore' },
  { key: 'lat', label: 'lat' },
  { key: 'lng', label: 'lng' },
];
const HOTSPOT_COLS = [
  { key: 'clusterId', label: 'clusterId' },
  { key: 'label', label: 'label' },
  { key: 'districtId', label: 'districtId' },
  { key: 'caseCount', label: 'caseCount' },
  { key: 'intensity', label: 'intensity' },
  { key: 'radiusM', label: 'radiusM' },
  { key: 'hourBandStart', label: 'hourBandStart' },
  { key: 'hourBandEnd', label: 'hourBandEnd' },
  { key: 'centroidLat', label: 'centroidLat' },
  { key: 'centroidLng', label: 'centroidLng' },
];
const INCIDENT_COLS = [
  { key: 'caseMasterId', label: 'caseMasterId' },
  { key: 'crimeHeadId', label: 'crimeHeadId' },
  { key: 'crimeSubHeadId', label: 'crimeSubHeadId' },
  { key: 'registeredDate', label: 'registeredDate' },
  { key: 'lat', label: 'lat' },
  { key: 'lng', label: 'lng' },
];

export default function ExportMenu({ stations, hotspots, incidents, apiParams, scrubMonth }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const items = [
    { key: 'stations', label: 'Stations', rows: stations, cols: STATION_COLS, month: null },
    { key: 'hotspots', label: 'Hotspots', rows: hotspots, cols: HOTSPOT_COLS, month: null },
    { key: 'incidents', label: scrubMonth ? `Incidents (${scrubMonth})` : 'Incidents (window)', rows: incidents, cols: INCIDENT_COLS, month: scrubMonth },
  ];

  const run = (it) => {
    const name = exportName(it.key, apiParams, it.month);
    downloadCsv(name, it.cols, it.rows || []);
    toast.success(`Exported ${fmtInt((it.rows || []).length)} rows → ${name}.csv`);
    setOpen(false);
  };

  return (
    // static on <md: anchors the menu to the viewport-wide top overlay so it
    // never clips off-screen at narrow widths
    <div ref={rootRef} className="static md:relative">
      <button
        type="button"
        className="btn gi-tap !px-2.5 !py-1.5 text-xs"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        title="Export visible layers as CSV"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        CSV
      </button>
      {open && (
        <div className="pointer-events-auto absolute left-0 right-0 md:left-auto md:right-0 md:w-52 top-full mt-1 z-30 bg-panel border border-grid rounded-xl shadow-lift p-1.5 animate-scale-in">
          {items.map((it) => {
            const n = (it.rows || []).length;
            return (
              <button
                key={it.key}
                type="button"
                disabled={!n}
                className="w-full flex items-center justify-between gap-2 text-left rounded-lg px-2 py-1.5 gi-tap text-xs text-ink hover:bg-grid/30 transition-colors disabled:opacity-45 disabled:pointer-events-none"
                onClick={() => run(it)}
              >
                <span className="truncate">{it.label}</span>
                <span className="num text-[10px] text-muted shrink-0">{fmtInt(n)} rows</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
