// /alerts — client-side CSV export. Blob download only; no server round-trip,
// so it works identically on Catalyst and the static GitHub Pages demo.
// Column headers follow the active UI language; the data keys never do.
import { translate } from '../../lib/i18n.jsx';
import { sevKey, statusKey, direction } from './severity.js';
import { explainAlert } from './explain.js';

const en = (key, vars) => translate('en', key, vars);

/** RFC-4180-ish cell escaping: quote when the value contains , " or newline. */
function cell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{key, label}] · rows: array of objects → CSV string (CRLF). */
export function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(','));
  return [head, ...body].join('\r\n');
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadBlob(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke so slower browsers finish reading the blob first.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const alertColumns = (t) => [
  { key: 'alertId', label: t('alerts.csvCol.alertId') },
  { key: 'severityBand', label: t('alerts.csvCol.severity') },
  { key: 'severity', label: t('alerts.csvCol.severityCode') },
  { key: 'statusLabel', label: t('alerts.csvCol.status') },
  { key: 'directionLabel', label: t('alerts.csvCol.direction') },
  { key: 'districtName', label: t('alerts.csvCol.district') },
  { key: 'headName', label: t('alerts.csvCol.crimeHead') },
  { key: 'periodStart', label: t('alerts.csvCol.periodStart') },
  { key: 'periodEnd', label: t('alerts.csvCol.periodEnd') },
  { key: 'observed', label: t('alerts.csvCol.observed') },
  { key: 'expected', label: t('alerts.csvCol.expected') },
  { key: 'excess', label: t('alerts.csvCol.excess') },
  { key: 'zScore', label: t('alerts.csvCol.zScore') },
  { key: 'sigma', label: t('alerts.csvCol.sigma') },
  { key: 'owner', label: t('alerts.csvCol.owner') },
  { key: 'triageNote', label: t('alerts.csvCol.triageNote') },
  { key: 'narrative', label: t('alerts.csvCol.narrative') },
];

const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : '');

/** Download the given alerts as dappa-alerts-YYYY-MM-DD.csv; returns row count.
 * `names` (optional) translates the API district / crime-head strings;
 * `metaFor` (optional) supplies this console's triage note + owner per alert.
 * The stored integer severity band is kept AND spelled out, so the file is
 * readable by a human and still joins back to AnomalyAlert.Severity. */
export function exportAlertsCsv(alerts, t = en, names, metaFor) {
  const tName = names || ((_kind, _id, fallback) => fallback || '');
  const rows = (alerts || []).map((a) => {
    const e = explainAlert(a);
    const m = metaFor ? metaFor(a.alertId) : null;
    const key = sevKey(a.severity);
    const dir = direction(a);
    return {
      ...a,
      severityBand: key ? t(`alerts.sev.${key}`) : '',
      statusLabel: t(`alerts.status.${statusKey(a.status)}`),
      directionLabel: dir ? t(dir === 'up' ? 'alerts.explain.surge' : 'alerts.explain.drop') : '',
      excess: round2(e.excess),
      sigma: round2(e.sigma),
      owner: m?.owner || '',
      triageNote: m?.note || '',
      districtName: tName('districts', a.districtId, a.districtName || a.districtId || '')
        || a.districtName || a.districtId || '',
      headName: tName('crimeHeads', a.crimeHeadId, a.headName || '') || a.headName || '',
    };
  });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`dappa-alerts-${stamp}.csv`, toCsv(alertColumns(t), rows));
  return rows.length;
}
