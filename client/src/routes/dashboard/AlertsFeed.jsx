// Live alerts feed — top 5 open anomalies, severity-coloured, relative time,
// with a local severity filter (All / Critical / High+) and a one-tap
// acknowledge button per row (useAckAlert — invalidates alerts + kpis).
// Severity tones follow routes/alerts/AlertCard.jsx (critical/high red,
// medium amber, low neutral). Each row deep-links into /alerts.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../components/Badge.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useAckAlert } from '../../lib/api.js';
import { fmtNum } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';

export const isOpenAlert = (a) => !/ack/i.test(String(a?.status || ''));
export const sevRank = (s) => ({ critical: 3, high: 2, medium: 1 }[String(s || '').toLowerCase()] ?? 0);

const SEV_TONE = { critical: 'red', high: 'red', medium: 'amber', low: 'neutral' };
const SEV_BORDER = {
  critical: 'border-l-signal',
  high: 'border-l-signal/70',
  medium: 'border-l-amber/70',
  low: 'border-l-grid',
};

/** '2026-07-21' (or full ISO) → 'today' | 'yesterday' | '3d ago' | '2w ago' |
 * '3mo ago', in the active language. `t` comes from the calling component's
 * useT() — this module is plain JS, so it never calls the hook itself. */
export function relTime(iso, t) {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return t('dashboard.rel.today');
  if (days === 1) return t('dashboard.rel.yesterday');
  if (days < 7) return t('dashboard.rel.days', { n: days });
  if (days < 30) return t('dashboard.rel.weeks', { n: Math.round(days / 7) });
  return t('dashboard.rel.months', { n: Math.round(days / 30) });
}

/** The 5 most severe open alerts (severity rank, then |z|). */
export function topOpenAlerts(alerts, n = 5) {
  return (alerts || [])
    .filter(isOpenAlert)
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity)
      || Math.abs(Number(b.zScore) || 0) - Math.abs(Number(a.zScore) || 0))
    .slice(0, n);
}

const AckIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m4 12.5 5 5L20 6.5" />
  </svg>
);

export default function AlertsFeed({ query, linkSearch = '' }) {
  const toast = useToast();
  const t = useT();
  const tName = useNames();
  const ack = useAckAlert();
  const [ackingId, setAckingId] = useState(null);
  const [sevFilter, setSevFilter] = useState('all');

  if (query.isLoading) return <LoadingSkeleton lines={5} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title={t('dashboard.alerts.error')}
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }

  const minRank = sevFilter === 'critical' ? 3 : sevFilter === 'high' ? 2 : 0;
  const pool = (query.data || []).filter((a) => sevRank(a.severity) >= minRank);
  const open = topOpenAlerts(pool);
  const hasAny = (query.data || []).some(isOpenAlert);

  const doAck = (a) => {
    if (!a.alertId || ack.isPending) return;
    setAckingId(a.alertId);
    const name = tName('crimeHeads', a.crimeHeadId, a.headName) || a.headName || a.alertId;
    ack.mutate(a.alertId, {
      onSuccess: () => toast.success(t('dashboard.alerts.acked', { name })),
      onError: (e) => toast.error(e?.message || t('dashboard.alerts.ackFailed')),
      onSettled: () => setAckingId(null),
    });
  };

  return (
    <div className="space-y-2">
      {hasAny && (
        <SegmentedControl
          ariaLabel={t('dashboard.alerts.sevAria')}
          value={sevFilter}
          onChange={setSevFilter}
          options={[
            { value: 'all', label: t('dashboard.alerts.sevAll') },
            { value: 'high', label: t('dashboard.alerts.sevHighPlus') },
            { value: 'critical', label: t('dashboard.alerts.sevCritical') },
          ]}
        />
      )}
      {!open.length ? (
        <EmptyState
          compact
          title={t('dashboard.alerts.empty')}
          message={t(hasAny ? 'dashboard.alerts.emptyAtSeverity' : 'dashboard.alerts.emptyNone')}
        />
      ) : (
        <ul className="space-y-2">
          {open.map((a, i) => {
            const sev = String(a.severity || 'medium').toLowerCase();
            const head = tName('crimeHeads', a.crimeHeadId, a.headName) || t('dashboard.alerts.anomaly');
            const district = tName('districts', a.districtId, a.districtName || a.districtId)
              || a.districtName || a.districtId;
            return (
              <li
                key={a.alertId || i}
                className={`group flex items-stretch rounded-lg border border-grid border-l-2 ${SEV_BORDER[sev] || SEV_BORDER.low}
                  bg-base/40 transition-colors hover:border-amber/40`}
              >
                <Link to={`/alerts${linkSearch}`} className="block min-w-0 flex-1 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={SEV_TONE[sev] || 'neutral'} pulse={sev === 'critical'}>{t(`dashboard.sev.${sev}`)}</Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink group-hover:text-amber transition-colors">
                      {head} — {district}
                    </span>
                    <span className="num shrink-0 text-[11px] text-muted">{t('dashboard.alerts.z', { v: fmtNum(a.zScore, 1) })}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[11px] text-muted">
                      {a.narrative || t('dashboard.alerts.narrativeFallback', {
                        district: district || t('dashboard.alerts.districtFallback'),
                      })}
                    </p>
                    <span className="num shrink-0 text-[10px] text-muted/80">{relTime(a.periodEnd, t)}</span>
                  </div>
                </Link>
                {a.alertId && (
                  <Tooltip label={t('dashboard.alerts.ack')}>
                    <button
                      type="button"
                      aria-label={t('dashboard.alerts.ackAria', { name: head })}
                      onClick={() => doAck(a)}
                      disabled={ackingId === a.alertId}
                      className="flex w-10 shrink-0 items-center justify-center rounded-r-lg border-l border-grid/60 text-muted
                        transition-colors hover:bg-teal/10 hover:text-teal disabled:opacity-40"
                    >
                      {ackingId === a.alertId
                        ? <span className="skeleton h-3 w-3 rounded-full" />
                        : AckIcon}
                    </button>
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
