// Full OffenderProfile corpus loader.
//
// The /offenders endpoint hard-caps perPage at 200 (verified against the live
// store: perPage=500 comes back as perPage=200), so whole-population analytics
// — crew scoring, MO vocabulary, peer cohorts — need the pages stitched
// together. 2,048 rows over 11 pages is a single cached round of small
// requests, cheap enough to do once and reuse across every panel.
//
// Pagination is ordered by RiskScore and ties are not broken deterministically,
// so page boundaries can repeat or drop a row (the live store returns 2,049
// rows for 2,044 distinct persons). Dedupe by personKey is mandatory, never
// cosmetic.
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api.js';

const PER_PAGE = 200;
const MAX_PAGES = 14; // 2,048 rows today; headroom without unbounded fetching

/** Fetch every offender profile page in parallel and dedupe by personKey. */
async function fetchCorpus({ signal }) {
  const first = await apiGet('/offenders', { perPage: PER_PAGE, page: 1, minCases: 1 }, { signal });
  const total = Number(first?.meta?.total) || (first?.data || []).length;
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PER_PAGE)));

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => apiGet(
      '/offenders',
      { perPage: PER_PAGE, page: i + 2, minCases: 1 },
      { signal },
    ).catch(() => ({ data: [] }))),
  );

  const byKey = new Map();
  for (const chunk of [first, ...rest]) {
    for (const r of chunk?.data || []) {
      const key = String(r?.personKey || '');
      if (!key || byKey.has(key)) continue;
      byKey.set(key, {
        personKey: key,
        canonicalName: r.canonicalName || key,
        aliases: Array.isArray(r.aliases) ? r.aliases : [],
        caseCount: Number(r.caseCount) || 0,
        districts: Array.isArray(r.districts) ? r.districts : [],
        moTags: Array.isArray(r.moTags) ? r.moTags : [],
        riskScore: Number.isFinite(Number(r.riskScore)) ? Number(r.riskScore) : null,
        communityId: r.communityId === undefined ? null : r.communityId,
      });
    }
  }
  return { rows: [...byKey.values()], total, pages };
}

/**
 * All identity-resolved offender profiles, cached for the whole session.
 * `enabled: false` keeps the eleven requests off the wire until a panel that
 * actually needs the full population is on screen.
 */
export function useOffenderCorpus({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['offender-corpus', PER_PAGE],
    queryFn: fetchCorpus,
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
