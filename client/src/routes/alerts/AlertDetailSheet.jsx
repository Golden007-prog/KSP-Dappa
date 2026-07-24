// Alert detail sheet — the full picture for one anomaly in a bottom sheet
// (opened from feed cards, board cards, or the `o` shortcut): z-score gauge,
// expected-vs-observed mini bars, history sparkline, SLA state, narrative,
// affected stations, every triage action, the alert-to-case drill, and a
// "similar alerts" list (same district or crime head) that jumps in place.
import { Link } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import Sparkline from './Sparkline.jsx';
import ZGauge from './ZGauge.jsx';
import MiniCompareBar from './MiniCompareBar.jsx';
import SlaBadge from './SlaBadge.jsx';
import { caseDrillHref } from './links.js';
import { fmtNum, dateLabel } from '../../lib/format.js';

const SEV_TONE = { critical: 'red', high: 'red', medium: 'amber', low: 'neutral' };
const BTN = 'btn !text-xs flex-1 justify-center min-h-[44px]';

export default function AlertDetailSheet({
  alert: a, onClose, sla, stations, acked, snoozedUntil,
  onAck, ackPending, onSnooze, onUnsnooze, onCopy, similar = [], onJump,
}) {
  if (!a) return null;
  const sev = String(a.severity || 'medium').toLowerCase();
  const snoozed = Number(snoozedUntil) > Date.now();
  const drill = caseDrillHref(a);
  return (
    <Sheet
      open={!!a}
      onClose={onClose}
      title={`${a.headName || 'Anomaly'} — ${a.districtName || a.districtId || 'Unknown district'}`}
    >
      <div className="space-y-4 px-1 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={acked || snoozed ? 'slate' : (SEV_TONE[sev] || 'neutral')} pulse={!acked && !snoozed}>{sev}</Badge>
          <Badge tone="slate" className="num">z {fmtNum(a.zScore, 1)}</Badge>
          {acked ? <Badge tone="teal">acknowledged</Badge>
            : snoozed ? <Badge tone="slate">snoozed</Badge>
              : sla && <SlaBadge sla={sla} severity={a.severity} />}
        </div>

        <div className="grid grid-cols-2 items-center gap-3">
          <ZGauge z={a.zScore} />
          <MiniCompareBar observed={a.observed} expected={a.expected} zScore={a.zScore} />
        </div>

        <div>
          <Sparkline alert={a} height={72} />
          <p className="mt-1 text-[10px] leading-tight text-muted">
            amber = observed · teal band = expected ±2σ · red dot = latest period
          </p>
        </div>

        {a.narrative && <p className="text-xs leading-relaxed text-muted">{a.narrative}</p>}

        <p className="num text-[11px] text-muted">
          {dateLabel(a.periodStart)} → {dateLabel(a.periodEnd)}
        </p>

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

        <div className="flex items-center gap-2">
          {acked ? (
            <Badge tone="teal" className="flex-1 justify-center py-1.5">acknowledged</Badge>
          ) : (
            <button type="button" className={`btn-primary ${BTN}`} disabled={ackPending} onClick={() => onAck(a.alertId)}>
              {ackPending ? 'Acknowledging…' : 'Acknowledge'}
            </button>
          )}
          {!acked && (snoozed ? (
            <button type="button" className={BTN} onClick={() => onUnsnooze(a.alertId)}>Unsnooze</button>
          ) : (
            <button type="button" className={BTN} onClick={() => onSnooze(a.alertId)}>Snooze 24h</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {a.districtId && (
            <Link className={BTN} to={`/map?districtId=${encodeURIComponent(a.districtId)}`}>View on map</Link>
          )}
          {drill && (
            <Link className={BTN} to={drill} title="Open the case list filtered to this district, crime head and period">
              Open cases →
            </Link>
          )}
          <button type="button" className={BTN} onClick={() => onCopy(a)}>Copy</button>
        </div>

        {similar.length > 0 && (
          <div className="space-y-1.5 border-t border-grid/60 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Similar alerts (same district or crime head)
            </p>
            {similar.map((s) => (
              <button
                key={String(s.alertId)}
                type="button"
                onClick={() => onJump(s)}
                className="flex w-full min-h-[44px] items-center gap-2 rounded-lg border border-grid px-2.5 py-1.5 text-left transition-colors hover:border-primary/50"
              >
                <Badge tone={SEV_TONE[String(s.severity || '').toLowerCase()] || 'neutral'}>
                  {String(s.severity || '—').toLowerCase()}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-ink">
                  {s.headName || 'Anomaly'} — {s.districtName || s.districtId}
                </span>
                <span className="num shrink-0 text-[11px] text-muted">z {fmtNum(s.zScore, 1)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
