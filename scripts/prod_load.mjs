// prod_load.mjs — load every Data Store table into the PRODUCTION environment
// with `catalyst ds:import --production`, answering the CLI's Stratus-bucket
// prompt on stdin (the CLI stops at "Select a bucket…" and errors when stdin
// is ignored — see memory catalyst-ds-import-prompt). Sequential, resumable:
// state lives next to this script. Boolean-fixed CSVs (pipeline/.bool_fixed)
// win over pipeline/out when present.
//
//   node prod_load.mjs                # everything not yet done
//   node prod_load.mjs --only=State,District
//   node prod_load.mjs --force        # ignore state
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'E:/Datathon/ksp-dappa';
const OUT = path.join(REPO, 'pipeline', 'out');
const FIXED = path.join(REPO, 'pipeline', '.bool_fixed');
const STATE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '.prod_load_state.json');
const TIMEOUT_MS = 30 * 60 * 1000;

const TABLE_ORDER = [
  'State', 'District', 'UnitType', 'Unit', 'Rank', 'Designation', 'Employee',
  'CaseCategory', 'GravityOffence', 'CaseStatusMaster', 'CasteMaster', 'ReligionMaster', 'OccupationMaster',
  'Act', 'Section', 'CrimeHead', 'CrimeSubHead', 'CrimeHeadActSection', 'Court',
  'CaseMaster', 'ComplainantDetails', 'Victim', 'Accused', 'ActSectionAssociation', 'ArrestSurrender', 'ChargesheetDetails',
  'AggMonthly', 'HotspotCluster', 'ForecastMonthly', 'AnomalyAlert', 'NetworkEdge', 'OffenderProfile', 'StationRisk', 'SocioEconomic',
  // Console-created tables that the first pass missed. Without FaceGallery,
  // /identify has no gallery at all: "Use a sample capture" reports that the
  // image could not be read, and a search can never run. CaseAnomaly drives
  // the case-explorer anomaly flag and degrades quietly, which is exactly why
  // its absence went unnoticed.
  'FaceGallery', 'CaseAnomaly',
];

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice(7).split(',').map((s) => s.trim()).filter(Boolean)) : null;

function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } }
function saveState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); }

function csvFor(table) {
  const fixed = path.join(FIXED, `${table}.csv`);
  return fs.existsSync(fixed) ? fixed : path.join(OUT, `${table}.csv`);
}

function runImport(table, csv) {
  return new Promise((resolve) => {
    const child = spawn('catalyst', ['ds:import', '--table', table, '--production', csv], {
      cwd: REPO, shell: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    // The CLI asks TWO questions, not one. Answering only the bucket prompt
    // left every import parked forever on "Do you like to download the report
    // of this job to your cmd execution directory? (y/N)" — the table imports
    // fine and the job id is printed, but the process never exits, so a run
    // stalls after the first table and no state is ever written. Each prompt
    // gets its own latch so one cannot mask the other.
    let askedBucket = false;
    let askedReport = false;
    let buf = '';
    const started = Date.now();
    const say = (text) => setTimeout(() => { try { child.stdin.write(text); } catch { /* closed */ } }, 400);
    const onData = (chunk) => {
      const text = chunk.toString();
      const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      buf += clean;
      process.stdout.write(clean);
      if (!askedBucket && /Select a bucket/i.test(clean)) { askedBucket = true; say('\n'); }
      // 'n' — the report is a convenience download; the authoritative check is
      // /healthz completeness against the source CSV row counts.
      if (!askedReport && /download the report/i.test(clean)) { askedReport = true; say('n\n'); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => {
      console.log(`\n[timeout] ${table}: killing after ${Math.round((Date.now() - started) / 1000)}s`);
      try { child.kill('SIGTERM'); } catch { /* noop */ }
    }, TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code === null ? -1 : code, tail: buf.split(/\r?\n/).filter((l) => l.trim()).slice(-6), secs: Math.round((Date.now() - started) / 1000) });
    });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: 1, tail: [String(err.message || err)], secs: 0 }); });
  });
}

const state = force ? {} : loadState();
const plan = TABLE_ORDER.filter((t) => !only || only.has(t));
let failed = 0;
for (let i = 0; i < plan.length; i += 1) {
  const table = plan[i];
  const label = `[${String(i + 1).padStart(2)}/${plan.length}] ${table}`;
  if (state[table] && state[table].status === 'done' && !force) { console.log(`${label} — already done (${state[table].at})`); continue; }
  const csv = csvFor(table);
  if (!fs.existsSync(csv)) { console.log(`${label} — MISSING ${csv}`); failed += 1; continue; }
  console.log(`\n${label} — importing ${path.basename(path.dirname(csv))}/${path.basename(csv)} …`);
  const r = await runImport(table, csv);
  const ok = r.code === 0;
  state[table] = { status: ok ? 'done' : (r.code === -1 ? 'timeout' : 'failed'), code: r.code, secs: r.secs, at: new Date().toISOString(), tail: r.tail };
  saveState(state);
  console.log(`${label} — ${state[table].status} (exit ${r.code}, ${r.secs}s)`);
  if (!ok) failed += 1;
}
console.log(`\nPROD LOAD SUMMARY: ${plan.length - failed} ok, ${failed} not ok`);
for (const t of plan) if (state[t]) console.log(`  ${t.padEnd(22)} ${state[t].status.padEnd(8)} ${state[t].secs || 0}s`);
process.exit(failed ? 1 : 0);
