// /reports — per-section CSV downloads for the brief tables (alerts, hotspots,
// risk stations). Reuses the alerts CSV/blob helpers (same owner) and the
// select.js ordering so files match what the brief prints. Each export returns
// the row count (0 → caller shows a "nothing to export" toast).
import { toCsv, downloadBlob } from '../alerts/csv.js';
import { selectOpenAlerts, selectTopHotspots, selectRiskRows } from './select.js';

const stamp = () => new Date().toISOString().slice(0, 10);

const SECTIONS = {
  alerts: {
    columns: [
      { key: 'districtName', label: 'District' },
      { key: 'headName', label: 'Crime head' },
      { key: 'narrative', label: 'Narrative' },
      { key: 'observed', label: 'Observed' },
      { key: 'expected', label: 'Expected' },
      { key: 'zScore', label: 'z-score' },
      { key: 'severity', label: 'Severity' },
      { key: 'periodStart', label: 'Period start' },
      { key: 'periodEnd', label: 'Period end' },
      { key: 'status', label: 'Status' },
    ],
    rows: (brief) => selectOpenAlerts(brief, Infinity).map((a) => ({
      ...a,
      districtName: a.districtName || a.districtId || '',
      headName: a.headName || '',
    })),
  },
  hotspots: {
    columns: [
      { key: 'label', label: 'Hotspot' },
      { key: 'subHeadName', label: 'Crime subhead' },
      { key: 'districtId', label: 'District unit' },
      { key: 'hourBandStart', label: 'Hour band start' },
      { key: 'hourBandEnd', label: 'Hour band end' },
      { key: 'caseCount', label: 'Cases' },
      { key: 'intensity', label: 'Intensity' },
    ],
    rows: (brief) => selectTopHotspots(brief, Infinity).map((h) => ({
      ...h,
      label: h.label || `Cluster ${h.clusterId}`,
    })),
  },
  risk: {
    columns: [
      { key: 'unitName', label: 'Station' },
      { key: 'unitId', label: 'Unit ID' },
      { key: 'riskScore', label: 'Risk score' },
      { key: 'drivers', label: 'Drivers' },
    ],
    rows: (brief) => selectRiskRows(brief, Infinity).map((s) => ({
      ...s,
      unitName: s.unitName || s.unitId || '',
      drivers: Array.isArray(s.drivers) ? s.drivers.join('; ') : (s.drivers || ''),
    })),
  },
};

/** Download one brief section as CSV; returns the number of data rows (0 = nothing). */
export function exportSectionCsv(section, brief) {
  const spec = SECTIONS[section];
  if (!spec) return 0;
  const rows = spec.rows(brief);
  if (!rows.length) return 0;
  downloadBlob(`dappa-brief-${section}-${stamp()}.csv`, toCsv(spec.columns, rows));
  return rows.length;
}
