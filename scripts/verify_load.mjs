#!/usr/bin/env node
/**
 * verify_load.mjs — post-bulk-load verification for the Catalyst Data Store.
 *
 * AUTH PATH (investigated 2026-07-24, zcatalyst-cli 1.27.0):
 *   - CHOSEN: `catalyst ds:export --table <T>` run with cwd = repo root. The CLI
 *     reuses its own logged-in session + .catalystrc project linkage, so this
 *     works headlessly with zero extra credentials (verified: an export call
 *     from the repo root authenticates and reaches the Data Store API).
 *   - REJECTED: ZCQL via the Catalyst REST API
 *     (`POST https://api.catalyst.zoho.{com,in}/baas/v1/project/<id>/query`)
 *     using the token from `catalyst token:generate --current`. That token is
 *     CLI-scoped (`w_1000.*`), not a Zoho OAuth token — the REST endpoint
 *     answers {"error_code":"INVALID_TOKEN"} on both DCs. A real OAuth client
 *     would need interactive consent, which breaks headless use.
 *   Consequence: the 5 spot "joins" are computed locally over the exported
 *   CSVs; each check prints the equivalent ZCQL so it can be replayed in the
 *   console's ZCQL tab for an on-store cross-check.
 *
 * Usage:
 *   node scripts/verify_load.mjs                # counts for all tables + 5 spot joins
 *   node scripts/verify_load.mjs --counts-only  # skip the join checks
 *   node scripts/verify_load.mjs --only=State,District
 *   node scripts/verify_load.mjs --keep         # keep exported CSVs in the temp dir
 *   node scripts/verify_load.mjs --production
 *
 * Exit code: non-zero when any table count mismatches or a check errors.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = process.env.DAPPA_OUT
  ? path.resolve(REPO_ROOT, process.env.DAPPA_OUT)
  : path.join(REPO_ROOT, 'pipeline', 'out');
const EXPORT_TIMEOUT_MS = 10 * 60 * 1000;
const PAGE_CAP = 200000; // bulk-read page size; loop pages if a table hits it

const TABLE_ORDER = [
  'State', 'District', 'UnitType', 'Unit', 'Rank', 'Designation', 'Employee',
  'CaseCategory', 'GravityOffence', 'CaseStatusMaster', 'CasteMaster',
  'ReligionMaster', 'OccupationMaster', 'Act', 'Section', 'CrimeHead',
  'CrimeSubHead', 'CrimeHeadActSection', 'Court', 'CaseMaster',
  'ComplainantDetails', 'Victim', 'Accused', 'ActSectionAssociation',
  'ArrestSurrender', 'ChargesheetDetails', 'AggMonthly', 'HotspotCluster',
  'ForecastMonthly', 'AnomalyAlert', 'NetworkEdge', 'OffenderProfile',
  'StationRisk', 'SocioEconomic',
];

// ---------- args ----------
const args = { countsOnly: false, keep: false, production: false, only: null };
for (const a of process.argv.slice(2)) {
  if (a === '--counts-only') args.countsOnly = true;
  else if (a === '--keep') args.keep = true;
  else if (a === '--production') args.production = true;
  else if (a.startsWith('--only=')) args.only = new Set(a.slice(7).split(',').map((s) => s.trim()));
  else { console.error(`Unknown argument: ${a}`); process.exit(2); }
}

// ---------- CSV helpers (quote-aware, no deps) ----------
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); field = ''; row = []; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length === 1 && rows[i][0] === '') continue; // trailing blank line
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = rows[i][j] ?? '';
    out.push(obj);
  }
  return { header, rows: out };
}

function countCsvRecords(file) {
  const buf = fs.readFileSync(file, 'utf8');
  let n = 0, inQ = false, any = false;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === '"') inQ = !inQ;
    else if (c === '\n' && !inQ) n++;
    else if (c !== '\r') any = true;
  }
  if (any && buf.length && buf[buf.length - 1] !== '\n') n++;
  return Math.max(0, n - 1);
}

// ---------- child process helpers ----------
function run(cmd, argv, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, {
      cwd: opts.cwd || REPO_ROOT,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGTERM'), opts.timeout || EXPORT_TIMEOUT_MS);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out }); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: 1, out: String(err) }); });
  });
}

async function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    const r = await run('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`,
    ]);
    return r.code === 0;
  }
  const r = await run('unzip', ['-o', zipPath, '-d', destDir]);
  return r.code === 0;
}

/** Move across devices safely (repo on E:, tmp on C: -> rename throws EXDEV). */
function moveSync(src, dst) {
  try {
    fs.renameSync(src, dst);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.cpSync(src, dst, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
}

function findCsvIn(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = findCsvIn(p); if (hit) return hit; }
    else if (e.name.toLowerCase().endsWith('.csv')) return p;
  }
  return null;
}

/** Export one page of a table; returns path to a CSV in tmpDir or null. */
async function exportTablePage(table, page, tmpDir) {
  const before = new Set(fs.readdirSync(REPO_ROOT));
  const argv = ['ds:export', '--table', table, '--page', String(page)];
  if (args.production) argv.push('--production');
  const r = await run('catalyst', argv);
  const created = fs.readdirSync(REPO_ROOT).filter((e) => !before.has(e));
  if (r.code !== 0 && created.length === 0) {
    const tail = r.out.trim().split(/\r?\n/).slice(-2).join(' | ');
    throw new Error(`ds:export failed for ${table}: ${tail}`);
  }
  // Move whatever the CLI dropped (zip / csv / folder) into tmpDir and locate the CSV.
  for (const name of created) {
    const src = path.join(REPO_ROOT, name);
    const dst = path.join(tmpDir, `${table}_p${page}_${name}`);
    moveSync(src, dst);
    if (dst.toLowerCase().endsWith('.csv')) return dst;
    if (dst.toLowerCase().endsWith('.zip')) {
      const exDir = dst.replace(/\.zip$/i, '');
      if (await extractZip(dst, exDir)) {
        const csv = findCsvIn(exDir);
        if (csv) return csv;
      }
    }
    if (fs.statSync(dst).isDirectory()) {
      const csv = findCsvIn(dst);
      if (csv) return csv;
    }
  }
  throw new Error(`ds:export for ${table} produced no CSV artifact (created: ${created.join(', ') || 'none'})`);
}

/** Export a full table (following pages if it hits the page cap). Returns array of row objects. */
async function exportTable(table, tmpDir) {
  let all = null;
  for (let page = 1; page <= 5; page++) {
    const csvPath = await exportTablePage(table, page, tmpDir);
    const { header, rows } = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    if (!all) all = { header, rows };
    else all.rows.push(...rows);
    if (rows.length < PAGE_CAP) break;
  }
  return all;
}

// ---------- spot checks ----------
function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function printCheck(title, zcql, rows) {
  console.log(`\n  CHECK: ${title}`);
  console.log(`  ZCQL : ${zcql}`);
  for (const [k, v] of rows) console.log(`    ${String(k).padEnd(32)} ${String(v).padStart(8)}`);
}

function spotChecks(t) {
  // t = {TableName: {header, rows}}
  const need = ['CaseMaster', 'Unit', 'District', 'CaseCategory', 'GravityOffence', 'CrimeHead', 'ChargesheetDetails'];
  for (const n of need) {
    if (!t[n] || !t[n].rows.length) throw new Error(`spot checks need exported table ${n} (empty or missing)`);
  }
  const districtName = new Map(t.District.rows.map((r) => [r.DistrictID, r.DistrictName]));
  const unitDistrict = new Map(t.Unit.rows.map((r) => [r.UnitID, r.DistrictID]));
  const catName = new Map(t.CaseCategory.rows.map((r) => [r.CaseCategoryID, r.LookupValue]));
  const gravName = new Map(t.GravityOffence.rows.map((r) => [r.GravityOffenceID, r.LookupValue]));
  const headName = new Map(t.CrimeHead.rows.map((r) => [r.CrimeHeadID, r.CrimeGroupName]));
  const cases = t.CaseMaster.rows;

  let failures = 0;
  const expectNonEmpty = (label, rows) => {
    if (!rows.length || rows.every(([, v]) => !v)) {
      console.error(`  FAIL: ${label} returned no data`);
      failures++;
    }
  };

  // 1. Top-5 districts by case count (CaseMaster -> Unit -> District)
  const byDist = new Map();
  for (const c of cases) {
    const d = unitDistrict.get(c.PoliceStationID);
    if (d) byDist.set(d, (byDist.get(d) || 0) + 1);
  }
  const r1 = topN(byDist, 5).map(([d, n]) => [`${districtName.get(d) || d} (${d})`, n]);
  printCheck(
    'Top-5 districts by case count',
    "SELECT District.DistrictName, COUNT(CaseMaster.ROWID) FROM CaseMaster " +
      'LEFT JOIN Unit ON CaseMaster.PoliceStationID = Unit.UnitID ' +
      'LEFT JOIN District ON Unit.DistrictID = District.DistrictID ' +
      'GROUP BY District.DistrictName ORDER BY COUNT(CaseMaster.ROWID) DESC LIMIT 5',
    r1
  );
  expectNonEmpty('top districts', r1);

  // 2. Cases by category (FIR/UDR/PAR/ZeroFIR)
  const byCat = new Map();
  for (const c of cases) {
    const k = catName.get(c.CaseCategoryID) || c.CaseCategoryID;
    byCat.set(k, (byCat.get(k) || 0) + 1);
  }
  const r2 = topN(byCat, 10);
  printCheck(
    'Case count by category',
    'SELECT CaseCategory.LookupValue, COUNT(CaseMaster.ROWID) FROM CaseMaster ' +
      'LEFT JOIN CaseCategory ON CaseMaster.CaseCategoryID = CaseCategory.CaseCategoryID ' +
      'GROUP BY CaseCategory.LookupValue',
    r2
  );
  expectNonEmpty('category split', r2);

  // 3. Heinous vs non-heinous split
  const byGrav = new Map();
  for (const c of cases) {
    const k = gravName.get(c.GravityOffenceID) || c.GravityOffenceID;
    byGrav.set(k, (byGrav.get(k) || 0) + 1);
  }
  const r3 = topN(byGrav, 5);
  printCheck(
    'Heinous vs non-heinous',
    'SELECT GravityOffence.LookupValue, COUNT(CaseMaster.ROWID) FROM CaseMaster ' +
      'LEFT JOIN GravityOffence ON CaseMaster.GravityOffenceID = GravityOffence.GravityOffenceID ' +
      'GROUP BY GravityOffence.LookupValue',
    r3
  );
  expectNonEmpty('gravity split', r3);

  // 4. Top-5 crime heads by case count
  const byHead = new Map();
  for (const c of cases) {
    const k = headName.get(c.CrimeMajorHeadID) || c.CrimeMajorHeadID;
    byHead.set(k, (byHead.get(k) || 0) + 1);
  }
  const r4 = topN(byHead, 5);
  printCheck(
    'Top-5 crime heads by case count',
    'SELECT CrimeHead.CrimeGroupName, COUNT(CaseMaster.ROWID) FROM CaseMaster ' +
      'LEFT JOIN CrimeHead ON CaseMaster.CrimeMajorHeadID = CrimeHead.CrimeHeadID ' +
      'GROUP BY CrimeHead.CrimeGroupName ORDER BY COUNT(CaseMaster.ROWID) DESC LIMIT 5',
    r4
  );
  expectNonEmpty('crime heads', r4);

  // 5. Chargesheet type distribution (only for cases that exist)
  const caseIds = new Set(cases.map((c) => c.CaseMasterID));
  const byCs = new Map();
  let orphans = 0;
  for (const cs of t.ChargesheetDetails.rows) {
    if (!caseIds.has(cs.CaseMasterID)) { orphans++; continue; }
    byCs.set(cs.cstype || '?', (byCs.get(cs.cstype || '?') || 0) + 1);
  }
  const r5 = topN(byCs, 5);
  printCheck(
    `Chargesheet type split (orphan rows: ${orphans})`,
    'SELECT ChargesheetDetails.cstype, COUNT(ChargesheetDetails.ROWID) FROM ChargesheetDetails ' +
      'INNER JOIN CaseMaster ON ChargesheetDetails.CaseMasterID = CaseMaster.CaseMasterID ' +
      'GROUP BY ChargesheetDetails.cstype',
    r5
  );
  expectNonEmpty('chargesheet split', r5);
  if (orphans > 0) {
    console.error(`  FAIL: ${orphans} ChargesheetDetails rows reference missing CaseMaster ids`);
    failures++;
  }
  return failures;
}

// ---------- main ----------
async function main() {
  const tables = TABLE_ORDER.filter((tName) => !args.only || args.only.has(tName));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dappa-verify-'));
  console.log(`Verify load — exporting ${tables.length} tables via catalyst ds:export`);
  console.log(`Temp dir: ${tmpDir}\n`);

  const exported = {}; // name -> {header, rows}
  const results = [];
  let failures = 0;

  for (const table of tables) {
    const local = path.join(OUT_DIR, `${table}.csv`);
    const localCount = fs.existsSync(local) ? countCsvRecords(local) : null;
    process.stdout.write(`${table.padEnd(22)} exporting... `);
    try {
      const data = await exportTable(table, tmpDir);
      exported[table] = data;
      const dsCount = data.rows.length;
      const ok = localCount === null ? true : dsCount === localCount;
      if (!ok) failures++;
      results.push({ table, dsCount, localCount, ok });
      console.log(`store=${dsCount}  csv=${localCount ?? 'n/a'}  ${ok ? 'PASS' : 'MISMATCH'}`);
    } catch (err) {
      failures++;
      results.push({ table, dsCount: null, localCount, ok: false });
      console.log(`ERROR — ${err.message}`);
    }
  }

  console.log('\n================ ROW COUNTS ================');
  console.log(`${'Table'.padEnd(22)} ${'Store'.padStart(8)} ${'CSV'.padStart(8)}  Status`);
  for (const r of results) {
    console.log(
      `${r.table.padEnd(22)} ${String(r.dsCount ?? '-').padStart(8)} ` +
        `${String(r.localCount ?? '-').padStart(8)}  ${r.ok ? 'PASS' : 'FAIL'}`
    );
  }

  if (!args.countsOnly) {
    console.log('\n================ SPOT JOINS (computed over exports; ZCQL shown for console replay) ================');
    try {
      failures += spotChecks(exported);
    } catch (err) {
      console.error(`  Spot checks aborted: ${err.message}`);
      failures++;
    }
  }

  if (!args.keep) fs.rmSync(tmpDir, { recursive: true, force: true });
  else console.log(`\nExports kept in ${tmpDir}`);

  console.log(`\n${failures ? `FAIL — ${failures} problem(s)` : 'ALL CHECKS PASSED'}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
