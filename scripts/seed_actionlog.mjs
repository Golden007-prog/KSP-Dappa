#!/usr/bin/env node
// seed_actionlog.mjs — the ActionLog demo seed as a CSV the lead can import.
//
// 40 deterministic officer decisions on the 13 oldest AnomalyAlert rows
// (lib/actionlog.js seedActions — the same generator the contract suite and
// the PUBLIC_DEMO fixture use), every Payload marked source:"fixture" so a
// judge can tell a seeded decision from a real one on screen.
//
//   node scripts/seed_actionlog.mjs                      # alerts from the Development API, CSV to pipeline/out/ActionLog_seed.csv
//   node scripts/seed_actionlog.mjs --from-csv pipeline/out/AnomalyAlert.csv
//   node scripts/seed_actionlog.mjs --api https://…/server/dappa_api/api/v1
//   node scripts/seed_actionlog.mjs --push https://…/api/v1 --token demo-admin   # POST /admin/bulk-insert (≤200 rows/call) into the live table
//
// Import path (console): catalyst ds:import ActionLog pipeline/out/ActionLog_seed.csv
// — or the --push flag above once the table exists. Re-running the import
// duplicates rows (ds:import appends; docs/DECISIONS.md D-018), so import once.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const require = createRequire(path.join(ROOT, 'functions/dappa_api/package.json'));
const actionlog = require(path.join(ROOT, 'functions/dappa_api/lib/actionlog.js'));
const { toCsv } = require(path.join(ROOT, 'functions/dappa_api/lib/util.js'));

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const API = arg('--api', 'https://project-rainfall-60079891305.development.catalystserverless.in/server/dappa_api/api/v1');
const FROM_CSV = arg('--from-csv', null);
const PUSH = arg('--push', null);
const TOKEN = arg('--token', process.env.ADMIN_TOKEN || 'demo-admin');
const OUT = arg('--out', path.join(ROOT, 'pipeline/out/ActionLog_seed.csv'));
const COUNT = Number(arg('--count', 40));
const OLDEST = Number(arg('--oldest', 16));

function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      cur.push(field); rows.push(cur); cur = []; field = '';
    } else field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

async function getJson(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (!json || json.ok !== true) throw new Error(`${url} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

/** Oldest N alerts with their CreatedAt, from the API (list has no CreatedAt; detail does). */
async function alertsFromApi() {
  const all = [];
  for (let page = 1; page <= 10; page += 1) {
    const json = await getJson(`${API}/alerts?perPage=200&page=${page}`);
    all.push(...json.data);
    if (all.length >= (json.meta.total || 0) || json.data.length < 200) break;
  }
  all.sort((a, b) => String(a.periodEnd || a.periodStart).localeCompare(String(b.periodEnd || b.periodStart)) || String(a.alertId).localeCompare(String(b.alertId)));
  const oldest = all.slice(0, OLDEST);
  const out = [];
  for (const a of oldest) {
    // eslint-disable-next-line no-await-in-loop
    const d = await getJson(`${API}/alerts/${encodeURIComponent(a.alertId)}`);
    out.push({
      AlertID: a.alertId, CreatedAt: d.data.createdAt || null, PeriodEnd: a.periodEnd, PeriodStart: a.periodStart,
      Severity: a.severity, UnitID: a.unitId, DistrictID: a.districtId
    });
  }
  return { rows: out, total: all.length };
}

function alertsFromCsv(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  return { rows, total: rows.length };
}

async function main() {
  const src = FROM_CSV ? alertsFromCsv(path.resolve(ROOT, FROM_CSV)) : await alertsFromApi();
  const seed = actionlog.seedActions(src.rows, { count: COUNT, seedTag: 'seed_actionlog v1' });
  const keys = [...new Set(seed.map((r) => r.AlertKey))];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const cols = ['AlertKey', 'ActionType', 'Actor', 'ActorRole', 'Unit', 'Note', 'OutcomeLabel', 'Payload', 'ClientTs'];
  fs.writeFileSync(OUT, toCsv(seed, cols));
  console.log(`alerts read: ${src.total} · seeded ${seed.length} actions on ${keys.length} oldest alerts (${keys.join(', ')})`);
  console.log(`csv: ${OUT}`);
  if (PUSH) {
    let inserted = 0;
    for (let i = 0; i < seed.length; i += 200) {
      const res = await fetch(`${PUSH}/admin/bulk-insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
        body: JSON.stringify({ table: 'ActionLog', rows: seed.slice(i, i + 200) })
      });
      const json = await res.json().catch(() => null);
      if (!json || json.ok !== true) throw new Error(`bulk-insert failed: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
      inserted += json.data.inserted || 0;
    }
    console.log(`pushed ${inserted} rows into ActionLog via ${PUSH}`);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
