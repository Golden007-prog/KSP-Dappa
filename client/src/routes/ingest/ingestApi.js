// /ingest API layer. Own fetch wrapper because the ingest calls carry headers
// api.js's request() does not (X-Dappa-Tier, X-Admin-Token) and because the
// static demo (VITE_STATIC_DEMO=1) must degrade honestly: GETs come from the
// snapshot, validation runs in the browser (localValidate.js, a subset of the
// server's checks, labelled as such) and loads are refused with a note.
import { useQuery } from '@tanstack/react-query';
import { API_BASE, ApiError } from '../../lib/api.js';
import { demoKey } from '../../lib/demoKey.js';
import { validateLocally } from './localValidate.js';

const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';
const DEMO_BASE = `${import.meta.env.BASE_URL}demo/api/`;
export const SAMPLE_URL = `${import.meta.env.BASE_URL}ingest_demo/CaseMaster_sample.csv`;
const TOKEN_KEY = 'dappa-ingest-admin-token';

export function readAdminToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function saveAdminToken(v) {
  try { if (v) sessionStorage.setItem(TOKEN_KEY, v); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

/**
 * Read one static-demo snapshot. A missing key does NOT 404 on GitHub Pages —
 * the SPA fallback answers with index.html at status 200 — so the content type
 * is checked before parsing. Without that check a drifted key looks like an
 * empty answer instead of a failure, and the table picker silently empties.
 */
async function snapshot(key) {
  try {
    const res = await fetch(`${DEMO_BASE}${key}.json`);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!/\bjson\b/i.test(type)) return null;
    return await res.json();
  } catch { return null; }
}

async function call(path, { method = 'GET', body, headers = {}, signal } = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method, signal,
      headers: Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, headers),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError('NETWORK', 'Cannot reach the DAPPA API. Is the backend running?', 0);
  }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (json && json.ok === false) {
    const e = json.error || {};
    throw new ApiError(e.code || 'API_ERROR', e.message || 'The API reported an error.', res.status);
  }
  if (!res.ok) throw new ApiError(`HTTP_${res.status}`, `API request failed with status ${res.status}.`, res.status);
  return { data: json ? json.data : null, meta: (json && json.meta) || {} };
}

/** Tier + optional admin token headers for write calls. */
export function writeHeaders(tier, adminToken, actor) {
  const h = { 'X-Dappa-Tier': tier || 'district' };
  if (adminToken) h['X-Admin-Token'] = adminToken;
  if (actor) h['X-Dappa-Actor'] = actor;
  return h;
}

export async function fetchTables() {
  if (STATIC_DEMO) {
    const json = await snapshot(demoKey('GET', '/ingest/tables'));
    if (json && json.ok) return { data: json.data, meta: { ...(json.meta || {}), demoStatic: true } };
    throw new ApiError('DEMO_MISS', 'The static demo snapshot has no ER table registry — use the live Catalyst deployment.', 404);
  }
  return call('/ingest/tables');
}

export function useIngestTables() {
  return useQuery({ queryKey: ['ingest-tables'], queryFn: () => fetchTables().then((r) => r.data), staleTime: 60 * 60 * 1000 });
}

export function useIngestBatches(enabled = true) {
  return useQuery({
    queryKey: ['ingest-batches'],
    queryFn: () => (STATIC_DEMO ? Promise.resolve([]) : call('/ingest/batches').then((r) => r.data || [])),
    enabled, staleTime: 15 * 1000,
  });
}

/**
 * Validate in parts (≤ ~700 KB of JSON each) so a 5,000-row file fits the
 * function's body limit and shows progress. Returns the final result envelope.
 */
export async function validateInParts({ table, columns, parts, mapping, options, tableDef, onProgress, signal }) {
  if (STATIC_DEMO) {
    const rows = parts.flat();
    onProgress && onProgress({ part: 1, parts: 1, rows: rows.length });
    return validateLocally({ table, tableDef, columns, rows, mapping, options });
  }
  let batchId = null;
  let last = null;
  for (let i = 0; i < parts.length; i += 1) {
    const final = i === parts.length - 1;
    const body = { table, columns, rows: parts[i], mapping, options, part: { batchId, index: i + 1, final } };
    // eslint-disable-next-line no-await-in-loop
    last = await call('/ingest/validate', { method: 'POST', body, signal });
    batchId = last.data.batchId;
    onProgress && onProgress({ part: i + 1, parts: parts.length, rows: parts.slice(0, i + 1).reduce((s, p) => s + p.length, 0) });
  }
  return last;
}

/** Load in ≤ chunkLimit chunks per call, following resume tokens until done. */
export async function loadBatch({ batchId, headers, onProgress, signal, chunkLimit = 2 }) {
  if (STATIC_DEMO) {
    throw new ApiError('DEMO_STATIC', 'Static demo: loading needs the live Catalyst deployment — nothing is written here.', 403);
  }
  let body = { batchId, acceptOnlyValid: true, chunkLimit };
  let last = null;
  for (let guard = 0; guard < 100; guard += 1) {
    // eslint-disable-next-line no-await-in-loop
    last = await call('/ingest/load', { method: 'POST', body, headers, signal });
    onProgress && onProgress(last.data);
    if (last.data.done || !last.data.resumeToken) break;
    body = { resumeToken: last.data.resumeToken, acceptOnlyValid: true, chunkLimit };
  }
  return last;
}

export async function rollbackBatch({ batchId, headers }) {
  if (STATIC_DEMO) throw new ApiError('DEMO_STATIC', 'Static demo: nothing was loaded, so there is nothing to roll back.', 403);
  return call(`/ingest/batches/${encodeURIComponent(batchId)}/rollback`, { method: 'POST', body: {}, headers });
}

export async function fetchBatch(batchId) {
  if (STATIC_DEMO) throw new ApiError('DEMO_STATIC', 'Static demo has no batch store.', 404);
  return call(`/ingest/batches/${encodeURIComponent(batchId)}`);
}

export function rejectionsUrl(batchId) {
  return `${API_BASE}/ingest/batches/${encodeURIComponent(batchId)}/rejections.csv`;
}

export function templateUrl(table) {
  return `${API_BASE}/ingest/template/${encodeURIComponent(table)}.csv`;
}

export const isStaticDemo = STATIC_DEMO;
