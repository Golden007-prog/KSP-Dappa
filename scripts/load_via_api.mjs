#!/usr/bin/env node
// load_via_api.mjs — stream pipeline/out CSVs into the live Data Store through
// dappa_api's POST /admin/bulk-insert (regular row API), bypassing the
// exhausted free-tier bulk-write allowance. Resumable via scripts/.apiload_state.json.
//   node scripts/load_via_api.mjs <BASE_URL> [--only=A,B] [--limit-rows=N]
// BASE_URL example: https://project-rainfall-60079891305.development.catalystserverless.in/server/dappa_api
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'pipeline', 'out');
const STATE_FILE = path.join(ROOT, 'scripts', '.apiload_state.json');
const BASE = process.argv[2];
if (!BASE || !BASE.startsWith('http')) { console.error('usage: node scripts/load_via_api.mjs <BASE_URL> [--only=A,B]'); process.exit(1); }
const TOKEN = process.env.ADMIN_TOKEN || 'demo-admin';
const argOnly = process.argv.find((a) => a.startsWith('--only='));
const only = argOnly ? argOnly.slice(7).split(',') : null;
const argLim = process.argv.find((a) => a.startsWith('--limit-rows='));
const LIMIT = argLim ? parseInt(argLim.slice(13), 10) : Infinity;
const CHUNK = 200;

// column type maps (Int/Double -> Number, Boolean -> true/false; rest strings)
const T = {
  SocioEconomic: { DistrictID:'i', Population:'i', UrbanPct:'d', LiteracyPct:'d', PerCapitaIncomeIdx:'d' },
  AggMonthly: { DistrictID:'i', UnitID:'i', CrimeHeadID:'i', CrimeSubHeadID:'i', CaseCount:'i', HeinousCount:'i' },
  // AlertID / ClusterID are STRING ids from the pipeline ('A0001', 'H001') —
  // the schema checklist mis-declared them Int. Left uncoerced on purpose.
  AnomalyAlert: { DistrictID:'i', UnitID:'i', CrimeHeadID:'i', Observed:'i', Expected:'d', ZScore:'d', Severity:'i' },
  OffenderProfile: { CaseCount:'i', DegreeCentrality:'d', RiskScore:'d' },
  NetworkEdge: { Weight:'i' },
  StationRisk: { UnitID:'i', Horizon:'i', RiskScore:'d' },
  HotspotCluster: { CrimeHeadID:'i', CentroidLat:'d', CentroidLng:'d', RadiusM:'d', CaseCount:'i', HourBandStart:'i', HourBandEnd:'i', Intensity:'d', DistrictID:'i' },
  ForecastMonthly: { DistrictID:'i', CrimeHeadID:'i', Actual:'i', Predicted:'d', Lo:'d', Hi:'d' },
  CaseAnomaly: { CaseMasterID:'i', Score:'d' },
  Victim: { VictimMasterID:'i', CaseMasterID:'i', AgeYear:'i', GenderID:'i' },
  Accused: { AccusedMasterID:'i', CaseMasterID:'i', AgeYear:'i', GenderID:'i' },
  CasteMaster: { caste_master_id:'i' },
  ReligionMaster: { ReligionID:'i' },
  OccupationMaster: { OccupationID:'i' },
  Act: { Active:'b' },
  Section: { Active:'b' },
  CrimeHeadActSection: { CrimeHeadID:'i' },
  Court: { CourtID:'i', DistrictID:'i', StateID:'i', Active:'b' },
  ComplainantDetails: { ComplainantID:'i', CaseMasterID:'i', AgeYear:'i', OccupationID:'i', ReligionID:'i', CasteID:'i', GenderID:'i' },
  ActSectionAssociation: { CaseMasterID:'i', ActOrderID:'i', SectionOrderID:'i' },
  ArrestSurrender: { ArrestSurrenderID:'i', CaseMasterID:'i', ArrestSurrenderTypeID:'i', ArrestSurrenderStateId:'i', ArrestSurrenderDistrictId:'i', PoliceStationID:'i', IOID:'i', CourtID:'i', AccusedMasterID:'i', IsAccused:'b', IsComplainantAccused:'b' },
  ChargesheetDetails: { CSID:'i', CaseMasterID:'i', PolicePersonID:'i' },
};

// priority: analytics tables the app queries, then case children, then ER rest
const ORDER = ['SocioEconomic', 'AggMonthly', 'AnomalyAlert', 'OffenderProfile', 'NetworkEdge', 'StationRisk', 'HotspotCluster', 'ForecastMonthly', 'CaseAnomaly', 'Victim', 'Accused', 'CasteMaster', 'ReligionMaster', 'OccupationMaster', 'Act', 'Section', 'CrimeHeadActSection', 'Court', 'ComplainantDetails', 'ActSectionAssociation', 'ArrestSurrender', 'ChargesheetDetails'];

function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function coerce(table, header, parts) {
  const types = T[table] || {};
  const obj = {};
  for (let i = 0; i < header.length; i++) {
    const v = parts[i];
    if (v === '' || v === undefined) continue; // nullable
    const t = types[header[i]];
    // Doubles go as STRINGS. Catalyst rejects small JSON numbers outright —
    // {"DegreeCentrality":0.0005} => "Please give a correct double value",
    // while "0.0005" is accepted (verified against the live table; 0.005 is
    // fine, so the cutoff is where its stack switches to exponent notation).
    // The raw CSV text is already a clean decimal, so pass it through.
    if (t === 'd') { obj[header[i]] = Number.isFinite(Number(v)) ? v : v; }
    else if (t === 'i') { const n = Number(v); obj[header[i]] = Number.isFinite(n) ? n : v; }
    else if (t === 'b') obj[header[i]] = v === '1' || v === 'true';
    else obj[header[i]] = v;
  }
  return obj;
}

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

async function postChunk(table, rows, attempt = 1) {
  const r = await fetch(BASE + '/api/v1/admin/bulk-insert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
    body: JSON.stringify({ table, rows }),
  });
  if (r.status === 429 || r.status >= 500) {
    if (attempt <= 5) {
      await new Promise((res) => setTimeout(res, attempt * 3000));
      return postChunk(table, rows, attempt + 1);
    }
  }
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

for (const table of ORDER) {
  if (only && !only.includes(table)) continue;
  const src = path.join(OUT, table + '.csv');
  if (!fs.existsSync(src)) { console.log(`SKIP ${table} — no csv`); continue; }
  const rows = parseCsv(fs.readFileSync(src, 'utf8'));
  const header = rows[0];
  const data = rows.slice(1, 1 + Math.min(LIMIT, rows.length - 1)).map((p) => coerce(table, header, p));
  let done = state[table] || 0;
  if (done >= data.length) { console.log(`OK   ${table} already loaded (${done})`); continue; }
  process.stdout.write(`LOAD ${table} ${done}/${data.length}`);
  while (done < data.length) {
    const chunk = data.slice(done, done + CHUNK);
    const res = await postChunk(table, chunk);
    if (res.status !== 200) {
      console.log(`\nFAIL ${table} at ${done}: HTTP ${res.status} ${(JSON.stringify(res.body) || '').slice(0, 160)}`);
      save();
      process.exit(2);
    }
    done += chunk.length;
    state[table] = done;
    if (done % 2000 < CHUNK) { process.stdout.write(` ${done}`); save(); }
  }
  state[table] = done;
  save();
  console.log(` -> ${done} rows DONE`);
}
console.log('\nAPI load complete.');
