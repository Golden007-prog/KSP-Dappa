// /about — runtime-introspection hooks.
//
// None of these endpoints has a hook in lib/api.js (route fillers must not edit
// it), so they follow the pattern routes/alerts/useAlertIntel.js already uses:
// route-local react-query hooks over the shared apiGet.
//
// Verified live shapes (development Catalyst deployment, 2026-07-26):
//
//   GET /meta/services  → { services:[{ key, name, category, status, statusReason,
//                           invocation|null, fallback, flag?, requires?[], endpoints[] }],
//                           counts:{ total, reachableFromCode, liveNow, flagGated,
//                           consolePending, withFallback, byStatus:{…} },
//                           flags:{…15 booleans}, dataMode:'live'|'fixture-demo',
//                           generatedAt }
//                         status ∈ live | flag-gated | console-pending | platform
//   GET /ml/models      → { models:[{ key, name, task, target, status:'serving'|'disabled',
//                           service, trainedAt?, metrics?, flag?, requires?[],
//                           endpoint, fallbackFor:string|null }],
//                           counts:{ total, serving, consolePending, disabled } }
//   GET /healthz        → { status, datastore:{ ok, mode?, rowCounts{}, completeness:{
//                           tables:{ T:{expected,actual,pct} }, overallPct } },
//                           cache:{ ok, backend }, nosql:{ ok, mode?, note? }, flags{} }
//                         meta.uptimeSec
//   GET /meta/challenge → { challenge, capabilities:[{ id, key, title, status, summary,
//                           highlights[], endpoints[], services[] }], counts{} }
//   GET /search/cases   → { query, scope, results[], counts:{cases,offenders},
//                           source:'catalyst-search'|'fallback-zcql-like', matched }
//                         meta.source / meta.cached / meta.ttlSec
//
// Every hook is read-only and retry:0 — a judge on a flaky connection should see
// an honest "could not reach it" panel immediately, not a spinner that hangs.
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const num = (v, d = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const SERVICE_STATUS_ORDER = ['live', 'platform', 'flag-gated', 'console-pending'];

/** Normalize one service row; unknown statuses degrade to 'console-pending'
 *  rather than rendering as live — the safe direction for an honesty page. */
function normalizeService(s, i) {
  const status = SERVICE_STATUS_ORDER.includes(str(s.status)) ? str(s.status) : 'console-pending';
  return {
    key: str(s.key) || `svc-${i}`,
    name: str(s.name) || str(s.key),
    category: str(s.category) || 'other',
    status,
    statusReason: str(s.statusReason),
    invocation: s.invocation ? str(s.invocation) : '',
    fallback: str(s.fallback),
    flag: s.flag ? str(s.flag) : '',
    requires: arr(s.requires).map(str),
    endpoints: arr(s.endpoints).map(str),
  };
}

/**
 * Catalyst service coverage, straight from the function's own introspection.
 * `byStatus` is recomputed from the rows so the group headings can never
 * disagree with the rows rendered underneath them.
 */
export function useServiceMatrix() {
  return useQuery({
    queryKey: ['about-meta-services'],
    queryFn: ({ signal }) => apiGet('/meta/services', {}, { signal }).then((r) => {
      const d = r.data || {};
      const services = arr(d.services).map(normalizeService);
      const byStatus = {};
      for (const s of SERVICE_STATUS_ORDER) byStatus[s] = 0;
      const categories = [];
      for (const s of services) {
        byStatus[s.status] += 1;
        if (!categories.includes(s.category)) categories.push(s.category);
      }
      const reported = d.counts || {};
      return {
        services,
        byStatus,
        categories: categories.sort(),
        total: services.length,
        // Reported by the API rather than derived here — labelled as such in the UI.
        reachableFromCode: num(reported.reachableFromCode),
        withFallback: num(reported.withFallback),
        reportedTotal: num(reported.total),
        flags: d.flags && typeof d.flags === 'object' ? d.flags : {},
        dataMode: str(d.dataMode),
        generatedAt: str(d.generatedAt),
      };
    }),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

/**
 * ML model registry with the fallback chain resolved: every disabled model
 * names the model that answers its endpoint instead (`fallbackFor`).
 */
export function useModelRegistry() {
  return useQuery({
    queryKey: ['about-ml-models'],
    queryFn: ({ signal }) => apiGet('/ml/models', {}, { signal }).then((r) => {
      const d = r.data || {};
      const models = arr(d.models).map((m, i) => ({
        key: str(m.key) || `model-${i}`,
        name: str(m.name) || str(m.key),
        task: str(m.task) || 'other',
        target: str(m.target),
        status: str(m.status) === 'serving' ? 'serving' : str(m.status) || 'disabled',
        service: str(m.service),
        trainedAt: m.trainedAt ? str(m.trainedAt) : '',
        metrics: m.metrics && typeof m.metrics === 'object' ? m.metrics : null,
        flag: m.flag ? str(m.flag) : '',
        requires: arr(m.requires).map(str),
        endpoint: str(m.endpoint),
        fallbackFor: m.fallbackFor ? str(m.fallbackFor) : '',
      }));
      const byKey = new Map(models.map((m) => [m.key, m]));
      // Group by endpoint: that is what actually decides which model answers.
      const chains = [];
      for (const m of models) {
        let chain = chains.find((c) => c.endpoint === m.endpoint);
        if (!chain) {
          chain = { endpoint: m.endpoint, task: m.task, target: m.target, members: [] };
          chains.push(chain);
        }
        chain.members.push(m);
      }
      for (const c of chains) {
        // Disabled candidates first (they are tried first when flagged on),
        // the serving model last — that is the order a request travels.
        c.members.sort((a, b) => (a.status === 'serving' ? 1 : 0) - (b.status === 'serving' ? 1 : 0));
        c.serving = c.members.find((m) => m.status === 'serving') || null;
      }
      const tasks = [];
      for (const m of models) if (!tasks.includes(m.task)) tasks.push(m.task);
      return {
        models,
        chains,
        tasks,
        byKey,
        total: models.length,
        serving: models.filter((m) => m.status === 'serving').length,
        disabled: models.filter((m) => m.status !== 'serving').length,
      };
    }),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

/**
 * Per-table completeness from /healthz. Incomplete tables sort first so a
 * partially loaded table is the first thing a judge reads, not a footnote.
 */
export function useProvenance() {
  return useQuery({
    queryKey: ['about-healthz'],
    queryFn: ({ signal }) => apiGet('/healthz', {}, { signal }).then((r) => {
      const d = r.data || {};
      const ds = d.datastore || {};
      const comp = ds.completeness || {};
      const tables = Object.entries(comp.tables || {}).map(([name, v]) => ({
        name,
        expected: num(v?.expected, 0) || 0,
        actual: v?.actual === null || v?.actual === undefined ? null : num(v.actual, 0),
        pct: v?.pct === null || v?.pct === undefined ? null : num(v.pct, null),
      }));
      tables.sort((a, b) => {
        const ap = a.pct === null ? -1 : a.pct;
        const bp = b.pct === null ? -1 : b.pct;
        if (ap !== bp) return ap - bp;
        return b.expected - a.expected;
      });
      const incomplete = tables.filter((t) => t.pct !== null && t.pct < 100);
      // A null `actual` means the count query for that table did not return on
      // this probe — NOT that the table is empty. Rolling it in as zero would
      // report a catastrophic gap that does not exist, so unknown tables are
      // excluded from both sides of the summary and counted separately.
      const known = tables.filter((t) => t.actual !== null);
      return {
        status: str(d.status) || 'unknown',
        tables,
        incomplete,
        unknown: tables.filter((t) => t.actual === null),
        loadedRows: known.reduce((n, t) => n + (t.actual || 0), 0),
        expectedRows: known.reduce((n, t) => n + t.expected, 0),
        overallPct: comp.overallPct === null || comp.overallPct === undefined ? null : num(comp.overallPct, null),
        rowCounts: ds.rowCounts && typeof ds.rowCounts === 'object' ? ds.rowCounts : {},
        datastore: { ok: ds.ok !== false, mode: str(ds.mode) },
        cache: { ok: (d.cache || {}).ok !== false, backend: str((d.cache || {}).backend) },
        nosql: { ok: (d.nosql || {}).ok !== false, mode: str((d.nosql || {}).mode), note: str((d.nosql || {}).note) },
        flags: d.flags && typeof d.flags === 'object' ? d.flags : {},
        uptimeSec: num((r.meta || {}).uptimeSec, null),
      };
    }),
    staleTime: 30 * 1000,
    retry: 0,
  });
}

/** The six scored capability areas, as the backend itself declares them. */
export function useChallengeCoverage() {
  return useQuery({
    queryKey: ['about-meta-challenge'],
    queryFn: ({ signal }) => apiGet('/meta/challenge', {}, { signal }).then((r) => {
      const d = r.data || {};
      const capabilities = arr(d.capabilities).map((c) => ({
        id: num(c.id, 0),
        key: str(c.key),
        title: str(c.title),
        status: str(c.status),
        summary: str(c.summary),
        highlights: arr(c.highlights).map(str),
        endpoints: arr(c.endpoints).map(str),
        services: arr(c.services).map(str),
      }));
      const counts = d.counts || {};
      return {
        capabilities,
        byId: new Map(capabilities.map((c) => [c.id, c])),
        challenge: str(d.challenge),
        distinctEndpoints: num(counts.distinctEndpoints),
        copilotUtterances: num(counts.copilotUtterances),
        covered: num(counts.covered, capabilities.filter((c) => c.status === 'covered').length),
        total: num(counts.capabilities, capabilities.length),
      };
    }),
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });
}

/**
 * Full-text case search over the live 45,000-row CaseMaster.
 * `enabled` is caller-controlled so the panel only queries on an explicit
 * submit — no keystroke storm against the Data Store.
 *
 * `elapsedMs` is measured around the fetch in the browser, so it includes
 * network time: it is honest wall-clock, not a server-reported number.
 */
export function useCaseSearch({ q, scope = 'all', limit = 20, enabled = true }) {
  const term = str(q).trim();
  return useQuery({
    queryKey: ['about-search-cases', term, scope, limit],
    queryFn: async ({ signal }) => {
      const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const r = await apiGet('/search/cases', { q: term, scope, limit }, { signal });
      const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const d = r.data || {};
      const meta = r.meta || {};
      return {
        query: str(d.query) || term,
        scope: str(d.scope) || scope,
        results: arr(d.results).map((x) => ({
          type: str(x.type) === 'offender' ? 'offender' : 'case',
          id: str(x.id),
          caseMasterId: x.caseMasterId === undefined ? null : str(x.caseMasterId),
          personKey: x.personKey === undefined ? null : str(x.personKey),
          title: str(x.title),
          registeredDate: str(x.registeredDate),
          unitName: str(x.unitName),
          districtName: str(x.districtName),
          headName: str(x.headName),
          subHeadName: str(x.subHeadName),
          caseCount: num(x.caseCount),
          riskScore: num(x.riskScore),
          snippet: str(x.snippet),
        })),
        counts: {
          cases: num((d.counts || {}).cases, 0) || 0,
          offenders: num((d.counts || {}).offenders, 0) || 0,
        },
        matched: num(d.matched, 0) || 0,
        // meta.source is the authoritative "which backend answered" signal.
        source: str(meta.source || d.source),
        cached: Boolean(meta.cached),
        ttlSec: num(meta.ttlSec),
        limit,
        elapsedMs: Math.max(0, Math.round(ended - started)),
      };
    },
    enabled: Boolean(enabled && term),
    staleTime: 60 * 1000,
    retry: 0,
  });
}
