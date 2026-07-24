// KSP DAPPA — API layer. Fetch wrapper + one react-query hook per endpoint.
// Envelope contract (docs/CONTRACTS.md): success {ok:true,data,meta} · error {ok:false,error:{code,message}}.
// Every hook's exact return shape is documented in client/CONTRACT.md — route
// fillers code against that file, not against guesses.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const API_BASE = import.meta.env.VITE_API_BASE || '/server/dappa_api/api/v1';

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

async function request(path, { method = 'GET', params, body, signal } = {}) {
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

export function useHealthz() {
  return query(['healthz'], ({ signal }) =>
    apiGet('/healthz', {}, { signal }).then((r) => r.data || {}),
  { retry: 0, staleTime: 30 * 1000 });
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
