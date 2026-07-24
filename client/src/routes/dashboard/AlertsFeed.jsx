// Live alerts feed — top 5 open anomalies, severity-coloured, relative time.
// Severity tones follow routes/alerts/AlertCard.jsx (critical/high red,
// medium amber, low neutral). Each row deep-links into /alerts.
import { Link } from 'react-router-dom';
import Badge from '../../components/Badge.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { fmtNum } from '../../lib/format.js';

export const isOpenAlert = (a) => !/ack/i.test(String(a?.status || ''));
export const sevRank = (s) => ({ critical: 3, high: 2, medium: 1 }[String(s || '').toLowerCase()] ?? 0);

const SEV_TONE = { critical: 'red', high: 'red', medium: 'amber', low: 'neutral' };
const SEV_BORDER = {
  critical: 'border-l-signal',
  high: 'border-l-signal/70',
  medium: 'border-l-amber/70',
  low: 'border-l-grid',
};

/** '2026-07-21' (or full ISO) → 'today' | 'yesterday' | '3d ago' | '2w ago' | '3mo ago'. */
export function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/** The 5 most severe open alerts (severity rank, then |z|). */
export function topOpenAlerts(alerts, n = 5) {
  return (alerts || [])
    .filter(isOpenAlert)
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity)
      || Math.abs(Number(b.zScore) || 0) - Math.abs(Number(a.zScore) || 0))
    .slice(0, n);
}

export default function AlertsFeed({ query, linkSearch = '' }) {
  if (query.isLoading) return <LoadingSkeleton lines={5} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title="Couldn't load alerts"
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>Retry</button>}
      />
    );
  }
  const open = topOpenAlerts(query.data);
  if (!open.length) {
    return <EmptyState compact title="No active alerts" message="No anomalies flagged in the current window." />;
  }
  return (
    <ul className="space-y-2">
      {open.map((a, i) => {
        const sev = String(a.severity || 'medium').toLowerCase();
        return (
          <li key={a.alertId || i}>
            <Link
              to={`/alerts${linkSearch}`}
              className={`group block rounded-lg border border-grid border-l-2 ${SEV_BORDER[sev] || SEV_BORDER.low}
                bg-base/40 px-3 py-2 transition-colors hover:border-amber/40`}
            >
              <div className="flex items-center gap-2">
                <Badge tone={SEV_TONE[sev] || 'neutral'} pulse={sev === 'critical'}>{sev}</Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-ink group-hover:text-amber transition-colors">
                  {a.headName || 'Anomaly'} — {a.districtName || a.districtId}
                </span>
                <span className="num shrink-0 text-[11px] text-muted">z {fmtNum(a.zScore, 1)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[11px] text-muted">
                  {a.narrative || `Observed above expected in ${a.districtName || 'district'}`}
                </p>
                <span className="num shrink-0 text-[10px] text-muted/80">{relTime(a.periodEnd)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
