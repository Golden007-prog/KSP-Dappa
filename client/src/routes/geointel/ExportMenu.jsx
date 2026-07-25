// Export menu for GeoIntel — downloads the currently visible stations,
// hotspots, or incident window as CSV or as a GeoJSON FeatureCollection
// (client-side blob; filename embeds the active filters + scrub month).
// Counts shown per row so an empty export is obvious before clicking.
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/ToastProvider.jsx';
import { fmtInt } from '../../lib/format.js';
import { downloadCsv, exportName } from './csv.js';
import { buildFeatureCollection, downloadGeoJson } from './geo.js';
import { useT } from '../../lib/i18n.jsx';

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
  const t = useT();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const incidentLabel = scrubMonth
    ? t('geointel.export.incidentsMonth', { month: scrubMonth })
    : t('geointel.export.incidentsWindow');
  const items = [
    { key: 'stations', label: t('geointel.export.stations'), rows: stations, cols: STATION_COLS, month: null },
    { key: 'hotspots', label: t('geointel.export.hotspots'), rows: hotspots, cols: HOTSPOT_COLS, month: null },
    { key: 'incidents', label: incidentLabel, rows: incidents, cols: INCIDENT_COLS, month: scrubMonth },
  ];
  const geoItems = [
    { key: 'gj-hotspots', kind: 'hotspots', label: t('geointel.export.hotspots'), rows: hotspots, month: null },
    { key: 'gj-stations', kind: 'stations', label: t('geointel.export.stations'), rows: stations, month: null },
    { key: 'gj-incidents', kind: 'incidents', label: incidentLabel, rows: incidents, month: scrubMonth },
  ];

  const run = (it) => {
    const name = exportName(it.key, apiParams, it.month);
    downloadCsv(name, it.cols, it.rows || []);
    toast.success(t('geointel.export.doneCsv', { n: fmtInt((it.rows || []).length), name }));
    setOpen(false);
  };

  const runGeo = (it) => {
    const fc = buildFeatureCollection(it.kind, it.rows || []);
    const name = exportName(it.kind, apiParams, it.month);
    downloadGeoJson(name, fc);
    toast.success(t('geointel.export.doneGeo', { n: fmtInt(fc.features.length), name }));
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
        title={t('geointel.export.title')}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        {t('geointel.export.csv')}
      </button>
      {open && (
        <div className="pointer-events-auto absolute left-0 right-0 md:left-auto md:right-0 md:w-52 top-full mt-1 z-30 bg-panel border border-grid rounded-xl shadow-lift p-1.5 animate-scale-in">
          <p className="px-2 pt-0.5 pb-0.5 text-[9px] uppercase tracking-wider text-muted">{t('geointel.export.csv')}</p>
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
                <span className="num text-[10px] text-muted shrink-0">{t('geointel.export.rows', { n: fmtInt(n) })}</span>
              </button>
            );
          })}
          <p className="px-2 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-muted border-t border-grid/60 mt-1">
            {t('geointel.export.geojson')} <span className="normal-case">{t('geointel.export.geojsonHint')}</span>
          </p>
          {geoItems.map((it) => {
            const n = (it.rows || []).length;
            return (
              <button
                key={it.key}
                type="button"
                disabled={!n}
                className="w-full flex items-center justify-between gap-2 text-left rounded-lg px-2 py-1.5 gi-tap text-xs text-ink hover:bg-grid/30 transition-colors disabled:opacity-45 disabled:pointer-events-none"
                onClick={() => runGeo(it)}
              >
                <span className="truncate">{it.label}</span>
                <span className="num text-[10px] text-muted shrink-0">{t('geointel.export.pts', { n: fmtInt(n) })}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
