// Similar cases. v2: when the detail page passes the `similar` hook result
// (useSimilarCases → GET /cases/:id/similar), rows carry a 0–100 similarity
// score (hour band · station/district · geo proximity) rendered as a bar, plus
// whyMatched reason chips; the engine badge says whether the server pattern
// engine or the client fallback produced the list. Without the prop the
// original client-side heuristic (same subhead/head + district via /cases)
// still runs — backwards compatible. Clicking a row navigates with the
// similar set as prev/next siblings.
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCases, useLookups } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { CrimeNoInline, splitCrimeNo } from './CrimeNoBreakdown.jsx';

const MAX_ROWS = 6;

function RowButton({ r, onOpen }) {
  const hasScore = Number.isFinite(Number(r.similarity));
  const score = hasScore ? Math.max(0, Math.min(100, Number(r.similarity))) : 0;
  const why = Array.isArray(r.whyMatched) ? r.whyMatched.filter(Boolean) : [];
  return (
    <button
      type="button"
      onClick={() => onOpen(r)}
      className="flex w-full items-center gap-3 px-1 py-2.5 min-h-[48px] text-left rounded-lg hover:bg-grid/25 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate"><CrimeNoInline crimeNo={r.crimeNo} /></p>
        <p className="text-[11px] text-muted num mt-0.5 truncate">
          {dateLabel(r.registeredDate)} · {r.unitName || r.districtName || '—'}
        </p>
        {why.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {why.slice(0, 4).map((w, i) => (
              <span key={`${w}-${i}`} className="chip !py-0.5 !px-1.5 !text-[10px]">{w}</span>
            ))}
          </span>
        )}
      </div>
      {hasScore && (
        <span className="shrink-0 flex flex-col items-end gap-1" aria-label={`Similarity ${score} percent`}>
          <span className="num text-xs text-ink font-medium">{fmtInt(score)}%</span>
          <span className="block h-1.5 w-14 rounded-full bg-grid overflow-hidden" aria-hidden="true">
            <span
              className={`block h-full ${score >= 60 ? 'bg-amber' : 'bg-teal/70'}`}
              style={{ width: `${score}%` }}
            />
          </span>
        </span>
      )}
      {r.anomalyFlag ? <Badge tone="red" pulse>anomaly</Badge> : null}
      {r.statusName && !why.length && <Badge tone="slate">{r.statusName}</Badge>}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

function RowList({ rows, onOpen }) {
  return (
    <ul className="divide-y divide-grid/40">
      {rows.map((r) => (
        <li key={r.caseMasterId}><RowButton r={r} onOpen={onOpen} /></li>
      ))}
    </ul>
  );
}

/** Pattern-engine variant — renders the useSimilarCases hook result. */
function SimilarFromEngine({ caseData, similar }) {
  const navigate = useNavigate();
  const location = useLocation();
  const d = caseData || {};
  const rows = (similar.data?.rows || []).slice(0, MAX_ROWS);
  const engine = similar.data?.engine || 'server';
  const siblings = rows.map((r) => String(r.caseMasterId));
  const open = (r) => navigate(
    { pathname: `/cases/${r.caseMasterId}`, search: location.search },
    { state: { siblings } },
  );

  let body;
  if (similar.isLoading || (similar.isPending && similar.fetchStatus !== 'idle')) {
    body = <LoadingSkeleton lines={4} />;
  } else if (similar.error) {
    body = (
      <EmptyState
        compact
        title="Couldn't score similar cases"
        message={similar.error.message}
        action={<button type="button" className="btn" onClick={() => similar.refetch()}>Retry</button>}
      />
    );
  } else if (!rows.length) {
    body = <EmptyState compact title="No similar cases" message="The pattern engine found no case sharing this one's crime pattern." />;
  } else {
    body = <RowList rows={rows} onOpen={open} />;
  }

  return (
    <Card
      title="Similar cases"
      subtitle={engine === 'server'
        ? 'Scored on hour band · station/district · geo proximity'
        : `Same ${d.subHeadName ? 'subhead' : 'crime head'} · same district · newest first`}
      className="no-print"
      actions={engine === 'server'
        ? <Badge tone="teal">pattern engine</Badge>
        : <Badge tone="slate">client fallback</Badge>}
    >
      {body}
    </Card>
  );
}

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

  return <RowList rows={rows} onOpen={open} />;
}

export default function SimilarCases({ caseData, similar }) {
  const d = caseData || {};
  const lookups = useLookups();
  const lk = lookups.data;

  // Detail page passes the pattern-engine hook result; render that path.
  if (similar) return <SimilarFromEngine caseData={caseData} similar={similar} />;

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
