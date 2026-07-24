// Similar cases — same crime subhead in the same district (falls back to the
// crime head when the subhead can't be resolved from lookups). The district id
// comes from the CrimeNo's 4-digit district segment; the subhead id is resolved
// name → id via /meta/lookups because the detail payload carries names only.
// Clicking a row navigates with the similar set as prev/next siblings.
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCases, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { dateLabel } from '../../lib/format.js';
import { CrimeNoInline, splitCrimeNo } from './CrimeNoBreakdown.jsx';

const MAX_ROWS = 6;

function SimilarList({ params, matchLabel, currentId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const cases = useCases({ ...params, page: 1, perPage: 12 });

  const rows = useMemo(
    () => (cases.data?.rows || [])
      .filter((r) => String(r.caseMasterId) !== String(currentId))
      .slice(0, MAX_ROWS),
    [cases.data, currentId],
  );

  if (cases.isLoading) return <LoadingSkeleton lines={4} />;
  if (cases.error) {
    return <EmptyState compact title="Couldn't load similar cases" message={cases.error.message} />;
  }
  if (!rows.length) {
    return <EmptyState compact title="No similar cases" message={`No other case shares ${matchLabel}.`} />;
  }

  const siblings = rows.map((r) => String(r.caseMasterId));
  const open = (r) => navigate(
    { pathname: `/cases/${r.caseMasterId}`, search: location.search },
    { state: { siblings } },
  );

  return (
    <ul className="divide-y divide-grid/40">
      {rows.map((r) => (
        <li key={r.caseMasterId}>
          <button
            type="button"
            onClick={() => open(r)}
            className="flex w-full items-center gap-3 px-1 py-2.5 min-h-[48px] text-left rounded-lg hover:bg-grid/25 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate"><CrimeNoInline crimeNo={r.crimeNo} /></p>
              <p className="text-[11px] text-muted num mt-0.5 truncate">
                {dateLabel(r.registeredDate)} · {r.unitName || r.districtName || '—'}
              </p>
            </div>
            {r.anomalyFlag ? <Badge tone="red" pulse>anomaly</Badge> : null}
            {r.statusName && <Badge tone="slate">{r.statusName}</Badge>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function SimilarCases({ caseData }) {
  const d = caseData || {};
  const lookups = useLookups();
  const lk = lookups.data;

  const parts = splitCrimeNo(d.crimeNo);
  const districtId = parts ? parts[1].text : '';
  const sub = d.subHeadName ? (lk?.crimeSubHeads || []).find((s) => s.subHeadName === d.subHeadName) : null;
  const head = d.headName ? (lk?.crimeHeads || []).find((h) => h.headName === d.headName) : null;

  const params = sub
    ? { crimeSubHeadId: sub.crimeSubHeadId }
    : head ? { crimeHeadId: head.crimeHeadId } : null;
  const matchLabel = sub
    ? `subhead “${d.subHeadName}” in ${d.districtName || 'this district'}`
    : head ? `head “${d.headName}” in ${d.districtName || 'this district'}` : '';

  return (
    <Card
      title="Similar cases"
      subtitle={matchLabel ? `Same ${sub ? 'subhead' : 'crime head'} · same district · newest first` : 'Pattern context for this FIR'}
      className="no-print"
      actions={
        <span className="flex items-center gap-1.5">
          {sub ? <Badge tone="teal">subhead match</Badge> : head ? <Badge tone="slate">head match</Badge> : null}
        </span>
      }
    >
      {lookups.isLoading ? (
        <LoadingSkeleton lines={4} />
      ) : !params || !districtId ? (
        <EmptyState
          compact
          title="Not enough attributes"
          message="This case's crime head/subhead could not be matched against the lookup tables."
        />
      ) : (
        <SimilarList params={{ ...params, districtId }} matchLabel={matchLabel} currentId={d.caseMasterId} />
      )}
    </Card>
  );
}
