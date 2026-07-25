// /reports — per-section CSV downloads for the brief tables (alerts, hotspots,
// risk stations). Reuses the alerts CSV/blob helpers (same owner) and the
// select.js ordering so files match what the brief prints. Each export returns
// the row count (0 → caller shows a "nothing to export" toast).
// Column headers follow the active UI language; the data keys never do.
import { toCsv, downloadBlob } from '../alerts/csv.js';
import { translate } from '../../lib/i18n.jsx';
import { selectOpenAlerts, selectTopHotspots, selectRiskRows, hotspotLabel } from './select.js';

const en = (key, vars) => translate('en', key, vars);
const passThrough = (_kind, _id, fallback) => fallback || '';

const stamp = () => new Date().toISOString().slice(0, 10);

const SECTIONS = {
  alerts: {
    columns: (t) => [
      { key: 'districtName', label: t('alerts.csvCol.district') },
      { key: 'headName', label: t('alerts.csvCol.crimeHead') },
      { key: 'narrative', label: t('alerts.csvCol.narrative') },
      { key: 'observed', label: t('alerts.csvCol.observed') },
      { key: 'expected', label: t('alerts.csvCol.expected') },
      { key: 'zScore', label: t('alerts.csvCol.zScore') },
      { key: 'severity', label: t('alerts.csvCol.severity') },
      { key: 'periodStart', label: t('alerts.csvCol.periodStart') },
      { key: 'periodEnd', label: t('alerts.csvCol.periodEnd') },
      { key: 'status', label: t('alerts.csvCol.status') },
    ],
    rows: (brief, t, tName) => selectOpenAlerts(brief, Infinity).map((a) => ({
      ...a,
      districtName: tName('districts', a.districtId, a.districtName || a.districtId || '')
        || a.districtName || a.districtId || '',
      headName: tName('crimeHeads', a.crimeHeadId, a.headName || '') || a.headName || '',
    })),
  },
  hotspots: {
    columns: (t) => [
      { key: 'label', label: t('alerts.csvCol.hotspot') },
      { key: 'subHeadName', label: t('alerts.csvCol.crimeSubhead') },
      { key: 'districtId', label: t('alerts.csvCol.districtUnit') },
      { key: 'hourBandStart', label: t('alerts.csvCol.hourBandStart') },
      { key: 'hourBandEnd', label: t('alerts.csvCol.hourBandEnd') },
      { key: 'caseCount', label: t('alerts.csvCol.cases') },
      { key: 'intensity', label: t('alerts.csvCol.intensity') },
    ],
    rows: (brief, t, tName) => selectTopHotspots(brief, Infinity).map((h) => ({
      ...h,
      label: hotspotLabel(h, t, tName),
      subHeadName: tName('crimeHeads', h.crimeHeadId, h.subHeadName || '') || h.subHeadName || '',
    })),
  },
  risk: {
    columns: (t) => [
      { key: 'unitName', label: t('alerts.csvCol.station') },
      { key: 'unitId', label: t('alerts.csvCol.unitId') },
      { key: 'riskScore', label: t('alerts.csvCol.riskScore') },
      { key: 'drivers', label: t('alerts.csvCol.drivers') },
    ],
    rows: (brief) => selectRiskRows(brief, Infinity).map((s) => ({
      ...s,
      unitName: s.unitName || s.unitId || '',
      drivers: Array.isArray(s.drivers) ? s.drivers.join('; ') : (s.drivers || ''),
    })),
  },
};

/** Download one brief section as CSV; returns the number of data rows (0 = nothing). */
export function exportSectionCsv(section, brief, t = en, tName = passThrough) {
  const spec = SECTIONS[section];
  if (!spec) return 0;
  const rows = spec.rows(brief, t, tName);
  if (!rows.length) return 0;
  downloadBlob(`dappa-brief-${section}-${stamp()}.csv`, toCsv(spec.columns(t), rows));
  return rows.length;
}
