// Search result: the decision first, in words — candidates, "no reliable
// match" (with the top figure and the floor visible), or a quality-gate
// rejection with its reasons — then the shortlist line, the gate card and the
// ranked candidate list.
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import Badge from '../../components/Badge.jsx';
import PlainTerm from '../../components/PlainTerm.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useT } from '../../lib/i18n.jsx';
import CandidateCard from './CandidateCard.jsx';

function GateCard({ gate }) {
  const t = useT();
  if (!gate) return null;
  const reasons = gate.reasons || [];
  return (
    <div className="rounded-lg border border-grid bg-base/50 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink font-medium">{t('identify.result.gate')}</span>
        <Badge tone={gate.mode === 'zia' ? 'teal' : 'amber'}>{t(`identify.result.gateMode.${gate.mode === 'zia' ? 'zia' : 'advisory'}`)}</Badge>
        <StatusPill status={gate.passed ? 'stable' : 'rising'} label={t(gate.passed ? 'identify.result.gatePassed' : 'identify.result.gateFailed')} />
        {gate.facesCount !== null && gate.facesCount !== undefined && <span className="num text-muted">{t('identify.result.gateFaces', { n: gate.facesCount })}</span>}
        {gate.confidence !== null && gate.confidence !== undefined && <span className="num text-muted">{t('identify.result.gateConfidence', { n: Math.round(gate.confidence * 100) })}</span>}
        {gate.pose !== null && gate.pose !== undefined && <span className="num text-muted">{t('identify.result.gatePose', { n: gate.pose })}</span>}
      </div>
      {gate.note && <p className="text-muted mt-1">{gate.note}</p>}
      {reasons.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {reasons.map((r) => <li key={r} className="chip !py-0.5 text-[11px] !border-signal/50 text-signal">{t(`identify.result.gateReason.${r}`)}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function ResultsPanel({ result, meta, loading, error, floorFallback = 0.7, decisions = [], onDecide, deciding, onRetry }) {
  const t = useT();
  if (loading) return <Card title={t('identify.result.title')}><LoadingSkeleton lines={6} /></Card>;
  if (error) {
    return (
      <Card title={t('identify.result.title')}>
        <EmptyState compact title={t('identify.result.error')} message={error.message} action={onRetry ? <button type="button" className="btn min-h-[44px]" onClick={onRetry}>{t('common.action.retry')}</button> : null} />
      </Card>
    );
  }
  if (!result) {
    return (
      <Card title={t('identify.result.title')}>
        <EmptyState compact title={t('identify.result.empty')} message={t('identify.result.emptyHint')} />
      </Card>
    );
  }
  const floor = Number(result.floor) || floorFallback;
  const deadBand = Number(result.deadBand) || 0.1;
  const top = result.candidates && result.candidates[0];
  const topPct = top && top.confidence !== null ? Math.round(top.confidence * 100) : null;
  const engineWord = (e) => (e === 'zia-identity-scanner' ? t('identify.result.engineZia') : t('identify.result.engineLocal'));
  const acc = (meta && meta.accountability) || {};

  return (
    <Card
      title={t('identify.result.title')}
      subtitle={result.shortlist ? t('identify.result.shortlist', { desc: result.shortlist.description }) : null}
      actions={(
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={meta && meta.engine === 'zia-identity-scanner' ? 'teal' : 'slate'}>{t('identify.result.engine', { engine: engineWord(meta && meta.engine) })}</Badge>
          <Tooltip label={t('identify.result.floorHint', { lo: Math.round((floor - deadBand) * 100), floor: Math.round(floor * 100) })} position="bottom">
            <button type="button" className="chip !py-0.5 text-[11px] num">{t('identify.result.floor', { floor: Math.round(floor * 100) })}</button>
          </Tooltip>
        </div>
      )}
    >
      <div className="space-y-3">
        {result.decision === 'candidates' && (
          <p className="text-sm text-ink">
            <StatusPill status="rising" label={t('identify.cand.band.lead')} className="mr-2" />
            {t('identify.result.candidates', { n: result.candidates.length, pct: topPct })}
          </p>
        )}
        {result.decision === 'no-reliable-match' && (
          <div className="rounded-lg border border-amber/40 bg-amber/5 px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">
              <StatusPill status="nodata" label={t('identify.result.noReliable')} className="mr-2" />
              {t('identify.result.noReliable')}
            </p>
            <p className="text-xs text-muted mt-1">
              {topPct !== null
                ? t('identify.result.noReliableHint', { pct: topPct, floor: Math.round(floor * 100) })
                : (result.noReliableMatch && result.noReliableMatch.reason) || t('identify.result.noCandidates')}
            </p>
          </div>
        )}
        {result.decision === 'rejected-by-quality-gate' && (
          <div className="rounded-lg border border-signal/40 bg-signal/5 px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">
              <StatusPill status="falling" label={t('identify.result.rejected')} className="mr-2" />
              {t('identify.result.rejected')}
            </p>
            <p className="text-xs text-muted mt-1">{t('identify.result.rejectedHint')}</p>
          </div>
        )}

        <GateCard gate={result.gate} />

        {result.shortlist && (
          <p className="text-[11px] text-muted">
            <PlainTerm term="faceShortlist" vars={{ n: result.shortlist.count, cap: result.shortlist.cap }} className="mr-1" />
            <span className="num">{t('identify.result.shortlistLine', { n: result.shortlist.count, narrowed: result.shortlist.narrowed, cap: result.shortlist.cap })}</span>
            {result.shortlist.withoutGallery > 0 && <span> · {t('identify.result.withoutGallery', { n: result.shortlist.withoutGallery })}</span>}
          </p>
        )}

        {result.candidates && result.candidates.length > 0 && (
          <ul className="space-y-2.5">
            {result.candidates.map((c) => (
              <CandidateCard key={c.personKey} cand={c} floor={floor} deadBand={deadBand} searchId={result.searchId} decisions={decisions} onDecide={onDecide} deciding={deciding} />
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted num">
          {t('identify.result.audited', { id: result.searchId, caseNo: acc.caseNo || '—', basis: acc.legalBasis ? t(`identify.basis.${acc.legalBasis}`) : '—', actor: (acc.officer && acc.officer.actor) || '—' })}
          {' · '}{t('identify.audit.noProbe')}
        </p>
      </div>
    </Card>
  );
}
