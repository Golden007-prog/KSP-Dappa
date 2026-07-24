#!/usr/bin/env node
// import_all.mjs — schedule catalyst ds:import jobs for every Data Store table.
// Works around two CLI quirks: (1) the interactive bucket prompt (answered via
// piped stdin), (2) Stratus object-name collisions on retry (409) — every run
// uploads under a unique file name. Boolean-fixed CSVs (scripts/fix_bools.mjs)
// are preferred where they exist. Usage:
//   node scripts/import_all.mjs [--only=A,B] [--skip=A,B]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'pipeline', 'out');
const FIXED = path.join(ROOT, 'pipeline', '.bool_fixed');
const BATCH = path.join(ROOT, 'pipeline', '.import_batch');

const ORDER = [
  'State', 'District', 'UnitType', 'Unit', 'Rank', 'Designation', 'Employee',
  'CaseCategory', 'GravityOffence', 'CaseStatusMaster', 'CasteMaster',
  'ReligionMaster', 'OccupationMaster', 'Act', 'Section', 'CrimeHead',
  'CrimeSubHead', 'CrimeHeadActSection', 'Court', 'CaseMaster',
  'ComplainantDetails', 'Victim', 'Accused', 'ActSectionAssociation',
  'ArrestSurrender', 'ChargesheetDetails', 'AggMonthly', 'HotspotCluster',
  'ForecastMonthly', 'AnomalyAlert', 'NetworkEdge', 'OffenderProfile',
  'StationRisk', 'SocioEconomic', 'CaseAnomaly',
];

const argOnly = process.argv.find((a) => a.startsWith('--only='));
const argSkip = process.argv.find((a) => a.startsWith('--skip='));
const only = argOnly ? argOnly.slice(7).split(',') : null;
const skip = argSkip ? new Set(argSkip.slice(7).split(',')) : new Set();

fs.mkdirSync(BATCH, { recursive: true });
const runTag = 'r' + Date.now().toString(36);
const jobs = {};

for (const table of ORDER) {
  if (only && !only.includes(table)) continue;
  if (skip.has(table)) continue;
  const src = fs.existsSync(path.join(FIXED, table + '.csv'))
    ? path.join(FIXED, table + '.csv')
    : path.join(OUT, table + '.csv');
  if (!fs.existsSync(src)) { console.log(`SKIP ${table} — no csv`); continue; }
  const staged = path.join(BATCH, `${table}_${runTag}.csv`);
  fs.copyFileSync(src, staged);
  const res = spawnSync(
    'catalyst', ['ds:import', '--table', table, staged],
    { cwd: ROOT, input: '\nN\n', encoding: 'utf8', shell: true, timeout: 5 * 60 * 1000 },
  );
  const out = (res.stdout || '') + (res.stderr || '');
  const m = out.match(/jobid "?(\d+)"?/);
  if (m) {
    jobs[table] = m[1];
    console.log(`OK    ${table} job=${m[1]}`);
  } else {
    const err = (out.match(/Error[^\n]*/) || ['unknown'])[0].replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    console.log(`FAIL  ${table} — ${err.slice(0, 120)}`);
  }
  fs.rmSync(staged, { force: true });
}

fs.writeFileSync(path.join(ROOT, 'scripts', '.import_jobs.json'), JSON.stringify(jobs, null, 1));
console.log(`\nScheduled ${Object.keys(jobs).length} import jobs — ids in scripts/.import_jobs.json`);
