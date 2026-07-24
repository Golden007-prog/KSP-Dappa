// Single-case JSON export. Serializes ONLY the whitelisted fields the detail
// page itself renders — never the raw payload — so schema-fidelity columns
// (caste/religion) can never leak into a downloaded file. Field lists are the
// exact same configs the panels use (PartyList / KeyValuePanel rows).
import { PERSON_FIELDS, ARREST_FIELDS, NAME_KEYS } from './PartyList.jsx';
import { CHARGESHEET_ROWS, IO_ROWS, COURT_ROWS } from './detailPanels.js';
import { pickValue } from './caseDates.js';

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function person(p, fields) {
  if (p === null || p === undefined) return null;
  if (typeof p !== 'object') return { name: String(p) };
  const out = { name: String(pickValue(p, NAME_KEYS) ?? 'Unnamed') };
  const aliases = Array.isArray(p.aliases) ? p.aliases.filter(Boolean).map(String) : [];
  if (aliases.length) out.aliases = aliases;
  for (const f of fields) {
    const v = pickValue(p, f.keys);
    if (v !== undefined) out[slug(f.label)] = v;
  }
  return out;
}

function keyValue(obj, rows) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  for (const r of rows) {
    const v = pickValue(obj, r.keys);
    if (v !== undefined) out[slug(r.label)] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Whitelisted, render-mirroring export object for one case. */
export function buildCaseExport(d) {
  const people = (list, fields) => (Array.isArray(list) ? list.map((p) => person(p, fields)).filter(Boolean) : []);
  const out = {
    exportedAt: new Date().toISOString(),
    source: 'KSP DAPPA prototype — synthetic data',
    caseMasterId: d.caseMasterId ?? null,
    crimeNo: d.crimeNo ?? null,
    caseNo: d.caseNo ?? null,
    registeredDate: d.registeredDate ?? null,
    districtName: d.districtName ?? null,
    unitName: d.unitName ?? null,
    headName: d.headName ?? null,
    subHeadName: d.subHeadName ?? null,
    statusName: d.statusName ?? null,
    gravityName: d.gravityName ?? null,
    anomalyFlag: !!d.anomalyFlag,
    incidentFrom: d.incidentFrom ?? null,
    incidentTo: d.incidentTo ?? null,
    briefFacts: d.briefFacts ?? null,
    complainants: people(d.complainants, PERSON_FIELDS),
    victims: people(d.victims, PERSON_FIELDS),
    accused: people(d.accused, PERSON_FIELDS),
    sections: (Array.isArray(d.sections) ? d.sections : []).map((s) => ({
      actCode: s?.actCode ?? null,
      sectionCode: s?.sectionCode ?? null,
      description: s?.description ?? null,
    })),
    arrests: people(d.arrests, ARREST_FIELDS),
    chargesheet: keyValue(d.chargesheet, CHARGESHEET_ROWS),
    io: keyValue(d.io, IO_ROWS),
    court: keyValue(d.court, COURT_ROWS),
  };
  const lat = Number(d.latitude);
  const lng = Number(d.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    out.latitude = lat;
    out.longitude = lng;
  }
  const anomalyReason = d.anomalyReason || d.anomaly_reason || d.anomalyNarrative || '';
  if (d.anomalyFlag && anomalyReason) out.anomalyReason = String(anomalyReason);
  return out;
}

/** Download the whitelisted case object as a pretty-printed .json file. */
export function downloadCaseJson(d) {
  const payload = buildCaseExport(d);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dappa-case-${String(payload.crimeNo || payload.caseMasterId || 'export')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
