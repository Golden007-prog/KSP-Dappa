// Phase 8 — CSV → ER ingest contract checks (lib/ingest.js, lib/routes/ingest.js).
// Runs against the harness's fresh stub-backed app (PUBLIC_DEMO anonymous):
// every load here goes to memory storage, which is exactly what the demo does
// without the admin token.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ingest = require('../../lib/ingest.js');
const { ymOf, ymAdd } = require('../../lib/util.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO_CSV = path.join(HERE, '..', '..', '..', '..', 'data', 'ingest_demo', 'CaseMaster_sample.csv');

const HEADER = ['CaseMasterID', 'CrimeNo', 'CaseNo', 'CrimeRegisteredDate', 'PolicePersonID', 'PoliceStationID', 'CaseCategoryID', 'GravityOffenceID', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'CaseStatusID', 'CourtID', 'IncidentFromDate', 'IncidentToDate', 'InfoReceivedPSDate', 'latitude', 'longitude', 'BriefFacts'];

/** Minimal RFC-4180 parser for the demo file (mirrors client/src/lib/csv.js semantics). */
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
  return rows;
}

export async function run(h) {
  const { get, post, getRaw, check, hasKeys, tables } = h;
  const curYm = tables.AggMonthly.map((r) => r.Ym).sort().pop();
  const year = curYm.slice(0, 4);

  // A clean CaseMaster row against the fixture's own units (0101 → 1011..1013).
  const mk = (i, over) => Object.assign({
    CaseMasterID: 70000 + i, CrimeNo: `101011011${year}7${String(i).padStart(4, '0')}`, CaseNo: `${year}7${String(i).padStart(4, '0')}`,
    CrimeRegisteredDate: `${curYm}-1${i % 9}`, PolicePersonID: 9001, PoliceStationID: 1011, CaseCategoryID: 1, GravityOffenceID: i % 5 === 0 ? 1 : 2,
    CrimeMajorHeadID: 3, CrimeMinorHeadID: 307, CaseStatusID: 1, CourtID: 501, IncidentFromDate: `${curYm}-1${i % 9} 22:10:00`, IncidentToDate: `${curYm}-1${i % 9} 22:40:00`,
    InfoReceivedPSDate: `${curYm}-1${i % 9} 23:00:00`, latitude: 12.972 + i * 0.0003, longitude: 77.594 + i * 0.0003, BriefFacts: `Chain snatching near market, row ${i}.`
  }, over || {});
  const toArr = (o) => HEADER.map((c) => (o[c] === undefined || o[c] === null ? '' : String(o[c])));

  // --- pure-function pins ---------------------------------------------------
  check('ingest: 27 ER tables in the registry, console-import order', ingest.TABLES.length === 27 && ingest.TABLES[19].name === 'CaseMaster' && ingest.TABLES[0].name === 'State');
  check('ingest: CaseMaster columns verbatim from SCHEMA_CHECKLIST §20', JSON.stringify(ingest.tableDef('CaseMaster').columns.map((c) => c.name)) === JSON.stringify(HEADER));
  {
    const p = ingest.parseCrimeNo('101163125202300001');
    check('CrimeNo parser: 1·4·4·4·5 segments', p && p.category === '1' && p.district === '0116' && p.unit === '3125' && p.year === '2023' && p.serial === '00001', JSON.stringify(p));
    check('CrimeNo parser rejects 17 digits', ingest.parseCrimeNo('10116312520230000') === null);
    check('CrimeNo parser rejects letters', ingest.parseCrimeNo('10116312520230000A') === null);
    const ref = { districtIds: new Set(['101', '116']), unitDistrict: new Map([['3125', '116'], ['1011', '101']]) };
    const good = ingest.crimeNoIssues({ CrimeNo: '101163125202300001', CaseCategoryID: 1, PoliceStationID: 3125, CrimeRegisteredDate: '2023-08-01', CaseNo: '202300001' }, ref);
    check('CrimeNo validator: consistent row has no issues', good.length === 0, JSON.stringify(good));
    const codes = (row) => ingest.crimeNoIssues(row, ref).map((i) => i.code);
    check('CrimeNo validator: station segment ≠ PoliceStationID', codes({ CrimeNo: '101163125202300001', PoliceStationID: 1011 }).includes('CRIMENO_UNIT'));
    check('CrimeNo validator: district segment ≠ station district', codes({ CrimeNo: '101013125202300001', PoliceStationID: 3125 }).includes('CRIMENO_DISTRICT'));
    check('CrimeNo validator: year segment ≠ registration year', codes({ CrimeNo: '101163125202300001', CrimeRegisteredDate: '2024-08-01' }).includes('CRIMENO_YEAR'));
    check('CrimeNo validator: category digit ≠ CaseCategoryID', codes({ CrimeNo: '101163125202300001', CaseCategoryID: 3 }).includes('CRIMENO_CATEGORY'));
    check('CrimeNo validator: unknown district segment', codes({ CrimeNo: '199993125202300001' }).includes('CRIMENO_DISTRICT_UNKNOWN'));
    check('CrimeNo validator: CaseNo drift is a warning only', ingest.crimeNoIssues({ CrimeNo: '101163125202300001', CaseNo: '202300002' }, ref).every((i) => i.severity === 'warn'));
  }
  {
    const d = (v) => ingest.parseValue(v, { type: 'Date' });
    check('date: dd-mm-yyyy → ISO with a normalisation note', d('15-07-2026').value === '2026-07-15' && d('15-07-2026').issue.code === 'DATE_NORMALISED');
    check('date: dd/mm/yyyy → ISO', d('05/01/2026').value === '2026-01-05');
    check('date: ISO passes untouched', d('2026-07-15').value === '2026-07-15' && !d('2026-07-15').issue);
    check('date: month 13 rejected', d('15/13/2026').issue.code === 'DATE_INVALID');
    check('date: 31 Feb rejected', d('31-02-2026').issue.code === 'DATE_INVALID');
    const dt = (v) => ingest.parseValue(v, { type: 'DateTime' });
    check('datetime: dd-mm-yyyy HH:MM → ISO seconds', dt('15-07-2026 22:10').value === '2026-07-15 22:10:00');
    check('datetime: ISO T separator accepted', dt('2026-07-15T22:10:05').value === '2026-07-15 22:10:05');
    check('int: Indian digit grouping stripped', ingest.parseValue('1,00,566', { type: 'Int' }).value === 100566 && ingest.parseValue('1,00,566', { type: 'Int' }).issue.code === 'DIGIT_GROUPING');
    check('int: word rejected', ingest.parseValue('open', { type: 'Int' }).issue.code === 'TYPE_INT');
    check('double: sent as a string', ingest.parseValue('12.9716', { type: 'Double' }).value === '12.9716');
    check('boolean: 1/0/yes/no', ingest.parseValue('1', { type: 'Boolean' }).value === true && ingest.parseValue('no', { type: 'Boolean' }).value === false && ingest.parseValue('maybe', { type: 'Boolean' }).issue.code === 'TYPE_BOOLEAN');
    check('varchar: over the column limit rejected', ingest.parseValue('x'.repeat(19), { type: 'Varchar', max: 18 }).issue.code === 'LEN_VARCHAR');
    check('text: over 10,000 rejected, Kannada counted per code point', ingest.parseValue('ಕ'.repeat(10001), { type: 'Text', max: 10000 }).issue.code === 'LEN_TEXT' && !ingest.parseValue('ಕ'.repeat(10000), { type: 'Text', max: 10000 }).issue);
  }
  check('geo: Bengaluru centre inside Bengaluru City polygon', ingest.pointInDistrict(12.9716, 77.5946, '0101') === true);
  check('geo: Mysuru centre outside Bengaluru City polygon', ingest.pointInDistrict(12.2958, 76.6394, '0101') === false);
  check('geo: unknown district → null (no polygon)', ingest.pointInDistrict(12.9, 77.5, '9999') === null);
  check('privacy: header classifier', ingest.classifyExtraHeader('Caste') === 'never-used' && ingest.classifyExtraHeader('ComplainantPhone') === 'pii' && ingest.classifyExtraHeader('Remarks') === 'unknown');
  check('resume token round-trips', (() => { const t = ingest.parseResumeToken('ing-abc123-00z:400'); return t && t.batchId === 'ing-abc123-00z' && t.cursor === 400 && ingest.parseResumeToken('junk') === null; })());
  check('budget: 5,000 free-tier inserts, 200 per call', (() => { const b = ingest.budgetFor(450); return b.insertCalls === 3 && b.withinFreeTier && !ingest.budgetFor(5001).withinFreeTier && b.freeTierInsertsPerMonth === 5000; })());
  check('load authorization: tier header or admin token', ingest.loadAuthorization({ headers: { 'x-dappa-tier': 'district' } }).ok && !ingest.loadAuthorization({ headers: { 'x-dappa-tier': 'beat' } }).ok && ingest.loadAuthorization({ headers: { 'x-admin-token': 'demo-admin' } }).actorRole === 'admin');

  // --- GET /ingest/tables + template ---------------------------------------
  {
    const r = await get('/ingest/tables');
    check('GET /ingest/tables 200 with 27 tables', r.status === 200 && r.json.ok && r.json.data.tables.length === 27 && r.json.meta.count === 27);
    const cm = r.json.data.tables.find((t) => t.name === 'CaseMaster');
    check('tables: CaseMaster carries requires, dupKeys, geo and the IIF-1 preset flagged unverified', cm && cm.requires.includes('Unit') && cm.dupKeys.includes('CrimeNo') && cm.geo.lat === 'latitude' && cm.presets.length === 1 && cm.presets[0].verified === false);
    const cd = r.json.data.tables.find((t) => t.name === 'ComplainantDetails');
    check('tables: caste/religion columns flagged never-used, names flagged PII', cd.columns.find((c) => c.name === 'CasteID').neverUsed && cd.columns.find((c) => c.name === 'ReligionID').neverUsed && cd.columns.find((c) => c.name === 'ComplainantName').pii);
    check('tables: CasteMaster table itself is never-used', r.json.data.tables.find((t) => t.name === 'CasteMaster').neverUsed === true);
    const tpl = await getRaw('/ingest/template/CaseMaster.csv');
    check('GET /ingest/template/CaseMaster.csv is a CSV header in official order', tpl.status === 200 && tpl.contentType.includes('text/csv') && tpl.text.trim() === HEADER.join(','), tpl.text.slice(0, 80));
    const bad = await get('/ingest/template/Nope.csv');
    check('template: unknown table 404', bad.status === 404);
  }

  // --- validation 400s -------------------------------------------------------
  check('validate: missing table 400', (await post('/ingest/validate', { columns: HEADER, rows: [] })).status === 400);
  check('validate: unknown table 400', (await post('/ingest/validate', { table: 'Nope', columns: HEADER, rows: [] })).status === 400);
  check('validate: missing columns 400', (await post('/ingest/validate', { table: 'CaseMaster', rows: [] })).status === 400);
  check('validate: bad mapping target 400', (await post('/ingest/validate', { table: 'CaseMaster', columns: HEADER, rows: [], mapping: { Nope: 'x' } })).status === 400);
  check('validate: too many rows 400', (await post('/ingest/validate', { table: 'CaseMaster', columns: ['CaseMasterID'], rows: Array.from({ length: 5001 }, () => ['1']) })).status === 400);

  // --- a clean batch + one of each defect -------------------------------------
  let batchId = null;
  let resumeToken = null;
  {
    const rows = [];
    for (let i = 1; i <= 12; i += 1) rows.push(toArr(mk(i)));
    rows.push(toArr(mk(13, { CrimeNo: '10101101120267001' })));                                  // 17 digits
    rows.push(toArr(mk(14, { CaseMasterID: 1 })));                                                // fixture already holds CaseMasterID 1
    rows.push(toArr(mk(15, { CrimeNo: rows[0][1], CaseNo: rows[0][2] })));                        // duplicate inside the batch
    rows.push(toArr(mk(16, { CrimeMinorHeadID: 999 })));                                          // FK miss
    rows.push(toArr(mk(17, { CrimeRegisteredDate: `1${7 % 9}-${curYm.slice(5, 7)}-${year}` })));  // dd-mm-yyyy (crime no year matches)
    rows.push(toArr(mk(18, { latitude: 28.6139, longitude: 77.209 })));                            // Delhi
    rows.push(toArr(mk(19, { latitude: 12.2958, longitude: 76.6394 })));                           // Mysuru point, Bengaluru station
    rows.push(toArr(mk(20, { PoliceStationID: '' })));                                            // required missing
    rows.push(toArr(mk(21, { BriefFacts: 'x'.repeat(10001) })));                                  // oversize text
    rows.push(toArr(mk(22, { CaseStatusID: 'open' })));                                           // type
    const columns = ['﻿' + HEADER[0], ...HEADER.slice(1), 'Caste', 'ComplainantPhone'];
    const rowsWithExtras = rows.map((r, i) => [...r, i === 2 ? 'X' : '', i === 3 ? '9876543210' : '']);
    const r = await post('/ingest/validate', { table: 'CaseMaster', columns, rows: rowsWithExtras, options: { dryRun: true } });
    check('validate: 200 envelope with batchId, counts, rows, profile, budget, privacy, whatChanged', r.status === 200 && r.json.ok && hasKeys(r.json.data, ['batchId', 'counts', 'rows', 'issueSummary', 'profile', 'budget', 'privacy', 'storeChecks', 'whatChanged', 'resumeToken']), JSON.stringify(r.json).slice(0, 300));
    const d = r.json.data;
    batchId = d.batchId;
    resumeToken = d.resumeToken;
    check('validate: is a dry run, meta.source local / storage memory', d.dryRun === true && r.json.meta.source === 'local' && r.json.meta.storage === 'memory');
    check('validate: BOM stripped from the first header', d.mapping.CaseMasterID === 'CaseMasterID' && d.profile.encoding.bom === true);
    const codesOf = (n) => (d.rows.find((x) => x.rowNo === n) || { issues: [] }).issues.map((i) => i.code);
    const verdict = (n) => (d.rows.find((x) => x.rowNo === n) || {}).verdict;
    check('validate: 12 clean rows accepted', d.rows.slice(0, 12).every((x) => x.verdict === 'accept'), JSON.stringify(d.rows.slice(0, 12).filter((x) => x.verdict !== 'accept')).slice(0, 300));
    check('row 13: CRIMENO_FORMAT rejected', verdict(13) === 'reject' && codesOf(13).includes('CRIMENO_FORMAT'), codesOf(13).join());
    check('row 14: DUP_IN_STORE (CaseMasterID 1 in the fixture) rejected', verdict(14) === 'reject' && codesOf(14).includes('DUP_IN_STORE'), codesOf(14).join());
    check('row 15: DUP_IN_BATCH rejected', verdict(15) === 'reject' && codesOf(15).includes('DUP_IN_BATCH'), codesOf(15).join());
    check('row 16: FK_MISSING on CrimeMinorHeadID rejected', verdict(16) === 'reject' && codesOf(16).includes('FK_MISSING'), codesOf(16).join());
    check('row 17: dd-mm-yyyy accepted with DATE_NORMALISED', verdict(17) === 'accept' && codesOf(17).includes('DATE_NORMALISED'), codesOf(17).join());
    check('row 18: GEO_OUT_OF_STATE rejected', verdict(18) === 'reject' && codesOf(18).includes('GEO_OUT_OF_STATE'), codesOf(18).join());
    check('row 19: GEO_OUT_OF_DISTRICT is a warning, row accepted', verdict(19) === 'accept' && codesOf(19).includes('GEO_OUT_OF_DISTRICT'), codesOf(19).join());
    check('row 20: REQUIRED_MISSING rejected', verdict(20) === 'reject' && codesOf(20).includes('REQUIRED_MISSING'), codesOf(20).join());
    check('row 21: LEN_TEXT rejected', verdict(21) === 'reject' && codesOf(21).includes('LEN_TEXT'), codesOf(21).join());
    check('row 22: TYPE_INT rejected', verdict(22) === 'reject' && codesOf(22).includes('TYPE_INT'), codesOf(22).join());
    check('validate: counts add up (14 accepted / 8 rejected of 22)', d.counts.rows === 22 && d.counts.accepted === 14 && d.counts.rejected === 8, JSON.stringify(d.counts));
    check('privacy guard: Caste column never-used + dropped, phone column PII + dropped', d.privacy.extraColumns.some((x) => x.header === 'Caste' && x.kind === 'never-used' && x.action === 'dropped') && d.privacy.extraColumns.some((x) => x.header === 'ComplainantPhone' && x.kind === 'pii'), JSON.stringify(d.privacy.extraColumns));
    check('privacy guard: acted on the rows that carried values', codesOf(3).includes('NEVER_USED_DROPPED') && codesOf(4).includes('PII_DROPPED'));
    check('profile: null rates, date range, unit coverage, coordinate sanity', d.profile.nullRates.PoliceStationID > 0 && d.profile.dateRange && d.profile.dateRange.min.startsWith(curYm) && d.profile.unitCoverage.distinctUnits === 1 && d.profile.coordinates.outOfState === 1 && d.profile.coordinates.outOfDistrict === 1, JSON.stringify(d.profile).slice(0, 300));
    check('store checks: duplicate page reads on CrimeNo and CaseMasterID', d.storeChecks.filter((s) => s.kind === 'duplicate').length === 2 && d.storeChecks.every((s) => !s.failed), JSON.stringify(d.storeChecks));
    check('budget: 14 rows → 1 insert call, within the free tier', d.budget.rows === 14 && d.budget.insertCalls === 1 && d.budget.withinFreeTier === true);
    check('prerequisites satisfied on the fixture (District/Unit/CrimeHead loaded)', d.prerequisites.ok === true);
    check('reference: live lookups unioned with the bundled masters', d.reference.liveCounts.Unit === tables.Unit.length && d.reference.bundledCounts.Unit === 359, JSON.stringify(d.reference));
    // what changed — projected
    const wc = d.whatChanged;
    check('whatChanged: KPI before/after from the AggMonthly anchor month', wc.applicable && wc.kpis.before.asOfYm === curYm && wc.kpis.after.totalFirs === wc.kpis.before.totalFirs + 14, JSON.stringify(wc.kpis));
    check('whatChanged: heinous delta counts GravityOffenceID=1 rows', wc.kpis.delta.heinousCount === 2, JSON.stringify(wc.kpis.delta));
    const pair = wc.alerts.find((a) => a.districtId === '0101' && a.crimeHeadId === 3);
    check('whatChanged: z-check for the touched district × head with before/after', pair && pair.added === 14 && pair.baselineMonths === 11 && typeof pair.zAfter === 'number' && pair.zAfter > pair.zBefore, JSON.stringify(pair));
    // same maths as circuits.robustZ, recomputed here against the fixture
    const { robustZ } = require('../../lib/circuits.js');
    const series = new Map();
    for (const r2 of tables.AggMonthly) if (r2.DistrictID === '0101' && r2.CrimeHeadID === 3) series.set(r2.Ym, (series.get(r2.Ym) || 0) + r2.CaseCount);
    const months = [...series.keys()].sort().slice(-12);
    const values = months.map((m) => series.get(m));
    const expectAfter = Math.round(robustZ(values.slice(0, -1), values[values.length - 1] + 14) * 100) / 100;
    check('whatChanged: zAfter equals robustZ over the fixture series', pair && Math.abs(pair.zAfter - expectAfter) < 1e-9, `${pair && pair.zAfter} vs ${expectAfter}`);
  }

  // --- batch listing + rejection report ------------------------------------
  {
    const r = await get('/ingest/batches');
    check('GET /ingest/batches lists the validated batch', r.status === 200 && r.json.data.some((b) => b.batchId === batchId && b.status === 'validated'));
    const one = await get(`/ingest/batches/${batchId}`);
    check('GET /ingest/batches/:id returns counts, rejected rows, resume token', one.status === 200 && one.json.data.rejected.length === 8 && one.json.data.resumeToken === resumeToken && one.json.data.privacy);
    check('GET /ingest/batches/:id malformed 400 / unknown 404', (await get('/ingest/batches/junk')).status === 400 && (await get('/ingest/batches/ing-zzzzzz-000')).status === 404);
    const csv = await getRaw(`/ingest/batches/${batchId}/rejections.csv`);
    const lines = csv.text.trim().split(/\r?\n/);
    check('rejections.csv: header + one line per rejected/warned row, keys and reasons only', csv.status === 200 && csv.contentType.includes('text/csv') && lines[0] === 'rowNo,CaseMasterID,verdict,codes,columns,details' && lines.length === 1 + 8 + 1, `${lines.length} lines: ${lines[0]}`);
    check('rejections.csv: never carries a PII/narrative column', !/BriefFacts|ComplainantPhone|Caste/.test(lines[0]));
  }

  // --- load: tier gate, chunked memory load, resume token, what changed ---------
  {
    const denied = await post('/ingest/load', { batchId, acceptOnlyValid: true });
    check('load: anonymous below District tier → 403 TIER_REQUIRED', denied.status === 403 && denied.json.error.code === 'TIER_REQUIRED');
    check('load: malformed batchId 400', (await post('/ingest/load', { batchId: 'nope' }, { 'x-dappa-tier': 'district' })).status === 400);
    check('load: unknown batch 404', (await post('/ingest/load', { batchId: 'ing-zzzzzz-000' }, { 'x-dappa-tier': 'district' })).status === 404);
    check('load: acceptOnlyValid:false refused', (await post('/ingest/load', { batchId, acceptOnlyValid: false }, { 'x-dappa-tier': 'district' })).status === 400);
    const r = await post('/ingest/load', { batchId, acceptOnlyValid: true }, { 'x-dappa-tier': 'district', 'x-dappa-actor': 'SP Mysuru' });
    check('load: District tier loads to memory storage and says so', r.status === 200 && r.json.data.storage === 'memory' && r.json.meta.storage === 'memory' && r.json.meta.source === 'local', JSON.stringify(r.json).slice(0, 300));
    check('load: accepted 14 / rejected 8 / inserted 14, done', r.json.data.inserted === 14 && r.json.data.rejected === 8 && r.json.data.done === true && r.json.data.resumeToken === null);
    check('load: post-load what-changed block attached', r.json.data.whatChanged && r.json.data.whatChanged.kpis.delta.totalFirs === 14);
    check('load: audit row recorded (actionlog / datastore / memory)', r.json.data.audit && ['actionlog', 'datastore', 'memory'].includes(r.json.data.audit.source), JSON.stringify(r.json.data.audit));
    check('load: actor + tier echoed', r.json.data.actor.actor === 'SP Mysuru' && r.json.data.actor.role === 'district');
    const again = await post('/ingest/load', { batchId, acceptOnlyValid: true }, { 'x-dappa-tier': 'district' });
    check('load: re-running a finished batch is a no-op (0 remaining)', again.status === 200 && again.json.data.inserted === 14 && again.json.data.remaining === 0);
  }

  // --- rollback (memory) ------------------------------------------------------
  {
    check('rollback: needs tier/admin', (await post(`/ingest/batches/${batchId}/rollback`, {})).status === 403);
    const r = await post(`/ingest/batches/${batchId}/rollback`, {}, { 'x-dappa-tier': 'state' });
    check('rollback: memory batch removed 14 rows', r.status === 200 && r.json.data.removed === 14 && r.json.data.storage === 'memory', JSON.stringify(r.json).slice(0, 200));
    check('rollback: second call 409', (await post(`/ingest/batches/${batchId}/rollback`, {}, { 'x-dappa-tier': 'state' })).status === 409);
    check('rollback: batch status rolled-back', (await get(`/ingest/batches/${batchId}`)).json.data.status === 'rolled-back');
  }

  // --- resume token over a multi-chunk load -----------------------------------
  {
    const rows = [];
    for (let i = 1; i <= 450; i += 1) rows.push(toArr(mk(1000 + i, { CaseMasterID: 71000 + i, CrimeNo: `101011012${year}8${String(i).padStart(4, '0')}`, CaseNo: `${year}8${String(i).padStart(4, '0')}`, PoliceStationID: 1012, CrimeRegisteredDate: `${curYm}-05` })));
    // two-part upload: part 1 then the final part
    const p1 = await post('/ingest/validate', { table: 'CaseMaster', columns: HEADER, rows: rows.slice(0, 300), part: { index: 1, final: false } });
    check('validate: part 1 acknowledged with a batchId and receivedRows', p1.status === 200 && p1.json.data.status === 'receiving' && p1.json.data.receivedRows === 300, JSON.stringify(p1.json).slice(0, 200));
    const p2 = await post('/ingest/validate', { table: 'CaseMaster', columns: HEADER, rows: rows.slice(300), part: { batchId: p1.json.data.batchId, index: 2, final: true } });
    check('validate: final part validates all 450 rows', p2.status === 200 && p2.json.data.counts.rows === 450 && p2.json.data.counts.accepted === 450, JSON.stringify(p2.json.data && p2.json.data.counts));
    check('validate: budget shows 3 insert calls for 450 rows', p2.json.data.budget.insertCalls === 3);
    const id = p2.json.data.batchId;
    const l1 = await post('/ingest/load', { batchId: id, acceptOnlyValid: true, chunkLimit: 1 }, { 'x-dappa-tier': 'district' });
    check('load: chunkLimit 1 → 200 inserted, resume token issued', l1.status === 200 && l1.json.data.inserted === 200 && l1.json.data.done === false && l1.json.data.resumeToken === `${id}:200` && l1.json.data.progressPct === 44.4, JSON.stringify(l1.json.data).slice(0, 250));
    const stale = await post('/ingest/load', { resumeToken: `${id}:100`, acceptOnlyValid: true }, { 'x-dappa-tier': 'district' });
    check('load: stale resume token 409 RESUME_MISMATCH', stale.status === 409 && stale.json.error.code === 'RESUME_MISMATCH');
    const l2 = await post('/ingest/load', { resumeToken: l1.json.data.resumeToken, acceptOnlyValid: true, chunkLimit: 1 }, { 'x-dappa-tier': 'district' });
    check('load: resume continues from the cursor (400/450)', l2.status === 200 && l2.json.data.inserted === 400 && l2.json.data.resumeToken === `${id}:400`);
    const l3 = await post('/ingest/load', { resumeToken: l2.json.data.resumeToken, acceptOnlyValid: true }, { 'x-dappa-tier': 'district' });
    check('load: final chunk completes with whatChanged and audit', l3.status === 200 && l3.json.data.done === true && l3.json.data.inserted === 450 && l3.json.data.whatChanged.kpis.delta.totalFirs === 450 && l3.json.data.audit);
    check('load: batch listed as loaded', (await get(`/ingest/batches/${id}`)).json.data.status === 'loaded');
  }

  // --- reference-data ordering ------------------------------------------------
  {
    const r = await post('/ingest/validate', { table: 'District', columns: ['DistrictID', 'DistrictName', 'StateID', 'Active'], rows: [['139', 'New District', '29', '1'], ['101', 'Bengaluru City', '29', 'yes']] });
    check('validate: District (reference) row 2 is a DUP_IN_STORE, row 1 accepted with Boolean true', r.status === 200 && r.json.data.rows[0].verdict === 'accept' && r.json.data.rows[1].issues.some((i) => i.code === 'DUP_IN_STORE'), JSON.stringify(r.json.data && r.json.data.rows));
    check('validate: whatChanged not applicable to reference tables', r.json.data.whatChanged.applicable === false);
    const child = await post('/ingest/validate', { table: 'Victim', columns: ['VictimMasterID', 'CaseMasterID', 'VictimName', 'AgeYear', 'GenderID', 'VictimPolice'], rows: [['9001', '1', 'A Person', '30', '2', 'N'], ['9002', '999999', 'B Person', '31', '1', 'N']] });
    check('validate: child table checks the parent CaseMaster exists (row 2 FK_MISSING)', child.status === 200 && child.json.data.rows[0].verdict === 'accept' && child.json.data.rows[1].issues.some((i) => i.code === 'FK_MISSING'), JSON.stringify(child.json.data && child.json.data.rows));
    check('validate: Victim name flagged PII in the guard', child.json.data.privacy.piiColumns.some((p) => p.column === 'VictimName'));
    // prerequisites: a datastore with no District rows must refuse CaseMaster
    const empty = h.buildFixtureTables();
    empty.District = [];
    empty.Unit = [];
    const app = h.createApp({ clientFactory: () => h.createStubClient(empty) });
    const server = app.listen(0);
    await new Promise((res) => server.once('listening', res));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const resp = await fetch(`${base}/ingest/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'CaseMaster', columns: HEADER, rows: [toArr(mk(1))] }) });
    const j = await resp.json();
    check('prerequisites: CaseMaster without District/Unit loaded names the tables to load first', resp.status === 200 && j.data.prerequisites.ok === false && j.data.prerequisites.missing.includes('District') && /before CaseMaster/.test(j.data.prerequisites.message), JSON.stringify(j.data && j.data.prerequisites));
    const ld = await fetch(`${base}/ingest/load`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dappa-tier': 'state' }, body: JSON.stringify({ batchId: j.data.batchId, acceptOnlyValid: true }) });
    const lj = await ld.json();
    check('prerequisites: load refused with ORDER_REFERENCE_FIRST', ld.status === 409 && lj.error.code === 'ORDER_REFERENCE_FIRST', JSON.stringify(lj));
    server.close();
  }

  // --- what changed: the fixture anchors where the pipeline does -------------
  {
    // pipeline/out's AggMonthly stops at the last complete month; the fixture
    // must anchor there too, or a batch dated in the bundled demo CSV's month
    // lands one month before the anchor and the tiles read "N -> N, delta 0".
    check('ingest: the fixture AggMonthly ends at the last complete month, as pipeline/out does', curYm === ymAdd(ymOf(), -1), `${curYm} vs now ${ymOf()}`);
    // A batch dated in the anchor month moves the anchor tiles.
    const inAnchor = [1, 2, 3, 4, 5].map((i) => toArr(mk(i)));
    const v = await post('/ingest/validate', { table: 'CaseMaster', columns: HEADER, rows: inAnchor });
    const w = v.json.data.whatChanged;
    check('ingest: a batch in the anchor month moves the anchor tiles and reports no separate batch month',
      w.applicable && w.batch.month === curYm && w.kpis.delta.totalFirs === 5 && w.kpis.after.totalFirs === w.kpis.before.totalFirs + 5 && w.kpis.batchMonth === null,
      JSON.stringify({ batch: w.batch, delta: w.kpis.delta, bm: w.kpis.batchMonth }));

    // A back-dated batch must not read "N -> N, delta 0" beside a moved momPct.
    const backYm = ymAdd(curYm, -1);
    const back = [1, 2, 3].map((i) => toArr(mk(200 + i, {
      CrimeRegisteredDate: `${backYm}-1${i}`,
      IncidentFromDate: `${backYm}-1${i} 22:10:00`, IncidentToDate: `${backYm}-1${i} 22:40:00`, InfoReceivedPSDate: `${backYm}-1${i} 23:00:00`,
      CrimeNo: `101011011${backYm.slice(0, 4)}8${String(i).padStart(4, '0')}`, CaseNo: `${backYm.slice(0, 4)}8${String(i).padStart(4, '0')}`
    })));
    const v2 = await post('/ingest/validate', { table: 'CaseMaster', columns: HEADER, rows: back });
    const w2 = v2.json.data.whatChanged;
    check('ingest: a back-dated batch reports before/after for its OWN month, so the tiles can never read "N -> N" beside a moved momPct',
      w2.applicable && w2.batch.month === backYm && w2.kpis.delta.totalFirs === 0 && w2.kpis.batchMonth
      && w2.kpis.batchMonth.ym === backYm && w2.kpis.batchMonth.delta.totalFirs === 3
      && w2.kpis.batchMonth.after.totalFirs === w2.kpis.batchMonth.before.totalFirs + 3,
      JSON.stringify({ batch: w2.batch, anchorDelta: w2.kpis.delta, bm: w2.kpis.batchMonth }));
    check('ingest: the back-dated batch still moves the anchor month-on-month figure, which is why the batch-month block exists',
      w2.kpis.after.momPct !== w2.kpis.before.momPct, JSON.stringify({ before: w2.kpis.before.momPct, after: w2.kpis.after.momPct }));
  }

  // --- the coordinate profile accounts for every point ----------------------
  {
    const rows = [1, 2, 3].map((i) => toArr(mk(300 + i)));
    const v = await post('/ingest/validate', { table: 'CaseMaster', columns: HEADER, rows });
    const g = v.json.data.profile.coordinates;
    check('ingest: the coordinate profile is complete — every point with coordinates lands in exactly one bucket',
      g.withCoords === g.inDistrict + g.outOfDistrict + g.outOfState + g.invalid + g.unknownPolygon, JSON.stringify(g));
    check('ingest: the server profile says the polygon test actually ran', g.polygonChecked === true, JSON.stringify(g));
  }

  // --- the checker must not reject its own template -------------------------
  {
    const tpl = await getRaw('/ingest/template/CaseMaster.csv?example=1');
    const lines = tpl.text.trim().split(/\r?\n/);
    const cols = lines[0].split(',');
    const cells = lines[1].split(',');
    // BriefFacts is quoted (it has spaces but no comma), so the naive split
    // still yields one cell per column here.
    check('ingest: the CaseMaster template example row has one value per official column', cols.length === HEADER.length && cells.length === HEADER.length, `${cols.length}/${cells.length} vs ${HEADER.length}`);
    const row = Object.fromEntries(cols.map((c, i) => [c, cells[i].replace(/^"|"$/g, '')]));
    check('ingest: the template example CrimeNo agrees with its own category, station and year',
      row.CrimeNo === '101013009202690001' && row.PoliceStationID === '3009' && row.CaseCategoryID === '1'
      && row.CrimeRegisteredDate.slice(0, 4) === '2026' && row.CaseNo === '202690001', JSON.stringify(row));
    check('ingest: the template example coordinate is a Karnataka point, not latitude twice',
      Number(row.latitude) > 11.5 && Number(row.latitude) < 18.5 && Number(row.longitude) > 74 && Number(row.longitude) < 78.6, `${row.latitude},${row.longitude}`);
    const tv = await post('/ingest/validate', { table: 'CaseMaster', columns: cols, rows: [cells.map((c) => c.replace(/^"|"$/g, ''))] });
    check('ingest: the CaseMaster template example row passes every row-level check', tv.status === 200 && tv.json.data.counts.rejected === 0, JSON.stringify(tv.json.data && { counts: tv.json.data.counts, issues: tv.json.data.rows[0].issues }));
    for (const table of ['Accused', 'Victim']) {
      // Varchar(5) PersonID / Varchar(1) VictimPolice used to get the column
      // name as their example value and overflow their own max.
      const r2 = await getRaw(`/ingest/template/${table}.csv?example=1`);
      const l2 = r2.text.trim().split(/\r?\n/);
      const v2 = await post('/ingest/validate', { table, columns: l2[0].split(','), rows: [l2[1].split(',')] });
      check(`ingest: the ${table} template example row is not rejected by its own column limits`, v2.status === 200 && v2.json.data.counts.rejected === 0, JSON.stringify(v2.json.data && v2.json.data.rows[0].issues));
    }
  }

  // --- the rejection report never carries a PII cell value -------------------
  {
    const cols = ['EmployeeID', 'DistrictID', 'UnitID', 'RankID', 'DesignationID', 'KGID', 'FirstName', 'EmployeeDOB', 'GenderID', 'BloodGroupID', 'PhysicallyChallenged', 'AppointmentDate'];
    // dd-mm-yyyy DOB (normalised, echoed in the detail) on a row rejected for
    // an unrelated reason: the report must not carry the date of birth out.
    const rows = [['', '9999', '1011', '1', '1', 'KG1', 'Anitha', '12-03-1965', '2', '1', 'false', '2001-06-01']];
    const v = await post('/ingest/validate', { table: 'Employee', columns: cols, rows });
    check('ingest: the Employee row is rejected (missing key) and its DOB was normalised', v.status === 200 && v.json.data.counts.rejected === 1
      && v.json.data.rows[0].issues.some((i) => i.code === 'DATE_NORMALISED' && i.column === 'EmployeeDOB'), JSON.stringify(v.json.data && v.json.data.rows[0].issues));
    const csv = await getRaw(`/ingest/batches/${v.json.data.batchId}/rejections.csv`);
    check('ingest: the rejection CSV redacts the PII detail and never prints the date of birth',
      csv.status === 200 && !/1965/.test(csv.text) && !/12-03-1965/.test(csv.text) && /redacted/.test(csv.text), csv.text.slice(0, 300));
    check('ingest: the rejection CSV still names the column and the code so the row stays fixable',
      /EmployeeDOB/.test(csv.text) && /DATE_NORMALISED/.test(csv.text), csv.text.slice(0, 300));
  }

  // --- the demo dataset itself ------------------------------------------------
  if (fs.existsSync(DEMO_CSV)) {
    const text = fs.readFileSync(DEMO_CSV, 'utf8');
    const parsed = parseCsv(text);
    const columns = parsed[0];
    const rows = parsed.slice(1);
    check('demo csv: 200 rows, BOM, official header + 2 guard columns', rows.length === 200 && text.charCodeAt(0) === 0xfeff && columns[0].replace(/^﻿/, '') === 'CaseMasterID' && columns.includes('Caste'), `${rows.length} rows`);
    const r = await post('/ingest/validate', { table: 'CaseMaster', columns, rows });
    const d = r.json.data;
    check('demo csv: validates — 12 rejected, 188 accepted against the fixture', r.status === 200 && d.counts.rejected === 12 && d.counts.accepted === 188, JSON.stringify(d && d.counts));
    const codes = new Set(d.issueSummary.map((i) => i.code));
    for (const c of ['CRIMENO_FORMAT', 'CRIMENO_DISTRICT', 'REQUIRED_MISSING', 'GEO_OUT_OF_STATE', 'DATE_INVALID', 'LEN_TEXT', 'DUP_IN_BATCH', 'DUP_IN_STORE', 'FK_MISSING', 'TYPE_INT', 'GEO_INVALID', 'CRIMENO_YEAR', 'GEO_OUT_OF_DISTRICT', 'DATE_NORMALISED', 'DIGIT_GROUPING', 'NEVER_USED_DROPPED', 'PII_DROPPED']) {
      check(`demo csv: raises ${c}`, codes.has(c), [...codes].join());
    }
    check('demo csv: 183 clean rows raise no warnings', d.counts.acceptedWithWarnings === 1, String(d.counts.acceptedWithWarnings));
  } else {
    check('demo csv present (data/ingest_demo/CaseMaster_sample.csv)', false, DEMO_CSV);
  }
}
