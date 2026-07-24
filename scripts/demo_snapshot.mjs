#!/usr/bin/env node
/**
 * demo_snapshot.mjs — builds the static GitHub Pages demo dataset.
 *
 * Boots the dappa_api express app in-process against the bundled fixture
 * (same technique as functions/dappa_api/test/run.mjs), issues every GET/POST
 * the client can make (endpoints × the param combos the routes actually
 * request: districts, crime heads, month windows, horizons, canned copilot
 * utterances, per-case narratives, a one-factor predict sweep), and writes
 * each response envelope to client/public/demo/api/<key>.json where <key>
 * comes from client/src/lib/demoKey.js — the exact encoder the browser uses
 * when the bundle is built with VITE_STATIC_DEMO=1.
 *
 * Usage: node scripts/demo_snapshot.mjs
 * Exits non-zero if any snapshot request fails.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
// The snapshot fires thousands of in-process requests in seconds — lift the
// public-API rate limit (600/min default) before the app module reads it.
process.env.RATE_LIMIT_PER_MIN = '1000000';
const { createApp } = require('../functions/dappa_api/lib/app.js');
const { createStubClient } = require('../functions/dappa_api/lib/datastore.js');
const { buildFixtureTables } = require('../functions/dappa_api/lib/fixture.js');
const { CANNED_UTTERANCES } = require('../functions/dappa_api/lib/copilot.js');
const constants = require('../functions/dappa_api/lib/constants.js');

const { demoKey, demoFallbackKey, normalizeUtterance } =
  await import(new URL('../client/src/lib/demoKey.js', import.meta.url));
const { SUGGESTED_QUESTIONS } =
  await import(new URL('../client/src/routes/copilot/suggestions.js', import.meta.url));

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.join(SCRIPT_DIR, '..', 'client', 'public', 'demo');
const OUT_DIR = path.join(DEMO_DIR, 'api');

// ---------------------------------------------------------------------------
// Boot the app with the stubbed datastore (mirrors test/run.mjs)
// ---------------------------------------------------------------------------

const tables = buildFixtureTables();
const stub = createStubClient(tables);
const app = createApp({ clientFactory: () => stub });
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/api/v1`;

// Vocabulary the specs iterate over — derived from the fixture/constants so a
// dataset change automatically reshapes the snapshot.
const D_ALL = constants.DISTRICTS.map((d) => d.id);
const D_NAMES = constants.DISTRICTS.map((d) => d.name);
const HEADS = constants.CRIME_HEADS.map((h) => String(h.id));
const FIXTURE_DISTRICTS = [...new Set(tables.Unit.map((u) => u.DistrictID))];
const FIXTURE_UNITS = tables.Unit.map((u) => u.UnitID);
const CASE_IDS = tables.CaseMaster.map((c) => c.CaseMasterID);
const PERSON_KEYS = tables.OffenderProfile.map((o) => o.PersonKey);

// ---------------------------------------------------------------------------
// Date helpers mirroring the client's FilterBar presets (lib/filters.js) and
// the Reports windows (routes/reports/useBriefData.js). Best effort: exact-key
// hits require the page to be viewed on the build date; otherwise api.js's
// fallback ladder strips from/to and serves the endpoint's full window.
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
function subMonthsClamp(n) { // date-fns subMonths semantics (clamp to month end)
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(now.getDate(), last));
}
const TODAY = ymd(new Date());
const PRESETS = [ // FilterBar DATE_RANGES ('all' sends no dates)
  { from: ymd(daysAgo(30)), to: TODAY },
  { from: ymd(daysAgo(90)), to: TODAY },
  { from: ymd(subMonthsClamp(12)), to: TODAY },
  { from: `${new Date().getFullYear()}-01-01`, to: TODAY },
];
const REPORT_WINDOWS = [ // useBriefData windowInfo: last 7 / last 30 days
  { from: ymd(daysAgo(7)), to: TODAY },
  { from: ymd(daysAgo(30)), to: TODAY },
];

/** 'YYYY-MM' → {from,to} covering the month (mirrors geointel/utils monthWindow). */
function monthWindow(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return { from: `${ym}-01`, to: `${ym}-${pad2(new Date(y, m, 0).getDate())}` };
}

// ---------------------------------------------------------------------------
// HTTP + write plumbing
// ---------------------------------------------------------------------------

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
// Snapshots are CI build artifacts — keep the ~1.4k JSON files out of git.
fs.writeFileSync(path.join(DEMO_DIR, '.gitignore'), '*\n!.gitignore\n');

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

const written = new Set();
const failures = [];
let requests = 0;

function write(key, json) {
  if (written.has(key)) return;
  written.add(key);
  fs.writeFileSync(path.join(OUT_DIR, `${key}.json`), JSON.stringify(json));
}

async function snapGet(p, params = {}) {
  const key = demoKey('GET', p, params);
  if (written.has(key)) return null;
  requests += 1;
  const res = await fetch(BASE + p + buildQuery(params));
  let json = null;
  try { json = await res.json(); } catch { /* recorded as failure below */ }
  if (res.status !== 200 || !json || json.ok !== true) {
    failures.push({ method: 'GET', path: p, params, status: res.status, error: json && json.error });
    return null;
  }
  write(key, json);
  return json;
}

async function snapPost(p, body, key) {
  requests += 1;
  const res = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* recorded as failure below */ }
  if (res.status !== 200 || !json || json.ok !== true) {
    failures.push({ method: 'POST', path: p, body, status: res.status, error: json && json.error });
    return null;
  }
  write(key, json);
  return json;
}

// ---------------------------------------------------------------------------
// GET sweep
// ---------------------------------------------------------------------------

// Unfiltered defaults — exactly the params each hook sends on a fresh load,
// and the terminal combos of api.js's demo fallback ladder.
await snapGet('/healthz');
await snapGet('/meta/lookups');
await snapGet('/summary/kpis');
const trendsBase = await snapGet('/trends/monthly'); // reused for scrub months below
await snapGet('/trends/seasonality');
await snapGet('/trends/category-share');
await snapGet('/geo/districts');
await snapGet('/geo/hotspots');
await snapGet('/geo/stations', { perPage: 200 });
await snapGet('/geo/incidents', { limit: 2000 });
await snapGet('/alerts', { perPage: 200 });
await snapGet('/network/graph');
await snapGet('/offenders', { perPage: 200 });
await snapGet('/offenders', { perPage: 200, repeatOnly: '1' });
await snapGet('/forecast');
await snapGet('/risk/stations', { horizon: 30 });
await snapGet('/cases', { page: 1, perPage: 50 });
await snapGet('/cases', { page: 1, perPage: 8 }); // station-drill ladder terminal

// The filter-driven endpoints (FilterBar carries districtId/crimeHeadId/from/to
// across every route that spreads apiParams into these hooks).
const FILTERED = [
  ['/summary/kpis', {}],
  ['/geo/districts', {}],
  ['/trends/monthly', {}],
  ['/trends/seasonality', {}],
  ['/trends/category-share', {}],
  ['/geo/stations', { perPage: 200 }],
  ['/geo/hotspots', {}],
  ['/geo/incidents', { limit: 2000 }],
  ['/alerts', { perPage: 200 }],
  ['/cases', { page: 1, perPage: 50 }],
];

for (const d of D_ALL) {
  for (const [p, base] of FILTERED) await snapGet(p, { ...base, districtId: d });
}
for (const h of HEADS) {
  for (const [p, base] of FILTERED) await snapGet(p, { ...base, crimeHeadId: h });
}
// district × head cross only where the fixture has data — any other pair falls
// back one ladder step to the district-only snapshot.
for (const d of FIXTURE_DISTRICTS) {
  for (const h of HEADS) {
    for (const [p, base] of FILTERED) await snapGet(p, { ...base, districtId: d, crimeHeadId: h });
  }
}

// FilterBar date presets and Reports brief windows (kpis/alerts/hotspots).
for (const range of PRESETS) {
  for (const [p, base] of FILTERED) await snapGet(p, { ...base, ...range });
}
for (const range of REPORT_WINDOWS) {
  await snapGet('/summary/kpis', range);
  await snapGet('/alerts', { perPage: 200, ...range });
  await snapGet('/geo/hotspots', range);
}

// GeoIntel time-scrubber: one heat-layer snapshot per month in the trends window.
const scrubMonths = ((trendsBase && trendsBase.data) || []).map((r) => r.ym).filter(Boolean);
if (!scrubMonths.length) failures.push({ method: 'GET', path: '/trends/monthly', error: 'no scrub months derived' });
for (const ym of scrubMonths) {
  await snapGet('/geo/incidents', { limit: 2000, ...monthWindow(ym) });
}

// Offenders registry + Network graph filter by district NAME (the client
// resolves the FilterBar code to a name first).
for (const name of D_NAMES) {
  await snapGet('/offenders', { perPage: 200, district: name });
  await snapGet('/offenders', { perPage: 200, district: name, repeatOnly: '1' });
  await snapGet('/network/graph', { districtId: name });
}

// Forecast explorer: full district × head grid (both arrive as strings).
for (const d of D_ALL) {
  for (const h of HEADS) await snapGet('/forecast', { districtId: d, crimeHeadId: h });
}

// GeoIntel station drill: recent cases per fixture unit.
for (const u of FIXTURE_UNITS) await snapGet('/cases', { page: 1, perPage: 8, unitId: u });

// Detail routes.
for (const id of CASE_IDS) await snapGet(`/cases/${id}`);
for (const pk of PERSON_KEYS) await snapGet(`/offenders/${pk}`);

// ---------------------------------------------------------------------------
// POST sweep
// ---------------------------------------------------------------------------

// Copilot: every canned utterance + suggestion chip, keyed by the normalized
// utterance (api.js normalizes the same way before the lookup).
const utterances = new Map();
for (const u of [...CANNED_UTTERANCES, ...SUGGESTED_QUESTIONS]) {
  const norm = normalizeUtterance(u);
  if (norm) utterances.set(norm, u);
}
for (const [norm, raw] of utterances) {
  await snapPost('/copilot/query', { q: raw }, demoKey('POST', '/copilot/query', {}, { q: norm }));
}

// Narrative per case (NarrativePanel fires {caseId} on mount; string/number
// caseId hash identically via stableBody coercion).
for (const id of CASE_IDS) {
  await snapPost('/ai/narrative', { caseId: id }, demoKey('POST', '/ai/narrative', {}, { caseId: id }));
}

// Predict: OutcomePanel default profile + a one-factor sweep over every form
// control, plus a fixed-name fallback for multi-field edits.
const PREDICT_DEFAULT = {
  districtId: '0101', crimeSubHeadId: '306', gravity: 'Non-Heinous', hourBand: 'night',
  victimCount: 1, accusedCount: 1, sectionCount: 2, arrestWithin7d: false,
};
const predictBodies = [PREDICT_DEFAULT];
for (const d of D_ALL) predictBodies.push({ ...PREDICT_DEFAULT, districtId: d });
for (const s of constants.CRIME_SUBHEADS) predictBodies.push({ ...PREDICT_DEFAULT, crimeSubHeadId: String(s.id) });
for (const g of constants.GRAVITIES) predictBodies.push({ ...PREDICT_DEFAULT, gravity: g.name });
for (const hb of ['night', 'morning', 'day', 'evening']) predictBodies.push({ ...PREDICT_DEFAULT, hourBand: hb });
for (const n of [1, 2, 3, 4, 5, 6]) {
  predictBodies.push({ ...PREDICT_DEFAULT, victimCount: n });
  predictBodies.push({ ...PREDICT_DEFAULT, accusedCount: n });
}
for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) predictBodies.push({ ...PREDICT_DEFAULT, sectionCount: n });
predictBodies.push({ ...PREDICT_DEFAULT, arrestWithin7d: true });
let predictFallback = null;
for (const body of predictBodies) {
  const key = demoKey('POST', '/predict/outcome', {}, body);
  if (written.has(key)) continue;
  const json = await snapPost('/predict/outcome', body, key);
  if (json && !predictFallback) predictFallback = json;
}
if (predictFallback) write(demoFallbackKey('POST', '/predict/outcome'), predictFallback);

// Weekly brief per window + fixed-name fallback.
let briefFallback = null;
for (const w of ['last-7-days', 'last-30-days']) {
  const body = { window: w };
  const json = await snapPost('/reports/weekly-brief', body, demoKey('POST', '/reports/weekly-brief', {}, body));
  if (json && !briefFallback) briefFallback = json;
}
if (briefFallback) write(demoFallbackKey('POST', '/reports/weekly-brief'), briefFallback);

// ---------------------------------------------------------------------------
// Wrap up
// ---------------------------------------------------------------------------

server.close();

fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  files: written.size,
  requests,
  scrubMonths,
  copilotUtterances: utterances.size,
}, null, 2));

console.log(`demo_snapshot: ${written.size} snapshot files from ${requests} requests -> ${path.relative(process.cwd(), OUT_DIR)}`);
if (failures.length) {
  console.error(`demo_snapshot: ${failures.length} FAILED requests:`);
  console.error(JSON.stringify(failures.slice(0, 20), null, 2));
  process.exit(1);
}
console.log('demo_snapshot: all requests OK.');
