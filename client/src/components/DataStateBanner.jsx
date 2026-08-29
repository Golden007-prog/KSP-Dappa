// "This environment has no records loaded" banner.
//
// Why this exists. /healthz has always published per-table completeness, but
// only /about ever read it — so an environment whose Data Store is empty still
// rendered a confident Command Dashboard reading "FIRS THIS MONTH 0 · ACTIVE
// ALERTS 0" with no hint that the zeros are a missing load rather than a
// finding. That is exactly the "confident empty chart" this project refuses
// elsewhere, and it is reachable in public: the Production environment answers
// at its own URL with 0 of 45,000 CaseMaster rows, because Catalyst migrates
// code and schema but not data.
//
// It is deliberately conservative. It renders ONLY when /healthz answers AND
// says the store is essentially empty. An unknown or failed probe renders
// nothing — absence of evidence is not evidence of emptiness — which also
// keeps it off screen when the browser is offline and OfflineBanner is already
// speaking. On the submitted deployment (100% across 13 tables) it never
// appears at all.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';

// Under this, the store is not "partially loaded", it is unloaded. A genuinely
// partial load stays /about's story, which names the table and the shortfall.
const EMPTY_PCT = 1;

export default function DataStateBanner() {
  const t = useT();
  // Its OWN key. This deliberately does NOT reuse ['about-healthz']: react-query
  // caches by key, so two hooks sharing a key with different queryFns do not
  // share a probe — they race, and whichever resolves first defines the cached
  // shape for both. Reusing it meant this banner's raw /healthz payload could
  // land in the slot /about's useProvenance expects to hold its normalized
  // {tables, incomplete, unknown, ...}, so ProvenancePanel read `unknown` and
  // HonestyLedger read `incomplete` off an object that had neither and the
  // whole About page died in its error boundary. One extra cheap probe is the
  // right price for not corrupting another component's cache entry.
  const { data } = useQuery({
    queryKey: ['shell-datastate-healthz'],
    queryFn: ({ signal }) => apiGet('/healthz', {}, { signal }).then((r) => r.data || {}),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    // A failed probe must not be read as "empty".
    throwOnError: false,
  });

  const ds = (data && data.datastore) || null;
  if (!ds || ds.ok === false) return null;
  const pct = ds.completeness ? ds.completeness.overallPct : null;
  if (pct === null || pct === undefined || Number(pct) > EMPTY_PCT) return null;

  return (
    <div
      role="status"
      className="no-print mb-4 rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-sm text-ink"
    >
      <p className="font-semibold">{t('shell.nodata.title')}</p>
      <p className="mt-1 text-muted">
        {t('shell.nodata.body')}{' '}
        <Link to="/about" className="underline hover:text-ink transition-colors">
          {t('shell.nodata.link')}
        </Link>
      </p>
    </div>
  );
}
