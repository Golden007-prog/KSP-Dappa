// Alert detail sheet — the full picture for one anomaly in a bottom sheet
// (opened from feed cards, board cards, or the `o` shortcut).
//
// Three layers, in the order an investigator reads them:
//   1. WHAT — severity, z, SLA, the observed-vs-expected bars and sparkline.
//   2. WHY IT FIRED — the real 12-month AggMonthly series with its robust
//      baseline (GET /alerts/:id), and a decomposition of the deviation itself
//      (recovered σ, expected ±2σ band, approximate rarity, detection lag).
//   3. WHY HERE — the district's socio-economic profile normalised to cases per
//      lakh, so a spike in an 11-million-person city is not read like a spike
//      in a rural district.
// Then casework: note, owner, audit trail, every triage action, the
// alert-to-case drill and a "similar alerts" list that jumps in place.
import { Link } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import Sparkline from './Sparkline.jsx';
import ZGauge from './ZGauge.jsx';
import MiniCompareBar from './MiniCompareBar.jsx';
import SlaBadge from './SlaBadge.jsx';
import AlertContextChart from './AlertContextChart.jsx';
import ExplainPanel from './ExplainPanel.jsx';
import SocioContext from './SocioContext.jsx';
import TriageNotes from './TriageNotes.jsx';
import { caseDrillHref } from './links.js';
import { fmtNum, dateLabel } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { sevKey, SEV_TONE, direction, statusKey } from './severity.js';

const BTN = 'btn !text-xs flex-1 justify-center min-h-[44px]';

export default function AlertDetailSheet({
  alert: a, onClose, sla, stations, acked, snoozedUntil,
  onAck, ackPending, onSnooze, onUnsnooze, onCopy, similar = [], onJump,
  // New (all optional — omitting them renders the previous sheet).
  detail, socio, meta, owners = [], onNote, onOwner, onDismiss, onReopen,
}) {
  const t = useT();
  const tName = useNames();
  if (!a) return null;
  const sev = sevKey(a.severity) || 'medium';
  const dir = direction(a);
  const state = statusKey(a.status);
  const snoozed = Number(snoozedUntil) > Date.now();
  const drill = caseDrillHref(a);
  const head = tName('crimeHeads', a.crimeHeadId, a.headName) || t('alerts.anomaly');
  const district = tName('districts', a.districtId, a.districtName || a.districtId)
    || t('alerts.unknownDistrict');
  const createdAt = detail?.data?.createdAt || a.createdAt;

  return (
    <Sheet
      open={!!a}
      onClose={onClose}
      title={`${head} — ${district}`}
    >
      <div className="space-y-4 px-1 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={acked || snoozed ? 'slate' : (SEV_TONE[sev] || 'neutral')} pulse={!acked && !snoozed}>{t(`alerts.sevLower.${sev}`)}</Badge>
          <Badge tone="slate" className="num">{t('alerts.card.z')} {fmtNum(a.zScore, 1)}</Badge>
          {dir && (
            <Badge tone={acked || snoozed ? 'slate' : (dir === 'up' ? 'red' : 'teal')}>
              {t(dir === 'up' ? 'alerts.dir.up' : 'alerts.dir.down')}
            </Badge>
          )}
          {state !== 'open' && <Badge tone="slate">{t(`alerts.status.${state}`)}</Badge>}
          {acked ? <Badge tone="teal">{t('alerts.card.acknowledged')}</Badge>
            : snoozed ? <Badge tone="slate">{t('alerts.detail.snoozed')}</Badge>
              : sla && <SlaBadge sla={sla} severity={a.severity} />}
        </div>

        <div className="grid grid-cols-2 items-center gap-3">
          <ZGauge z={a.zScore} />
          <MiniCompareBar observed={a.observed} expected={a.expected} zScore={a.zScore} />
        </div>

        <div>
          <Sparkline alert={a} height={72} />
          <p className="mt-1 text-[10px] leading-tight text-muted">
            {t('alerts.spark.legend')}
          </p>
        </div>

        {detail && <AlertContextChart query={detail} alertYm={String(a.periodStart || '').slice(0, 7)} />}

        <ExplainPanel alert={a} createdAt={createdAt} />

        {socio && <SocioContext query={socio} alert={a} />}

        {a.narrative && <p className="text-xs leading-relaxed text-muted">{a.narrative}</p>}

        <p className="num text-[11px] text-muted">
          {dateLabel(a.periodStart)} → {dateLabel(a.periodEnd)}
        </p>

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

        <div className="flex items-center gap-2">
          {acked ? (
            <Badge tone="teal" className="flex-1 justify-center py-1.5">{t('alerts.card.acknowledged')}</Badge>
          ) : (
            <button type="button" className={`btn-primary ${BTN}`} disabled={ackPending} onClick={() => onAck(a.alertId)}>
              {ackPending ? t('alerts.card.acknowledging') : t('alerts.card.acknowledge')}
            </button>
          )}
          {!acked && (snoozed ? (
            <button type="button" className={BTN} onClick={() => onUnsnooze(a.alertId)}>{t('alerts.card.unsnooze')}</button>
          ) : (
            <button type="button" className={BTN} onClick={() => onSnooze(a.alertId)}>{t('alerts.card.snooze24')}</button>
          ))}
        </div>
        {(onDismiss || onReopen) && (
          <div className="flex items-center gap-2">
            {onDismiss && state !== 'dismissed' && (
              <Tooltip label={t('alerts.card.dismissTip')} className="flex-1">
                <button type="button" className={`${BTN} w-full`} onClick={() => onDismiss(a.alertId)}>
                  {t('alerts.card.dismiss')}
                </button>
              </Tooltip>
            )}
            {onReopen && state !== 'open' && (
              <Tooltip label={t('alerts.card.reopenTip')} className="flex-1">
                <button type="button" className={`${BTN} w-full`} onClick={() => onReopen(a.alertId)}>
                  {t('alerts.card.reopen')}
                </button>
              </Tooltip>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          {a.districtId && (
            <Link className={BTN} to={`/map?districtId=${encodeURIComponent(a.districtId)}`}>{t('alerts.card.viewOnMap')}</Link>
          )}
          {drill && (
            <Link className={BTN} to={drill} title={t('alerts.card.casesTip')}>
              {t('alerts.detail.openCases')}
            </Link>
          )}
          <button type="button" className={BTN} onClick={() => onCopy(a)}>{t('common.action.copy')}</button>
        </div>

        {meta && (
          <TriageNotes
            alertId={a.alertId}
            meta={meta}
            owners={owners}
            onNote={onNote}
            onOwner={onOwner}
          />
        )}

        {similar.length > 0 && (
          <div className="space-y-1.5 border-t border-grid/60 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t('alerts.detail.similar')}
            </p>
            {similar.map((s) => {
              const key = sevKey(s.severity);
              return (
                <button
                  key={String(s.alertId)}
                  type="button"
                  onClick={() => onJump(s)}
                  className="flex w-full min-h-[44px] items-center gap-2 rounded-lg border border-grid px-2.5 py-1.5 text-left transition-colors hover:border-primary/50"
                >
                  <Badge tone={SEV_TONE[key] || 'neutral'}>
                    {t(key ? `alerts.sevLower.${key}` : 'alerts.sevLower.none')}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">
                    {tName('crimeHeads', s.crimeHeadId, s.headName) || t('alerts.anomaly')}
                    {' — '}
                    {tName('districts', s.districtId, s.districtName || s.districtId) || t('alerts.unknownDistrict')}
                  </span>
                  <span className="num shrink-0 text-[11px] text-muted">{t('alerts.card.z')} {fmtNum(s.zScore, 1)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}
