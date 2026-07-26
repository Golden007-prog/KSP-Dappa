// Victim + location entity loaders for the Network Explorer.
//
// The co-accusal graph the route already draws (23,833 NetworkEdge rows) knows
// WHICH FIRs bind two suspects but nothing about who was harmed or where. Those
// two facts live on the FIR itself, and the API exposes them one case at a time
// (GET /cases/:id → victims[], unitName, districtName, registeredDate). There is
// no bulk party endpoint, so this module fetches a BOUNDED, deterministic SAMPLE
// of the linked FIRs in the current view and every downstream panel states that
// sample size on its face. Nothing here pretends to be a census.
//
// Cache note: the per-case queryKey is ['case', id] — byte-identical to
// useCase() in lib/api.js, so a FIR already opened in the Case Explorer costs
// nothing here, and vice versa.
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiGet } from '../../lib/api.js';

// A case detail is ~620 ms against the live Catalyst deployment; the browser
// runs these concurrently, so 48 FIRs settle in a few seconds. Larger samples
// are the analyst's explicit choice, never a default.
export const SAMPLE_SIZES = [24, 48, 96, 160];
export const DEFAULT_SAMPLE = 48;

/**
 * Case ids of the visible edge set, ranked so the sample spends its budget
 * where the evidence is densest: FIRs shared by repeat-co-offending pairs
 * first, then FIRs touching the most distinct suspects, then id order for a
 * stable, reproducible sample (same view → same FIRs → same panels).
 * Returns {ids, total, suspectsByCase}.
 */
export function rankCaseIds(edges = [], size = DEFAULT_SAMPLE) {
  const byCase = new Map();
  for (const e of edges) {
    const s = String(e.source);
    const t = String(e.target);
    const w = Number(e.weight) || 1;
    for (const raw of e.caseIds || []) {
      const cid = String(raw);
      if (!cid) continue;
      let rec = byCase.get(cid);
      if (!rec) { rec = { caseId: cid, suspects: new Set(), topWeight: 0 }; byCase.set(cid, rec); }
      rec.suspects.add(s);
      rec.suspects.add(t);
      if (w > rec.topWeight) rec.topWeight = w;
    }
  }
  const ranked = [...byCase.values()].sort((a, b) =>
    b.topWeight - a.topWeight
    || b.suspects.size - a.suspects.size
    || String(a.caseId).localeCompare(String(b.caseId), undefined, { numeric: true }));
  return {
    ids: ranked.slice(0, Math.max(0, size)).map((r) => r.caseId),
    total: ranked.length,
    suspectsByCase: byCase,
  };
}

// Concurrency gate. Firing the whole sample at once is not merely impolite —
// measured against the live deployment, 48 simultaneous /cases/:id calls came
// back as 11 × 200 and 37 × 429, i.e. the sample silently lost three quarters
// of its evidence. The same 48 through a 5-wide gate return 47 × 200 and one
// genuine 404 in ~3 s. react-query has no cross-query concurrency control, so
// the gate lives here, in front of the fetch.
const MAX_INFLIGHT = 5;
let inflight = 0;
const waiting = [];

function pump() {
  while (inflight < MAX_INFLIGHT && waiting.length) {
    const job = waiting.shift();
    inflight += 1;
    job.run().then(job.resolve, job.reject).finally(() => { inflight -= 1; pump(); });
  }
}

/** Run `task` when a slot frees up; a query aborted while queued never runs. */
function gated(task, signal) {
  return new Promise((resolve, reject) => {
    waiting.push({
      run: () => {
        if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
        return task();
      },
      resolve,
      reject,
    });
    pump();
  });
}

/**
 * Fetch the sampled FIRs through the gate above. `enabled` is false until the
 * analyst asks for it — the route must never fire dozens of requests on mount.
 * Returns {cases, loaded, requested, failed, isFetching, progress}.
 */
export function useCaseEvidence(caseIds = [], { enabled = false } = {}) {
  const ids = useMemo(() => caseIds.map(String), [caseIds]);
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['case', id],
      queryFn: ({ signal }) => gated(
        () => apiGet(`/cases/${encodeURIComponent(id)}`, {}, { signal }).then((r) => r.data || {}),
        signal,
      ),
      enabled,
      // A 429 that slipped through the gate is worth one retry; a 404 (case ids
      // on NetworkEdge do drift out of CaseMaster) is not worth three.
      retry: (count, err) => count < 1 && err?.status !== 404,
      staleTime: 30 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
    })),
  });

  // useQueries returns a new array identity every render; hash on the settled
  // ids so downstream memos only recompute when data actually lands.
  const signature = results.map((r) => (r.data ? 'd' : r.isError ? 'e' : '.')).join('');

  return useMemo(() => {
    const cases = [];
    let failed = 0;
    let fetching = 0;
    for (const r of results) {
      if (r.data && r.data.caseMasterId !== undefined) cases.push(r.data);
      else if (r.isError) failed += 1;
      if (r.isFetching) fetching += 1;
    }
    return {
      cases,
      loaded: cases.length,
      requested: ids.length,
      failed,
      isFetching: fetching > 0,
      progress: ids.length ? (cases.length + failed) / ids.length : 1,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ids]);
}

// --- shared vocabulary -------------------------------------------------------

// The FIR schema stores GenderID 1/2; anything else is left unlabelled rather
// than guessed. Caste and religion columns exist in the ER schema and are
// deliberately never requested, mapped or displayed anywhere in this route.
export const GENDER_IDS = [1, 2];
export function genderKey(genderId) {
  const g = Number(genderId);
  return g === 1 ? 'male' : g === 2 ? 'female' : 'unknown';
}

export const AGE_BANDS = [
  { key: 'minor', test: (a) => a < 18 },
  { key: 'y18', test: (a) => a >= 18 && a <= 25 },
  { key: 'y26', test: (a) => a >= 26 && a <= 35 },
  { key: 'y36', test: (a) => a >= 36 && a <= 50 },
  { key: 'y51', test: (a) => a >= 51 && a <= 65 },
  { key: 'y66', test: (a) => a > 65 },
];

export function ageBand(age) {
  const a = Number(age);
  if (!Number.isFinite(a) || a <= 0) return null;
  return (AGE_BANDS.find((b) => b.test(a)) || {}).key || null;
}

/** Normalised victim-identity key: lowercased name + recorded gender. */
export function victimProfileKey(name, genderId) {
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n) return '';
  return `${n}|${genderKey(genderId)}`;
}
