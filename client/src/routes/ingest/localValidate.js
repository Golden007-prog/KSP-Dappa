// Browser-side validation — the subset of lib/ingest.js that needs no store:
// required columns, Data Store types and limits, dd-mm-yyyy normalisation,
// digit grouping, CrimeNo structure (format / station / year / category),
// duplicates inside the batch, coordinate range and the Karnataka bounding
// box, and the privacy guard. Used ONLY by the static demo (no API) and
// labelled 'browser' so nobody mistakes it for the server's FK, store-duplicate
// and polygon checks. Same reason codes and row shape as the server.
import { stripDigitGrouping, toIsoDate } from '../../lib/csv.js';

const BBOX = { latMin: 11.5, latMax: 18.5, lngMin: 74.0, lngMax: 78.6 };
const NEVER_USED_RE = /caste|religion|jati|jaati|dharm|community\b/i;
const PII_RE = /phone|mobile|aadha|email|e-mail|address|passport|\bpan\b|voter|dob$|birth/i;
const TRUE_SET = new Set(['true', '1', 'yes', 'y', 't']);
const FALSE_SET = new Set(['false', '0', 'no', 'n', 'f']);

export function classifyExtraHeader(h) {
  if (NEVER_USED_RE.test(h)) return 'never-used';
  if (PII_RE.test(h)) return 'pii';
  return 'unknown';
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

function parseValue(raw, col) {
  const s = String(raw).trim();
  switch (col.type) {
    case 'Int': {
      const v = stripDigitGrouping(s);
      if (!/^-?\d+(\.0+)?$/.test(v)) return { issue: { code: 'TYPE_INT', severity: 'reject', detail: s.slice(0, 40) } };
      return { value: Number(v), issue: v !== s ? { code: 'DIGIT_GROUPING', severity: 'info', detail: s } : null };
    }
    case 'Double': {
      const v = s.replace(/,/g, '');
      if (!/^-?\d+(\.\d+)?$/.test(v)) return { issue: { code: 'TYPE_DOUBLE', severity: 'reject', detail: s.slice(0, 40) } };
      return { value: String(Number(v)) };
    }
    case 'Boolean': {
      const l = s.toLowerCase();
      if (TRUE_SET.has(l)) return { value: true };
      if (FALSE_SET.has(l)) return { value: false };
      return { issue: { code: 'TYPE_BOOLEAN', severity: 'reject', detail: s.slice(0, 20) } };
    }
    case 'Date': {
      const d = toIsoDate(s);
      if (!d) return { issue: { code: 'DATE_INVALID', severity: 'reject', detail: s.slice(0, 30) } };
      return { value: d.date, issue: d.normalised ? { code: 'DATE_NORMALISED', severity: 'info', detail: `${s} → ${d.date}` } : null };
    }
    case 'DateTime': {
      const d = toIsoDate(s);
      if (!d) return { issue: { code: 'DATETIME_INVALID', severity: 'reject', detail: s.slice(0, 30) } };
      const value = `${d.date} ${d.time || '00:00:00'}`;
      return { value, issue: d.normalised ? { code: 'DATE_NORMALISED', severity: 'info', detail: `${s} → ${value}` } : d.time ? null : { code: 'TIME_MISSING', severity: 'info' } };
    }
    default: {
      const max = col.max || (col.type === 'Text' ? 10000 : 255);
      const len = Array.from(s).length;
      if (len > max) return { issue: { code: col.type === 'Text' ? 'LEN_TEXT' : 'LEN_VARCHAR', severity: 'reject', detail: `${len} > ${max}` } };
      if (s.includes('�')) return { value: s, issue: { code: 'ENCODING_REPLACEMENT', severity: 'warn' } };
      return { value: s };
    }
  }
}

function crimeNoIssues(row) {
  const out = [];
  const v = String(row.CrimeNo || '');
  if (!/^\d{18}$/.test(v)) { out.push({ code: 'CRIMENO_FORMAT', column: 'CrimeNo', severity: 'reject', detail: v.slice(0, 24) }); return out; }
  const cat = v[0]; const unit = v.slice(5, 9); const year = v.slice(9, 13); const serial = v.slice(13);
  if (row.CaseCategoryID !== null && row.CaseCategoryID !== undefined && String(row.CaseCategoryID) !== cat) out.push({ code: 'CRIMENO_CATEGORY', column: 'CrimeNo', severity: 'reject', detail: `digit ${cat} ≠ CaseCategoryID ${row.CaseCategoryID}` });
  if (row.PoliceStationID !== null && row.PoliceStationID !== undefined && String(Number(unit)) !== String(Number(row.PoliceStationID))) out.push({ code: 'CRIMENO_UNIT', column: 'CrimeNo', severity: 'reject', detail: `station ${unit} ≠ PoliceStationID ${row.PoliceStationID}` });
  if (row.CrimeRegisteredDate && String(row.CrimeRegisteredDate).slice(0, 4) !== year) out.push({ code: 'CRIMENO_YEAR', column: 'CrimeNo', severity: 'reject', detail: `year ${year} ≠ registered ${String(row.CrimeRegisteredDate).slice(0, 4)}` });
  if (row.CaseNo && String(row.CaseNo) !== `${year}${serial}`) out.push({ code: 'CASENO_MISMATCH', column: 'CaseNo', severity: 'warn', detail: `${row.CaseNo} ≠ ${year}${serial}` });
  return out;
}

/** Same envelope shape as POST /ingest/validate, meta.source 'browser'. */
export function validateLocally({ table, tableDef, columns, rows, mapping, options = {} }) {
  const headers = columns.map((h) => String(h || '').replace(/^﻿/, '').trim());
  const idxOf = (name) => {
    const want = mapping && mapping[name] ? String(mapping[name]) : name;
    const i = headers.indexOf(want);
    return i >= 0 ? i : headers.findIndex((h) => h.toLowerCase() === want.toLowerCase());
  };
  const map = {};
  for (const c of tableDef.columns) { const i = idxOf(c.name); if (i >= 0) map[c.name] = i; }
  const used = new Set(Object.values(map));
  const extra = headers.map((h, i) => ({ header: h, index: i })).filter((x) => !used.has(x.index) && x.header);
  const keyCols = tableDef.key && tableDef.key.length ? tableDef.key : tableDef.columns.filter((c) => c.pk).map((c) => c.name);
  const dupKeys = tableDef.dupKeys || keyCols;
  const seen = new Map(dupKeys.map((k) => [k, new Map()]));
  const issueCounts = new Map();
  const nulls = Object.fromEntries(tableDef.columns.map((c) => [c.name, 0]));
  const note = (is) => { const k = `${is.code}|${is.severity}`; const cur = issueCounts.get(k) || { code: is.code, severity: is.severity, count: 0, column: is.column || null, sample: is.detail || null }; cur.count += 1; issueCounts.set(k, cur); };
  const out = [];
  let accepted = 0;
  let warnRows = 0;
  const dates = [];
  // No district polygons ship to the browser, so every in-bbox point lands in
  // unknownPolygon: polygonChecked says so rather than letting "0 inside their
  // district" read as a finding (D-phase8-ingest-12).
  const geo = { withCoords: 0, inDistrict: 0, outOfDistrict: 0, outOfState: 0, invalid: 0, unknownPolygon: 0, polygonChecked: false };
  rows.forEach((raw, i) => {
    const rowNo = i + 1;
    const rec = {};
    const issues = [];
    for (const col of tableDef.columns) {
      const v = map[col.name] === undefined ? undefined : raw[map[col.name]];
      if (isBlank(v)) { nulls[col.name] += 1; if (col.required) issues.push({ code: 'REQUIRED_MISSING', column: col.name, severity: 'reject' }); rec[col.name] = null; continue; }
      const p = parseValue(v, col);
      // `detail` echoes the offending cell, so mark the ones that must never
      // leave in the downloadable rejection report (a PII or never-used cell).
      if (p.issue) issues.push({ column: col.name, ...p.issue, ...(col.pii || col.neverUsed ? { sensitive: true } : {}) });
      rec[col.name] = p.value === undefined ? null : p.value;
      if (col.neverUsed && options.dropSensitive !== false && rec[col.name] !== null) { rec[col.name] = null; issues.push({ code: 'NEVER_USED_DROPPED', column: col.name, severity: 'info' }); }
    }
    for (const x of extra) {
      if (isBlank(raw[x.index])) continue;
      const kind = classifyExtraHeader(x.header);
      issues.push({ code: kind === 'never-used' ? 'NEVER_USED_DROPPED' : kind === 'pii' ? 'PII_DROPPED' : 'UNKNOWN_COLUMN_IGNORED', column: x.header, severity: 'info' });
    }
    if (table === 'CaseMaster') for (const is of crimeNoIssues(rec)) issues.push(is);
    if (tableDef.geo) {
      const lat = rec[tableDef.geo.lat] === null ? null : Number(rec[tableDef.geo.lat]);
      const lng = rec[tableDef.geo.lng] === null ? null : Number(rec[tableDef.geo.lng]);
      if (lat !== null && lng !== null) {
        geo.withCoords += 1;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { geo.invalid += 1; issues.push({ code: 'GEO_INVALID', column: tableDef.geo.lat, severity: 'reject', detail: `${lat},${lng}` }); } else if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) { geo.outOfState += 1; issues.push({ code: 'GEO_OUT_OF_STATE', column: tableDef.geo.lat, severity: 'reject', detail: `${lat},${lng}` }); } else geo.unknownPolygon += 1;
      } else if (lat !== null || lng !== null) issues.push({ code: 'GEO_PARTIAL', column: tableDef.geo.lat, severity: 'warn' });
    }
    for (const k of dupKeys) {
      const v = rec[k];
      if (v === null || v === undefined) continue;
      const m = seen.get(k);
      if (m.has(String(v))) issues.push({ code: 'DUP_IN_BATCH', column: k, severity: 'reject', detail: `same as row ${m.get(String(v))}` });
      else m.set(String(v), rowNo);
    }
    if (tableDef.dateColumn && rec[tableDef.dateColumn]) dates.push(String(rec[tableDef.dateColumn]).slice(0, 10));
    for (const is of issues) note(is);
    const verdict = issues.some((is) => is.severity === 'reject') ? 'reject' : 'accept';
    if (verdict === 'accept') { accepted += 1; if (issues.some((is) => is.severity === 'warn')) warnRows += 1; }
    out.push({ rowNo, verdict, issues, keys: Object.fromEntries([...new Set([...keyCols, ...dupKeys])].map((c) => [c, rec[c]])) });
  });
  dates.sort();
  const missingRequired = tableDef.columns.filter((c) => c.required && map[c.name] === undefined).map((c) => c.name);
  return {
    data: {
      batchId: null, status: 'validated-browser', dryRun: true, resumeToken: null, table,
      mapping: Object.fromEntries(Object.entries(map).map(([c, i]) => [c, headers[i]])),
      unmappedColumns: tableDef.columns.filter((c) => map[c.name] === undefined).map((c) => c.name),
      missingRequiredColumns: missingRequired,
      prerequisites: { ok: true, missing: [], message: null },
      counts: { rows: rows.length, accepted, rejected: rows.length - accepted, acceptedWithWarnings: warnRows },
      rows: out,
      issueSummary: [...issueCounts.values()].sort((a, b) => b.count - a.count),
      profile: {
        rows: rows.length, columnsMapped: Object.keys(map).length, columnsUnmapped: tableDef.columns.filter((c) => map[c.name] === undefined).map((c) => c.name),
        nullRates: Object.fromEntries(Object.entries(nulls).map(([c, n]) => [c, rows.length ? Math.round((n / rows.length) * 1000) / 10 : 0])),
        dateRange: dates.length ? { column: tableDef.dateColumn, min: dates[0], max: dates[dates.length - 1] } : null,
        unitCoverage: null, coordinates: tableDef.geo ? geo : null,
        encoding: { bom: /^﻿/.test(String(columns[0] || '')), kannadaCells: 0, replacementChars: (issueCounts.get('ENCODING_REPLACEMENT|warn') || { count: 0 }).count },
      },
      budget: { rows: accepted, insertCalls: Math.ceil(accepted / 200), chunkSize: 200, freeTierInsertsPerMonth: 5000, withinFreeTier: accepted <= 5000, loadedThisMonthByThisContainer: null, note: 'Free-tier Data Store inserts are 5,000/month (docs/CATALYST_SERVICE_RESEARCH.md §4.1).' },
      privacy: {
        dropSensitive: options.dropSensitive !== false,
        neverUsedColumns: tableDef.columns.filter((c) => c.neverUsed).map((c) => ({ column: c.name, action: options.dropSensitive !== false ? 'dropped' : 'kept (never used in analytics)' })),
        piiColumns: tableDef.columns.filter((c) => c.pii).map((c) => ({ column: c.name, action: 'loaded, never exported' })),
        extraColumns: extra.map((x) => ({ header: x.header, kind: classifyExtraHeader(x.header), action: 'dropped' })),
        tableNeverUsed: Boolean(tableDef.neverUsed),
      },
      storeChecks: [],
      reference: null,
      whatChanged: { applicable: false, note: 'browser-only validation: the before/after KPIs and the z-check need the live API.' },
    },
    meta: { source: 'browser', storage: 'none', validator: 'client/src/routes/ingest/localValidate.js', demoStatic: true, count: out.length, skipped: ['FK_MISSING', 'DUP_IN_STORE', 'GEO_OUT_OF_DISTRICT', 'CRIMENO_DISTRICT', 'SUBHEAD_HEAD_MISMATCH', 'prerequisites', 'whatChanged'] },
  };
}
