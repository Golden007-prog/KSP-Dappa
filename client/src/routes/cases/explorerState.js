// Case Explorer URL state — extends the shared filters (lib/filters.js) with
// the explorer-only params the /cases endpoint (or a client-side refinement)
// understands. Everything lives in the URL search params so a filtered view is
// a shareable link; page size / presets / column choices persist in localStorage.
//
// Server-side params (functions/dappa_api/lib/routes/cases.js caseWhere):
//   from, to, districtId, unitId, crimeHeadId, crimeSubHeadId, gravityId
// Client-side refinements (the API has no status/search filter):
//   status (lookup id → matched on statusName), q (full-text), anomaly ('1')
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Every explorer-managed key — shared trio + extended set (used by presets/clear). */
export const EXPLORER_KEYS = [
  'districtId', 'unitId', 'crimeHeadId', 'crimeSubHeadId', 'gravityId',
  'status', 'range', 'from', 'to', 'q', 'anomaly',
];

/** Keys the server actually filters on (safe to send as query params). */
export const SERVER_KEYS = ['districtId', 'unitId', 'crimeHeadId', 'crimeSubHeadId', 'gravityId', 'from', 'to'];

const PAGESIZE_STORAGE_KEY = 'dappa-cases-pagesize';
export const PAGE_SIZES = [25, 50, 100, 200];

export function readPageSize() {
  try {
    const v = Number(localStorage.getItem(PAGESIZE_STORAGE_KEY));
    if (PAGE_SIZES.includes(v)) return v;
  } catch { /* private mode */ }
  return 50;
}

export function persistPageSize(v) {
  try { localStorage.setItem(PAGESIZE_STORAGE_KEY, String(v)); } catch { /* private mode */ }
}

/** Generic guarded JSON localStorage read/write (presets, column chooser). */
export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

/**
 * useExplorerParams() → { unitId, crimeSubHeadId, gravityId, statusId, q,
 * anomalyOnly, setMany(patch), applyParams(obj), clearAll() }.
 * Complements useUrlFilters() (which owns districtId/crimeHeadId/range/from/to
 * reads); ALL writes go through setMany here so dependent clears are atomic:
 * changing district drops the station, changing head drops the subhead,
 * setting a range preset drops explicit from/to and vice versa.
 */
export function useExplorerParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const setMany = useCallback((patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        const empty = value === undefined || value === null || value === ''
          || (key === 'range' && value === 'all') || (key === 'anomaly' && !value);
        if (empty) next.delete(key); else next.set(key, String(value));
        if (key === 'range') { next.delete('from'); next.delete('to'); }
        if ((key === 'from' || key === 'to') && !empty) next.delete('range');
        if (key === 'districtId' && String(value ?? '') !== (prev.get('districtId') || '')) next.delete('unitId');
        if (key === 'crimeHeadId' && String(value ?? '') !== (prev.get('crimeHeadId') || '')) next.delete('crimeSubHeadId');
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  /** Replace the whole explorer filter state (presets): unset keys are cleared. */
  const applyParams = useCallback((params) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of EXPLORER_KEYS) {
        const v = params?.[key];
        if (v === undefined || v === null || v === '' || (key === 'range' && v === 'all')) next.delete(key);
        else next.set(key, String(v));
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const clearAll = useCallback(() => applyParams({}), [applyParams]);

  return {
    unitId: searchParams.get('unitId') || '',
    crimeSubHeadId: searchParams.get('crimeSubHeadId') || '',
    gravityId: searchParams.get('gravityId') || '',
    statusId: searchParams.get('status') || '',
    q: searchParams.get('q') || '',
    anomalyOnly: searchParams.get('anomaly') === '1',
    setMany,
    applyParams,
    clearAll,
  };
}

/** Snapshot of the current explorer params (for saving as a preset). */
export function snapshotParams(searchParams) {
  const out = {};
  for (const key of EXPLORER_KEYS) {
    const v = searchParams.get(key);
    if (v) out[key] = v;
  }
  return out;
}

/**
 * Row predicate for the client-side refinements. statusName is the resolved
 * lookup name for the selected status id ('' = no status filter — including
 * while lookups are still loading, when it can't be resolved yet).
 */
export function buildRefine({ q, statusName, anomalyOnly }) {
  const needle = String(q || '').trim().toLowerCase();
  return (r) => {
    if (anomalyOnly && !r.anomalyFlag) return false;
    if (statusName && String(r.statusName || '') !== statusName) return false;
    if (needle) {
      const hay = [r.crimeNo, r.caseNo, r.districtName, r.unitName, r.headName, r.subHeadName, r.statusName, r.gravityName]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      if (!hay.includes(needle)) return false;
    }
    return true;
  };
}

/** Stable numeric-aware comparator matching DataTable's local-sort semantics. */
export function compareRows(a, b, sort) {
  if (!sort) return 0;
  const mul = sort.dir === 'desc' ? -1 : 1;
  const av = a?.[sort.key];
  const bv = b?.[sort.key];
  if (av === bv) return 0;
  if (av === undefined || av === null || av === '') return 1;
  if (bv === undefined || bv === null || bv === '') return -1;
  const an = Number(av);
  const bn = Number(bv);
  if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mul;
  return String(av).localeCompare(String(bv)) * mul;
}
