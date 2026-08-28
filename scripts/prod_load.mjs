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
    let answered = false;
    let buf = '';
    const started = Date.now();
    const onData = (chunk) => {
      const text = chunk.toString();
      const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      buf += clean;
      process.stdout.write(clean);
      if (!answered && /Select a bucket/i.test(text)) {
        answered = true;
        setTimeout(() => { try { child.stdin.write('\n'); } catch { /* closed */ } }, 400);
      }
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
