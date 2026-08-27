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
import { fmtInt, fmtNum, dateLabel, getFormatLocale } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { sevKey, SEV_TONE, direction, statusKey } from './severity.js';

function cardBorder(sev, acked, snoozed) {
  if (acked) return 'opacity-80';
  if (snoozed) return 'opacity-70 border-grid';
  if (sev === 'critical') return 'border-signal/70 animate-pulse-glow';
  if (sev === 'high') return 'border-signal/50 animate-pulse-glow';
  return 'border-signal/30';
}

/** '2026-07-21' → 'ended 3d ago' (relative to now; null when unparseable). */
function endedAgo(iso, t) {
  if (!iso) return null;
  const ts = Date.parse(`${String(iso).slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(ts)) return null;
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (!Number.isFinite(days) || days < 0) return null;
  if (days === 0) return t('alerts.card.endedToday');
  if (days === 1) return t('alerts.card.endedYesterday');
  if (days < 14) return t('alerts.card.endedDays', { n: days });
  if (days < 60) return t('alerts.card.endedWeeks', { n: Math.round(days / 7) });
  return t('alerts.card.endedMonths', { n: Math.round(days / 30) });
}

const LOCALE = { en: 'en-IN', kn: 'kn-IN' };
const snoozeLabel = (ts) => {
  try {
    return new Date(ts).toLocaleString(LOCALE[getFormatLocale()] || 'en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
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
  // New (all optional — omitting them reproduces the previous card exactly).
  selected = false, onSelect, hasNote = false, owner = '', onDismiss,
}) {
  const t = useT();
  const tName = useNames();
  const sev = sevKey(a.severity) || 'medium';
  const dir = direction(a);
  const state = statusKey(a.status);
  const snoozed = Number(snoozedUntil) > Date.now();
  const rel = endedAgo(a.periodEnd, t);
  const drill = caseDrillHref(a);
  const head = tName('crimeHeads', a.crimeHeadId, a.headName) || t('alerts.anomaly');
  const district = tName('districts', a.districtId, a.districtName || a.districtId)
    || t('alerts.unknownDistrict');
  return (
    <Card className={cardBorder(sev, acked, snoozed)}>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {onSelect && (
              <label className="flex h-11 w-6 shrink-0 cursor-pointer items-center sm:h-6">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onSelect(a.alertId)}
                  aria-label={t('alerts.bulk.selectAria', { name: `${head} — ${district}` })}
                  className="h-4 w-4 accent-current text-primary"
                />
              </label>
            )}
            <Badge tone={acked || snoozed ? 'slate' : (SEV_TONE[sev] || 'neutral')} pulse={!acked && !snoozed}>{t(`alerts.sevLower.${sev}`)}</Badge>
            <h3 className="text-sm font-semibold text-ink truncate">
              {head} — {district}
            </h3>
            <Badge tone={acked || snoozed ? 'slate' : 'red'} className="num">{t('alerts.card.z')} {fmtNum(a.zScore, 1)}</Badge>
            {dir && (
              <Tooltip label={t(dir === 'up' ? 'alerts.dir.upTip' : 'alerts.dir.downTip')}>
                <span tabIndex={0} className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                  <Badge tone={acked || snoozed ? 'slate' : (dir === 'up' ? 'red' : 'teal')}>
                    {t(dir === 'up' ? 'alerts.dir.up' : 'alerts.dir.down')}
                  </Badge>
                </span>
              </Tooltip>
            )}
            {state === 'reviewed' && <Badge tone="slate">{t('alerts.status.reviewed')}</Badge>}
            {state === 'dismissed' && <Badge tone="slate">{t('alerts.status.dismissed')}</Badge>}
            {owner && <Badge tone="teal">{t('alerts.triage.assignedTo', { who: owner })}</Badge>}
            {hasNote && (
              <Tooltip label={t('alerts.card.hasNoteTip')}>
                <span tabIndex={0} className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                  <Badge tone="amber">{t('alerts.card.hasNote')}</Badge>
                </span>
              </Tooltip>
            )}
            {snoozed && (
              <Badge tone="slate">{t('alerts.card.snoozedUntil', { when: snoozeLabel(snoozedUntil) })}</Badge>
            )}
            {unread && !acked && !snoozed && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {t('alerts.card.new')}
              </span>
            )}
            {onOpenDetail && (
              <Tooltip label={t('alerts.card.detailsTip')} className="ml-auto">
                <button
                  type="button"
                  onClick={() => onOpenDetail(a)}
                  aria-label={t('alerts.card.detailsAria', { name: head })}
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
              <Tooltip label={t('alerts.card.periodEndedTip', { date: dateLabel(a.periodEnd) })}>
                <span className="cursor-default" tabIndex={0}>{rel}</span>
              </Tooltip>
            )}
            <span>
              {t('alerts.card.observed')} <span className="text-ink font-medium">{fmtInt(a.observed)}</span>
              {' '}{t('alerts.card.vsExpected')} <span className="text-ink font-medium">{fmtInt(a.expected)}</span>
            </span>
            {!acked && !snoozed && sla && <SlaBadge sla={sla} severity={a.severity} />}
          </div>

          {stations?.names?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted">
                {stations.scope === 'district' ? t('alerts.card.stationsInDistrict') : t('alerts.card.affectedStation')}
              </span>
              {stations.names.map((n) => (
                <span key={n} className="chip !py-0.5 !text-[11px]">{n}</span>
              ))}
              {stations.more > 0 && (
                <span className="chip !py-0.5 !text-[11px] text-muted">{t('alerts.card.moreStations', { n: stations.more })}</span>
              )}
            </div>
          )}
        </div>

        <div className="w-full md:w-60 shrink-0 flex flex-col gap-2">
          <Sparkline alert={a} height={72} />
          <p className="text-[10px] text-muted leading-tight">
            {t('alerts.spark.legend')}
          </p>
          <MiniCompareBar observed={a.observed} expected={a.expected} zScore={a.zScore} />
          <div className="flex items-center gap-2">
            {a.districtId && (
              <Link
                className={`btn ${actionBtn}`}
                to={`/map?districtId=${encodeURIComponent(a.districtId)}`}
                onClick={() => onRead?.(a.alertId)}
              >
                {t('alerts.card.viewOnMap')}
              </Link>
            )}
            {acked ? (
              <Badge tone="teal" className="flex-1 justify-center py-1">{t('alerts.card.acknowledged')}</Badge>
            ) : (
              <button
                type="button"
                className={`btn-primary ${actionBtn}`}
                disabled={ackPending}
                onClick={() => { onRead?.(a.alertId); onAck(a.alertId); }}
              >
                {ackPending ? t('alerts.card.acknowledging') : t('alerts.card.acknowledge')}
              </button>
            )}
          </div>
          {(onCopy || drill || (!acked && (onSnooze || onUnsnooze || onDismiss))) && (
            <div className="flex items-center gap-2">
              {onCopy && (
                <button type="button" className={`btn ${actionBtn}`} onClick={() => onCopy(a)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" />
                  </svg>
                  {t('common.action.copy')}
                </button>
              )}
              {drill && (
                <Link
                  className={`btn ${actionBtn}`}
                  to={drill}
                  title={t('alerts.card.casesTip')}
                  onClick={() => onRead?.(a.alertId)}
                >
                  {t('alerts.card.cases')}
                </Link>
              )}
              {!acked && onDismiss && (
                <button
                  type="button"
                  className={`btn ${actionBtn}`}
                  title={t('alerts.card.dismissTip')}
                  onClick={() => onDismiss(a.alertId)}
                >
                  {t('alerts.card.dismiss')}
                </button>
              )}
              {!acked && (snoozed ? (
                onUnsnooze && (
                  <button type="button" className={`btn ${actionBtn}`} onClick={() => onUnsnooze(a.alertId)}>
                    {t('alerts.card.unsnooze')}
                  </button>
                )
              ) : (
                onSnooze && (
                  <button type="button" className={`btn ${actionBtn}`} onClick={() => onSnooze(a.alertId)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M5 3 2.5 5.5M19 3l2.5 2.5" />
                    </svg>
                    {t('alerts.card.snooze24')}
                  </button>
                )
              ))}
            </div>
          )}
          {ackError && <p className="text-[11px] text-signal" role="alert">{t('alerts.card.ackError')}</p>}
        </div>
      </div>
    </Card>
  );
}
