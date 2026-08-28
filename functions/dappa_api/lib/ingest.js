'use strict';
// CSV → official ER schema ingest (Round 2, Phase 8).
//
// The client parses the officer's CSV in the browser and posts JSON rows; this
// module owns everything after that: the ER table registry (docs/
// SCHEMA_CHECKLIST.md §1–27, column names verbatim), per-row validation with
// reason codes, the privacy guard, duplicate detection against the store, the
// point-in-polygon check, the data-quality profile, the Data Store budget
// estimate, the chunked load with a resume token, the audit row and the
// post-load "what changed" block (the same AggMonthly aggregates /summary/kpis
// reads, plus the robust z-check the nightly job and the event function use).
//
// Batches live in this container's memory (bounded, 2-hour TTL). That is a
// documented limitation, not an accident: a Data Store table for batches does
// not exist and console-created tables are outside what code can do. A batch
// lost to a container restart is re-validated by the client in one call.

const fs = require('fs');
const path = require('path');
const constants = require('./constants');
const { getLookups } = require('./lookups');
const { robustZ } = require('./circuits');
const { anchorYm } = require('./routes/read');
const { isAuthed } = require('./envelope');
const { toNum, round, ymAdd, ymRange, pctDelta, toCsv, hash32, logJson } = require('./util');

// ---------------------------------------------------------------------------
// ER table registry — docs/SCHEMA_CHECKLIST.md, in console-import order.
// ---------------------------------------------------------------------------

const VARCHAR_MAX = 255;
const TEXT_MAX = 10000;
const MAX_ROWS = 5000;
const CHUNK = 200;
const FREE_TIER_INSERTS_PER_MONTH = 5000;

const C = (name, type, o) => Object.assign({ name, type }, o || {});
const I = (name, o) => C(name, 'Int', o);
const V = (name, max, o) => C(name, 'Varchar', Object.assign({ max: Math.min(max, VARCHAR_MAX) }, o || {}));
const B = (name, o) => C(name, 'Boolean', o);
const D = (name, o) => C(name, 'Date', o);
const DT = (name, o) => C(name, 'DateTime', o);
const F = (name, o) => C(name, 'Double', o);
const T = (name, o) => C(name, 'Text', Object.assign({ max: TEXT_MAX }, o || {}));

const REQ = { required: true };
const PK = { required: true, pk: true };
const fk = (table, extra) => Object.assign({ fk: table }, extra || {});
const PII = { pii: true };
const NEVER = { neverUsed: true };

const TABLES = [
  { name: 'State', order: 1, group: 'reference', columns: [I('StateID', PK), V('StateName', 100, REQ), I('NationalityID'), B('Active')] },
  { name: 'District', order: 2, group: 'reference', requires: ['State'], columns: [I('DistrictID', PK), V('DistrictName', 100, REQ), I('StateID', fk('State')), B('Active')] },
  { name: 'UnitType', order: 3, group: 'reference', columns: [I('UnitTypeID', PK), V('UnitTypeName', 100, REQ), V('CityDistState', 20), I('Hierarchy'), B('Active')] },
  { name: 'Unit', order: 4, group: 'reference', requires: ['District', 'UnitType'], columns: [I('UnitID', PK), V('UnitName', 150, REQ), I('TypeID', fk('UnitType')), I('ParentUnit', fk('Unit')), I('NationalityID'), I('StateID', fk('State')), I('DistrictID', fk('District', REQ)), B('Active')] },
  { name: 'Rank', order: 5, group: 'reference', columns: [I('RankID', PK), V('RankName', 100, REQ), I('Hierarchy'), B('Active')] },
  { name: 'Designation', order: 6, group: 'reference', columns: [I('DesignationID', PK), V('DesignationName', 100, REQ), B('Active'), I('SortOrder')] },
  { name: 'Employee', order: 7, group: 'reference', requires: ['District', 'Unit', 'Rank', 'Designation'], columns: [I('EmployeeID', PK), I('DistrictID', fk('District', REQ)), I('UnitID', fk('Unit', REQ)), I('RankID', fk('Rank')), I('DesignationID', fk('Designation')), V('KGID', 20, PII), V('FirstName', 60, PII), D('EmployeeDOB', PII), I('GenderID'), I('BloodGroupID'), B('PhysicallyChallenged'), D('AppointmentDate')] },
  { name: 'CaseCategory', order: 8, group: 'reference', columns: [I('CaseCategoryID', PK), V('LookupValue', 20, REQ)] },
  { name: 'GravityOffence', order: 9, group: 'reference', columns: [I('GravityOffenceID', PK), V('LookupValue', 20, REQ)] },
  { name: 'CaseStatusMaster', order: 10, group: 'reference', columns: [I('CaseStatusID', PK), V('CaseStatusName', 50, REQ)] },
  { name: 'CasteMaster', order: 11, group: 'reference', neverUsed: true, columns: [I('caste_master_id', PK), V('caste_master_name', 60, Object.assign({}, REQ, NEVER))] },
  { name: 'ReligionMaster', order: 12, group: 'reference', neverUsed: true, columns: [I('ReligionID', PK), V('ReligionName', 40, Object.assign({}, REQ, NEVER))] },
  { name: 'OccupationMaster', order: 13, group: 'reference', columns: [I('OccupationID', PK), V('OccupationName', 60, REQ)] },
  { name: 'Act', order: 14, group: 'reference', columns: [V('ActCode', 10, PK), V('ActDescription', 150), V('ShortName', 30), B('Active')] },
  { name: 'Section', order: 15, group: 'reference', requires: ['Act'], key: ['ActCode', 'SectionCode'], columns: [V('ActCode', 10, fk('Act', REQ)), V('SectionCode', 10, REQ), V('SectionDescription', 200), B('Active')] },
  { name: 'CrimeHead', order: 16, group: 'reference', columns: [I('CrimeHeadID', PK), V('CrimeGroupName', 60, REQ), B('Active')] },
  { name: 'CrimeSubHead', order: 17, group: 'reference', requires: ['CrimeHead'], columns: [I('CrimeSubHeadID', PK), I('CrimeHeadID', fk('CrimeHead', REQ)), V('CrimeHeadName', 60, REQ), I('SeqID')] },
  { name: 'CrimeHeadActSection', order: 18, group: 'reference', requires: ['CrimeHead', 'Act', 'Section'], key: ['CrimeHeadID', 'ActCode', 'SectionCode'], columns: [I('CrimeHeadID', fk('CrimeHead', REQ)), V('ActCode', 10, fk('Act', REQ)), V('SectionCode', 10, fk('Section', REQ))] },
  { name: 'Court', order: 19, group: 'reference', requires: ['District'], columns: [I('CourtID', PK), V('CourtName', 120, REQ), I('DistrictID', fk('District')), I('StateID', fk('State')), B('Active')] },
  {
    name: 'CaseMaster', order: 20, group: 'fact', requires: ['District', 'Unit', 'CrimeHead', 'CrimeSubHead', 'CaseCategory', 'CaseStatusMaster'],
    dupKeys: ['CrimeNo', 'CaseMasterID'], dateColumn: 'CrimeRegisteredDate', geo: { lat: 'latitude', lng: 'longitude', unit: 'PoliceStationID' },
    columns: [
      I('CaseMasterID', PK), V('CrimeNo', 18, Object.assign({ crimeNo: true }, REQ)), V('CaseNo', 9), D('CrimeRegisteredDate', REQ),
      I('PolicePersonID', fk('Employee', { soft: true })), I('PoliceStationID', fk('Unit', REQ)), I('CaseCategoryID', fk('CaseCategory', REQ)),
      I('GravityOffenceID', fk('GravityOffence')), I('CrimeMajorHeadID', fk('CrimeHead', REQ)), I('CrimeMinorHeadID', fk('CrimeSubHead', REQ)),
      I('CaseStatusID', fk('CaseStatusMaster', REQ)), I('CourtID', fk('Court')), DT('IncidentFromDate'), DT('IncidentToDate'), DT('InfoReceivedPSDate'),
      F('latitude'), F('longitude'), T('BriefFacts', { narrative: true })
    ]
  },
  { name: 'ComplainantDetails', order: 21, group: 'fact', requires: ['CaseMaster'], columns: [I('ComplainantID', PK), I('CaseMasterID', fk('CaseMaster', REQ)), V('ComplainantName', 100, PII), I('AgeYear'), I('OccupationID', fk('OccupationMaster')), I('ReligionID', NEVER), I('CasteID', NEVER), I('GenderID')] },
  { name: 'Victim', order: 22, group: 'fact', requires: ['CaseMaster'], columns: [I('VictimMasterID', PK), I('CaseMasterID', fk('CaseMaster', REQ)), V('VictimName', 100, PII), I('AgeYear'), I('GenderID'), V('VictimPolice', 1)] },
  { name: 'Accused', order: 23, group: 'fact', requires: ['CaseMaster'], columns: [I('AccusedMasterID', PK), I('CaseMasterID', fk('CaseMaster', REQ)), V('AccusedName', 100, PII), I('AgeYear'), I('GenderID'), V('PersonID', 5)] },
  { name: 'ActSectionAssociation', order: 24, group: 'fact', requires: ['CaseMaster', 'Act', 'Section'], key: ['CaseMasterID', 'ActID', 'SectionID'], columns: [I('CaseMasterID', fk('CaseMaster', REQ)), V('ActID', 10, fk('Act', REQ)), V('SectionID', 10, fk('Section', REQ)), I('ActOrderID'), I('SectionOrderID')] },
  { name: 'ArrestSurrender', order: 25, group: 'fact', requires: ['CaseMaster', 'Accused'], columns: [I('ArrestSurrenderID', PK), I('CaseMasterID', fk('CaseMaster', REQ)), I('ArrestSurrenderTypeID'), D('ArrestSurrenderDate'), I('ArrestSurrenderStateId'), I('ArrestSurrenderDistrictId', fk('District')), I('PoliceStationID', fk('Unit')), I('IOID', fk('Employee', { soft: true })), I('CourtID', fk('Court')), I('AccusedMasterID', fk('Accused', { soft: true })), B('IsAccused'), B('IsComplainantAccused')] },
  { name: 'ChargesheetDetails', order: 26, group: 'fact', requires: ['CaseMaster'], dateColumn: 'csdate', columns: [I('CSID', PK), I('CaseMasterID', fk('CaseMaster', REQ)), DT('csdate'), V('cstype', 1), I('PolicePersonID', fk('Employee', { soft: true }))] },
  { name: 'SocioEconomic', order: 27, group: 'appendix', requires: ['District'], columns: [I('DistrictID', fk('District', PK)), I('Population'), F('UrbanPct'), F('LiteracyPct'), I('DensityPerKm2'), F('PerCapitaIncomeIdx')] }
];

const tableByName = new Map(TABLES.map((t) => [t.name, t]));

function tableDef(name) {
  return tableByName.get(String(name || '')) || null;
}

function keyColumns(t) {
  if (t.key) return t.key;
  const pk = t.columns.find((c) => c.pk);
  return pk ? [pk.name] : [];
}

// CCTNS IIF-1 (IF1 – First Information Report) → CaseMaster. The seven
// Integrated Investigation Forms are verified (docs/DOMAIN_RESEARCH.md §2.1);
// the export column names below are NOT — they are the field names an IF1
// print carries and must be checked against a real export before use.
const PRESETS = [
  {
    id: 'cctns-iif1', table: 'CaseMaster', name: 'CCTNS IIF-1 (FIR) export',
    verified: false,
    note: 'IIF-1 form list verified (docs/DOMAIN_RESEARCH.md §2.1); export column names are unverified and must be checked against a real export.',
    mapping: {
      CaseMasterID: 'FIR_REG_NUM', CrimeNo: 'FIR_NO', CaseNo: 'CASE_NO', CrimeRegisteredDate: 'FIR_DATE',
      PolicePersonID: 'IO_ID', PoliceStationID: 'PS_CD', CaseCategoryID: 'CASE_CATEGORY', GravityOffenceID: 'GRAVITY',
      CrimeMajorHeadID: 'MAJOR_HEAD', CrimeMinorHeadID: 'MINOR_HEAD', CaseStatusID: 'CASE_STATUS', CourtID: 'COURT_CD',
      IncidentFromDate: 'OCCURRENCE_FROM', IncidentToDate: 'OCCURRENCE_TO', InfoReceivedPSDate: 'INFO_RECEIVED_AT',
      latitude: 'LATITUDE', longitude: 'LONGITUDE', BriefFacts: 'BRIEF_FACTS'
    }
  }
];

// ---------------------------------------------------------------------------
// Bundled reference copy of the masters (generated by scripts/make_ingest_demo.mjs
// from pipeline/out) — unioned with the live lookups so FK checks are complete
// even when the fixture fallback serves only its 15 stub units.
// ---------------------------------------------------------------------------

function loadAsset(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', name), 'utf8'));
  } catch (e) {
    return null;
  }
}

const REFERENCE = loadAsset('ingest_reference.json') || { tables: {}, unitDistrict: {} };
const GEO = loadAsset('karnataka_districts.geojson');

const dkey = (v) => String(v === undefined || v === null ? '' : v).trim().replace(/^0+(?=\d)/, '');

// FK targets answered by the cached lookups (lib/lookups.js); every other
// target is checked against the bundled reference copy plus a page read.
const LOOKUP_TABLES = new Set(['District', 'Unit', 'CrimeHead', 'CrimeSubHead', 'CaseCategory', 'CaseStatusMaster', 'GravityOffence']);
// Column a foreign key points at when the target's key is composite.
const FK_COLUMN = { Section: 'SectionCode' };

// Police-unit code → 2011-census polygon (mirror of client/src/lib/districtGeoMap.js).
const UNIT_POLYGON = {
  101: 'Bengaluru Urban', 102: 'Bengaluru Rural', 103: 'Mysuru', 104: 'Mysuru', 105: 'Dakshina Kannada', 106: 'Dakshina Kannada',
  107: 'Dharwad', 108: 'Dharwad', 109: 'Belagavi', 110: 'Belagavi', 111: 'Kalaburagi', 112: 'Ballari', 113: 'Vijayapura',
  114: 'Davanagere', 115: 'Shivamogga', 116: 'Tumakuru', 117: 'Udupi', 118: 'Hassan', 119: 'Chikkamagaluru', 120: 'Kodagu',
  121: 'Chamarajanagara', 122: 'Mandya', 123: 'Kolar', 124: 'Chikkaballapura', 125: 'Ramanagara', 126: 'Bagalkote', 127: 'Gadag',
  128: 'Haveri', 129: 'Uttara Kannada', 130: 'Raichur', 131: 'Koppal', 132: 'Yadgir', 133: 'Bidar', 134: 'Chitradurga',
  135: 'Kodagu', 136: 'Kolar', 137: 'Ballari', 138: 'Bengaluru Rural'
};

const KARNATAKA_BBOX = { latMin: 11.5, latMax: 18.5, lngMin: 74.0, lngMax: 78.6 };

const polygonByName = new Map();
if (GEO && Array.isArray(GEO.features)) {
  for (const f of GEO.features) {
    if (f && f.properties && f.geometry) polygonByName.set(f.properties.district, f.geometry);
  }
}

function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeometry(pt, geom) {
  if (!geom) return null;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((rings) => pointInRing(pt, rings[0]) && !rings.slice(1).some((hole) => pointInRing(pt, hole)));
}

/** Point-in-polygon for a district code. Returns true/false, or null when no polygon is known. */
function pointInDistrict(lat, lng, districtId) {
  const name = UNIT_POLYGON[Number(dkey(districtId))];
  const geom = name ? polygonByName.get(name) : null;
  if (!geom) return null;
  return pointInGeometry([lng, lat], geom);
}

// ---------------------------------------------------------------------------
// Value parsing — one parser per Data Store type. Each returns
// { value, issue? } where issue is { code, severity, detail? }.
// ---------------------------------------------------------------------------

const INDIAN_GROUPING = /^-?\d{1,3}(,\d{2})*(,\d{3})$|^-?\d{1,3}(,\d{3})+$/;

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function parseInt_(raw) {
  let s = String(raw).trim();
  let grouped = false;
  if (INDIAN_GROUPING.test(s)) { s = s.replace(/,/g, ''); grouped = true; }
  if (!/^-?\d+(\.0+)?$/.test(s)) return { issue: { code: 'TYPE_INT', severity: 'reject', detail: String(raw).slice(0, 40) } };
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { issue: { code: 'TYPE_INT', severity: 'reject', detail: 'out of range' } };
  return { value: n, issue: grouped ? { code: 'DIGIT_GROUPING', severity: 'info', detail: String(raw) } : null };
}

function parseDouble(raw) {
  let s = String(raw).trim();
  let grouped = false;
  if (/,/.test(s) && INDIAN_GROUPING.test(s.split('.')[0])) { s = s.replace(/,/g, ''); grouped = true; }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { issue: { code: 'TYPE_DOUBLE', severity: 'reject', detail: String(raw).slice(0, 40) } };
  const n = Number(s);
  if (!Number.isFinite(n)) return { issue: { code: 'TYPE_DOUBLE', severity: 'reject' } };
  // Doubles go to the Data Store as strings (lib/datastore.js contract).
  return { value: String(n), issue: grouped ? { code: 'DIGIT_GROUPING', severity: 'info', detail: String(raw) } : null };
}

const TRUE_SET = new Set(['true', '1', 'yes', 'y', 't']);
const FALSE_SET = new Set(['false', '0', 'no', 'n', 'f']);

function parseBoolean(raw) {
  const s = String(raw).trim().toLowerCase();
  if (TRUE_SET.has(s)) return { value: true };
  if (FALSE_SET.has(s)) return { value: false };
  return { issue: { code: 'TYPE_BOOLEAN', severity: 'reject', detail: String(raw).slice(0, 20) } };
}

const pad2 = (n) => String(n).padStart(2, '0');

function validYmd(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days && y >= 1900 && y <= 2100;
}

/** Accepts ISO (yyyy-mm-dd), Indian (dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy) and
 * yyyy/mm/dd, with an optional HH:MM[:SS] part. Returns {y,m,d,hh,mi,ss,form}. */
function parseDateParts(raw) {
  const s = String(raw).trim().replace(/T/, ' ').replace(/Z$/, '');
  const m = s.match(/^(\d{1,4})([-/.])(\d{1,2})\2(\d{1,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  const c = Number(m[4]);
  let y;
  let mo;
  let d;
  let form;
  if (m[1].length === 4) { y = a; mo = b; d = c; form = 'iso'; } else if (m[4].length === 4) { y = c; mo = b; d = a; form = 'dmy'; } else return null;
  if (!validYmd(y, mo, d)) return null;
  const hh = m[5] === undefined ? null : Number(m[5]);
  const mi = m[6] === undefined ? null : Number(m[6]);
  const ss = m[7] === undefined ? 0 : Number(m[7]);
  if (hh !== null && (hh > 23 || mi > 59 || ss > 59)) return null;
  return { y, m: mo, d, hh, mi, ss, form };
}

function parseDate(raw) {
  const p = parseDateParts(raw);
  if (!p) return { issue: { code: 'DATE_INVALID', severity: 'reject', detail: String(raw).slice(0, 30) } };
  const value = `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  return { value, issue: p.form === 'dmy' ? { code: 'DATE_NORMALISED', severity: 'info', detail: `${String(raw).trim()} → ${value}` } : null };
}

function parseDateTime(raw) {
  const p = parseDateParts(raw);
  if (!p) return { issue: { code: 'DATETIME_INVALID', severity: 'reject', detail: String(raw).slice(0, 30) } };
  const value = `${p.y}-${pad2(p.m)}-${pad2(p.d)} ${pad2(p.hh === null ? 0 : p.hh)}:${pad2(p.mi === null ? 0 : p.mi)}:${pad2(p.ss)}`;
  const issue = p.form === 'dmy' ? { code: 'DATE_NORMALISED', severity: 'info', detail: `${String(raw).trim()} → ${value}` }
    : p.hh === null ? { code: 'TIME_MISSING', severity: 'info', detail: 'time part defaulted to 00:00:00' } : null;
  return { value, issue };
}

function parseString(raw, col) {
  const s = String(raw).trim();
  const max = col.max || (col.type === 'Text' ? TEXT_MAX : VARCHAR_MAX);
  const len = Array.from(s).length;
  if (len > max) return { issue: { code: col.type === 'Text' ? 'LEN_TEXT' : 'LEN_VARCHAR', severity: 'reject', detail: `${len} > ${max}` } };
  if (s.includes('�')) return { value: s, issue: { code: 'ENCODING_REPLACEMENT', severity: 'warn', detail: 'contains U+FFFD' } };
  return { value: s };
}

function parseValue(raw, col) {
  switch (col.type) {
    case 'Int': return parseInt_(raw);
    case 'Double': return parseDouble(raw);
    case 'Boolean': return parseBoolean(raw);
    case 'Date': return parseDate(raw);
    case 'DateTime': return parseDateTime(raw);
    default: return parseString(raw, col);
  }
}

// ---------------------------------------------------------------------------
// CrimeNo — 1 category · 4 district · 4 station · 4 year · 5 serial (README
// "Official ER schema"). The stub fixture and the pipeline both build it that way.
// ---------------------------------------------------------------------------

function parseCrimeNo(s) {
  const v = String(s || '').trim();
  if (!/^\d{18}$/.test(v)) return null;
  return { category: v[0], district: v.slice(1, 5), unit: v.slice(5, 9), year: v.slice(9, 13), serial: v.slice(13) };
}

/** Structural checks on one CaseMaster row. `ref` = { districtIds:Set, unitDistrict:Map }. */
function crimeNoIssues(row, ref) {
  const out = [];
  const parts = parseCrimeNo(row.CrimeNo);
  if (!parts) { out.push({ code: 'CRIMENO_FORMAT', column: 'CrimeNo', severity: 'reject', detail: String(row.CrimeNo || '').slice(0, 24) }); return out; }
  if (row.CaseCategoryID !== undefined && row.CaseCategoryID !== null && String(row.CaseCategoryID) !== parts.category) {
    out.push({ code: 'CRIMENO_CATEGORY', column: 'CrimeNo', severity: 'reject', detail: `digit ${parts.category} ≠ CaseCategoryID ${row.CaseCategoryID}` });
  }
  const dk = dkey(parts.district);
  if (ref.districtIds.size && !ref.districtIds.has(dk)) {
    out.push({ code: 'CRIMENO_DISTRICT_UNKNOWN', column: 'CrimeNo', severity: 'reject', detail: `district ${parts.district}` });
  }
  if (row.PoliceStationID !== undefined && row.PoliceStationID !== null) {
    if (dkey(parts.unit) !== dkey(row.PoliceStationID)) {
      out.push({ code: 'CRIMENO_UNIT', column: 'CrimeNo', severity: 'reject', detail: `station ${parts.unit} ≠ PoliceStationID ${row.PoliceStationID}` });
    }
    const unitD = ref.unitDistrict.get(dkey(row.PoliceStationID));
    if (unitD && unitD !== dk) {
      out.push({ code: 'CRIMENO_DISTRICT', column: 'CrimeNo', severity: 'reject', detail: `district ${parts.district} but station belongs to ${unitD}` });
    }
  }
  if (row.CrimeRegisteredDate && String(row.CrimeRegisteredDate).slice(0, 4) !== parts.year) {
    out.push({ code: 'CRIMENO_YEAR', column: 'CrimeNo', severity: 'reject', detail: `year ${parts.year} ≠ registered ${String(row.CrimeRegisteredDate).slice(0, 4)}` });
  }
  if (row.CaseNo && String(row.CaseNo) !== `${parts.year}${parts.serial}`) {
    out.push({ code: 'CASENO_MISMATCH', column: 'CaseNo', severity: 'warn', detail: `${row.CaseNo} ≠ ${parts.year}${parts.serial}` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Privacy guard — column classification for headers the schema does not name.
// ---------------------------------------------------------------------------

const NEVER_USED_RE = /caste|religion|jati|jaati|dharm|community\b/i;
const PII_RE = /phone|mobile|aadha|email|e-mail|address|passport|\bpan\b|voter|dob$|birth/i;

function classifyExtraHeader(h) {
  if (NEVER_USED_RE.test(h)) return 'never-used';
  if (PII_RE.test(h)) return 'pii';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Header mapping — target ER column → source header.
// ---------------------------------------------------------------------------

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function resolveMapping(t, headers, mapping) {
  const byNorm = new Map(headers.map((h, i) => [norm(h), i]));
  const map = {};
  const unmapped = [];
  for (const col of t.columns) {
    const wanted = mapping && mapping[col.name] !== undefined && mapping[col.name] !== null && mapping[col.name] !== '' ? String(mapping[col.name]) : col.name;
    const idx = headers.indexOf(wanted) >= 0 ? headers.indexOf(wanted) : byNorm.has(norm(wanted)) ? byNorm.get(norm(wanted)) : -1;
    if (idx >= 0) map[col.name] = idx;
    else unmapped.push(col.name);
  }
  const used = new Set(Object.values(map));
  const extra = headers.map((h, i) => ({ header: h, index: i })).filter((x) => !used.has(x.index) && String(x.header || '').trim() !== '');
  return { map, unmapped, extra };
}

// ---------------------------------------------------------------------------
// FK reference sets: live lookups ∪ bundled reference copy.
// ---------------------------------------------------------------------------

async function buildReference(ctx) {
  const lk = await getLookups(ctx);
  const sets = {};
  const add = (table, values) => {
    if (!sets[table]) sets[table] = new Set();
    for (const v of values || []) if (!isBlank(v)) sets[table].add(dkey(v));
  };
  add('District', lk.districts.map((d) => d.districtId));
  add('Unit', lk.units.map((u) => u.unitId));
  add('CrimeHead', lk.heads.map((h) => h.id));
  add('CrimeSubHead', lk.subHeads.map((s) => s.id));
  add('CaseCategory', lk.categories.map((c) => c.id));
  add('CaseStatusMaster', lk.statuses.map((s) => s.id));
  add('GravityOffence', lk.gravities.map((g) => g.id));
  const liveCounts = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size]));
  const bundled = REFERENCE.tables || {};
  for (const [table, ids] of Object.entries(bundled)) add(table, ids);
  const unitDistrict = new Map();
  for (const [u, d] of Object.entries(REFERENCE.unitDistrict || {})) unitDistrict.set(dkey(u), dkey(d));
  // Live lookups win over the bundled copy where both know a unit.
  for (const u of lk.units) unitDistrict.set(dkey(u.unitId), dkey(u.districtId));
  const subHeadHead = new Map();
  for (const [s, h] of Object.entries(REFERENCE.subHeadHead || {})) subHeadHead.set(dkey(s), dkey(h));
  for (const s of lk.subHeads) subHeadHead.set(dkey(s.id), dkey(s.headId));
  return {
    sets, unitDistrict, subHeadHead, lookups: lk,
    districtIds: sets.District || new Set(),
    source: { lookups: lk.source, bundled: REFERENCE.generatedAt || null, liveCounts, bundledCounts: Object.fromEntries(Object.entries(bundled).map(([k, v]) => [k, (v || []).length])) }
  };
}

/** Which of `values` exist in `table.column` — IN-chunked selects (≤100 per
 * query). District/unit ids are asked for in both their bare and 4-digit
 * padded forms (the masters hold 101, the fact tables and the fixture hold
 * '0101' — lib/lookups.js) and the answer set is normalised with dkey(). */
const PADDED_ID_COL = /district|unit/i;
async function storeKeys(ctx, table, column, values) {
  const found = new Set();
  const list = [...new Set(values.filter((v) => !isBlank(v)).map((v) => String(v)))];
  const ask = PADDED_ID_COL.test(column)
    ? [...new Set(list.flatMap((v) => (/^\d{1,3}$/.test(v) ? [v, v.padStart(4, '0')] : [v])))]
    : list;
  let queries = 0;
  let failed = false;
  for (let i = 0; i < ask.length; i += 100) {
    const chunk = ask.slice(i, i + 100);
    queries += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      const rows = await ctx.ds.query({ table, columns: [column], where: [{ col: column, op: 'in', val: chunk }] });
      for (const r of rows) found.add(dkey(r[column]));
    } catch (e) {
      failed = true;
      break;
    }
  }
  return { found, queries, failed, checked: list.length, has: (v) => found.has(dkey(v)) };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function rowToObject(row, headers) {
  if (Array.isArray(row)) {
    const o = {};
    headers.forEach((h, i) => { o[h] = row[i]; });
    return o;
  }
  return row || {};
}

/**
 * Validate one batch. Returns the full batch verdict (rows, profile, budget,
 * privacy, store checks). Pure apart from the store/lookup reads.
 */
async function validateBatch(ctx, input) {
  const t = tableDef(input.table);
  const headers = (input.columns || []).map((h) => String(h === undefined || h === null ? '' : h).replace(/^﻿/, '').trim());
  const bom = Boolean(input.columns && input.columns.length && /^﻿/.test(String(input.columns[0])));
  const options = Object.assign({ dropSensitive: true, strictGeo: false, dedupeStore: true }, input.options || {});
  const rowsIn = input.rows || [];
  const { map, unmapped, extra } = resolveMapping(t, headers, input.mapping);

  const missingRequired = t.columns.filter((c) => c.required && map[c.name] === undefined).map((c) => c.name);
  const prerequisites = await checkPrerequisites(ctx, t);

  const ref = await buildReference(ctx);
  const privacy = {
    dropSensitive: options.dropSensitive,
    neverUsedColumns: t.columns.filter((c) => c.neverUsed).map((c) => ({ column: c.name, action: options.dropSensitive ? 'dropped' : 'kept (never used in analytics)' })),
    piiColumns: t.columns.filter((c) => c.pii).map((c) => ({ column: c.name, action: 'loaded, never exported' })),
    extraColumns: extra.map((x) => ({ header: x.header, kind: classifyExtraHeader(x.header), action: 'dropped' })),
    tableNeverUsed: Boolean(t.neverUsed)
  };

  const perRow = [];
  const accepted = [];
  const acceptedMeta = [];
  const acceptedIndex = new Map(); // rowNo → index into accepted
  const parsed = []; // every row's typed values, verdict aside (FK store pass)
  const issueCounts = new Map();
  const nulls = {};
  for (const c of t.columns) nulls[c.name] = 0;
  const keyCols = keyColumns(t);
  const reportCols = [...new Set([...keyCols, ...(t.dupKeys || [])])];
  const batchKeys = new Map(); // key col → Map(value → first rowNo)
  for (const k of (t.dupKeys || keyCols)) batchKeys.set(k, new Map());
  if (keyCols.length > 1) batchKeys.set('__composite', new Map());
  let kannadaCells = 0;
  let dates = [];
  const units = new Map();
  const geo = { withCoords: 0, inDistrict: 0, outOfDistrict: 0, outOfState: 0, invalid: 0, unknownPolygon: 0 };

  const note = (issue) => {
    const k = `${issue.code}|${issue.severity}`;
    const cur = issueCounts.get(k) || { code: issue.code, severity: issue.severity, count: 0, column: issue.column || null, sample: issue.detail || null };
    cur.count += 1;
    issueCounts.set(k, cur);
  };

  rowsIn.forEach((raw, i) => {
    const rowNo = i + 1;
    const src = rowToObject(raw, headers);
    const out = {};
    const issues = [];
    for (const col of t.columns) {
      const idx = map[col.name];
      const rawVal = idx === undefined ? undefined : (Array.isArray(raw) ? raw[idx] : src[headers[idx]]);
      if (isBlank(rawVal)) {
        nulls[col.name] += 1;
        if (col.required) issues.push({ code: 'REQUIRED_MISSING', column: col.name, severity: 'reject' });
        out[col.name] = null;
        continue;
      }
      if (/[ಀ-೿]/.test(String(rawVal))) kannadaCells += 1;
      const p = parseValue(rawVal, col);
      if (p.issue) issues.push(Object.assign({ column: col.name }, p.issue));
      if (p.value === undefined) { out[col.name] = null; continue; }
      out[col.name] = p.value;
      if (col.neverUsed && options.dropSensitive) {
        out[col.name] = null;
        issues.push({ code: 'NEVER_USED_DROPPED', column: col.name, severity: 'info' });
      }
      if (col.fk && LOOKUP_TABLES.has(col.fk) && ref.sets[col.fk] && !ref.sets[col.fk].has(dkey(p.value))) {
        issues.push({ code: 'FK_MISSING', column: col.name, severity: col.soft ? 'warn' : 'reject', detail: `${col.fk} ${p.value}` });
      }
    }
    // extra source columns carrying data on this row → the guard acted here
    for (const x of extra) {
      const v = Array.isArray(raw) ? raw[x.index] : src[x.header];
      if (isBlank(v)) continue;
      const kind = classifyExtraHeader(x.header);
      issues.push({ code: kind === 'never-used' ? 'NEVER_USED_DROPPED' : kind === 'pii' ? 'PII_DROPPED' : 'UNKNOWN_COLUMN_IGNORED', column: x.header, severity: 'info' });
    }
    if (t.name === 'CaseMaster') {
      for (const is of crimeNoIssues(out, ref)) issues.push(is);
      const minor = out.CrimeMinorHeadID;
      const major = out.CrimeMajorHeadID;
      if (minor !== null && major !== null && ref.subHeadHead.has(dkey(minor)) && ref.subHeadHead.get(dkey(minor)) !== dkey(major)) {
        issues.push({ code: 'SUBHEAD_HEAD_MISMATCH', column: 'CrimeMinorHeadID', severity: 'reject', detail: `sub-head ${minor} belongs to head ${ref.subHeadHead.get(dkey(minor))}` });
      }
    }
    if (t.geo) {
      const lat = out[t.geo.lat] === null ? null : Number(out[t.geo.lat]);
      const lng = out[t.geo.lng] === null ? null : Number(out[t.geo.lng]);
      if (lat !== null && lng !== null) {
        geo.withCoords += 1;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          geo.invalid += 1;
          issues.push({ code: 'GEO_INVALID', column: t.geo.lat, severity: 'reject', detail: `${lat},${lng}` });
        } else if (lat < KARNATAKA_BBOX.latMin || lat > KARNATAKA_BBOX.latMax || lng < KARNATAKA_BBOX.lngMin || lng > KARNATAKA_BBOX.lngMax) {
          geo.outOfState += 1;
          issues.push({ code: 'GEO_OUT_OF_STATE', column: t.geo.lat, severity: 'reject', detail: `${lat},${lng}` });
        } else {
          const d = ref.unitDistrict.get(dkey(out[t.geo.unit]));
          const inside = d ? pointInDistrict(lat, lng, d) : null;
          if (inside === null) geo.unknownPolygon += 1;
          else if (inside) geo.inDistrict += 1;
          else {
            geo.outOfDistrict += 1;
            issues.push({ code: 'GEO_OUT_OF_DISTRICT', column: t.geo.lat, severity: options.strictGeo ? 'reject' : 'warn', detail: `outside district ${d} polygon` });
          }
        }
      } else if (lat !== null || lng !== null) {
        issues.push({ code: 'GEO_PARTIAL', column: lat === null ? t.geo.lat : t.geo.lng, severity: 'warn' });
      }
    }
    // duplicates inside the batch
    for (const [k, seen] of batchKeys) {
      const v = k === '__composite' ? keyCols.map((c) => String(out[c])).join('|') : out[k];
      if (v === null || v === undefined) continue;
      const key = String(v);
      if (seen.has(key)) issues.push({ code: 'DUP_IN_BATCH', column: k === '__composite' ? keyCols.join('+') : k, severity: 'reject', detail: `same as row ${seen.get(key)}` });
      else seen.set(key, rowNo);
    }
    if (t.dateColumn && out[t.dateColumn]) dates.push(String(out[t.dateColumn]).slice(0, 10));
    if (t.geo && out[t.geo.unit] !== null) units.set(dkey(out[t.geo.unit]), (units.get(dkey(out[t.geo.unit])) || 0) + 1);
    for (const is of issues) note(is);
    const verdict = issues.some((is) => is.severity === 'reject') ? 'reject' : 'accept';
    parsed.push(out);
    perRow.push({ rowNo, verdict, issues, keys: Object.fromEntries(reportCols.map((c) => [c, out[c]])) });
    if (verdict === 'accept') { acceptedIndex.set(rowNo, accepted.length); accepted.push(out); acceptedMeta.push(rowNo); }
  });

  // duplicates against the store + parent existence (needs the parsed keys)
  const storeChecks = [];
  if (options.dedupeStore && rowsIn.length) {
    for (const k of (t.dupKeys || (keyCols.length === 1 ? keyCols : []))) {
      const values = perRow.map((r) => r.keys[k]).filter((v) => v !== null && v !== undefined);
      if (!values.length) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await storeKeys(ctx, t.name, k, values);
      storeChecks.push({ kind: 'duplicate', table: t.name, column: k, checked: r.checked, found: r.found.size, queries: r.queries, failed: r.failed });
      if (r.failed) continue;
      for (const pr of perRow) {
        const v = pr.keys[k];
        if (v !== null && v !== undefined && r.has(v)) {
          const is = { code: 'DUP_IN_STORE', column: k, severity: 'reject', detail: String(v) };
          pr.issues.push(is);
          note(is);
        }
      }
    }
  }
  // FK targets outside the cached lookups (Court, Employee, Act, Section, the
  // CaseMaster/Accused parents of child tables): the bundled reference copy
  // answers first, then a page read for the values the bundle does not know —
  // so a fixture-only court (501) and a pipeline one (1–76) both pass.
  if (rowsIn.length) {
    for (const col of t.columns.filter((c) => c.fk && !LOOKUP_TABLES.has(c.fk))) {
      const target = tableDef(col.fk);
      const targetCol = FK_COLUMN[col.fk] || (target ? keyColumns(target)[0] : null);
      if (!targetCol) continue;
      const bundled = ref.sets[col.fk] || new Set();
      const distinct = [...new Set(parsed.map((r) => r[col.name]).filter((v) => v !== null && v !== undefined).map((v) => String(v)))];
      const unknown = distinct.filter((v) => !bundled.has(dkey(v)));
      const slice = unknown.slice(0, 2000);
      const checkedSet = new Set(slice);
      const check = { kind: 'fk', table: col.fk, column: targetCol, via: col.name, distinct: distinct.length, bundled: distinct.length - unknown.length, checked: slice.length, found: 0, queries: 0, failed: false, partial: unknown.length > slice.length };
      let found = new Set();
      if (slice.length) {
        // eslint-disable-next-line no-await-in-loop
        const r = await storeKeys(ctx, col.fk, targetCol, slice);
        found = new Set([...r.found]);
        check.queries = r.queries;
        check.failed = r.failed;
        check.found = r.found.size;
      }
      storeChecks.push(check);
      if (check.failed) continue;
      for (let i = 0; i < perRow.length; i += 1) {
        const v = parsed[i][col.name];
        if (v === null || v === undefined) continue;
        const sv = String(v);
        if (bundled.has(dkey(v)) || found.has(dkey(v)) || !checkedSet.has(sv)) continue;
        const is = { code: 'FK_MISSING', column: col.name, severity: col.soft ? 'warn' : 'reject', detail: `${col.fk} ${v}` };
        perRow[i].issues.push(is);
        note(is);
      }
    }
  }
  // re-derive verdicts after the store pass
  const finalAccepted = [];
  const finalAcceptedRowNos = [];
  for (let i = 0; i < perRow.length; i += 1) {
    const pr = perRow[i];
    pr.verdict = pr.issues.some((is) => is.severity === 'reject') ? 'reject' : 'accept';
    if (pr.verdict === 'accept') {
      const j = acceptedIndex.get(pr.rowNo);
      if (j !== undefined) { finalAccepted.push(accepted[j]); finalAcceptedRowNos.push(pr.rowNo); }
    }
  }

  const rejectedCount = perRow.filter((r) => r.verdict === 'reject').length;
  const warnRows = perRow.filter((r) => r.verdict === 'accept' && r.issues.some((is) => is.severity === 'warn')).length;
  dates = dates.sort();
  const profile = {
    rows: rowsIn.length,
    columnsMapped: Object.keys(map).length,
    columnsUnmapped: unmapped,
    nullRates: Object.fromEntries(Object.entries(nulls).map(([c, n]) => [c, rowsIn.length ? round((n / rowsIn.length) * 100, 1) : 0])),
    dateRange: dates.length ? { column: t.dateColumn, min: dates[0], max: dates[dates.length - 1] } : null,
    unitCoverage: t.geo ? {
      distinctUnits: units.size,
      knownUnits: [...units.keys()].filter((u) => ref.sets.Unit && ref.sets.Unit.has(u)).length,
      districts: [...new Set([...units.keys()].map((u) => ref.unitDistrict.get(u)).filter(Boolean))].length
    } : null,
    coordinates: t.geo ? geo : null,
    encoding: { bom, kannadaCells, replacementChars: (issueCounts.get('ENCODING_REPLACEMENT|warn') || { count: 0 }).count }
  };

  const budget = budgetFor(finalAccepted.length);

  return {
    table: t.name,
    mapping: Object.fromEntries(Object.entries(map).map(([c, idx]) => [c, headers[idx]])),
    unmappedColumns: unmapped,
    missingRequiredColumns: missingRequired,
    prerequisites,
    counts: { rows: rowsIn.length, accepted: finalAccepted.length, rejected: rejectedCount, acceptedWithWarnings: warnRows },
    rows: perRow,
    issueSummary: [...issueCounts.values()].sort((a, b) => b.count - a.count),
    profile,
    budget,
    privacy,
    storeChecks,
    reference: ref.source,
    acceptedRows: finalAccepted,
    acceptedRowNos: finalAcceptedRowNos
  };
}

function budgetFor(rows) {
  return {
    rows,
    insertCalls: Math.ceil(rows / CHUNK),
    chunkSize: CHUNK,
    freeTierInsertsPerMonth: FREE_TIER_INSERTS_PER_MONTH,
    withinFreeTier: rows <= FREE_TIER_INSERTS_PER_MONTH,
    loadedThisMonthByThisContainer: monthCounter.count(),
    note: 'Free-tier Data Store inserts are 5,000/month (docs/CATALYST_SERVICE_RESEARCH.md §4.1); the Basic plan is active on this project, so the check is advisory.'
  };
}

const monthCounter = (() => {
  let ym = null;
  let n = 0;
  const cur = () => `${new Date().getUTCFullYear()}-${pad2(new Date().getUTCMonth() + 1)}`;
  return {
    add(k) { if (ym !== cur()) { ym = cur(); n = 0; } n += k; },
    count() { return ym === cur() ? n : 0; }
  };
})();

/** Reference tables that must hold rows before this table can load. */
async function checkPrerequisites(ctx, t) {
  const req = t.requires || [];
  if (!req.length) return { ok: true, missing: [] };
  const lk = await getLookups(ctx);
  const present = {
    State: true, District: lk.districts.length > 0, Unit: lk.units.length > 0, CrimeHead: lk.heads.length > 0,
    CrimeSubHead: lk.subHeads.length > 0, CaseCategory: lk.categories.length > 0, CaseStatusMaster: lk.statuses.length > 0,
    GravityOffence: lk.gravities.length > 0
  };
  const missing = [];
  for (const r of req) {
    if (present[r] !== undefined) { if (!present[r]) missing.push(r); continue; }
    const def = tableDef(r);
    const pk = def ? keyColumns(def)[0] : null;
    if (!pk) continue;
    // eslint-disable-next-line no-await-in-loop
    const rows = await ctx.ds.query({ table: r, columns: [pk], limit: { offset: 0, count: 1 } }).catch(() => null);
    if (rows && rows.length === 0) missing.push(r);
  }
  return {
    ok: missing.length === 0,
    missing,
    message: missing.length ? `Load ${missing.join(', ')} before ${t.name} — the ER foreign keys point at them (docs/SCHEMA_CHECKLIST.md order).` : null
  };
}

// ---------------------------------------------------------------------------
// "What changed" — the same AggMonthly aggregates /summary/kpis reads, before
// and after this batch (projected from the accepted rows: the event function
// upserts AggMonthly per insert, the nightly job reconciles exactly), and the
// robust-z check each touched district × crime-head month would trip.
// ---------------------------------------------------------------------------

async function whatChanged(ctx, t, acceptedRows) {
  if (t.name !== 'CaseMaster') return { applicable: false, note: `"What changed" is computed for CaseMaster loads; ${t.name} rows do not move the KPI aggregates.` };
  const lk = await getLookups(ctx);
  const curYm = await anchorYm(ctx.ds, null);
  const prevYm = ymAdd(curYm, -1);
  const [monthRows, alertRows] = await Promise.all([
    ctx.ds.query({
      table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)', 'SUM(HeinousCount)'],
      where: [{ col: 'Ym', op: '>=', val: prevYm }, { col: 'Ym', op: '<=', val: curYm }], groupBy: ['Ym']
    }).catch(() => []),
    ctx.ds.query({ table: 'AnomalyAlert', columns: ['COUNT(AlertID)'], where: [{ col: 'Status', op: '=', val: 'OPEN' }] }).catch(() => [])
  ]);
  const byYm = {};
  for (const r of monthRows) byYm[r.Ym] = { cases: toNum(r['SUM(CaseCount)']), heinous: toNum(r['SUM(HeinousCount)']) };
  const cur = byYm[curYm] || { cases: 0, heinous: 0 };
  const prev = byYm[prevYm] || { cases: 0, heinous: 0 };

  const byMonth = new Map();
  const pairs = new Map(); // `${d}|${h}|${ym}` → {cases, heinous}
  for (const r of acceptedRows) {
    const ym = String(r.CrimeRegisteredDate || '').slice(0, 7);
    const parts = parseCrimeNo(r.CrimeNo);
    const d = parts ? parts.district : null;
    const h = toNum(r.CrimeMajorHeadID, null);
    const heinous = toNum(r.GravityOffenceID) === 1 ? 1 : 0;
    const m = byMonth.get(ym) || { ym, cases: 0, heinous: 0 };
    m.cases += 1; m.heinous += heinous; byMonth.set(ym, m);
    if (!d || h === null) continue;
    const k = `${d}|${h}|${ym}`;
    const p = pairs.get(k) || { districtId: d, crimeHeadId: h, ym, cases: 0, heinous: 0 };
    p.cases += 1; p.heinous += heinous; pairs.set(k, p);
  }
  const addCur = byMonth.get(curYm) || { cases: 0, heinous: 0 };
  const addPrev = byMonth.get(prevYm) || { cases: 0, heinous: 0 };
  const before = { totalFirs: cur.cases, heinousCount: cur.heinous, momPct: pctDelta(cur.cases, prev.cases), activeAlerts: toNum(alertRows.length ? alertRows[0]['COUNT(AlertID)'] : 0), asOfYm: curYm };
  const afterCases = cur.cases + addCur.cases;
  const after = { totalFirs: afterCases, heinousCount: cur.heinous + addCur.heinous, momPct: pctDelta(afterCases, prev.cases + addPrev.cases), activeAlerts: before.activeAlerts, asOfYm: curYm };

  // z-check per touched district × head month (top 12 by batch count)
  const top = [...pairs.values()].sort((a, b) => b.cases - a.cases).slice(0, 12);
  const alerts = [];
  for (const p of top) {
    const fromYm = ymAdd(p.ym, -11);
    // eslint-disable-next-line no-await-in-loop
    const rows = await ctx.ds.query({
      table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)'],
      where: [{ col: 'DistrictID', op: '=', val: p.districtId }, { col: 'CrimeHeadID', op: '=', val: p.crimeHeadId }, { col: 'Ym', op: '>=', val: fromYm }, { col: 'Ym', op: '<=', val: p.ym }],
      groupBy: ['Ym']
    }).catch(() => []);
    const series = new Map(rows.map((r) => [String(r.Ym), toNum(r['SUM(CaseCount)'])]));
    const months = ymRange(fromYm, p.ym);
    const values = months.map((m) => series.get(m) || 0);
    const baseline = values.slice(0, -1);
    const current = values[values.length - 1];
    // Same rule as functions/dappa_event: fewer than three baseline months
    // with data is "not enough history", never a nine-sigma alert on zeros.
    const withData = baseline.filter((v) => v > 0).length;
    const enough = withData >= 3;
    const zBefore = enough ? round(robustZ(baseline, current), 2) : null;
    const zAfter = enough ? round(robustZ(baseline, current + p.cases), 2) : null;
    alerts.push({
      districtId: p.districtId, districtName: lk.districtName(p.districtId), crimeHeadId: p.crimeHeadId, headName: lk.headName(p.crimeHeadId),
      ym: p.ym, observedBefore: current, added: p.cases, observedAfter: current + p.cases, zBefore, zAfter,
      baselineMonths: withData, wouldRaise: zAfter !== null && zAfter >= 2 && (zBefore === null || zBefore < 2),
      status: zAfter === null ? 'nodata' : zAfter >= 3 ? 'rising' : zAfter >= 2 ? 'watch' : 'stable'
    });
  }
  alerts.sort((a, b) => (b.zAfter || 0) - (a.zAfter || 0));
  const monthsSorted = [...byMonth.values()].sort((a, b) => b.cases - a.cases);
  return {
    applicable: true,
    asOfYm: curYm,
    batch: { rows: acceptedRows.length, month: monthsSorted.length ? monthsSorted[0].ym : null, months: byMonth.size },
    kpis: { before, after, delta: { totalFirs: after.totalFirs - before.totalFirs, heinousCount: after.heinousCount - before.heinousCount } },
    byMonth: [...byMonth.values()].sort((a, b) => a.ym.localeCompare(b.ym)),
    alerts,
    wouldRaise: alerts.filter((a) => a.wouldRaise).length,
    method: 'before = AggMonthly SUM(CaseCount)/SUM(HeinousCount) for the anchor month (the /summary/kpis aggregates); after = before + accepted rows in that month; z = MAD robust z of the month total against the trailing 11 months (lib/circuits.js robustZ), the same statistic the nightly job uses; alert line z ≥ 2 (docs/UX_RESEARCH.md §11 rule 3).'
  };
}

// ---------------------------------------------------------------------------
// Batch store (per container, bounded, TTL) + load / rollback / audit.
// ---------------------------------------------------------------------------

const BATCHES = new Map();
const BATCH_LIMIT = 12;
const BATCH_TTL_MS = 2 * 3600 * 1000;
let seq = 0;

function newBatchId() {
  seq = (seq + 1) % 46656;
  return `ing-${Date.now().toString(36)}-${seq.toString(36).padStart(3, '0')}`;
}

function sweep() {
  const now = Date.now();
  for (const [id, b] of BATCHES) if (now - b.touchedAt > BATCH_TTL_MS) BATCHES.delete(id);
  while (BATCHES.size > BATCH_LIMIT) {
    const oldest = [...BATCHES.values()].sort((a, b) => a.touchedAt - b.touchedAt)[0];
    BATCHES.delete(oldest.batchId);
  }
}

function getBatch(id) {
  const b = BATCHES.get(String(id || ''));
  if (b) b.touchedAt = Date.now();
  return b || null;
}

function resumeTokenFor(b) {
  return `${b.batchId}:${b.cursor}`;
}

function parseResumeToken(token) {
  const m = String(token || '').match(/^(ing-[a-z0-9]+-[a-z0-9]{3}):(\d+)$/);
  return m ? { batchId: m[1], cursor: Number(m[2]) } : null;
}

/** Public summary of a batch (no row payloads). */
function summarize(b) {
  return {
    batchId: b.batchId, table: b.table, status: b.status, storage: b.storage || null,
    createdAt: b.createdAt, updatedAt: b.updatedAt,
    counts: b.counts, cursor: b.cursor, inserted: b.inserted.length, remaining: Math.max(0, b.accepted.length - b.cursor),
    resumeToken: b.status === 'validated' || b.status === 'loading' ? resumeTokenFor(b) : null,
    rolledBack: Boolean(b.rolledBack), actor: b.actor || null, audit: b.audit || null,
    receivedRows: b.status === 'receiving' ? b.raw.length : undefined
  };
}

/** Create (or extend) a batch from a validate call. Handles multi-part uploads. */
async function receive(ctx, input) {
  sweep();
  const t = tableDef(input.table);
  if (!t) throw httpError(400, 'BAD_REQUEST', `Unknown table "${input.table}" — GET /ingest/tables lists the 27 ER tables.`);
  const part = input.part || null;
  let b = part && part.batchId ? getBatch(part.batchId) : null;
  if (part && part.batchId && !b) throw httpError(404, 'BATCH_NOT_FOUND', 'This batch is no longer in memory (2-hour TTL or a container restart) — validate again.');
  if (b && b.status !== 'receiving') throw httpError(409, 'BATCH_STATE', `Batch ${b.batchId} is ${b.status}; parts can only extend a batch that is still receiving.`);
  if (!Array.isArray(input.columns) || !input.columns.length) throw httpError(400, 'BAD_REQUEST', 'columns[] (the CSV header) is required.');
  if (!Array.isArray(input.rows)) throw httpError(400, 'BAD_REQUEST', 'rows[] is required (arrays aligned with columns, or objects keyed by header).');
  if (!b) {
    b = {
      batchId: newBatchId(), table: t.name, status: 'receiving', createdAt: new Date().toISOString(), updatedAt: null, touchedAt: Date.now(),
      columns: input.columns, mapping: input.mapping || null, options: input.options || {}, raw: [], accepted: [], acceptedRowNos: [], rows: [],
      counts: null, cursor: 0, inserted: [], rowIds: [], storage: null, audit: null
    };
    BATCHES.set(b.batchId, b);
  }
  if (b.raw.length + input.rows.length > MAX_ROWS) throw httpError(400, 'TOO_MANY_ROWS', `A batch holds at most ${MAX_ROWS} rows (${b.raw.length} received so far).`);
  for (const r of input.rows) b.raw.push(r);
  b.updatedAt = new Date().toISOString();
  if (part && !part.final) return { batch: b, result: null };
  const result = await validateBatch(ctx, { table: t.name, columns: b.columns, rows: b.raw, mapping: b.mapping, options: b.options });
  b.raw = [];
  b.status = 'validated';
  b.accepted = result.acceptedRows;
  b.acceptedRowNos = result.acceptedRowNos;
  b.rows = result.rows;
  b.counts = result.counts;
  b.mappingResolved = result.mapping;
  b.profile = result.profile;
  b.budget = result.budget;
  b.privacy = result.privacy;
  b.issueSummary = result.issueSummary;
  b.storeChecks = result.storeChecks;
  b.prerequisites = result.prerequisites;
  b.projected = await whatChanged(ctx, t, b.accepted).catch((e) => ({ applicable: false, error: String(e && e.message) }));
  delete result.acceptedRows;
  delete result.acceptedRowNos;
  return { batch: b, result };
}

function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/** Caller may load when the admin token matches or the declared tier is district/state. */
function loadAuthorization(req) {
  const tier = String((req.headers && req.headers['x-dappa-tier']) || '').toLowerCase();
  if (isAuthed(req)) return { ok: true, actorRole: 'admin', actor: 'demo-admin', tier: tier || 'state' };
  if (tier === 'district' || tier === 'state') return { ok: true, actorRole: tier, actor: String((req.headers && req.headers['x-dappa-actor']) || 'officer'), tier };
  return { ok: false, tier: tier || null };
}

function catalystApp(req) {
  try {
    const capp = require('zcatalyst-sdk-node').initialize(req);
    return capp || null;
  } catch (e) {
    return null;
  }
}

async function auditRow(ctx, req, b, authz, outcome) {
  const rec = {
    AlertKey: b.batchId, ActionType: 'ingest', Actor: authz.actor, ActorRole: authz.actorRole, Unit: null,
    Note: `${b.table}: ${b.counts.accepted} accepted / ${b.counts.rejected} rejected of ${b.counts.rows} rows; ${b.inserted.length} written (${b.storage})`,
    OutcomeLabel: outcome, Payload: JSON.stringify({ batchId: b.batchId, table: b.table, counts: b.counts, storage: b.storage, inserted: b.inserted.length }),
    ClientTs: new Date().toISOString().replace('T', ' ').slice(0, 19)
  };
  // phase 7 owns lib/actionlog.js (recordAction(ctx, req, input, identity),
  // subjectType 'ingest', actionType 'note'); use it when it is present, else
  // the minimal SDK/memory path below.
  try {
    // eslint-disable-next-line global-require
    const al = require('./actionlog');
    if (al && typeof al.recordAction === 'function') {
      const r = await al.recordAction(ctx, req,
        { subjectType: 'ingest', subjectKey: b.batchId, actionType: 'note', note: `${outcome}: ${rec.Note}`, source: 'ingest' },
        { actor: authz.actor, actorRole: authz.actorRole, actorSource: authz.actorRole === 'admin' ? 'admin-token' : 'tier-header' });
      if (r && r.ok) return { source: 'actionlog', ok: true, storage: r.storage || null };
      logJson('warn', 'ingest_audit_rejected', { batchId: b.batchId, code: r && r.code, message: r && r.message });
    }
  } catch (e) { /* module absent — fall through */ }
  const capp = catalystApp(req);
  if (capp) {
    try {
      await capp.datastore().table('ActionLog').insertRow(rec);
      return { source: 'datastore', ok: true };
    } catch (e) {
      return { source: 'memory', ok: true, note: `ActionLog insert failed (${String(e && e.message).slice(0, 80)}); kept in memory` };
    }
  }
  return { source: 'memory', ok: true };
}

/**
 * Load accepted rows in chunks of ≤200. `chunkLimit` chunks per call, then a
 * resume token. Data Store writes need the SDK app (deployed) AND the admin
 * token; otherwise the rows are held in memory so the flow is demonstrable.
 */
async function load(ctx, req, body) {
  const b = body.resumeToken ? getBatch((parseResumeToken(body.resumeToken) || {}).batchId) : getBatch(body.batchId);
  if (!b) throw httpError(404, 'BATCH_NOT_FOUND', 'Batch not found — it may have expired (2-hour TTL) or lived in another container. Validate again.');
  if (b.status === 'receiving') throw httpError(409, 'BATCH_STATE', 'Batch is still receiving parts; send the final part first.');
  if (b.rolledBack) throw httpError(409, 'BATCH_STATE', 'Batch was rolled back.');
  if (body.acceptOnlyValid === false) throw httpError(400, 'BAD_REQUEST', 'Rejected rows are never loaded; send acceptOnlyValid:true (the rejection report explains each row).');
  if (b.prerequisites && !b.prerequisites.ok) throw httpError(409, 'ORDER_REFERENCE_FIRST', b.prerequisites.message);
  const authz = loadAuthorization(req);
  if (!authz.ok) throw httpError(403, 'TIER_REQUIRED', 'Loading needs the District or State tier (X-Dappa-Tier header) or the admin token.');
  if (body.resumeToken) {
    const tok = parseResumeToken(body.resumeToken);
    if (!tok || tok.cursor !== b.cursor) throw httpError(409, 'RESUME_MISMATCH', `Resume token cursor ${tok ? tok.cursor : '?'} does not match the batch cursor ${b.cursor}.`);
  }
  const capp = authz.actorRole === 'admin' ? catalystApp(req) : null;
  if (!b.storage) b.storage = capp ? 'datastore' : 'memory';
  b.status = 'loading';
  b.actor = authz.actor;
  const chunkLimit = Math.max(1, Math.min(25, toNum(body.chunkLimit, 5) || 5));
  let chunks = 0;
  let lastError = null;
  while (b.cursor < b.accepted.length && chunks < chunkLimit) {
    const rows = b.accepted.slice(b.cursor, b.cursor + CHUNK);
    const rowNos = b.acceptedRowNos.slice(b.cursor, b.cursor + CHUNK);
    if (b.storage === 'datastore') {
      try {
        // eslint-disable-next-line no-await-in-loop
        const out = await capp.datastore().table(b.table).insertRows(rows);
        (Array.isArray(out) ? out : []).forEach((r) => { if (r && r.ROWID !== undefined) b.rowIds.push(String(r.ROWID)); });
      } catch (e) {
        lastError = String((e && e.message) || e);
        logJson('warn', 'ingest_insert_failed', { batchId: b.batchId, cursor: b.cursor, message: lastError });
        break;
      }
    }
    rowNos.forEach((n) => b.inserted.push(n));
    b.cursor += rows.length;
    chunks += 1;
    monthCounter.add(rows.length);
  }
  b.updatedAt = new Date().toISOString();
  const done = b.cursor >= b.accepted.length;
  if (done) b.status = 'loaded';
  else if (lastError) b.status = 'partial';
  let changed = null;
  if (done) {
    const t = tableDef(b.table);
    changed = await whatChanged(ctx, t, b.accepted).catch(() => b.projected);
    b.whatChanged = changed;
    b.audit = await auditRow(ctx, req, b, authz, lastError ? 'partial' : 'loaded');
  }
  return {
    batchId: b.batchId, table: b.table, status: b.status, storage: b.storage,
    accepted: b.accepted.length, rejected: b.counts.rejected, inserted: b.inserted.length,
    remaining: Math.max(0, b.accepted.length - b.cursor), done,
    progressPct: b.accepted.length ? round((b.cursor / b.accepted.length) * 100, 1) : 100,
    resumeToken: done ? null : resumeTokenFor(b), chunksThisCall: chunks, error: lastError,
    whatChanged: changed, audit: b.audit, actor: { actor: authz.actor, role: authz.actorRole, tier: authz.tier }
  };
}

/** Undo this batch's inserts. Memory: always. Data Store: only the ROWIDs this
 * container recorded, with the admin token — anything else is refused honestly. */
async function rollback(ctx, req, batchId) {
  const b = getBatch(batchId);
  if (!b) throw httpError(404, 'BATCH_NOT_FOUND', 'Batch not found in this container.');
  if (b.rolledBack) throw httpError(409, 'BATCH_STATE', 'Batch already rolled back.');
  if (!b.inserted.length) throw httpError(409, 'BATCH_STATE', 'Nothing was loaded from this batch.');
  const authz = loadAuthorization(req);
  if (!authz.ok) throw httpError(403, 'TIER_REQUIRED', 'Rollback needs the District or State tier or the admin token.');
  let removed = 0;
  let note = null;
  if (b.storage === 'memory') {
    removed = b.inserted.length;
  } else {
    if (authz.actorRole !== 'admin') throw httpError(403, 'AUTH_REQUIRED', 'Data Store rollback needs the admin token.');
    if (!b.rowIds.length) throw httpError(409, 'ROLLBACK_UNAVAILABLE', 'The Data Store did not return ROWIDs for this batch, so its rows cannot be identified for deletion. Delete by CrimeNo/CaseMasterID from the console instead.');
    const capp = catalystApp(req);
    if (!capp) throw httpError(503, 'CATALYST_UNAVAILABLE', 'Catalyst SDK unavailable in this runtime.');
    for (let i = 0; i < b.rowIds.length; i += CHUNK) {
      // eslint-disable-next-line no-await-in-loop
      await capp.datastore().table(b.table).deleteRows(b.rowIds.slice(i, i + CHUNK));
      removed += Math.min(CHUNK, b.rowIds.length - i);
    }
    note = 'Rows deleted by ROWID; the event function\'s AggMonthly increments are reconciled by the nightly job (D-? in docs/round2/decisions-phase8-ingest.md).';
  }
  b.rolledBack = true;
  b.status = 'rolled-back';
  b.updatedAt = new Date().toISOString();
  b.audit = await auditRow(ctx, req, b, authz, 'rolled-back');
  return { batchId: b.batchId, storage: b.storage, removed, note, audit: b.audit };
}

/** Row-level rejection report — keys + reasons only, never a PII column. */
function rejectionCsv(b) {
  const t = tableDef(b.table);
  const keys = keyColumns(t).filter((k) => !(t.columns.find((c) => c.name === k) || {}).pii);
  const columns = ['rowNo', ...keys, 'verdict', 'codes', 'columns', 'details'];
  const rows = b.rows.filter((r) => r.verdict === 'reject' || r.issues.some((is) => is.severity === 'warn')).map((r) => Object.assign(
    { rowNo: r.rowNo, verdict: r.verdict },
    Object.fromEntries(keys.map((k) => [k, r.keys[k]])),
    {
      codes: r.issues.map((is) => `${is.code}${is.severity === 'reject' ? '' : `(${is.severity})`}`).join('|'),
      columns: r.issues.map((is) => is.column || '').join('|'),
      details: r.issues.map((is) => is.detail || '').join('|')
    }
  ));
  return toCsv(rows, columns);
}

function templateCsv(t, withExample) {
  const columns = t.columns.map((c) => c.name);
  const example = withExample ? [Object.fromEntries(t.columns.map((c) => [c.name, exampleValue(c)]))] : [];
  return toCsv(example, columns);
}

function exampleValue(c) {
  switch (c.type) {
    case 'Int': return c.crimeNo ? '' : '1';
    case 'Double': return '12.9716';
    case 'Boolean': return 'true';
    case 'Date': return '2026-07-15';
    case 'DateTime': return '2026-07-15 10:30:00';
    default: return c.crimeNo ? '101013125202690001' : c.name;
  }
}

function listTables() {
  return TABLES.map((t) => ({
    name: t.name, order: t.order, group: t.group, requires: t.requires || [], key: keyColumns(t), dupKeys: t.dupKeys || null,
    neverUsed: Boolean(t.neverUsed), dateColumn: t.dateColumn || null, geo: t.geo || null,
    columns: t.columns.map((c) => ({
      name: c.name, type: c.type, max: c.max || (c.type === 'Varchar' ? VARCHAR_MAX : c.type === 'Text' ? TEXT_MAX : null),
      required: Boolean(c.required), pk: Boolean(c.pk), fk: c.fk || null, softFk: Boolean(c.soft), pii: Boolean(c.pii), neverUsed: Boolean(c.neverUsed), crimeNo: Boolean(c.crimeNo)
    })),
    presets: PRESETS.filter((p) => p.table === t.name)
  }));
}

function listBatches() {
  sweep();
  return [...BATCHES.values()].sort((a, b) => b.touchedAt - a.touchedAt).map(summarize);
}

/** Test hook. */
function resetBatches() {
  BATCHES.clear();
}

module.exports = {
  TABLES, PRESETS, MAX_ROWS, CHUNK, FREE_TIER_INSERTS_PER_MONTH, KARNATAKA_BBOX,
  tableDef, listTables, keyColumns, resolveMapping, classifyExtraHeader,
  parseValue, parseDateParts, parseCrimeNo, crimeNoIssues, pointInDistrict, pointInGeometry,
  validateBatch, whatChanged, budgetFor, checkPrerequisites,
  receive, load, rollback, getBatch, listBatches, summarize, rejectionCsv, templateCsv, resumeTokenFor, parseResumeToken,
  loadAuthorization, resetBatches, httpError
};
