// /alerts — whole-corpus loader.
//
// GET /alerts is paginated and the server caps perPage; the console previously
// asked for perPage=200 once and silently analysed the first page only. The
// live AnomalyAlert table is far bigger than one page, so every roll-up (z
// distribution, district × severity matrix, SLA ageing) was computed on a
// truncated slice. This hook walks the pages with LIMIT offset,count until
// meta.total is covered or a hard row cap is reached, and reports honestly how
// much it actually pulled.
//
// The query key is deliberately NOT ['alerts'] — the shape here is an object,
// not an array, and useAckAlertOptimistic patches both shapes by key.
import { useQuery } from '@tanstack/react-query';
import { apiGet, prune } from '../../lib/api.js';

/** Rows per request. The server caps perPage; 200 matches the previous ask. */
export const PAGE_SIZE = 200;
/** Hard ceiling so a runaway table can never lock the browser up mid-demo. */
export const CORPUS_CAP = 4000;

const asArray = (d) => (Array.isArray(d) ? d : (d && Array.isArray(d.rows) ? d.rows : []));

/**
 * Walk /alerts page by page.
 * Resolves to { rows, total, fetched, pages, capped, partial } where `total` is
 * the server's row count for the filter, `capped` means CORPUS_CAP stopped us
 * early, and `partial` means a page after the first failed (we keep what we
 * already have rather than blanking the console).
 */
async function fetchCorpus(params, signal) {
  const first = await apiGet('/alerts', { ...params, page: 1, perPage: PAGE_SIZE }, { signal });
  const rows = asArray(first.data);
  const total = Number(first.meta?.total);
  const known = Number.isFinite(total) && total > 0 ? total : rows.length;
  const wanted = Math.min(known, CORPUS_CAP);
  // Trust what the server actually returned, not what we asked for: perPage is
  // capped server-side, and assuming PAGE_SIZE would stop the walk after one
  // page if the cap were ever lowered.
  const size = rows.length || PAGE_SIZE;
  let pages = 1;
  let partial = false;

  while (rows.length < wanted && rows.length >= size * pages) {
    pages += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      const next = await apiGet('/alerts', { ...params, page: pages, perPage: PAGE_SIZE }, { signal });
      const batch = asArray(next.data);
      if (!batch.length) break;
      rows.push(...batch);
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      partial = true;
      break;
    }
  }

  return {
    rows: rows.slice(0, CORPUS_CAP),
    total: known,
    fetched: Math.min(rows.length, CORPUS_CAP),
    pages,
    capped: known > CORPUS_CAP,
    partial,
  };
}

/** The paged corpus for the active filters. */
export function useAlertsCorpus(params = {}) {
  const p = prune(params);
  return useQuery({
    queryKey: ['alerts-corpus', p],
    queryFn: ({ signal }) => fetchCorpus(p, signal),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
  });
}

/**
 * GET /alerts/summary — server-side roll-up over the WHOLE table (status split,
 * severity split, busiest districts, newest CreatedAt). Independent of what the
 * client managed to page in, so the console can state corpus truth even while
 * the pages are still arriving.
 */
export function useAlertsSummary() {
  return useQuery({
    queryKey: ['alerts-summary'],
    queryFn: ({ signal }) => apiGet('/alerts/summary', {}, { signal }).then((r) => r.data || {}),
    staleTime: 2 * 60 * 1000,
    retry: 0,
  });
}
