// Static-demo snapshot contract (scripts/demo_snapshot.mjs ↔ client/src/lib/
// demoKey.js ↔ client/src/lib/api.js ↔ routes/ingest/ingestApi.js).
//
// The GitHub Pages build answers every request from pre-generated JSON keyed by
// demoKey(). Nothing in the browser can tell you a key is wrong — a miss 404s
// to a hash nobody can read back, or (on a host with an SPA fallback) returns
// index.html with status 200 — so these checks stand in for the runtime signal:
//
//   1. the key encoder is the ONLY way a key is built (a hand-written literal
//      drifted once and silently emptied the /ingest table picker);
//   2. a non-JSON answer is rejected before parsing, in both readers;
//   3. writes that record an accountability decision refuse honestly instead of
//      resolving {ok:true} — a judge must never think a decision was recorded;
//   4. every API path the client actually requests is either snapshotted by the
//      generator or listed below as a deliberate honest failure. Five whole
//      feature areas (/ocr, /about's nightly + health cards, /identify, the
//      /alerts action loop and all of /depth) were dead on the Pages demo
//      because the generator never fetched them; this is the guard.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const CLIENT_SRC = path.join(ROOT, 'client', 'src');
const GENERATOR = path.join(ROOT, 'scripts', 'demo_snapshot.mjs');
const API_JS = path.join(CLIENT_SRC, 'lib', 'api.js');
const INGEST_API_JS = path.join(CLIENT_SRC, 'routes', 'ingest', 'ingestApi.js');

/** '/cases/${id}' and '/cases/:id' both collapse to '/cases/:p'. */
const normPath = (p) => String(p)
  .replace(/\$\{[^}]*\}/g, ':p')
  .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':p')
  .replace(/\/+$/, '');

function listSources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSources(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Express route paths registered on the app, normalised. */
function routePaths(app) {
  const out = new Set();
  const walk = (stack) => {
    for (const layer of stack || []) {
      if (layer.route) out.add(normPath(layer.route.path));
      else if (layer.handle && layer.handle.stack) walk(layer.handle.stack);
    }
  };
  walk((app._router || app.router || {}).stack);
  return out;
}

/**
 * API paths mentioned in `files`, restricted to paths that are real routes.
 * `anyLiteral` widens the match from "first argument of a call" (how the client
 * writes them) to every string literal (the generator keeps some in arrays).
 */
function apiPathsIn(files, routes, anyLiteral) {
  const found = new Map();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const rx = anyLiteral
      ? /(['"`])(\/[A-Za-z][^'"`\n]*)\1/g
      : /\(\s*(['"`])(\/[A-Za-z][^'"`\n]*)\1/g;
    let m = rx.exec(src);
    while (m) {
      const p = normPath(m[2]);
      if (routes.has(p)) {
        if (!found.has(p)) found.set(p, new Set());
        found.get(p).add(path.relative(ROOT, file).replace(/\\/g, '/'));
      }
      m = rx.exec(src);
    }
  }
  return found;
}

// Paths the client calls that MUST NOT have a snapshot: every one of them is a
// write, and the static bundle has nothing to write to. api.js / ingestApi.js
// each answer these with an explicit refusal that names what is missing.
const HONEST_FAILURES = new Set([
  '/alerts/:p/ack',            // simulated in demoPost, resets on refetch (documented there)
  '/alerts/:p/status',
  '/alerts/:p/actions',
  '/identify/audit/:p/decision',
  '/ingest/validate',          // runs in the browser (localValidate.js)
  '/ingest/load',
  '/ingest/batches',
  '/ingest/batches/:p',
  '/ingest/batches/:p/rollback',
  '/notify/register',
  '/notify/test-digest',
  '/offenders/watch',
]);

// The endpoints the five dead areas depend on. Named explicitly so a future
// refactor of the generator cannot quietly drop one of them.
const REQUIRED_IN_GENERATOR = [
  '/ocr/samples', '/ocr/attachments', '/zia/objects/samples', '/zia/objects', '/zia/ocr', '/zia/moderate',
  '/meta/nightly', '/meta/observability', '/meta/services', '/auth/roles',
  '/identify', '/identify/rules', '/identify/model-card', '/identify/cost', '/identify/gallery', '/identify/audit',
  '/alerts/outcomes', '/actions/recent', '/alerts/digest', '/alerts/:p/actions',
  '/depth/escalation', '/depth/mo-transitions', '/depth/recidivism', '/depth/reactivation',
  '/depth/corridors', '/depth/near-repeat', '/depth/hotspot-trajectory', '/depth/festival-uplift',
  '/depth/lead-lag', '/depth/forecast-audit', '/depth/benchmarks', '/depth/identity/:p',
  '/ingest/tables', '/trends/compare', '/cases/:p/similar',
];

export async function run(h) {
  const { check, createApp, createStubClient, buildFixtureTables } = h;

  const demoKeyMod = await import(new URL('../../../../client/src/lib/demoKey.js', import.meta.url));
  const { demoKey, demoFallbackKey, demoPostKeyBody, canonicalParams } = demoKeyMod;

  // --- 1. the key encoder is the only way a key is built --------------------
  const tablesKey = demoKey('GET', '/ingest/tables');
  check('demoKey GET /ingest/tables is a hashed key, not a hand-written slug',
    /^get_ingest_tables\.[0-9a-f]{8}$/.test(tablesKey), tablesKey);
  check('demoKey GET /ingest/tables is NOT the legacy literal that 404-ed',
    tablesKey !== 'GET_ingest_tables', tablesKey);

  const ingestSrc = fs.readFileSync(INGEST_API_JS, 'utf8');
  check('ingestApi fetchTables keys the snapshot through demoKey()',
    /snapshot\(demoKey\('GET',\s*'\/ingest\/tables'\)\)/.test(ingestSrc));
  check('ingestApi has no hand-written snapshot key literal',
    !/snapshot\(\s*['"]GET_/.test(ingestSrc));

  // --- 2. a non-JSON answer is rejected before parsing ----------------------
  const apiSrc = fs.readFileSync(API_JS, 'utf8');
  for (const [name, src] of [['api.js fetchSnapshot', apiSrc], ['ingestApi snapshot', ingestSrc]]) {
    check(`${name} reads the response content type`, src.includes("headers.get('content-type')"));
    check(`${name} returns null unless the body is JSON`, /if \(!\/\\bjson\\b\/i\.test\(type\)\) return null;/.test(src));
  }

  // --- 3. decision writes refuse honestly -----------------------------------
  // Matched on the message a judge would read: the branch exists to make the
  // refusal visible, so the wording is the contract.
  check('demoPost refuses to fake an alert-action write',
    apiSrc.includes('Static demo: decisions need the live Catalyst deployment'));
  check('demoPost refuses to fake an identify confirm / reject',
    apiSrc.includes('a confirm / reject is written to the Catalyst audit table'));
  check('demoPost refuses a face search on an image the snapshot never saw',
    apiSrc.includes("path === '/identify' && !(body && body.samplePerson)"));
  check('demoPost refuses a Zia scan of an upload the snapshot never saw',
    apiSrc.includes("path === '/zia/ocr' || path === '/zia/moderate'"));
  check('the alert-action branch is reached before the generic {ok:true} fallthrough',
    apiSrc.indexOf('Static demo: decisions need the live Catalyst deployment')
    < apiSrc.indexOf('{ data: { ok: true, demoStatic: true }'));

  // --- 4. the /identify POST key ignores the parts that cannot be replayed --
  const probeBody = {
    image: 'data:image/png;base64,AAAA',
    samplePerson: 'P001',
    filters: { districtId: '0101' },
    limit: 25,
    caseNo: 'CR-2026-000123',
    legalBasis: 'investigation-fir',
  };
  const reduced = demoPostKeyBody('/identify', probeBody);
  check('demoPostKeyBody(/identify) keeps samplePerson, filters and limit',
    reduced.samplePerson === 'P001' && reduced.limit === 25 && reduced.filters.districtId === '0101',
    JSON.stringify(reduced));
  check('demoPostKeyBody(/identify) drops the probe image and the purpose fields',
    !('image' in reduced) && !('caseNo' in reduced) && !('legalBasis' in reduced), JSON.stringify(reduced));
  check('a different probe image hits the same /identify snapshot key',
    demoKey('POST', '/identify', {}, demoPostKeyBody('/identify', probeBody))
    === demoKey('POST', '/identify', {}, demoPostKeyBody('/identify', { ...probeBody, image: 'data:image/png;base64,ZZZZ', caseNo: 'CR-9' })));
  check('a different sample person does NOT collide',
    demoKey('POST', '/identify', {}, demoPostKeyBody('/identify', probeBody))
    !== demoKey('POST', '/identify', {}, demoPostKeyBody('/identify', { ...probeBody, samplePerson: 'P002' })));
  check('demoPostKeyBody is identity for every other path',
    demoPostKeyBody('/copilot/query', { q: 'x' }).q === 'x'
    && demoPostKeyBody('/ai/narrative', { caseId: 4 }).caseId === 4);
  check('demoFallbackKey is stable and filename-safe',
    demoFallbackKey('POST', '/predict/outcome') === 'post_predict_outcome._fallback');
  check('canonicalParams coerces and sorts so 200 and "200" share a key',
    canonicalParams({ perPage: 200, page: '1' }) === canonicalParams({ page: 1, perPage: '200' }));

  // --- 5. generator coverage over the client's real request surface ---------
  const app = createApp({ clientFactory: () => createStubClient(buildFixtureTables()) });
  const routes = routePaths(app);
  check('the express app exposes the routes this check reads', routes.size > 100, `routes=${routes.size}`);

  const generatorSrc = fs.readFileSync(GENERATOR, 'utf8');
  const generatorPaths = apiPathsIn([GENERATOR], routes, true);
  const clientPaths = apiPathsIn(listSources(CLIENT_SRC), routes, false);
  check('the client requests a meaningful number of API paths', clientPaths.size > 50, `client=${clientPaths.size}`);

  const uncovered = [...clientPaths.keys()]
    .filter((p) => !generatorPaths.has(p) && !HONEST_FAILURES.has(p))
    .sort();
  check('every API path the client requests is snapshotted or an honest failure',
    uncovered.length === 0,
    uncovered.map((p) => `${p} (${[...clientPaths.get(p)].join(', ')})`).join(' · '));

  for (const p of REQUIRED_IN_GENERATOR) {
    check(`demo_snapshot.mjs fetches ${p}`, generatorPaths.has(p));
  }

  check('demo_snapshot.mjs writes the raw thumbnail assets api.js points API_BASE at',
    /writeRaw\(`\/identify\/thumb\//.test(generatorSrc));
  check('api.js repoints API_BASE at the raw asset folder in the static demo',
    /STATIC_DEMO \? DEMO_RAW_BASE/.test(apiSrc));
  check('the generator ends by asserting every request succeeded',
    /all requests OK/.test(generatorSrc));
}
