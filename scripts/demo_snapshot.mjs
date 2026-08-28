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
import zlib from 'zlib';

const require = createRequire(import.meta.url);
// The snapshot fires thousands of in-process requests in seconds — lift the
// public-API rate limit (600/min default) before the app module reads it.
process.env.RATE_LIMIT_PER_MIN = '1000000';
const { createApp } = require('../functions/dappa_api/lib/app.js');
const { createStubClient } = require('../functions/dappa_api/lib/datastore.js');
const { buildFixtureTables } = require('../functions/dappa_api/lib/fixture.js');
const { CANNED_UTTERANCES } = require('../functions/dappa_api/lib/copilot.js');
const constants = require('../functions/dappa_api/lib/constants.js');
// Read-only measurement helpers for the POST /identify probe (see buildSampleProbe).
const faceLib = require('../functions/dappa_api/lib/faces.js');
const { decodePng } = require('../functions/dappa_api/lib/png.js');

const { demoKey, demoFallbackKey, demoPostKeyBody, normalizeUtterance } =
  await import(new URL('../client/src/lib/demoKey.js', import.meta.url));
const { SUGGESTED_QUESTIONS } =
  await import(new URL('../client/src/routes/copilot/suggestions.js', import.meta.url));

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.join(SCRIPT_DIR, '..', 'client', 'public', 'demo');
const OUT_DIR = path.join(DEMO_DIR, 'api');
// Raw (non-envelope) assets the browser requests straight off API_BASE — the
// gallery / candidate thumbnails. api.js repoints API_BASE at this folder when
// VITE_STATIC_DEMO=1, so the suffix under it must match the live path exactly.
const RAW_DIR = path.join(DEMO_DIR, 'raw');
const PUBLIC_DIR = path.join(SCRIPT_DIR, '..', 'client', 'public');

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
fs.rmSync(RAW_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
// Snapshots are CI build artifacts — keep the JSON files out of git.
fs.writeFileSync(path.join(DEMO_DIR, '.gitignore'), '*\n!.gitignore\n');

let rawFiles = 0;
/** Write one raw asset under demo/raw/<suffix> (suffix starts with '/'). */
function writeRaw(suffix, body) {
  const file = path.join(RAW_DIR, suffix.replace(/^\//, ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  rawFiles += 1;
}

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

// --- minimal PNG writer (POST /identify probe) ------------------------------
// zlib only: the function bundle has no image dependency and neither does this
// script. 8-bit RGB, filter 0 on every row — lib/png.js decodes exactly this.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y += 1) {
    raw[y * (1 + size * 3)] = 0; // filter: none
    raw.set(px.subarray(y * size * 3, (y + 1) * size * 3), y * (1 + size * 3) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the POST /identify probe -----------------------------------------------
// A "sample capture" in the browser is the person's SVG stand-in rasterised on
// a canvas, so its bytes can never be reproduced here — and the local engine
// scores the PIXELS (faces.js probeDescriptor; samplePerson is provenance, not
// a shortcut), so a placeholder image would rank the wrong person. Instead the
// probe is drawn to the stand-in's own measured parameters — the skin and hair
// medians, face aspect and hair fraction stored in FaceGallery.QualityJson —
// and re-lit with the same brightness jitter imageUtil.js applies, so the
// answer that gets replayed is the function's real answer for a second capture
// of that person. The search below closes the loop on faces.pixelDescriptor,
// so a change to the measurement reshapes the drawing instead of drifting.
const PROBE_SIZE = 256;
const PROBE_BG = [226, 232, 240];

function drawProbe({ skin, hair, ry, hairBottom }) {
  const S = PROBE_SIZE;
  const px = new Uint8Array(S * S * 3);
  for (let i = 0; i < S * S; i += 1) { px[i * 3] = PROBE_BG[0]; px[i * 3 + 1] = PROBE_BG[1]; px[i * 3 + 2] = PROBE_BG[2]; }
  const put = (x, y, c) => { const i = (y * S + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; };
  const cx = S * 0.5;
  const cy = S * 0.47;
  const rx = S * 0.235;
  // Neck: darker than the face so the width profile collapses under the chin,
  // which is how pixelDescriptor finds the bottom of the face box.
  const shade = skin.map((c) => Math.max(0, c - 60));
  for (let y = Math.round(cy + ry * 0.72); y < S; y += 1) {
    for (let x = Math.round(cx - rx * 0.3); x <= Math.round(cx + rx * 0.3); x += 1) put(x, y, shade);
  }
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      if (u * u + v * v <= 1) put(x, y, skin);
    }
  }
  if (hairBottom !== null) { // hair cap, clipped well above the skin sample patch
    const hrx = rx * 1.08;
    const hry = ry * 1.05;
    const hcy = cy - ry * 0.06;
    for (let y = 0; y <= Math.min(S - 1, Math.round(hairBottom)); y += 1) {
      for (let x = 0; x < S; x += 1) {
        const u = (x - cx) / hrx;
        const v = (y - hcy) / hry;
        if (u * u + v * v <= 1) put(x, y, hair);
      }
    }
  }
  return px;
}

/** Mirror of imageUtil.js svgToProbe()'s r(5) brightness jitter. */
function relightProbe(px, seedNum) {
  const r = (n) => { const x = Math.sin(seedNum * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
  const bright = 0.88 + r(5) * 0.24;
  for (let i = 0; i < px.length; i += 1) px[i] = Math.min(255, Math.round(px[i] * bright));
  return px;
}

const measureProbe = (px) => faceLib.pixelDescriptor(decodePng(encodePng(PROBE_SIZE, Buffer.from(px))));

/** @returns {{png:Buffer, measured:object|null, target:object}} */
function buildSampleProbe(pixelQuality, seedNum) {
  const target = {
    skin: pixelQuality.skin,
    hair: pixelQuality.hair,
    aspect: Number(pixelQuality.aspect),
    hairFrac: Number(pixelQuality.hairFrac) || 0,
  };
  const cy = PROBE_SIZE * 0.47;
  const hasHair = target.hairFrac > 0.05;
  const capOf = (ry) => (hasHair ? Math.min(cy - 16, cy - ry * 0.18) : null);
  // aspect = maxWidth / faceHeight, so a taller ellipse lowers it: bisect on ry.
  let lo = PROBE_SIZE * 0.12;
  let hi = PROBE_SIZE * 0.48;
  let ry = PROBE_SIZE * 0.3;
  for (let i = 0; i < 24; i += 1) {
    ry = (lo + hi) / 2;
    const d = measureProbe(drawProbe({ ...target, ry, hairBottom: capOf(ry) }));
    if (!d) { lo = ry; continue; }
    if (d.aspect > target.aspect) lo = ry; else hi = ry;
  }
  const lit = relightProbe(drawProbe({ ...target, ry, hairBottom: capOf(ry) }), seedNum);
  return { png: encodePng(PROBE_SIZE, Buffer.from(lit)), measured: measureProbe(lit), target };
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
await snapGet('/alerts', { page: 1, perPage: 200 });
await snapGet('/network/graph');
await snapGet('/network/graph', { limit: 3000 }); // routes/offenders/useMoAnalysis.js
await snapGet('/offenders', { perPage: 200 });
await snapGet('/offenders', { perPage: 200, repeatOnly: '1' });
await snapGet('/forecast');
await snapGet('/risk/stations', { horizon: 30 });
await snapGet('/tiers/beat');
await snapGet('/tiers/station');
await snapGet('/tiers/state');
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
  ['/alerts', { page: 1, perPage: 200 }], // useAlertsCorpus page walk (PAGE_SIZE)
  ['/cases', { page: 1, perPage: 50 }],
  ['/cases', { page: 1, perPage: 200 }],  // Case Explorer deep scan (SCAN_PAGE)
  ['/cases', { page: 1, perPage: 1 }],    // FacetRail count probe
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

// Ingest screen: the ER table registry (validation runs in the browser in the static demo).
await snapGet('/ingest/tables');

// Detail routes, plus everything the FIR detail derives from one case: the
// pattern engine, the station-context and peer-cohort deep scans (both key off
// the CrimeNo segments — routes/cases/deepScan.js crimeNoParts/unpad) and the
// nearby-incident bbox the mini-map draws.
const SUBHEAD_ID_BY_NAME = new Map(constants.CRIME_SUBHEADS.map((s) => [String(s.name), String(s.id)]));
const crimeNoParts = (crimeNo) => {
  const s = String(crimeNo || '').replace(/\D/g, '');
  return s.length === 18 ? { districtId: s.slice(1, 5), unitId: s.slice(5, 9) } : null;
};
const unpad = (v) => String(v ?? '').replace(/^0+(?=\d)/, '');
for (const id of CASE_IDS) {
  const detail = await snapGet(`/cases/${id}`);
  const d = (detail && detail.data) || {};
  await snapGet(`/cases/${id}/similar`);
  const subId = SUBHEAD_ID_BY_NAME.get(String(d.subHeadName)) || '';
  const parts = crimeNoParts(d.crimeNo);
  if (parts) {
    await snapGet('/cases', { unitId: unpad(parts.unitId), page: 1, perPage: 200 });   // StationContext
    await snapGet('/cases', { districtId: parts.districtId, page: 1, perPage: 60 });   // useSimilarCases fallback
    if (subId) await snapGet('/cases', { crimeSubHeadId: subId, districtId: unpad(parts.districtId), page: 1, perPage: 200 }); // PeerCohortPanel
  }
  const la = Number(d.latitude);
  const ln = Number(d.longitude);
  if (Number.isFinite(la) && Number.isFinite(ln) && (la !== 0 || ln !== 0)) {
    const R = 0.045; // useNearbyIncidents radiusDeg
    const bbox = [ln - R, la - R, ln + R, la + R].map((n) => n.toFixed(5)).join(',');
    await snapGet('/geo/incidents', { bbox, crimeSubHeadId: subId || undefined, limit: 120 });
  }
}
await snapGet('/geo/incidents', { limit: 120 }); // bbox/sub-head ladder terminal
for (const pk of PERSON_KEYS) await snapGet(`/offenders/${pk}`);

// ---------------------------------------------------------------------------
// Round-2 surfaces. Without these five blocks the Pages demo answers DEMO_MISS
// on every panel they feed — /about's nightly + health cards, the /alerts
// action loop, /identify, all eleven /depth panels and the Zia surfaces — so a
// judge who opens the static demo sees error cards where the Catalyst
// deployment shows analysis. Param combos below are the ones the components
// actually request; anything else degrades through api.js's strip ladder.
// ---------------------------------------------------------------------------

// --- platform introspection (/about, tier homes, notification bell) --------
await snapGet('/meta/services');
await snapGet('/meta/nightly');
await snapGet('/meta/observability');
await snapGet('/meta/challenge');
await snapGet('/meta/socio');
await snapGet('/meta/refresh');
await snapGet('/meta/olap-benchmark');
await snapGet('/ml/models');
await snapGet('/auth/roles');
await snapGet('/auth/me');
// About's search demo: the default term plus every example chip × every scope.
for (const q of ['theft', 'gold chain', 'Bengaluru', 'two-wheeler', 'chain snatching']) {
  for (const scope of ['all', 'cases', 'offenders']) await snapGet('/search/cases', { q, scope, limit: 20 });
}

// --- /alerts action loop (routes/alerts/actionsApi.js) ---------------------
const ALERT_IDS = tables.AnomalyAlert.map((a) => a.AlertID);
await snapGet('/alerts/summary');
await snapGet('/alerts', { status: 'OPEN', perPage: 50 });   // notification bell
await snapGet('/actions/recent', { days: 7, limit: 60 });
// OutcomePanel / AlertsDigest scope by the FilterBar district (Alerts.jsx
// passes `unit={districtId}`), so `unit` is a district code or absent.
for (const w of ['all', 'last30', 'last90', 'last365']) {
  await snapGet('/alerts/outcomes', { window: w });
  for (const d of D_ALL) await snapGet('/alerts/outcomes', { window: w, unit: d });
}
for (const d of [7, 14, 30, 90]) await snapGet('/alerts/digest', { days: d });
for (const d of D_ALL) await snapGet('/alerts/digest', { days: 7, unit: d });
for (const id of ALERT_IDS) {
  await snapGet(`/alerts/${id}`);
  await snapGet(`/alerts/${id}/actions`);
}
// --- /trends A/B compare (routes/trends/ABCompare.jsx) ---------------------
// Both sides come from one call, and neither aDistrictId nor bDistrictId is on
// api.js's strip ladder (dropping one side would relabel the chart), so every
// pair a judge can pick is snapshotted. The seeded default arrives unpadded
// from /geo/districts while the picker's options are padded lookup ids, so the
// vocabulary is the union of both spellings.
const AB_DISTRICTS = [...new Set([...D_ALL, ...FIXTURE_DISTRICTS.map((d) => d.replace(/^0+(?=\d)/, ''))])];
for (const a of AB_DISTRICTS) {
  for (const b of AB_DISTRICTS) await snapGet('/trends/compare', { aDistrictId: a, bDistrictId: b });
}

// Intel panel: emerging sub-heads (districtId is the only honoured filter) and
// the socio correlation the weekly brief reads unfiltered.
await snapGet('/insight/emerging');
await snapGet('/insight/socio-correlation');
for (const d of D_ALL) await snapGet('/insight/emerging', { districtId: d });

// --- /identify (routes/identify/*, lib/faceApi.js) -------------------------
// Snapshot the audit BEFORE the POST sweep below, or the history tab would show
// the generator's own several hundred sweep searches instead of the seeded ones.
const rulesSnap = await snapGet('/identify/rules');
await snapGet('/identify/model-card');
for (let n = 1; n <= 25; n += 1) await snapGet('/identify/cost', { limit: n });
const gallery1 = await snapGet('/identify/gallery', { page: 1, perPage: 24 });
const galleryTotal = Number(gallery1 && gallery1.meta && gallery1.meta.total) || 0;
for (let p = 2; p <= Math.ceil(galleryTotal / 24); p += 1) await snapGet('/identify/gallery', { page: p, perPage: 24 });
const GALLERY_KEYS = ((gallery1 && gallery1.data && gallery1.data.items) || []).map((i) => String(i.personKey));
await snapGet('/identify/audit', { limit: 50 });
await snapGet('/identify/audit', { decision: 'confirm', limit: 100 }); // AliasQueue
for (const pk of GALLERY_KEYS) {
  await snapGet('/identify/gallery', { personKey: pk, perPage: 1, page: 1 });
  await snapGet('/identify/audit', { personKey: pk, limit: 50 });
  await snapGet('/identify/audit', { personKey: pk, limit: 5 });
}
// Thumbnails are <img src={`${API_BASE}${thumbUrl}`}> — raw SVG, not envelopes.
for (const pk of GALLERY_KEYS) {
  for (const size of ['', '?size=160', '?size=256']) {
    const res = await fetch(`${BASE}/identify/thumb/${encodeURIComponent(pk)}.svg${size}`);
    requests += 1;
    if (res.status !== 200) { failures.push({ method: 'GET', path: `/identify/thumb/${pk}.svg`, status: res.status }); continue; }
    // One file per person: a static host ignores the ?size query, and the SVG
    // scales, so the largest render is the one worth keeping.
    if (size === '?size=256') writeRaw(`/identify/thumb/${pk}.svg`, await res.text());
    else await res.text();
  }
}

// --- /depth analytics (lib/depthApi.js, routes/depth/*) --------------------
// Corpus-wide panels take no parameters.
for (const p of ['/depth/escalation', '/depth/mo-transitions', '/depth/recidivism',
  '/depth/reactivation', '/depth/corridors', '/depth/forecast-audit', '/depth/benchmarks']) {
  await snapGet(p);
}
// GeoIntel "Repeats" tab: both segmented controls × the district scope. The
// crime-head cross is skipped on purpose — the strip ladder drops crimeHeadId
// before districtId, so a head filter lands on the district-only snapshot.
for (const distM of [250, 500, 1000]) {
  for (const days of [7, 14, 28]) {
    await snapGet('/depth/near-repeat', { distM, days });
    for (const d of D_ALL) await snapGet('/depth/near-repeat', { districtId: d, distM, days });
  }
}
// TrajectoryPanel always sends a district (defaults to 0101) and months=12.
for (const cellKm of [1, 2, 5]) {
  for (const d of D_ALL) await snapGet('/depth/hotspot-trajectory', { districtId: d, months: 12, cellKm });
}
// Trends panels: state-wide and per district.
await snapGet('/depth/festival-uplift');
await snapGet('/depth/lead-lag');
for (const d of D_ALL) await snapGet('/depth/lead-lag', { districtId: d });
// festival-uplift rejects a district with no cases ("Unknown district"), which
// in this fixture is everything outside the five seeded districts; those fall
// back one ladder step to the state-wide panel.
for (const d of FIXTURE_DISTRICTS) await snapGet('/depth/festival-uplift', { districtId: d });
for (const pk of PERSON_KEYS) await snapGet(`/depth/identity/${pk}`);

// --- Zia surfaces (/ocr, FIR-detail evidence objects) ----------------------
const ocrSamples = await snapGet('/ocr/samples');
const sceneSamples = await snapGet('/zia/objects/samples');
for (const id of CASE_IDS) await snapGet('/ocr/attachments', { caseId: id });

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

// --- FIR-detail evidence objects (routes/cases/EvidenceTags.jsx) -----------
// The panel pairs each case with one scene by a hash of the case id, so every
// (scene, case) pair is snapshotted rather than replicating the hash here.
const SCENES = ((sceneSamples && sceneSamples.data && sceneSamples.data.scenes) || []).map((s) => s.sceneId);
if (!SCENES.length) failures.push({ method: 'GET', path: '/zia/objects/samples', error: 'no scenes derived' });
for (const sceneId of SCENES) {
  for (const id of CASE_IDS) {
    const body = { sceneId, caseId: String(id) };
    await snapPost('/zia/objects', body, demoKey('POST', '/zia/objects', {}, body));
  }
}

// --- /ocr sample scans (routes/Ocr.jsx) ------------------------------------
// The browser base64s the very bytes in client/public/samples/ocr/, so these
// bodies reproduce exactly. Uploads and pasted text are refused honestly by
// api.js's demoPost instead of being answered with a sample's text.
const OCR = (ocrSamples && ocrSamples.data) || {};
const ocrBase = OCR.baseUrl || 'samples/ocr/';
for (const s of OCR.samples || []) {
  const file = path.join(PUBLIC_DIR, ocrBase, s.file);
  if (!fs.existsSync(file)) { failures.push({ method: 'POST', path: '/zia/ocr', error: `missing sample ${file}` }); continue; }
  const imageBase64 = fs.readFileSync(file).toString('base64');
  const guard = { imageBase64 };
  await snapPost('/zia/moderate', guard, demoKey('POST', '/zia/moderate', {}, guard));
  for (const language of ['eng', 'kan', null]) { // 'auto' omits the field
    const body = { imageBase64 };
    if (language) body.language = language;
    if (s.truthText) body.text = s.truthText;
    await snapPost('/zia/ocr', body, demoKey('POST', '/zia/ocr', {}, body));
  }
}

// --- POST /identify (routes/identify/*) ------------------------------------
// Keyed on {samplePerson, filters, limit} (demoKey.js DEMO_POST_KEY_FIELDS);
// the probe itself is drawn to the stand-in's measured parameters — see
// buildSampleProbe above for why, and for what that does and does not preserve.
const RULES = (rulesSnap && rulesSnap.data) || {};
const RULE_FILTERS = RULES.filters || {};
const LEGAL_BASIS = ((RULES.legalBases || [])[0] || {}).id || 'investigation-fir';
// MO_SUGGESTIONS from routes/identify/FilterForm.jsx — the datalist a judge picks from.
const MO_TAGS = ['two-wheeler', 'gold-chain', 'night', 'lock-breaking', 'gas-cutter', 'otp-fraud', 'vehicle-theft', 'country-made-pistol'];
const FILTER_SETS = [
  ...D_ALL.map((districtId) => ({ districtId })),
  ...(RULE_FILTERS.riskBands || []).map((riskBand) => ({ riskBand })),
  ...(RULE_FILTERS.ageBands || []).map((ageBand) => ({ ageBand })),
  ...(RULE_FILTERS.genders || []).map((gender) => ({ gender })),
  ...MO_TAGS.map((moTag) => ({ moTag })),
];
const GALLERY_ITEMS = (gallery1 && gallery1.data && gallery1.data.items) || [];
// ProbeUpload SAMPLE_KEYS = the first five gallery persons; seedNum starts at 1.
for (const [idx, item] of GALLERY_ITEMS.slice(0, 5).entries()) {
  const q = (item.quality && item.quality.pixel) || null;
  if (!q || !q.skin || !q.hair) {
    failures.push({ method: 'POST', path: '/identify', error: `no pixel quality for ${item.personKey}` });
    continue;
  }
  const probe = buildSampleProbe(q, idx + 1);
  // Fail loudly rather than shipping a probe that ranks the wrong person: the
  // colour medians are the dimensions the local engine actually compares.
  const m = probe.measured;
  const off = !m || Math.abs(m.aspect - probe.target.aspect) > 0.08
    || m.skin.some((c, i) => Math.abs(c - probe.target.skin[i]) > 24)
    || m.hair.some((c, i) => Math.abs(c - probe.target.hair[i]) > 24);
  if (off) {
    failures.push({ method: 'POST', path: '/identify', error: `probe for ${item.personKey} missed its target: ${JSON.stringify(m)} vs ${JSON.stringify(probe.target)}` });
    continue;
  }
  const image = `data:image/png;base64,${probe.png.toString('base64')}`;
  for (const filters of FILTER_SETS) {
    const body = { image, samplePerson: item.personKey, filters, limit: 25, caseNo: 'CR-2026-000123', legalBasis: LEGAL_BASIS };
    await snapPost('/identify', body, demoKey('POST', '/identify', {}, demoPostKeyBody('/identify', body)));
  }
}

// ---------------------------------------------------------------------------
// Wrap up
// ---------------------------------------------------------------------------

server.close();

fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  files: written.size,
  rawFiles,
  requests,
  scrubMonths,
  copilotUtterances: utterances.size,
}, null, 2));

console.log(`demo_snapshot: ${written.size} snapshot files (+${rawFiles} raw assets) from ${requests} requests -> ${path.relative(process.cwd(), OUT_DIR)}`);
if (failures.length) {
  console.error(`demo_snapshot: ${failures.length} FAILED requests:`);
  console.error(JSON.stringify(failures.slice(0, 20), null, 2));
  process.exit(1);
}
console.log('demo_snapshot: all requests OK.');
