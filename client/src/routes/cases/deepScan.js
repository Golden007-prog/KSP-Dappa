// Deep scan — the corpus behind every client-side refinement and analytic on
// the Case Explorer.
//
// GET /cases has no status/text/age filter and caps perPage at 200
// (functions/dappa_api/lib/routes/cases.js), so any refinement the server can't
// express has to run over rows we pulled ourselves. The explorer used to pull a
// single 200-row page, which silently truncated every refinement against a
// 45,000-row CaseMaster. This pages the endpoint instead: perPage=200, newest
// first, up to a user-chosen depth, with the abort signal threaded through so a
// filter change cancels the tail of the previous scan mid-flight.
//
// Never "just ask for everything": depth is bounded, the caller shows how many
// rows were actually read, and `truncated` stays honest so the UI can say the
// analysis covers the newest N of M rather than pretending it saw all of them.
import { useQuery } from '@tanstack/react-query';
import { apiGet, prune } from '../../lib/api.js';
import { caseAgeDays, readJson, writeJson } from './explorerState.js';

/** Server page size — the endpoint's hard ceiling. */
export const SCAN_PAGE = 200;

/** Selectable scan depths (rows). 200 = one page, i.e. the legacy behaviour. */
export const SCAN_DEPTHS = [200, 500, 1000, 2000];

const DEPTH_STORAGE_KEY = 'dappa-cases-scandepth';

/** Pages fetched concurrently after page 1 (which is needed for meta.total). */
const CONCURRENCY = 3;

export function readScanDepth() {
  const v = Number(readJson(DEPTH_STORAGE_KEY, 0));
  // 1000 by default: verified against the live registry, that reaches ~28 days
  // back at state level, which is the shortest window in which the 30-day
  // emerging-trend comparison and the pendency spread say anything.
  return SCAN_DEPTHS.includes(v) ? v : 1000;
}

export function persistScanDepth(v) {
  if (SCAN_DEPTHS.includes(Number(v))) writeJson(DEPTH_STORAGE_KEY, Number(v));
}

/**
 * Page GET /cases up to `depth` rows for the given server filters.
 * → { rows (ageDays attached), total, fetched, pages, truncated }
 * `enabled` gates the whole scan: the unrefined table stays on plain server
 * pagination and never triggers it.
 */
export function useDeepScan(params, depth = 200, enabled = true) {
  const cap = SCAN_DEPTHS.includes(Number(depth)) ? Number(depth) : 200;
  return useQuery({
    queryKey: ['cases-deepscan', prune(params || {}), cap],
    enabled: !!enabled,
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev) => prev,
    queryFn: async ({ signal }) => {
      const fetchPage = async (page) => {
        const r = await apiGet('/cases', { ...params, page, perPage: SCAN_PAGE }, { signal });
        return {
          rows: Array.isArray(r.data) ? r.data : (r.data?.rows || []),
          total: Number(r.meta?.total),
        };
      };
      // Page 1 first because meta.total is what tells us how many pages exist;
      // the rest go out concurrently so a 2,000-row scan is ~3 round trips
      // rather than ten sequential ones.
      const head = await fetchPage(1);
      const total = Number.isFinite(head.total) ? head.total : head.rows.length;
      const batches = [head.rows];
      const lastPage = Math.ceil(Math.min(cap, total) / SCAN_PAGE);
      let pages = 1;
      for (let p = 2; p <= lastPage; p += CONCURRENCY) {
        const group = [];
        for (let k = p; k < p + CONCURRENCY && k <= lastPage; k += 1) group.push(k);
        // eslint-disable-next-line no-await-in-loop
        const got = await Promise.all(group.map(fetchPage));
        pages += group.length;
        for (const g of got) batches.push(g.rows);
        if (got.some((g) => g.rows.length < SCAN_PAGE)) break;
      }
      // GET /cases orders by CrimeRegisteredDate only, which is not a total
      // order — rows sharing a date can land on two consecutive pages. Verified
      // live: 600 fetched rows carried 581 distinct CaseMasterIDs, 2,000 carried
      // 96 duplicates. Without this de-duplication every count, series and
      // station tally below would be inflated by several percent.
      const rows = [];
      const seen = new Set();
      let duplicates = 0;
      for (const batch of batches) {
        for (const row of batch) {
          const key = String(row.caseMasterId);
          if (seen.has(key)) { duplicates += 1; continue; }
          seen.add(key);
          rows.push(row);
        }
      }
      if (rows.length > cap) rows.length = cap;
      return {
        rows: rows.map((r) => ({ ...r, ageDays: caseAgeDays(r.registeredDate) })),
        total,
        fetched: rows.length,
        pages,
        duplicates,
        truncated: rows.length < total,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// shared row maths — used by the analytics panels so they all agree
// ---------------------------------------------------------------------------

/** ISO day (YYYY-MM-DD) of a row's registration, '' when unparseable. */
export const rowDay = (r) => {
  const s = String(r?.registeredDate || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};

/** Percentile of a numeric sample (p in 0..100), nearest-rank. */
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * CrimeNo anatomy → parts.
 * [1 category][4 districtId][4 unitId][4 year][5 serial] (docs/CONTRACTS.md).
 * Returns null for anything that is not exactly 18 digits.
 */
export function crimeNoParts(crimeNo) {
  const s = String(crimeNo || '').replace(/\D/g, '');
  if (s.length !== 18) return null;
  return {
    categoryId: s.slice(0, 1),
    districtId: s.slice(1, 5),
    unitId: s.slice(5, 9),
    year: s.slice(9, 13),
    serial: Number(s.slice(13)),
  };
}

/** Lookup ids drop the zero padding CrimeNo carries ('0118' → '118'). */
export const unpad = (v) => String(v ?? '').replace(/^0+(?=\d)/, '');
