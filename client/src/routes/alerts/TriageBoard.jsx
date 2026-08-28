// Triage board — kanban-style status lanes (Open / Snoozed / Acknowledged).
// Lane headers carry counts plus a critical/high severity breakdown; compact
// cards open the detail sheet on tap and move between lanes via their inline
// actions (Ack / Snooze / Unsnooze). Lanes respect the feed's filters + sort.
// Mobile: lanes stack full-width; md+: three columns with per-lane scroll.
import Badge from '../../components/Badge.jsx';
import SlaBadge from './SlaBadge.jsx';
import { fmtNum } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { sevKey, SEV_TONE } from './severity.js';

const laneBreakdown = (items) => {
  let crit = 0;
  let high = 0;
  for (const a of items) {
    const sev = sevKey(a.severity);
    if (sev === 'critical') crit += 1;
    else if (sev === 'high') high += 1;
  }
  return { crit, high };
};

function BoardCard({ alert: a, lane, unread, sla, onOpen, onRead, onAck, ackPending, onSnooze, onUnsnooze }) {
  const t = useT();
  const tName = useNames();
  const sev = sevKey(a.severity) || 'medium';
  const head = tName('crimeHeads', a.crimeHeadId, a.headName) || t('alerts.anomaly');
  const district = tName('districts', a.districtId, a.districtName || a.districtId)
    || t('alerts.unknownDistrict');
  const open = () => { onRead?.(a.alertId); onOpen(a); };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      aria-label={t('alerts.board.cardAria', { head, district })}
      className={`group cursor-pointer rounded-lg border bg-panel p-2.5 shadow-card outline-none transition-colors
        hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/60 ${
        lane === 'open' && (sev === 'critical' || sev === 'high') ? 'border-signal/40' : 'border-grid'
      } ${lane !== 'open' ? 'opacity-80' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <Badge tone={lane === 'open' ? (SEV_TONE[sev] || 'neutral') : 'slate'}>{t(`alerts.sevLower.${sev}`)}</Badge>
        <Badge tone="slate" className="num">{t('alerts.card.z')} {fmtNum(a.zScore, 1)}</Badge>
        {unread && lane === 'open' && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" aria-label={t('alerts.board.unread')} />
        )}
      </div>
      <p className="mt-1.5 truncate text-xs font-semibold text-ink">{head}</p>
      <p className="truncate text-[11px] text-muted">{district}</p>
      {lane === 'open' && sla && <SlaBadge sla={sla} severity={a.severity} className="mt-1.5" />}
      <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {lane === 'open' && (
          <>
            <button
              type="button"
              className="btn !px-2 !py-1 !text-[11px] flex-1 justify-center min-h-[40px] sm:min-h-[26px]"
              disabled={ackPending}
              onClick={() => { onRead?.(a.alertId); onAck(a.alertId); }}
            >
              {ackPending ? t('alerts.board.acking') : t('alerts.board.ack')}
            </button>
            <button
              type="button"
              className="btn !px-2 !py-1 !text-[11px] flex-1 justify-center min-h-[40px] sm:min-h-[26px]"
              onClick={() => onSnooze(a.alertId)}
            >
              {t('alerts.board.snooze')}
            </button>
          </>
        )}
        {lane === 'snoozed' && (
          <button
            type="button"
            className="btn !px-2 !py-1 !text-[11px] flex-1 justify-center min-h-[40px] sm:min-h-[26px]"
            onClick={() => onUnsnooze(a.alertId)}
          >
            {t('alerts.board.unsnooze')}
          </button>
        )}
        {lane === 'acked' && <Badge tone="teal" className="flex-1 justify-center">{t('alerts.board.acknowledged')}</Badge>}
      </div>
    </div>
  );
}

export default function TriageBoard({
  open, snoozed, acked, readIds, slaOf,
  onOpen, onRead, onAck, ackPendingId, onSnooze, onUnsnooze,
}) {
  const t = useT();
  const lanes = [
    { key: 'open', title: t('alerts.board.lane.open'), hint: t('alerts.board.lane.openHint'), items: open },
    { key: 'snoozed', title: t('alerts.board.lane.snoozed'), hint: t('alerts.board.lane.snoozedHint'), items: snoozed },
    { key: 'acked', title: t('alerts.board.lane.acked'), hint: t('alerts.board.lane.ackedHint'), items: acked },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3" role="group" aria-label={t('alerts.board.aria')}>
      {lanes.map((lane) => {
        const { crit, high } = laneBreakdown(lane.items);
        return (
          <section
            key={lane.key}
            aria-label={t('alerts.board.laneAria', { lane: lane.title, n: lane.items.length })}
            className="flex min-w-0 flex-col rounded-xl border border-grid bg-canvas/40"
          >
            <header className="flex items-center gap-2 border-b border-grid/60 px-3 py-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink">{lane.title}</h2>
              <Badge tone="slate" className="num">{lane.items.length}</Badge>
              {crit > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-signal num">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />{t('alerts.board.crit', { n: crit })}
                </span>
              )}
              {high > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber num">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />{t('alerts.board.high', { n: high })}
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted">{lane.hint}</span>
            </header>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto overscroll-contain p-2 md:max-h-[65vh]">
              {lane.items.length === 0 && (
                <p className="px-1 py-3 text-center text-[11px] text-muted">{t('alerts.board.empty')}</p>
              )}
              {lane.items.map((a) => (
                <BoardCard
                  key={String(a.alertId)}
                  alert={a}
                  lane={lane.key}
                  unread={!readIds.has(String(a.alertId))}
                  sla={lane.key === 'open' ? slaOf(a) : null}
                  onOpen={onOpen}
                  onRead={onRead}
                  onAck={onAck}
                  ackPending={String(ackPendingId) === String(a.alertId)}
                  onSnooze={onSnooze}
                  onUnsnooze={onUnsnooze}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
