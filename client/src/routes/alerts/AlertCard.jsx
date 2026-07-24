// One anomaly alert card — narrative, observed-vs-expected sparkline with band,
// expected-vs-observed mini bars, z-score, SLA countdown, affected stations,
// relative "ended … ago" stamp, and actions: [View on map] [Acknowledge] plus
// [Copy] [Cases →] [Snooze 24h] / [Unsnooze] and a Details opener.
// New props are all optional — absent props reproduce the old card exactly.
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import Sparkline from './Sparkline.jsx';
import MiniCompareBar from './MiniCompareBar.jsx';
import SlaBadge from './SlaBadge.jsx';
import { caseDrillHref } from './links.js';
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';

const SEV_TONE = { critical: 'red', high: 'red', medium: 'amber', low: 'neutral' };

function cardBorder(severity, acked, snoozed) {
  if (acked) return 'opacity-80';
  if (snoozed) return 'opacity-70 border-grid';
  const sev = String(severity || '').toLowerCase();
  if (sev === 'critical') return 'border-signal/70 animate-pulse-glow';
  if (sev === 'high') return 'border-signal/50 animate-pulse-glow';
  return 'border-signal/30';
}

/** '2026-07-21' → 'ended 3d ago' (relative to now; null when unparseable). */
function endedAgo(iso) {
  if (!iso) return null;
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86400000);
  if (!Number.isFinite(days) || days < 0) return null;
  if (days === 0) return 'ended today';
  if (days === 1) return 'ended yesterday';
  if (days < 14) return `ended ${days}d ago`;
  if (days < 60) return `ended ${Math.round(days / 7)}w ago`;
  return `ended ${Math.round(days / 30)}mo ago`;
}

const snoozeLabel = (ts) => {
  try {
    return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// 44px touch targets on mobile; compact on sm+ where a pointer is precise.
const actionBtn = '!text-xs flex-1 justify-center min-h-[44px] sm:min-h-[30px]';

export default function AlertCard({
  alert: a, stations, acked = false, onAck, ackPending = false, ackError = false,
  unread = false, onRead, onCopy, onSnooze, snoozedUntil = 0, onUnsnooze,
  sla = null, onOpenDetail,
}) {
  const sev = String(a.severity || 'medium').toLowerCase();
  const snoozed = Number(snoozedUntil) > Date.now();
  const rel = endedAgo(a.periodEnd);
  const drill = caseDrillHref(a);
  return (
    <Card className={cardBorder(sev, acked, snoozed)}>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={acked || snoozed ? 'slate' : (SEV_TONE[sev] || 'neutral')} pulse={!acked && !snoozed}>{sev}</Badge>
            <h3 className="text-sm font-semibold text-ink truncate">
              {a.headName || 'Anomaly'} — {a.districtName || a.districtId || 'Unknown district'}
            </h3>
            <Badge tone={acked || snoozed ? 'slate' : 'red'} className="num">z {fmtNum(a.zScore, 1)}</Badge>
            {snoozed && (
              <Badge tone="slate">snoozed · until {snoozeLabel(snoozedUntil)}</Badge>
            )}
            {unread && !acked && !snoozed && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                new
              </span>
            )}
            {onOpenDetail && (
              <Tooltip label="Open the full alert detail (gauge, comparison, similar alerts)" className="ml-auto">
                <button
                  type="button"
                  onClick={() => onOpenDetail(a)}
                  aria-label={`Open details for ${a.headName || 'anomaly'}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-grid/40 hover:text-ink"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />
                  </svg>
                </button>
              </Tooltip>
            )}
          </div>

          {a.narrative && <p className="text-xs text-muted leading-relaxed">{a.narrative}</p>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted num">
            <span>{dateLabel(a.periodStart)} → {dateLabel(a.periodEnd)}</span>
            {rel && (
              <Tooltip label={`Period ended ${dateLabel(a.periodEnd)}`}>
                <span className="cursor-default" tabIndex={0}>{rel}</span>
              </Tooltip>
            )}
            <span>
              observed <span className="text-ink font-medium">{fmtInt(a.observed)}</span>
              {' '}vs expected <span className="text-ink font-medium">{fmtInt(a.expected)}</span>
            </span>
            {!acked && !snoozed && sla && <SlaBadge sla={sla} severity={a.severity} />}
          </div>

          {stations?.names?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">
                {stations.scope === 'district' ? 'Stations in district:' : 'Affected station:'}
              </span>
              {stations.names.map((n) => (
                <span key={n} className="chip !py-0.5 !text-[11px]">{n}</span>
              ))}
              {stations.more > 0 && <span className="chip !py-0.5 !text-[11px] text-muted">+{stations.more} more</span>}
            </div>
          )}
        </div>

        <div className="w-full md:w-60 shrink-0 flex flex-col gap-2">
          <Sparkline alert={a} height={72} />
          <p className="text-[10px] text-muted leading-tight">
            amber = observed · teal band = expected ±2σ · red dot = latest period
          </p>
          <MiniCompareBar observed={a.observed} expected={a.expected} zScore={a.zScore} />
          <div className="flex items-center gap-2">
            {a.districtId && (
              <Link
                className={`btn ${actionBtn}`}
                to={`/map?districtId=${encodeURIComponent(a.districtId)}`}
                onClick={() => onRead?.(a.alertId)}
              >
                View on map
              </Link>
            )}
            {acked ? (
              <Badge tone="teal" className="flex-1 justify-center py-1">acknowledged</Badge>
            ) : (
              <button
                type="button"
                className={`btn-primary ${actionBtn}`}
                disabled={ackPending}
                onClick={() => { onRead?.(a.alertId); onAck(a.alertId); }}
              >
                {ackPending ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            )}
          </div>
          {(onCopy || drill || (!acked && (onSnooze || onUnsnooze))) && (
            <div className="flex items-center gap-2">
              {onCopy && (
                <button type="button" className={`btn ${actionBtn}`} onClick={() => onCopy(a)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" />
                  </svg>
                  Copy
                </button>
              )}
              {drill && (
                <Link
                  className={`btn ${actionBtn}`}
                  to={drill}
                  title="Open the case list filtered to this district, crime head and period"
                  onClick={() => onRead?.(a.alertId)}
                >
                  Cases →
                </Link>
              )}
              {!acked && (snoozed ? (
                onUnsnooze && (
                  <button type="button" className={`btn ${actionBtn}`} onClick={() => onUnsnooze(a.alertId)}>
                    Unsnooze
                  </button>
                )
              ) : (
                onSnooze && (
                  <button type="button" className={`btn ${actionBtn}`} onClick={() => onSnooze(a.alertId)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M5 3 2.5 5.5M19 3l2.5 2.5" />
                    </svg>
                    Snooze 24h
                  </button>
                )
              ))}
            </div>
          )}
          {ackError && <p className="text-[11px] text-signal" role="alert">Couldn't acknowledge — try again.</p>}
        </div>
      </div>
    </Card>
  );
}
