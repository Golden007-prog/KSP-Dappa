// KSP DAPPA — API layer. Fetch wrapper + one react-query hook per endpoint.
// Envelope contract (docs/CONTRACTS.md): success {ok:true,data,meta} · error {ok:false,error:{code,message}}.
// Every hook's exact return shape is documented in client/CONTRACT.md — route
// fillers code against that file, not against guesses.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { demoKey, demoFallbackKey, demoPostKeyBody, normalizeUtterance } from './demoKey.js';

// Static demo (GitHub Pages): built with VITE_STATIC_DEMO=1 every request is
// answered from pre-generated JSON under BASE_URL/demo/api/ (written by
// scripts/demo_snapshot.mjs against the same fixture dataset the live
// PUBLIC_DEMO fallback serves). The check is a build-time constant, so
// Catalyst builds compile this whole branch away — zero behavior change.
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';
const DEMO_BASE = `${import.meta.env.BASE_URL}demo/api/`;
// Raw (non-envelope) API assets: the gallery / candidate thumbnails are plain
// <img src={`${API_BASE}${thumbUrl}`}> requests that never pass through
// request(). demo_snapshot.mjs mirrors them under client/public/demo/raw/ with
// the identical path suffix, so pointing API_BASE there keeps them alive on
// Pages instead of 404-ing to an absolute /server/... path that does not exist.
const DEMO_RAW_BASE = `${import.meta.env.BASE_URL}demo/raw`;

export const API_BASE = import.meta.env.VITE_API_BASE
  || (STATIC_DEMO ? DEMO_RAW_BASE : '/server/dappa_api/api/v1');

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Drop null/undefined/'' params and sort keys so query-keys hash stably. */
export function prune(params = {}) {
  const out = {};
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

function buildQuery(params) {
  const p = prune(params);
  const keys = Object.keys(p);
  if (!keys.length) return '';
  const qs = new URLSearchParams();
  for (const k of keys) qs.set(k, String(p[k]));
  return `?${qs.toString()}`;
}

// ---------------------------------------------------------------------------
// static-demo request handlers (dead code unless VITE_STATIC_DEMO=1)
// ---------------------------------------------------------------------------

// GET misses fall back by stripping filter params in this order — a snapshot
// exists for every terminal combination, so an un-snapshotted filter mix
// degrades to broader data instead of erroring (e.g. an arbitrary date range
// falls back to the endpoint's full window for the same district).
const DEMO_STRIP_ORDER = [
  ['from', 'to'], ['crimeSubHeadId'], ['gravityId'], ['crimeHeadId'], ['status'],
  ['bbox'], ['communityId'], ['personKey', 'depth'], ['unitId'], ['district'],
  ['districtId'], ['repeatOnly'],
];

async function fetchSnapshot(key, signal) {
  let res;
  try {
    res = await fetch(`${DEMO_BASE}${key}.json`, { signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    return null;
  }
  if (!res.ok) return null;
  // A missing key does not necessarily 404: a host that serves the SPA
  // fallback answers 200 with index.html. Reject anything that is not JSON
  // before parsing so a key drift surfaces as a miss, not as a silent null.
  const type = res.headers.get('content-type') || '';
  if (!/\bjson\b/i.test(type)) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function unwrapSnapshot(json) {
  if (json && json.ok === false) {
    const e = json.error || {};
    throw new ApiError(e.code || 'API_ERROR', e.message || 'The API reported an error.', 400);
  }
  if (json && json.ok === true) return { data: json.data, meta: { ...(json.meta || {}), demoStatic: true } };
  return { data: json, meta: { demoStatic: true } };
}

async function demoGet(path, params, signal) {
  const candidates = [prune(params || {})];
  for (const keys of DEMO_STRIP_ORDER) {
    const next = { ...candidates[candidates.length - 1] };
    let changed = false;
    for (const k of keys) if (k in next) { delete next[k]; changed = true; }
    if (changed) candidates.push(next);
  }
  const tried = new Set();
  for (const cand of candidates) {
    const key = demoKey('GET', path, cand);
    if (tried.has(key)) continue;
    tried.add(key);
    const json = await fetchSnapshot(key, signal);
    if (json) return unwrapSnapshot(json);
  }
  // Name the request that had no snapshot: the keys are hashes, so a 404 in the
  // network panel cannot be traced back to an endpoint without this line. It is
  // the only way to spot a generator gap while driving the built demo.
  // eslint-disable-next-line no-console
  console.warn('[demo] no snapshot for GET', path, JSON.stringify(prune(params || {})));
  throw new ApiError('DEMO_MISS', 'This view is not part of the static demo snapshot — reset the filters, or use the live Catalyst deployment.', 404);
}

async function demoPost(path, body, signal) {
  if (path === '/copilot/query') {
    const utterance = normalizeUtterance((body && (body.q || body.query)) || '');
    if (utterance) {
      const json = await fetchSnapshot(demoKey('POST', path, {}, { q: utterance }), signal);
      if (json) return unwrapSnapshot(json);
    }
    return {
      data: {
        answer: 'This static demo answers a curated set of questions — try one of the suggested chips, e.g. "top 5 districts for vehicle theft this year" or "chain snatching in Mysuru City last 3 months". The live Catalyst deployment answers free-form questions.',
        engine: 'demo-static',
      },
      meta: { source: 'demo-static', demoStatic: true },
    };
  }
  // A face search on an image the snapshot never saw cannot be answered: the
  // matcher runs inside the Catalyst function and it scores the PIXELS
  // (D-phase6-16 — no probeSeed shortcut). Only the built-in sample captures
  // name their stand-in, and the generator draws a probe to that stand-in's own
  // measured parameters (scripts/demo_snapshot.mjs buildSampleProbe), so only
  // those replay; anything else is refused rather than answered with another
  // person's candidate list.
  if (path === '/identify' && !(body && body.samplePerson)) {
    throw new ApiError('DEMO_STATIC', 'Static demo: the face matcher runs in the Catalyst function and scores the pixels you upload, so only the built-in "Sample capture" probes have a pre-computed answer here. Use the live deployment to search your own image.', 403);
  }
  const exact = await fetchSnapshot(demoKey('POST', path, {}, demoPostKeyBody(path, body || {})), signal);
  if (exact) return unwrapSnapshot(exact);
  // Writes that record an accountability decision must never look like they
  // were recorded: there is nothing to write to in a static bundle.
  if (/^\/alerts\/[^/]+\/actions$/.test(path)) {
    throw new ApiError('FEATURE_DISABLED', 'Static demo: decisions need the live Catalyst deployment — nothing is recorded here.', 403);
  }
  if (/^\/identify\/audit\/[^/]+\/decision$/.test(path)) {
    throw new ApiError('FEATURE_DISABLED', 'Static demo: a confirm / reject is written to the Catalyst audit table — nothing is recorded here.', 403);
  }
  const fallback = await fetchSnapshot(demoFallbackKey('POST', path), signal);
  if (fallback) {
    const r = unwrapSnapshot(fallback);
    // Representative response: these exact inputs were outside the snapshot sweep.
    r.meta.approximate = true;
    return r;
  }
  if (path === '/notify/test-digest') {
    throw new ApiError('FEATURE_DISABLED', 'Static demo: the e-mail digest needs the live Catalyst deployment (Catalyst Mail flag).', 403);
  }
  if (path === '/ai/narrative') {
    throw new ApiError('DEMO_MISS', 'This case is outside the static demo snapshot.', 404);
  }
  if (path === '/identify') {
    throw new ApiError('DEMO_MISS', 'Static demo: this filter combination was not pre-computed. Search a single filter (district, risk band, age band, gender or MO tag) with the shortlist limit left at 25.', 404);
  }
  if (path === '/zia/ocr' || path === '/zia/moderate') {
    throw new ApiError('DEMO_STATIC', 'Static demo: only the three bundled sample scans are pre-computed — the live Catalyst deployment reads your own upload or pasted text.', 403);
  }
  const ack = path.match(/^\/alerts\/([^/]+)\/ack$/);
  if (ack) {
    // Simulated write — nothing persists in the static demo, so the alert
    // reappears as OPEN after the invalidated queries refetch the snapshot.
    return { data: { alertId: decodeURIComponent(ack[1]), status: 'ACK', demoStatic: true }, meta: { source: 'demo-static', demoStatic: true } };
  }
  // eslint-disable-next-line no-console
  console.warn('[demo] no snapshot for write', path, 'body keys', Object.keys(body || {}).join(','));
  return { data: { ok: true, demoStatic: true }, meta: { source: 'demo-static', demoStatic: true } };
}

async function request(path, { method = 'GET', params, body, signal } = {}) {
  if (STATIC_DEMO) {
    return method === 'GET' ? demoGet(path, params, signal) : demoPost(path, body, signal);
  }
  const url = API_BASE + path + buildQuery(params);
  let res;
  try {
    res = await fetch(url, {
      method,
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError('NETWORK', 'Cannot reach the DAPPA API. Is the backend running?', 0);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body — fall through to status handling */
  }
  if (json && json.ok === false) {
    const e = json.error || {};
    throw new ApiError(e.code || 'API_ERROR', e.message || 'The API reported an error.', res.status);
  }
  if (!res.ok) {
    throw new ApiError(`HTTP_${res.status}`, `API request failed with status ${res.status}.`, res.status);
  }
  if (json && json.ok === true) return { data: json.data, meta: json.meta || {} };
  // Defensive: a server that skips the envelope still works.
  return { data: json, meta: {} };
}

export const apiGet = (path, params, opts = {}) => request(path, { ...opts, params });
export const apiPost = (path, body, opts = {}) => request(path, { ...opts, method: 'POST', body });

// ---------------------------------------------------------------------------
// shape helpers (defensive — never throw on odd payloads)
// ---------------------------------------------------------------------------

const asArray = (d) => {
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.rows)) return d.rows;
  if (d && Array.isArray(d.items)) return d.items;
  return [];
};
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v) => (v === undefined || v === null ? '' : String(v));

function listSelect(res, params = {}) {
  const rows = asArray(res.data);
  const meta = res.meta || {};
  return {
    rows,
    total: meta.total !== undefined ? num(meta.total) : rows.length,
    page: meta.page !== undefined ? num(meta.page) : num(params.page, 1),
    perPage: meta.perPage !== undefined ? num(meta.perPage) : num(params.perPage, 50),
    meta,
  };
}

// --- normalizers for endpoints whose shape is NOT pinned in CONTRACTS.md ---
// The hook guarantees the normalized output shape regardless of reasonable
// server-side variants (array-of-rows vs prebuilt series).

const lookupItem = (r, idKeys, nameKeys) => {
  const id = idKeys.map((k) => r[k]).find((v) => v !== undefined && v !== null);
  const name = nameKeys.map((k) => r[k]).find((v) => v !== undefined && v !== null);
  return { id: str(id), name: str(name || id) };
};

export function normalizeLookups(data) {
  const d = data || {};
  const districts = asArray(d.districts).map((r) => ({
    ...lookupItem(r, ['districtId', 'DistrictID', 'id'], ['districtName', 'DistrictName', 'name']),
  })).map((x) => ({ districtId: x.id, districtName: x.name }));
  const units = asArray(d.units).map((r) => ({
    unitId: str(r.unitId ?? r.UnitID ?? r.id),
    unitName: str(r.unitName ?? r.UnitName ?? r.name),
    districtId: str(r.districtId ?? r.DistrictID ?? ''),
    unitTypeId: r.unitTypeId ?? r.UnitTypeID ?? null,
  }));
  const crimeHeads = asArray(d.crimeHeads ?? d.heads).map((r) => ({
    ...lookupItem(r, ['crimeHeadId', 'CrimeHeadID', 'id'], ['headName', 'CrimeHeadName', 'name']),
  })).map((x) => ({ crimeHeadId: x.id, headName: x.name }));
  const crimeSubHeads = asArray(d.crimeSubHeads ?? d.subHeads ?? d.subheads).map((r) => ({
    crimeSubHeadId: str(r.crimeSubHeadId ?? r.CrimeSubHeadID ?? r.id),
    subHeadName: str(r.subHeadName ?? r.CrimeSubHeadName ?? r.name),
    crimeHeadId: str(r.crimeHeadId ?? r.CrimeHeadID ?? ''),
  }));
  const simple = (key, idKeys, nameKeys) =>
    asArray(d[key]).map((r) => lookupItem(r, idKeys, nameKeys));
  return {
    districts,
    units,
    crimeHeads,
    crimeSubHeads,
    categories: simple('categories', ['caseCategoryId', 'CaseCategoryID', 'id'], ['categoryName', 'CategoryName', 'name']),
    statuses: simple('statuses', ['caseStatusId', 'CaseStatusID', 'id'], ['statusName', 'StatusName', 'name']),
    gravities: simple('gravities', ['gravityId', 'GravityID', 'id'], ['gravityName', 'GravityName', 'name']),
  };
}

export function normalizeMonthlyTrends(data) {
  if (!data) return { months: [], series: [] };
  if (!Array.isArray(data) && Array.isArray(data.months) && Array.isArray(data.series)) {
    return {
      months: data.months.map(str),
      series: data.series.map((s) => ({ name: str(s.name), data: (s.data || []).map((v) => num(v)) })),
    };
  }
  const rows = asArray(data);
  const months = [...new Set(rows.map((r) => str(r.ym ?? r.Ym ?? r.month)))].filter(Boolean).sort();
  const byName = new Map();
  for (const r of rows) {
    const ym = str(r.ym ?? r.Ym ?? r.month);
    if (!ym) continue;
    const name = str(r.headName ?? r.name ?? r.crimeHead ?? (r.crimeHeadId != null ? `Head ${r.crimeHeadId}` : 'Total'));
    const count = num(r.count ?? r.caseCount ?? r.total ?? r.value);
    if (!byName.has(name)) byName.set(name, new Map());
    const m = byName.get(name);
    m.set(ym, (m.get(ym) || 0) + count);
  }
  const series = [...byName.entries()].map(([name, m]) => ({
    name,
    data: months.map((ym) => m.get(ym) || 0),
  }));
  return { months, series };
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function normalizeSeasonality(data) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const empty = { days: DAY_LABELS, hours, matrix: DAY_LABELS.map(() => hours.map(() => 0)), max: 0 };
  if (!data) return empty;
  let matrix = null;
  let days = DAY_LABELS;
  if (Array.isArray(data.matrix)) {
    matrix = data.matrix.map((row) => hours.map((h) => num(row?.[h])));
    if (Array.isArray(data.days) && data.days.length === data.matrix.length) days = data.days.map(str);
  } else {
    const rows = asArray(data.cells ?? data);
    if (rows.length) {
      matrix = DAY_LABELS.map(() => hours.map(() => 0));
      for (const r of rows) {
        const d = num(r.weekday ?? r.day ?? r.dow, -1);
        const h = num(r.hour ?? r.hr, -1);
        if (d >= 0 && d < 7 && h >= 0 && h < 24) matrix[d][h] += num(r.count ?? r.value ?? r.total);
      }
    }
  }
  if (!matrix) return empty;
  const max = Math.max(0, ...matrix.flat());
  return { days, hours, matrix, max };
}

export function normalizeCategoryShare(data) {
  const rows = asArray(data?.shares ?? data);
  const items = rows.map((r) => ({
    id: str(r.crimeHeadId ?? r.crimeSubHeadId ?? r.id ?? r.name),
    name: str(r.headName ?? r.subHeadName ?? r.name ?? r.category),
    count: num(r.count ?? r.caseCount ?? r.total ?? r.value),
    sharePct: r.sharePct !== undefined ? num(r.sharePct) : r.share !== undefined ? num(r.share) : null,
    deltaPct: r.deltaPct !== undefined ? num(r.deltaPct) : r.momDeltaPct !== undefined ? num(r.momDeltaPct) : null,
  })).filter((r) => r.name);
  const totalCount = items.reduce((a, r) => a + r.count, 0);
  for (const it of items) {
    if (it.sharePct === null && totalCount > 0) it.sharePct = (it.count / totalCount) * 100;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Query hooks — one per endpoint (see CONTRACT.md for return shapes)
// ---------------------------------------------------------------------------

const query = (key, fn, options = {}) =>
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useQuery({ queryKey: key, queryFn: fn, ...options });

export function useKpis(params = {}) {
  return query(['kpis', prune(params)], ({ signal }) =>
    apiGet('/summary/kpis', params, { signal }).then((r) => r.data || {}));
}

export function useDistrictsGeo(params = {}) {
  return query(['geo-districts', prune(params)], ({ signal }) =>
    apiGet('/geo/districts', params, { signal }).then((r) => asArray(r.data)));
}

export function useStations(params = {}) {
  const p = { perPage: 200, ...params };
  return query(['geo-stations', prune(p)], ({ signal }) =>
    apiGet('/geo/stations', p, { signal }).then((r) => asArray(r.data)));
}

export function useIncidents(params = {}) {
  const p = { limit: 2000, ...params };
  return query(['geo-incidents', prune(p)], ({ signal }) =>
    apiGet('/geo/incidents', p, { signal }).then((r) => asArray(r.data)));
}

export function useHotspots(params = {}) {
  return query(['geo-hotspots', prune(params)], ({ signal }) =>
    apiGet('/geo/hotspots', params, { signal }).then((r) => asArray(r.data)));
}

export function useAlerts(params = {}) {
  const p = { perPage: 200, ...params };
  return query(['alerts', prune(p)], ({ signal }) =>
    apiGet('/alerts', p, { signal }).then((r) => asArray(r.data)));
}

export function useAckAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId) => apiPost(`/alerts/${encodeURIComponent(alertId)}/ack`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['kpis'] });
    },
  });
}

export function useNetworkGraph(params = {}) {
  return query(['network-graph', prune(params)], ({ signal }) =>
    apiGet('/network/graph', params, { signal }).then((r) => ({
      nodes: asArray(r.data?.nodes),
      edges: asArray(r.data?.edges),
    })));
}

export function useOffenders(params = {}) {
  return query(['offenders', prune(params)], ({ signal }) =>
    apiGet('/offenders', params, { signal }).then((r) => listSelect(r, params)));
}

export function useOffender(personKey) {
  return query(['offender', str(personKey)], ({ signal }) =>
    apiGet(`/offenders/${encodeURIComponent(personKey)}`, {}, { signal }).then((r) => r.data || {}),
  { enabled: !!personKey });
}

export function useForecast(params = {}) {
  return query(['forecast', prune(params)], ({ signal }) =>
    apiGet('/forecast', params, { signal }).then((r) => ({
      history: asArray(r.data?.history),
      forecast: asArray(r.data?.forecast),
      model: r.data?.model || '',
      mape: r.data?.mape ?? null,
    })));
}

export function useStationRisk(params = {}) {
  const p = { horizon: 30, ...params };
  return query(['risk-stations', prune(p)], ({ signal }) =>
    apiGet('/risk/stations', p, { signal }).then((r) => asArray(r.data)));
}

export function useCases(params = {}) {
  const p = { page: 1, perPage: 50, ...params };
  return query(['cases', prune(p)], ({ signal }) =>
    apiGet('/cases', p, { signal }).then((r) => listSelect(r, p)),
  { placeholderData: (prev) => prev });
}

export function useCase(id) {
  return query(['case', str(id)], ({ signal }) =>
    apiGet(`/cases/${encodeURIComponent(id)}`, {}, { signal }).then((r) => r.data || {}),
  { enabled: !!id });
}

export function useLookups() {
  return query(['lookups'], ({ signal }) =>
    apiGet('/meta/lookups', {}, { signal }).then((r) => normalizeLookups(r.data)),
  { staleTime: 60 * 60 * 1000, gcTime: 2 * 60 * 60 * 1000 });
}

export function useTrendsMonthly(params = {}) {
  return query(['trends-monthly', prune(params)], ({ signal }) =>
    apiGet('/trends/monthly', params, { signal }).then((r) => normalizeMonthlyTrends(r.data)));
}

export function useSeasonality(params = {}) {
  return query(['trends-seasonality', prune(params)], ({ signal }) =>
    apiGet('/trends/seasonality', params, { signal }).then((r) => normalizeSeasonality(r.data)));
}

export function useCategoryShare(params = {}) {
  return query(['trends-category-share', prune(params)], ({ signal }) =>
    apiGet('/trends/category-share', params, { signal }).then((r) => normalizeCategoryShare(r.data)));
}

// --- mutations (all resolve to {data, meta} so meta.source badges work) ----

export function useCopilotQuery() {
  return useMutation({
    // Send the utterance under both keys — the request body key is not pinned
    // in CONTRACTS, so we stay compatible with either server reading.
    mutationFn: (queryText) => apiPost('/copilot/query', { query: queryText, q: queryText }),
  });
}

export function usePredictOutcome() {
  return useMutation({
    mutationFn: (features) => apiPost('/predict/outcome', features || {}),
  });
}

export function useNarrative() {
  return useMutation({
    mutationFn: ({ caseId }) => apiPost('/ai/narrative', { caseId }),
  });
}

export function useWeeklyBrief() {
  return useMutation({
    mutationFn: (body = {}) => apiPost('/reports/weekly-brief', body),
  });
}

// --- static client asset -----------------------------------------------------

export function useKarnatakaGeoJson() {
  return query(['karnataka-geojson'], async ({ signal }) => {
    const res = await fetch(`${import.meta.env.BASE_URL}data/karnataka_districts.geojson`, { signal });
    if (!res.ok) throw new ApiError('GEOJSON', 'Failed to load Karnataka district GeoJSON.', res.status);
    return res.json();
  }, { staleTime: Infinity, gcTime: Infinity });
}
