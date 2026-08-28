// Peer-cohort analysis — judge this person against people who actually look
// like them, not against the whole register.
//
// A top-of-the-list absolute risk score tells an investigator that a 230-case
// cross-state operator outranks a 4-case local, which they already knew. The
// question worth answering is who is unusual FOR THEIR PEER GROUP: among people
// with a comparable caseload, footprint and MO family, who stands out?
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { peerCohort } from './behaviour.js';
import { RiskBadge } from './common.jsx';

const PEER_ROWS = 8;

/** Percentile rail with the subject's position marked against the cohort. */
function PercentileRail({ metric }) {
  const t = useT();
  const pct = Math.max(0, Math.min(100, metric.percentile));
  const hot = metric.outlier && metric.z > 0;
  const cold = metric.outlier && metric.z < 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-ink truncate">{t(`offenders.peer.metric.${metric.id}`)}</span>
        <span className="num text-[11px] text-muted shrink-0">
          {t('offenders.peer.vsMean', {
            mine: fmtNum(metric.mine, metric.id === 'riskScore' ? 1 : 0),
            mean: fmtNum(metric.mean, 1),
          })}
        </span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-grid/60">
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-3 w-1 rounded-full ${
            hot ? 'bg-signal' : cold ? 'bg-teal' : 'bg-amber'
          }`}
          style={{ left: `calc(${pct}% - 2px)` }}
          title={t('offenders.peer.percentileHint', {
            pct: fmtPct(pct, { digits: 0 }),
            z: fmtNum(metric.z, 2),
          })}
        />
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="num text-[10px] text-muted">{t('offenders.peer.pctOfPeers', { pct: fmtPct(pct, { digits: 0 }) })}</span>
        {metric.outlier && (
          <Badge tone={hot ? 'red' : 'teal'}>
            {t(hot ? 'offenders.peer.aboveBadge' : 'offenders.peer.belowBadge', { z: fmtNum(Math.abs(metric.z), 1) })}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function PeerCohortCard({ subject, analysis }) {
  const t = useT();
  const { rows, vocab, isLoading } = analysis;

  const cohort = useMemo(() => {
    if (!subject?.personKey || !rows.length || !vocab) return null;
    return peerCohort(subject, rows, vocab.signalByKey);
  }, [subject, rows, vocab]);

  if (isLoading || !vocab) {
    return (
      <Card title={t('offenders.peer.title')} subtitle={t('offenders.peer.subtitle')}>
        <LoadingSkeleton lines={5} />
      </Card>
    );
  }

  if (!cohort || !cohort.enough) {
    return (
      <Card title={t('offenders.peer.title')} subtitle={t('offenders.peer.subtitle')}>
        <EmptyState compact title={t('offenders.peer.thinTitle')} message={t('offenders.peer.thinMsg')} />
      </Card>
    );
  }

  const peers = cohort.cohort.slice(0, PEER_ROWS);
  const verdictTone = cohort.verdict === 'outlierHigh' ? 'red' : cohort.verdict === 'outlierLow' ? 'teal' : 'slate';

  return (
    <Card
      title={t('offenders.peer.title')}
      subtitle={t('offenders.peer.cohortOf', { n: fmtInt(cohort.cohort.length) })}
      actions={<Badge tone={verdictTone}>{t(`offenders.peer.verdict.${cohort.verdict}`)}</Badge>}
    >
      <p className="text-[11px] text-muted leading-5">
        {t('offenders.peer.built', { sim: fmtPct(cohort.avgSimilarity * 100, { digits: 0 }) })}
      </p>

      <div className="mt-3 space-y-2.5">
        {cohort.metrics.map((m) => <PercentileRail key={m.id} metric={m} />)}
      </div>

      {cohort.standouts.length > 0 && (
        <div className="mt-3 bg-canvas/60 border border-grid border-l-2 border-l-signal rounded-lg px-3 py-2">
          <p className="text-xs font-medium text-ink">{t('offenders.peer.standoutTitle')}</p>
          <p className="text-[11px] text-muted mt-0.5 leading-4">
            {cohort.standouts.slice(0, 3).map((m) => t('offenders.peer.standoutItem', {
              metric: t(`offenders.peer.metric.${m.id}`),
              pct: fmtPct(m.percentile, { digits: 0 }),
              dir: t(m.z > 0 ? 'offenders.peer.dirAbove' : 'offenders.peer.dirBelow'),
            })).join(' ')}
          </p>
        </div>
      )}

      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('offenders.peer.closest')}</p>
        <ul className="divide-y divide-grid/50">
          {peers.map((p) => (
            <li key={p.row.personKey} className="py-1.5 first:pt-0 last:pb-0">
              <Link
                to={`/offenders/${encodeURIComponent(p.row.personKey)}`}
                className="flex items-center gap-2 min-h-[36px] group"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink truncate group-hover:text-amber transition-colors">
                    {p.row.canonicalName || p.row.personKey}
                  </span>
                  <span className="block text-[10px] text-muted num">
                    {t('offenders.peer.peerMeta', {
                      cases: fmtInt(p.row.caseCount),
                      districts: fmtInt((p.row.districts || []).length),
                    })}
                  </span>
                </span>
                <Tooltip label={t('offenders.peer.simHint')}>
                  <Badge tone="slate">{fmtPct(p.similarity * 100, { digits: 0 })}</Badge>
                </Tooltip>
                <RiskBadge score={p.row.riskScore} />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] text-muted mt-2 leading-5">{t('offenders.peer.method')}</p>
    </Card>
  );
}
