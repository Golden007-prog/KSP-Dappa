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
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { CrimeNoInline, splitCrimeNo } from './CrimeNoBreakdown.jsx';

const MAX_ROWS = 6;

// whyMatched reasons are produced in English by the pattern engine
// (functions/dappa_api/lib/routes/cases.js) and by the client fallback in
// similar.js — both stay canonical; only the chip text is translated.
const WHY_KEYS = {
  'same crime pattern': 'cases.similar.why.pattern',
  'same crime head': 'cases.similar.why.head',
  'same station': 'cases.similar.why.station',
  'same district': 'cases.similar.why.district',
  'similar hour of day': 'cases.similar.why.hour',
};
const WITHIN_KM = /^within\s+([\d.]+)\s*km$/i;

function useWhyLabel() {
  const t = useT();
  return (raw) => {
    const s = String(raw || '').trim();
    if (WHY_KEYS[s.toLowerCase()]) return t(WHY_KEYS[s.toLowerCase()]);
    const km = WITHIN_KM.exec(s);
    if (km) return t('cases.similar.why.withinKm', { km: km[1] });
    return s;
  };
}

function RowButton({ r, onOpen, whyLabel, trName, t }) {
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
          {dateLabel(r.registeredDate)} · {r.unitName || trName('districts', r.districtName) || '—'}
        </p>
        {why.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {why.slice(0, 4).map((w, i) => (
              <span key={`${w}-${i}`} className="chip !py-0.5 !px-1.5 !text-[10px]">{whyLabel(w)}</span>
            ))}
          </span>
        )}
      </div>
      {hasScore && (
        <span className="shrink-0 flex flex-col items-end gap-1" aria-label={t('cases.similar.scoreAria', { n: score })}>
          <span className="num text-xs text-ink font-medium">{fmtInt(score)}%</span>
          <span className="block h-1.5 w-14 rounded-full bg-grid overflow-hidden" aria-hidden="true">
            <span
              className={`block h-full ${score >= 60 ? 'bg-amber' : 'bg-teal/70'}`}
              style={{ width: `${score}%` }}
            />
          </span>
        </span>
      )}
      {r.anomalyFlag ? <Badge tone="red" pulse>{t('cases.badge.anomaly')}</Badge> : null}
      {r.statusName && !why.length && <Badge tone="slate">{trName('statuses', r.statusName)}</Badge>}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

function RowList({ rows, onOpen }) {
  const t = useT();
  const trName = useCaseNames();
  const whyLabel = useWhyLabel();
  return (
    <ul className="divide-y divide-grid/40">
      {rows.map((r) => (
        <li key={r.caseMasterId}>
          <RowButton r={r} onOpen={onOpen} whyLabel={whyLabel} trName={trName} t={t} />
        </li>
      ))}
    </ul>
  );
}

/** Pattern-engine variant — renders the useSimilarCases hook result. */
function SimilarFromEngine({ caseData, similar }) {
  const t = useT();
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
        title={t('cases.similar.scoreError')}
        message={similar.error.message}
        action={<button type="button" className="btn" onClick={() => similar.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  } else if (!rows.length) {
    body = <EmptyState compact title={t('cases.similar.none')} message={t('cases.similar.noneEngine')} />;
  } else {
    body = <RowList rows={rows} onOpen={open} />;
  }

  return (
    <Card
      title={t('cases.similar.title')}
      subtitle={engine === 'server'
        ? t('cases.similar.subEngine')
        : t(d.subHeadName ? 'cases.similar.subFallbackSub' : 'cases.similar.subFallbackHead')}
      className="no-print"
      actions={engine === 'server'
        ? <Badge tone="teal">{t('cases.similar.engineBadge')}</Badge>
        : <Badge tone="slate">{t('cases.similar.fallbackBadge')}</Badge>}
    >
      {body}
    </Card>
  );
}

function SimilarList({ params, matchLabel, currentId }) {
  const t = useT();
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
    return <EmptyState compact title={t('cases.similar.loadError')} message={cases.error.message} />;
  }
  if (!rows.length) {
    return <EmptyState compact title={t('cases.similar.none')} message={t('cases.similar.noneMatch', { what: matchLabel })} />;
  }

  const siblings = rows.map((r) => String(r.caseMasterId));
  const open = (r) => navigate(
    { pathname: `/cases/${r.caseMasterId}`, search: location.search },
    { state: { siblings } },
  );

  return <RowList rows={rows} onOpen={open} />;
}

export default function SimilarCases({ caseData, similar }) {
  const t = useT();
  const trName = useCaseNames();
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
  const districtLabel = trName('districts', d.districtName) || t('cases.similar.thisDistrict');
  const matchLabel = sub
    ? t('cases.similar.matchSub', { name: trName('crimeSubHeads', d.subHeadName), district: districtLabel })
    : head ? t('cases.similar.matchHead', { name: trName('crimeHeads', d.headName), district: districtLabel }) : '';

  return (
    <Card
      title={t('cases.similar.title')}
      subtitle={matchLabel
        ? t(sub ? 'cases.similar.subFallbackSub' : 'cases.similar.subFallbackHead')
        : t('cases.similar.subContext')}
      className="no-print"
      actions={
        <span className="flex items-center gap-1.5">
          {sub ? <Badge tone="teal">{t('cases.similar.subHeadMatch')}</Badge>
            : head ? <Badge tone="slate">{t('cases.similar.headMatch')}</Badge> : null}
        </span>
      }
    >
      {lookups.isLoading ? (
        <LoadingSkeleton lines={4} />
      ) : !params || !districtId ? (
        <EmptyState
          compact
          title={t('cases.similar.notEnough')}
          message={t('cases.similar.notEnoughMsg')}
        />
      ) : (
        <SimilarList params={{ ...params, districtId }} matchLabel={matchLabel} currentId={d.caseMasterId} />
      )}
    </Card>
  );
}
