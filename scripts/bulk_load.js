#!/usr/bin/env node
/**
 * bulk_load.js — one-command bulk load of pipeline/out CSVs into Catalyst Data Store.
 *
 * Primary path: `catalyst ds:import --table <Table> <csv>` (verified present in
 * zcatalyst-cli 1.27.0; the CLI creates a bulk-write job and waits on it, so no
 * manual 5k batching is needed — the CLI/bulk API batch internally).
 * Runs with cwd = repo root so the CLI picks up .catalystrc project linkage.
 *
 * Usage:
 *   node scripts/bulk_load.js                 # load everything not yet loaded
 *   node scripts/bulk_load.js --force         # ignore state, re-import all
 *   node scripts/bulk_load.js --only=State,District
 *   node scripts/bulk_load.js --dry-run       # print plan only
 *   node scripts/bulk_load.js --production    # target production env
 *
 * Resumable: progress is tracked in scripts/.bulkload_state.json — tables marked
 * "done" are skipped on re-run (delete the file or use --force to start over).
 *
 * NEVER imported: _ground_truth_offenders.csv (benchmark ground truth),
 * outcome_model.json (fallback predictor coefficients), rag_context/ (QuickML
 * knowledge base), quickml_*.csv (QuickML training files), network_graph.json
 * (NoSQL/Stratus payload). Only whitelisted Data Store tables are touched.
 *
 * Fallback if ds:import fails: exact console-import instructions are printed
 * per failed table (Data Store -> table -> Import), in dependency order.
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = process.env.DAPPA_OUT
  ? path.resolve(REPO_ROOT, process.env.DAPPA_OUT)
  : path.join(REPO_ROOT, 'pipeline', 'out');
const STATE_FILE = path.join(__dirname, '.bulkload_state.json');
const IMPORT_TIMEOUT_MS = 15 * 60 * 1000; // per table

// Dependency order (master spec section 5):
// State -> District -> UnitType -> Unit -> Rank -> Designation -> Employee ->
// lookups -> Act/Section/CrimeHead* -> Court -> CaseMaster -> children -> derived.
const TABLE_ORDER = [
  // geography + org hierarchy
  'State',
  'District',
  'UnitType',
  'Unit',
  'Rank',
  'Designation',
  'Employee',
  // lookups
  'CaseCategory',
  'GravityOffence',
  'CaseStatusMaster',
  'CasteMaster',
  'ReligionMaster',
  'OccupationMaster',
  // law + classification
  'Act',
  'Section',
  'CrimeHead',
  'CrimeSubHead',
  'CrimeHeadActSection',
  'Court',
  // transactions
  'CaseMaster',
  'ComplainantDetails',
  'Victim',
  'Accused',
  'ActSectionAssociation',
  'ArrestSurrender',
  'ChargesheetDetails',
  // derived analytics tables
  'AggMonthly',
  'HotspotCluster',
  'ForecastMonthly',
  'AnomalyAlert',
  'NetworkEdge',
  'OffenderProfile',
  'StationRisk',
  'SocioEconomic',
];

// Files that must never reach the Data Store, even if someone renames tables.
const NEVER_IMPORT = new Set([
  '_ground_truth_offenders.csv',
  'outcome_model.json',
  'network_graph.json',
  'quickml_case_outcome.csv',
  'quickml_station_risk.csv',
]);

// ---------- tiny helpers ----------

function parseArgs(argv) {
  const args = { force: false, dryRun: false, production: false, only: null };
  for (const a of argv.slice(2)) {
    if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--production') args.production = true;
    else if (a.startsWith('--only=')) {
      args.only = new Set(a.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { tables: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

/** Count CSV data records (quote-aware: embedded newlines inside quoted
 *  BriefFacts etc. do not inflate the count). Returns records minus header. */
function countCsvRecords(file) {
  const buf = fs.readFileSync(file, 'utf8');
  let records = 0;
  let inQuotes = false;
  let sawAny = false;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === '\n' && !inQuotes) records++;
    else if (c !== '\r') sawAny = true;
  }
  if (sawAny && buf.length && buf[buf.length - 1] !== '\n') records++; // no trailing newline
  return Math.max(0, records - 1); // minus header row
}

/** Run `catalyst <args>` streaming output live, resolve with {code, tail}. */
function runCatalyst(args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('catalyst', args, {
      cwd: REPO_ROOT,
      shell: process.platform === 'win32', // catalyst is a .cmd shim on Windows
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tail = [];
    const keep = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) {
          tail.push(line.trim());
          if (tail.length > 12) tail.shift();
        }
      }
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => {
      console.error(`\n  [timeout] killing catalyst after ${timeoutMs / 1000}s`);
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code === null ? 1 : code, tail });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      tail.push(String(err.message || err));
      resolve({ code: 1, tail });
    });
  });
}

function consoleFallback(table, csvPath) {
  return [
    `  Console import fallback for ${table}:`,
    `    1. Open the Catalyst console -> project "Project-Rainfall" (id 50643000000013024).`,
    `    2. Left nav: Develop -> Data Store -> click table "${table}".`,
    `    3. Top-right (...) menu -> Import -> choose file:`,
    `         ${csvPath}`,
    `    4. Column mapping: headers in the CSV already match the Data Store`,
    `       column names 1:1 — accept the auto-mapping and start the import.`,
    `    5. Wait for the import job to show "Success" before importing the next`,
    `       table (keep the dependency order shown by this script).`,
  ].join('\n');
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(OUT_DIR)) {
    console.error(`Output dir not found: ${OUT_DIR}`);
    console.error('Run the pipeline first:  python3.12 pipeline/generate.py && python3.12 pipeline/analytics.py');
    process.exit(1);
  }

  const state = args.force ? { tables: {} } : loadState();
  state.tables = state.tables || {};

  // Warn about stray CSVs in out/ that are not part of the load plan.
  const strays = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .filter((f) => !TABLE_ORDER.includes(path.basename(f, '.csv')));
  for (const s of strays) {
    const why = NEVER_IMPORT.has(s) ? 'excluded by policy (never bulk-loaded)' : 'no Data Store table for it';
    console.log(`[skip] ${s} — ${why}`);
  }

  const plan = TABLE_ORDER.filter((t) => !args.only || args.only.has(t));
  const results = []; // {table, status, rows, note}
  let failed = 0;

  console.log(`\nBulk load plan: ${plan.length} tables, out dir = ${OUT_DIR}`);
  console.log(`State file: ${STATE_FILE}${args.force ? ' (ignored: --force)' : ''}\n`);

  for (let i = 0; i < plan.length; i++) {
    const table = plan[i];
    const csvPath = path.join(OUT_DIR, `${table}.csv`);
    const label = `[${String(i + 1).padStart(2)}/${plan.length}] ${table}`;

    if (!fs.existsSync(csvPath)) {
      console.log(`${label} — MISSING (${csvPath})`);
      results.push({ table, status: 'missing', rows: 0, note: 'CSV not found — run the pipeline' });
      failed++;
      continue;
    }

    const rows = countCsvRecords(csvPath);
    const prev = state.tables[table];
    if (prev && prev.status === 'done' && !args.force) {
      console.log(`${label} — already loaded (${prev.rows} rows at ${prev.at}), skipping`);
      results.push({ table, status: 'skipped', rows: prev.rows, note: 'previously loaded' });
      continue;
    }

    console.log(`${label} — importing ${rows} rows ...`);
    if (args.dryRun) {
      results.push({ table, status: 'dry-run', rows, note: '' });
      continue;
    }

    const cliArgs = ['ds:import', '--table', table];
    if (args.production) cliArgs.push('--production');
    cliArgs.push(csvPath);

    const { code, tail } = await runCatalyst(cliArgs, IMPORT_TIMEOUT_MS);
    if (code === 0) {
      state.tables[table] = { status: 'done', rows, at: new Date().toISOString() };
      saveState(state);
      results.push({ table, status: 'done', rows, note: '' });
      console.log(`${label} — OK\n`);
    } else {
      failed++;
      state.tables[table] = { status: 'failed', rows, at: new Date().toISOString(), tail: tail.slice(-3) };
      saveState(state);
      results.push({ table, status: 'FAILED', rows, note: tail.slice(-1)[0] || `exit ${code}` });
      console.error(`${label} — FAILED (exit ${code})`);
      console.error(consoleFallback(table, csvPath));
      console.error('');
    }
  }

  // Summary
  console.log('\n================ BULK LOAD SUMMARY ================');
  const w = Math.max(...results.map((r) => r.table.length), 5);
  for (const r of results) {
    console.log(
      `${r.table.padEnd(w)}  ${String(r.rows).padStart(7)}  ${r.status.padEnd(8)}  ${r.note || ''}`
    );
  }
  console.log('===================================================');

  if (failed) {
    console.error(
      `\n${failed} table(s) need attention. For any FAILED table, use the console` +
        ' import steps printed above (dependency order = the order of this summary).' +
        '\nRe-running this script retries only tables not marked done.'
    );
    process.exit(1);
  }
  console.log('\nAll tables loaded. Next: node scripts/verify_load.mjs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
