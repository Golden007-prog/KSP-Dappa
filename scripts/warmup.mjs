#!/usr/bin/env node
/**
 * warmup.mjs — primes the Cache-backed aggregate endpoints after a deploy (and
 * the morning of judging). Pure Node, no deps.
 *
 * Usage:
 *   node scripts/warmup.mjs <BASE_URL>
 *
 * BASE_URL may be the API base (…/server/dappa_api/api/v1) or the app origin.
 * Hits: /meta/lookups, /summary/kpis, /geo/districts, /geo/hotspots,
 *       /trends/monthly, /alerts — twice each (first = fill cache, second =
 *       confirm the warm hit) and prints both timings.
 * Exit code 1 if any endpoint fails to return HTTP 200.
 */

const RAW_BASE = process.argv[2];
if (!RAW_BASE) {
  console.error('Usage: node scripts/warmup.mjs <BASE_URL>');
  process.exit(2);
}
const API_PATH = '/server/dappa_api/api/v1';
const BASE = RAW_BASE.replace(/\/+$/, '').includes('/api/v1')
  ? RAW_BASE.replace(/\/+$/, '')
  : RAW_BASE.replace(/\/+$/, '') + API_PATH;

const ENDPOINTS = [
  '/meta/lookups',
  '/summary/kpis',
  '/geo/districts',
  '/geo/hotspots',
  '/trends/monthly',
  '/alerts',
];

async function hit(pathName) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(BASE + pathName, { signal: ctrl.signal });
    await res.arrayBuffer(); // drain
    return { status: res.status, ms: Date.now() - t0 };
  } catch (err) {
    return { status: 0, ms: Date.now() - t0, err: err.name === 'AbortError' ? 'timeout' : String(err.cause?.code || err.message) };
  } finally {
    clearTimeout(timer);
  }
}

let failed = 0;
console.log(`Warmup -> ${BASE}\n`);
for (const ep of ENDPOINTS) {
  const cold = await hit(ep);
  const warm = cold.status === 200 ? await hit(ep) : { status: '-', ms: '-' };
  const ok = cold.status === 200;
  if (!ok) failed++;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${ep.padEnd(18)} cold=${String(cold.ms).padStart(6)}ms  warm=${String(warm.ms).padStart(6)}ms` +
      (ok ? '' : `  (HTTP ${cold.status} ${cold.err || ''})`)
  );
}
console.log(failed ? `\n${failed} endpoint(s) failed — deployment may be cold or broken.` : '\nAll warm.');
process.exit(failed ? 1 : 0);
