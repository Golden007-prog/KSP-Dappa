// One anomaly alert card — narrative, observed-vs-expected sparkline with band,
// z-score, affected stations, [View on map] and [Acknowledge] actions.
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Sparkline from './Sparkline.jsx';
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';

const SEV_TONE = { critical: 'red', high: 'red', medium: 'amber', low: 'neutral' };

function cardBorder(severity, acked) {
  if (acked) return 'opacity-80';
  const sev = String(severity || '').toLowerCase();
  if (sev === 'critical') return 'border-signal/70 animate-pulse-glow';
  if (sev === 'high') return 'border-signal/50 animate-pulse-glow';
  return 'border-signal/30';
}

export default function AlertCard({
  alert: a, stations, acked = false, onAck, ackPending = false, ackError = false,
  unread = false, onRead,
}) {
  const sev = String(a.severity || 'medium').toLowerCase();
  return (
    <Card className={cardBorder(sev, acked)}>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={acked ? 'slate' : (SEV_TONE[sev] || 'neutral')} pulse={!acked}>{sev}</Badge>
            <h3 className="text-sm font-semibold text-ink truncate">
              {a.headName || 'Anomaly'} — {a.districtName || a.districtId || 'Unknown district'}
            </h3>
            <Badge tone={acked ? 'slate' : 'red'} className="num">z {fmtNum(a.zScore, 1)}</Badge>
            {unread && !acked && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                new
              </span>
            )}
          </div>

          {a.narrative && <p className="text-xs text-muted leading-relaxed">{a.narrative}</p>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted num">
            <span>{dateLabel(a.periodStart)} → {dateLabel(a.periodEnd)}</span>
            <span>
              observed <span className="text-ink font-medium">{fmtInt(a.observed)}</span>
              {' '}vs expected <span className="text-ink font-medium">{fmtInt(a.expected)}</span>
            </span>
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
          <div className="flex items-center gap-2">
            {a.districtId && (
              <Link
                className="btn !text-xs flex-1 justify-center"
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
                className="btn-primary !text-xs flex-1 justify-center"
                disabled={ackPending}
                onClick={() => { onRead?.(a.alertId); onAck(a.alertId); }}
              >
                {ackPending ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            )}
          </div>
          {ackError && <p className="text-[11px] text-signal">Couldn't acknowledge — try again.</p>}
        </div>
      </div>
    </Card>
  );
}
