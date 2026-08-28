#!/usr/bin/env node
// make_ingest_demo.mjs — builds the ingest demo dataset and the bundled
// reference copy of the masters that lib/ingest.js unions with the live
// lookups for FK checks.
//
//   node scripts/make_ingest_demo.mjs
//
// Writes:
//   data/ingest_demo/CaseMaster_sample.csv   200 rows in the official column
//                                            order: 183 clean rows with NEW
//                                            CaseMasterIDs/CrimeNos (never a
//                                            duplicate of the loaded store) and
//                                            17 deliberately special rows (12
//                                            rejected, 5 accepted with a note)
//   data/ingest_demo/README.md               what each special row exercises
//   functions/dappa_api/assets/ingest_reference.json  ids of every master
//                                            table in pipeline/out (District,
//                                            Unit→District, CrimeHead,
//                                            CrimeSubHead→Head, CaseCategory,
//                                            CaseStatusMaster, GravityOffence,
//                                            Court, Employee, Rank, Designation,
//                                            UnitType, Act, Section, Occupation,
//                                            State)
//
// Deterministic: same pipeline output → same files (seeded by hash32).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'pipeline', 'out');
const DEMO_DIR = path.join(ROOT, 'data', 'ingest_demo');
const ASSET = path.join(ROOT, 'functions', 'dappa_api', 'assets', 'ingest_reference.json');

function hash32(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** RFC-4180 parser (quotes, doubled quotes, embedded newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const read = (name) => parseCsv(fs.readFileSync(path.join(OUT, `${name}.csv`), 'utf8').replace(/^\uFEFF/, ''));

const csvCell = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// --- bundled reference ---------------------------------------------------
const ids = (name, col) => read(name).map((r) => r[col]).filter((v) => v !== '');
const units = read('Unit');
const subHeads = read('CrimeSubHead');
const reference = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'pipeline/out (python3.12 pipeline/generate.py) — docs/SCHEMA_CHECKLIST.md tables 1–19',
  tables: {
    State: ids('State', 'StateID'),
    District: ids('District', 'DistrictID'),
    UnitType: ids('UnitType', 'UnitTypeID'),
    Unit: units.map((u) => u.UnitID),
    Rank: ids('Rank', 'RankID'),
    Designation: ids('Designation', 'DesignationID'),
    Employee: ids('Employee', 'EmployeeID'),
    CaseCategory: ids('CaseCategory', 'CaseCategoryID'),
    GravityOffence: ids('GravityOffence', 'GravityOffenceID'),
    CaseStatusMaster: ids('CaseStatusMaster', 'CaseStatusID'),
    OccupationMaster: ids('OccupationMaster', 'OccupationID'),
    Act: ids('Act', 'ActCode'),
    Section: read('Section').map((s) => s.SectionCode),
    CrimeHead: ids('CrimeHead', 'CrimeHeadID'),
    CrimeSubHead: subHeads.map((s) => s.CrimeSubHeadID),
    Court: ids('Court', 'CourtID')
  },
  unitDistrict: Object.fromEntries(units.map((u) => [u.UnitID, u.DistrictID])),
  subHeadHead: Object.fromEntries(subHeads.map((s) => [s.CrimeSubHeadID, s.CrimeHeadID]))
};
fs.writeFileSync(ASSET, JSON.stringify(reference));
console.log(`reference: ${Object.entries(reference.tables).map(([k, v]) => `${k} ${v.length}`).join(', ')} → ${path.relative(ROOT, ASSET)}`);

// --- demo CaseMaster sample ------------------------------------------------
const HEADER = ['CaseMasterID', 'CrimeNo', 'CaseNo', 'CrimeRegisteredDate', 'PolicePersonID', 'PoliceStationID', 'CaseCategoryID', 'GravityOffenceID', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'CaseStatusID', 'CourtID', 'IncidentFromDate', 'IncidentToDate', 'InfoReceivedPSDate', 'latitude', 'longitude', 'BriefFacts'];
const all = read('CaseMaster');
const lastYm = all.map((r) => r.CrimeRegisteredDate.slice(0, 7)).sort().pop();
// Districts whose synthetic coordinates all fall inside their census polygon
// (scratch geo check, 28 Aug 2026) so clean rows raise no geo warnings.
const CLEAN_DISTRICTS = new Set(['101', '103', '106', '107', '108', '109', '110', '111', '113', '114', '115', '118', '120', '123', '125', '126', '127', '128', '131', '132', '134', '135']);
const pool = all.filter((r) => r.CrimeRegisteredDate.startsWith(lastYm) && CLEAN_DISTRICTS.has(r.CrimeNo.slice(1, 5).replace(/^0+/, '')));
pool.sort((a, b) => hash32(`demo|${a.CaseMasterID}`) - hash32(`demo|${b.CaseMasterID}`));
const TOTAL = 200;
const SPECIAL = 17;
const clean = pool.slice(0, TOTAL - SPECIAL);
const spare = pool.slice(TOTAL - SPECIAL, TOTAL + 10);

let nextId = 90001;
let serial = 90001;
function renumber(r) {
  const o = Object.assign({}, r);
  const year = r.CrimeRegisteredDate.slice(0, 4);
  o.CaseMasterID = String(nextId);
  nextId += 1;
  const s = String(serial).padStart(5, '0');
  serial += 1;
  o.CrimeNo = `${r.CrimeNo.slice(0, 9)}${year}${s}`;
  o.CaseNo = `${year}${s}`;
  return o;
}
const rows = clean.map(renumber);

// deliberately special rows — each carries exactly one defect (see README)
const special = [];
const take = () => renumber(spare.shift());
const note = (r, why, expect) => { special.push({ r, why, expect }); return r; };
{ const r = take(); r.CrimeNo = r.CrimeNo.slice(0, 17); note(r, 'CrimeNo has 17 digits', 'CRIMENO_FORMAT → rejected'); }
{ const r = take(); r.CrimeNo = `${r.CrimeNo[0]}0136${r.CrimeNo.slice(5)}`; note(r, 'CrimeNo district segment 0136 (KGF) while the station belongs to another district', 'CRIMENO_DISTRICT → rejected'); }
{ const r = take(); r.PoliceStationID = ''; note(r, 'PoliceStationID blank (no station, so no district)', 'REQUIRED_MISSING → rejected'); }
{ const r = take(); r.latitude = '28.6139'; r.longitude = '77.2090'; note(r, 'coordinate in New Delhi, outside Karnataka', 'GEO_OUT_OF_STATE → rejected'); }
{ const r = take(); r.CrimeRegisteredDate = '15/13/2026'; note(r, 'registration date 15/13/2026 (month 13)', 'DATE_INVALID → rejected'); }
{ const r = take(); r.BriefFacts = `${r.BriefFacts} ${'Repeated narrative padding. '.repeat(400)}`; note(r, 'BriefFacts longer than 10,000 characters', 'LEN_TEXT → rejected'); }
{ const r = take(); const twin = Object.assign({}, rows[0]); Object.assign(r, { CrimeNo: twin.CrimeNo, CaseNo: twin.CaseNo }); note(r, `CrimeNo repeats row 1 (${twin.CrimeNo})`, 'DUP_IN_BATCH → rejected'); }
{ const r = take(); r.CaseMasterID = all[0].CaseMasterID; r.CrimeNo = all[0].CrimeNo; r.CaseNo = all[0].CaseNo; r.CrimeRegisteredDate = all[0].CrimeRegisteredDate; r.PoliceStationID = all[0].PoliceStationID; r.CaseCategoryID = all[0].CaseCategoryID; r.IncidentFromDate = all[0].IncidentFromDate; r.IncidentToDate = all[0].IncidentToDate; r.InfoReceivedPSDate = all[0].InfoReceivedPSDate; note(r, `CaseMasterID ${all[0].CaseMasterID} / CrimeNo ${all[0].CrimeNo} already in the loaded store (pipeline row 1)`, 'DUP_IN_STORE → rejected'); }
{ const r = take(); r.CrimeMinorHeadID = '999'; note(r, 'CrimeMinorHeadID 999 does not exist in CrimeSubHead', 'FK_MISSING → rejected'); }
{ const r = take(); r.CaseStatusID = 'open'; note(r, 'CaseStatusID is the word "open", not an Int', 'TYPE_INT → rejected'); }
{ const r = take(); r.latitude = '91.5'; note(r, 'latitude 91.5 (outside ±90)', 'GEO_INVALID → rejected'); }
{ const r = take(); r.CrimeNo = `${r.CrimeNo.slice(0, 9)}2019${r.CrimeNo.slice(13)}`; r.CaseNo = `2019${r.CaseNo.slice(4)}`; note(r, 'CrimeNo year segment 2019 while the registration date is in ' + r.CrimeRegisteredDate.slice(0, 4), 'CRIMENO_YEAR → rejected'); }
// accepted with a note
{ const r = take(); r.latitude = '12.9716'; r.longitude = '77.5946'; r._geoNote = true; note(r, 'coordinate in central Bengaluru while the station is in another district (inside Karnataka)', 'GEO_OUT_OF_DISTRICT → accepted with a warning'); }
{ const r = take(); const [y, m, d] = r.CrimeRegisteredDate.split('-'); r.CrimeRegisteredDate = `${d}-${m}-${y}`; note(r, `registration date written dd-mm-yyyy (${r.CrimeRegisteredDate})`, 'DATE_NORMALISED → accepted, converted to ISO'); }
{ const r = take(); r.PolicePersonID = `${r.PolicePersonID.slice(0, -3).replace(/(\d)(?=(\d{2})+$)/g, '$1,')},${r.PolicePersonID.slice(-3)}`; note(r, `PolicePersonID with Indian digit grouping (${r.PolicePersonID})`, 'DIGIT_GROUPING → accepted, commas stripped'); }
{ const r = take(); r._caste = 'X'; note(r, 'a value in the extra "Caste" column', 'NEVER_USED_DROPPED → accepted, column dropped by the privacy guard'); }
{ const r = take(); r._phone = '9876543210'; note(r, 'a value in the extra "ComplainantPhone" column', 'PII_DROPPED → accepted, column dropped and never exported'); }

// Place the special rows at deterministic positions so the preview (first 50)
// shows a few of them.
const merged = rows.slice();
special.forEach((s, i) => merged.splice(Math.min(merged.length, 7 + i * 11), 0, s.r));
const EXTRA = ['Caste', 'ComplainantPhone'];
const lines = [[...HEADER, ...EXTRA].join(',')];
for (const r of merged) lines.push([...HEADER.map((h) => csvCell(r[h])), csvCell(r._caste || ''), csvCell(r._phone || '')].join(','));
fs.mkdirSync(DEMO_DIR, { recursive: true });
const csvText = `\uFEFF${lines.join('\r\n')}\r\n`;
fs.writeFileSync(path.join(DEMO_DIR, 'CaseMaster_sample.csv'), csvText);
// The /ingest screen's "use the sample file" button fetches this copy.
const PUBLIC_DIR = path.join(ROOT, 'client', 'public', 'ingest_demo');
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.writeFileSync(path.join(PUBLIC_DIR, 'CaseMaster_sample.csv'), csvText);

const positions = new Map(merged.map((r, i) => [r, i + 1]));
const readme = [
  '# data/ingest_demo — the twenty-second ingest demo',
  '',
  `\`CaseMaster_sample.csv\` holds **${merged.length} rows** in the official ER column order (docs/SCHEMA_CHECKLIST.md §20) plus two extra columns the privacy guard must catch (\`Caste\`, \`ComplainantPhone\`). It is generated by \`node scripts/make_ingest_demo.mjs\` from \`pipeline/out/CaseMaster.csv\`:`,
  '',
  `- ${clean.length} clean rows from ${lastYm} (the latest month in the pipeline output) in districts whose synthetic coordinates all fall inside their census polygon, renumbered to CaseMasterID ${rows[0].CaseMasterID}+ and CrimeNo serial 90001+ so a load never duplicates the 45,000 rows already in the Data Store.`,
  `- ${special.length} deliberately special rows — ${special.filter((s) => /rejected$/.test(s.expect)).length} rejected, ${special.filter((s) => /accepted/.test(s.expect)).length} accepted with a note — so the rejection report and the privacy guard have something to show.`,
  '- The file starts with a UTF-8 BOM and uses CRLF line ends, the way Excel writes it.',
  '',
  '| Row | What is wrong | Expected verdict |',
  '|---|---|---|',
  ...special.map((s) => `| ${positions.get(s.r)} | ${s.why} | \`${s.expect}\` |`),
  '',
  'Upload it at `/ingest` → table **CaseMaster** → auto-map → validate. Against the live Development Data Store the `DUP_IN_STORE` row is caught by the CrimeNo/CaseMasterID page reads; against the bundled fixture it is caught by CaseMasterID 1, which the fixture also holds.',
  ''
].join('\n');
fs.writeFileSync(path.join(DEMO_DIR, 'README.md'), readme);
console.log(`demo: ${merged.length} rows (${clean.length} clean, ${special.length} special) from ${lastYm} → ${path.relative(ROOT, path.join(DEMO_DIR, 'CaseMaster_sample.csv'))}`);
