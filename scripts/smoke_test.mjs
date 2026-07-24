#!/usr/bin/env node
/**
 * smoke_test.mjs — end-to-end API smoke suite for KSP DAPPA (pure Node, no deps).
 *
 * Usage:
 *   node scripts/smoke_test.mjs <BASE_URL>
 *
 * BASE_URL may be either the API base (…/server/dappa_api/api/v1) or just the
 * app origin (https://…catalystserverless.in) — the suite appends the standard
 * base path when it is missing. Examples:
 *   node scripts/smoke_test.mjs http://localhost:3000
 *   node scripts/smoke_test.mjs https://project-rainfall-60079891305.development.catalystserverless.in
 *
 * Checks (per docs/CONTRACTS.md):
 *   - GET  /healthz               200 + ok:true
 *   - every GET endpoint          200 + {ok:true} + expected top-level keys
 *   - POST /predict/outcome       numeric probability
 *   - POST /copilot/query         all 15 canned utterances -> non-empty answer
 * Prints a PASS/FAIL table; exits non-zero on any failure.
 */

const RAW_BASE = process.argv[2];
if (!RAW_BASE) {
  console.error('Usage: node scripts/smoke_test.mjs <BASE_URL>');
  process.exit(2);
}
const API_PATH = '/server/dappa_api/api/v1';
const BASE = RAW_BASE.replace(/\/+$/, '').includes('/api/v1')
  ? RAW_BASE.replace(/\/+$/, '')
  : RAW_BASE.replace(/\/+$/, '') + API_PATH;

const TIMEOUT_MS = 30000;

// The 15 canned copilot utterances (master spec §6 examples + intent-grammar coverage).
const COPILOT_UTTERANCES = [
  'chain snatching in Mysuru City last 3 months',
  'top 5 districts for vehicle theft this year',
  'compare murders 2024 vs 2025 in Belagavi',
  'which stations are highest risk next month?',
  'total FIRs registered in Bengaluru City last month',
  'monthly trend of cyber crime in Mangaluru City',
  'detection rate for property crimes in Tumakuru',
  'top crime heads in Kalaburagi this year',
  'heinous cases in Ballari last 6 months',
  'how many murders in Mysuru City in 2025',
  'vehicle theft trend statewide last 12 months',
  'active alerts right now',
  'top 5 stations by case count in Bengaluru City',
  'NDPS cases in Dakshina Kannada this year',
  'compare chain snatching in Mysuru City vs Bengaluru City last 6 months',
];

const results = []; // {name, ok, ms, note}

function record(name, ok, ms, note = '') {
  results.push({ name, ok, ms, note });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name.padEnd(52)} ${String(ms).padStart(6)}ms  ${note}`);
}

async function call(method, pathName, body) {
  const url = BASE + pathName;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const ms = Date.now() - t0;
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, json, ms };
  } catch (err) {
    return { status: 0, json: null, ms: Date.now() - t0, err: err.name === 'AbortError' ? 'timeout' : String(err.cause?.code || err.message) };
  } finally {
    clearTimeout(timer);
  }
}

/** One retry on network failure / 5xx (cold starts). */
async function callRetry(method, pathName, body) {
  let r = await call(method, pathName, body);
  if (r.status === 0 || r.status >= 500) {
    await new Promise((res) => setTimeout(res, 1500));
    r = await call(method, pathName, body);
  }
  return r;
}

function hasKeys(obj, keys) {
  if (!obj || typeof obj !== 'object') return keys;
  return keys.filter((k) => !(k in obj));
}

/**
 * Generic GET check.
 *  keys: required top-level keys of data (object) — or, when rowKeys is given,
 *  data must be a non-empty array whose first row has rowKeys.
 */
async function checkGet(name, pathName, { keys = [], rowKeys = null, allowEmpty = false } = {}) {
  const r = await callRetry('GET', pathName);
  if (r.status !== 200) return record(name, false, r.ms, `HTTP ${r.status} ${r.err || ''}`);
  if (!r.json || r.json.ok !== true) return record(name, false, r.ms, 'ok!==true');
  const data = r.json.data;
  if (rowKeys) {
    const arr = Array.isArray(data) ? data : null;
    if (!arr) return record(name, false, r.ms, 'data is not an array');
    if (!arr.length) return record(name, allowEmpty, r.ms, allowEmpty ? 'empty (allowed)' : 'empty array');
    const missing = hasKeys(arr[0], rowKeys);
    if (missing.length) return record(name, false, r.ms, `row missing keys: ${missing.join(',')}`);
    return record(name, true, r.ms, `${arr.length} rows`);
  }
  const missing = hasKeys(data, keys);
  if (missing.length) return record(name, false, r.ms, `missing keys: ${missing.join(',')}`);
  return record(name, true, r.ms);
}

async function main() {
  console.log(`Smoke suite -> ${BASE}\n`);

  // 1. healthz gates everything.
  const hz = await callRetry('GET', '/healthz');
  record('GET /healthz', hz.status === 200 && hz.json?.ok === true, hz.ms,
    hz.status !== 200 ? `HTTP ${hz.status} ${hz.err || ''}` : '');
  if (hz.status !== 200) {
    finish(); // no point continuing against a dead deployment
    return;
  }

  // 2. Lookups first — later checks reuse real ids from it when available.
  const lk = await callRetry('GET', '/meta/lookups');
  const lkOk = lk.status === 200 && lk.json?.ok === true && lk.json.data && typeof lk.json.data === 'object';
  const lkData = lkOk ? lk.json.data : {};
  const missing = hasKeys(lkData, ['districts', 'units']);
  record('GET /meta/lookups', lkOk && !missing.length, lk.ms,
    !lkOk ? `HTTP ${lk.status}` : missing.length ? `missing keys: ${missing.join(',')}` : '');
  const firstDistrict = Array.isArray(lkData.districts) && lkData.districts[0]
    ? (lkData.districts[0].districtId ?? lkData.districts[0].DistrictID ?? '0101') : '0101';

  await checkGet('GET /summary/kpis', '/summary/kpis', {
    keys: ['totalFirs', 'momPct', 'heinousCount', 'detectionRate', 'activeAlerts', 'topRisingSubhead'],
  });
  await checkGet('GET /trends/monthly', '/trends/monthly', {});
  await checkGet('GET /trends/seasonality', '/trends/seasonality', {});
  await checkGet('GET /trends/category-share', '/trends/category-share', {});
  await checkGet('GET /geo/districts', '/geo/districts', {
    rowKeys: ['districtId', 'districtName', 'caseCount', 'ratePerLakh', 'momDeltaPct', 'alert'],
  });
  await checkGet(`GET /geo/stations?districtId=${firstDistrict}`, `/geo/stations?districtId=${firstDistrict}`, {
    rowKeys: ['unitId', 'unitName', 'districtId', 'lat', 'lng', 'caseCount', 'riskScore'],
  });
  await checkGet('GET /geo/incidents?limit=100', '/geo/incidents?limit=100', {});
  await checkGet('GET /geo/hotspots', '/geo/hotspots', {
    rowKeys: ['clusterId', 'centroidLat', 'centroidLng', 'radiusM', 'caseCount', 'intensity', 'label'],
  });
  await checkGet('GET /alerts', '/alerts', {
    rowKeys: ['alertId', 'districtId', 'severity', 'zScore', 'observed', 'expected', 'narrative'],
  });
  await checkGet('GET /network/graph', '/network/graph', { keys: ['nodes', 'edges'] });
  await checkGet('GET /forecast', '/forecast', { keys: ['history', 'forecast', 'model', 'mape'] });
  await checkGet('GET /risk/stations?horizon=30', '/risk/stations?horizon=30', {
    rowKeys: ['unitId', 'unitName', 'districtId', 'riskScore', 'drivers'],
  });

  // Offenders list -> detail
  const off = await callRetry('GET', '/offenders?repeatOnly=1');
  const offRows = Array.isArray(off.json?.data) ? off.json.data : [];
  const offOk = off.status === 200 && off.json?.ok === true && offRows.length > 0 &&
    !hasKeys(offRows[0], ['personKey', 'canonicalName', 'caseCount']).length;
  record('GET /offenders?repeatOnly=1', offOk, off.ms, offOk ? `${offRows.length} rows` : `HTTP ${off.status}`);
  if (offOk) {
    const key = encodeURIComponent(offRows[0].personKey);
    await checkGet(`GET /offenders/:personKey`, `/offenders/${key}`, { keys: ['personKey'] });
  } else {
    record('GET /offenders/:personKey', false, 0, 'skipped: no offender rows');
  }

  // Cases list -> detail (full ER join)
  const cs = await callRetry('GET', '/cases?perPage=5');
  const csRows = Array.isArray(cs.json?.data) ? cs.json.data : [];
  const csOk = cs.status === 200 && cs.json?.ok === true && csRows.length > 0 &&
    !hasKeys(csRows[0], ['caseMasterId', 'crimeNo', 'registeredDate', 'districtName', 'unitName', 'statusName']).length;
  record('GET /cases?perPage=5', csOk, cs.ms, csOk ? `total=${cs.json?.meta?.total ?? '?'}` : `HTTP ${cs.status}`);
  if (csOk) {
    await checkGet('GET /cases/:id', `/cases/${encodeURIComponent(csRows[0].caseMasterId)}`, {
      keys: ['crimeNo', 'briefFacts', 'complainants', 'victims', 'accused', 'sections'],
    });
  } else {
    record('GET /cases/:id', false, 0, 'skipped: no case rows');
  }

  // POST /predict/outcome — must return a numeric probability.
  const pr = await callRetry('POST', '/predict/outcome', {
    districtId: firstDistrict,
    crimeHeadId: 3,
    crimeSubHeadId: 305,
    gravityId: 2,
    hourBand: '22-04',
    victimCount: 1,
    accusedCount: 2,
    arrestWithin7d: 1,
    sectionCount: 2,
  });
  const prob = pr.json?.data?.probability;
  const prOk = pr.status === 200 && pr.json?.ok === true && typeof prob === 'number' && prob >= 0 && prob <= 1;
  record('POST /predict/outcome', prOk, pr.ms,
    prOk ? `p=${prob.toFixed(3)} src=${pr.json?.meta?.source || 'live'}` : `HTTP ${pr.status} prob=${String(prob)}`);

  // POST /copilot/query — 15 utterances, each must yield a non-empty answer.
  for (const u of COPILOT_UTTERANCES) {
    const r = await callRetry('POST', '/copilot/query', { query: u, q: u, text: u });
    const ans = r.json?.data?.answer;
    const ok = r.status === 200 && r.json?.ok === true && typeof ans === 'string' && ans.trim().length > 0;
    record(`copilot: "${u.slice(0, 44)}"`, ok, r.ms,
      ok ? `engine=${r.json?.data?.engine || '?'}` : `HTTP ${r.status}`);
  }

  finish();
}

function finish() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log('\n==================== SMOKE SUMMARY ====================');
  console.log(`PASS ${pass} / ${results.length}   FAIL ${fail}`);
  if (fail) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}  (${r.note})`);
  }
  console.log('=======================================================');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
