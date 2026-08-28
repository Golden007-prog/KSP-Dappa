// /alerts — "What happened to past alerts": the evaluation that predictive
// policing vendors never published, computed from DAPPA's own action record
// (GET /alerts/outcomes). Plain sentence first, the statistic behind the (i):
//   · alert precision (true_positive ÷ labelled) with a 95 % Wilson interval,
//     overall and per severity / crime head;
//   · time-to-acknowledge distribution and median;
//   · outcome mix and dismissal reasons;
//   · the open alerts nobody has touched, past their triage window or not;
//   · labels-for-learning: how many labels exist and what a retrain would
//     need — never a claim of online learning.
//
// Exported for the tier homes: `<OutcomePanel unit={unitId} compact />` mounts
// the same panel scoped to one unit or district (see docs/round2/decisions-
// phase7.md for the station-tier mount).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import PlainSentence from '../../components/PlainSentence.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { statusFromZ } from '../../lib/status.js';
import { useOutcomes, OUTCOME_LABELS, DISMISS_REASONS } from './actionsApi.js';

const WINDOWS = ['all', 'last30', 'last90', 'last365'];
const SEV_STATUS = { critical: 'rising', high: 'rising', medium: 'watch', low: 'stable' };

function pct100(v) {
  return v === null || v === undefined ? '—' : String(Math.round(Number(v) * 100));
}

function Stat({ label, value, tone = '' }) {
  return (
    <div className="rounded-lg border border-grid/60 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`num text-lg font-semibold ${tone || 'text-ink'}`}>{value}</p>
    </div>
  );
}

function Bars({ items, total, labelOf }) {
  return (
    <ul className="space-y-1" aria-label="distribution">
      {items.map(([k, n]) => (
        <li key={k} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-muted">{labelOf(k)}</span>
          <span className="relative h-3 flex-1 overflow-hidden rounded bg-grid/40" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded bg-primary/70 print:bg-black" style={{ width: `${total ? Math.round((n / total) * 100) : 0}%` }} />
          </span>
          <span className="num w-8 shrink-0 text-right text-ink">{fmtInt(n)}</span>
        </li>
      ))}
    </ul>
  );
}

function GroupTable({ title, rows, t }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      <table className="w-full min-w-[34rem] border-collapse text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
            <th className="py-1 pr-2 font-medium">{t('actions.panel.col.group')}</th>
            <th className="py-1 pr-2 text-right font-medium">{t('actions.panel.col.alerts')}</th>
            <th className="py-1 pr-2 text-right font-medium">{t('actions.panel.col.ack')}</th>
            <th className="py-1 pr-2 text-right font-medium">{t('actions.panel.col.assigned')}</th>
            <th className="py-1 pr-2 text-right font-medium">{t('actions.panel.col.escalated')}</th>
            <th className="py-1 pr-2 text-right font-medium">{t('actions.panel.col.dismissed')}</th>
            <th className="py-1 pr-2 text-right font-medium">{t('actions.panel.col.tta')}</th>
            <th className="py-1 pr-2 text-right font-medium">{t('actions.panel.col.precision')}</th>
            <th className="py-1 text-right font-medium">{t('actions.panel.col.stale')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key} className="border-t border-grid/50">
              <td className="py-1 pr-2 text-ink">{g.status ? <StatusPill status={g.status} label={g.name} /> : g.name}</td>
              <td className="num py-1 pr-2 text-right">{fmtInt(g.alerts)}</td>
              <td className="num py-1 pr-2 text-right">{fmtInt(g.acknowledged)}</td>
              <td className="num py-1 pr-2 text-right">{fmtInt(g.assigned)}</td>
              <td className="num py-1 pr-2 text-right">{fmtInt(g.escalated)}</td>
              <td className="num py-1 pr-2 text-right">{fmtInt(g.dismissed)}</td>
              <td className="num py-1 pr-2 text-right">{g.medianTimeToAckHours === null ? '—' : fmtNum(g.medianTimeToAckHours, 1)}</td>
              <td className="num py-1 pr-2 text-right">{g.labelled ? `${fmtInt(g.truePositive)} / ${fmtInt(g.labelled)}` : '—'}</td>
              <td className="num py-1 text-right">{fmtInt(g.stale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OutcomePanel({ unit, compact = false, className = '' }) {
  const t = useT();
  const tName = useNames();
  const [window, setWindow] = useState('all');
  const q = useOutcomes({ window, unit: unit || undefined });
  const d = q.data;
  const o = d?.overall || {};
  const source = d?.meta?.storage || 'memory';

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        size="sm"
        ariaLabel={t('actions.panel.window')}
        value={window}
        onChange={setWindow}
        options={WINDOWS.map((w) => ({ value: w, label: t(`actions.panel.window.${w}`) }))}
      />
      <Link to={`/alerts/digest${unit ? `?unit=${encodeURIComponent(unit)}` : ''}`} className="btn !text-xs min-h-[36px]">{t('actions.panel.digestLink')}</Link>
    </div>
  );

  return (
    <Card title={t('actions.panel.title')} subtitle={t('actions.panel.subtitle')} actions={header} className={className}>
      {q.isLoading ? (
        <LoadingSkeleton lines={5} />
      ) : q.error ? (
        <EmptyState compact title={t('actions.panel.error')} message={q.error.message} action={<button type="button" className="btn" onClick={() => q.refetch()}>{t('common.action.retry')}</button>} />
      ) : !d || !d.alertsInWindow ? (
        <EmptyState compact title={t('actions.panel.empty')} />
      ) : (
        <div className="space-y-4" data-readable="true">
          <p className="text-[11px] italic leading-snug text-muted">{t('actions.framing')}</p>

          {o.labelled ? (
            <PlainSentence
              term="precision"
              vars={{ tp: fmtInt(o.truePositive), n: fmtInt(o.labelled), pct: pct100(o.precision), lo: pct100(o.precisionInterval?.lo), hi: pct100(o.precisionInterval?.hi) }}
            />
          ) : (
            <p className="text-[13px] leading-snug text-ink">{t('actions.panel.precision.none')}</p>
          )}
          {o.medianTimeToAckHours !== null && o.medianTimeToAckHours !== undefined && (
            <PlainSentence term="timeToAck" vars={{ h: fmtNum(o.medianTimeToAckHours, 1) }} />
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t('actions.panel.stat.alerts')} value={fmtInt(d.alertsInWindow)} />
            <Stat label={t('actions.panel.stat.acknowledged')} value={fmtInt(o.acknowledged)} tone="text-teal" />
            <Stat label={t('actions.panel.stat.escalated')} value={fmtInt(o.escalated)} tone="text-amber" />
            <Stat label={t('actions.panel.stat.dismissed')} value={fmtInt(o.dismissed)} />
            <Stat label={t('actions.panel.stat.untouched')} value={fmtInt(o.untouched)} tone={o.untouched ? 'text-signal' : 'text-ink'} />
            <Stat label={t('actions.panel.stat.stale')} value={fmtInt(o.stale)} tone={o.stale ? 'text-signal' : 'text-ink'} />
            <Stat label={t('actions.panel.stat.assigned')} value={fmtInt(o.assigned)} />
            <Stat label={t('actions.panel.stat.medianTta')} value={o.medianTimeToAckHours === null ? '—' : t('actions.panel.hours', { h: fmtNum(o.medianTimeToAckHours, 1) })} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('actions.panel.tta.title')}</p>
              {d.timeToAck.n ? (
                <Bars
                  items={d.timeToAck.bucketOrder.map((k) => [k, d.timeToAck.buckets[k] || 0])}
                  total={d.timeToAck.n}
                  labelOf={(k) => t(`actions.panel.tta.${k}`)}
                />
              ) : <p className="text-xs text-muted">{t('actions.panel.tta.none')}</p>}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('actions.panel.mix.title')}</p>
              {o.labelled ? (
                <Bars items={OUTCOME_LABELS.map((k) => [k, o.outcomes?.[k] || 0])} total={o.labelled} labelOf={(k) => t(`actions.outcome.${k}`)} />
              ) : <p className="text-xs text-muted">{t('actions.panel.mix.none')}</p>}
            </div>
          </div>

          {!compact && (
            <>
              <GroupTable
                title={t('actions.panel.bySeverity.title')}
                t={t}
                rows={d.bySeverity.map((g) => ({ ...g, key: g.label, name: t(`alerts.sev.${g.label}`), status: SEV_STATUS[g.label] || 'nodata' }))}
              />
              <GroupTable
                title={t('actions.panel.byHead.title')}
                t={t}
                rows={d.byHead.map((g) => ({ ...g, key: String(g.crimeHeadId), name: tName('crimeHeads', g.crimeHeadId, g.label) || g.label }))}
              />
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('actions.panel.reasons.title')}</p>
                {o.dismissed ? (
                  <Bars items={DISMISS_REASONS.map((k) => [k, d.dismissReasons[k] || 0])} total={Object.values(d.dismissReasons).reduce((s, n) => s + n, 0) || 1} labelOf={(k) => t(`actions.reason.short.${k}`)} />
                ) : <p className="text-xs text-muted">{t('actions.panel.reasons.none')}</p>}
              </div>
            </>
          )}

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('actions.panel.untouched.title')}</p>
            {d.untouched.length === 0 ? (
              <p className="text-xs text-muted">{t('actions.panel.untouched.empty')}</p>
            ) : (
              <ul className="space-y-1">
                {d.untouched.slice(0, compact ? 4 : 10).map((u) => (
                  <li key={u.alertId}>
                    <Link to={`/alerts?q=${encodeURIComponent(u.alertId)}`} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-grid/60 px-2 text-xs hover:border-primary/50 sm:min-h-[36px]">
                      <StatusPill status={statusFromZ(u.zScore)} label={t(`alerts.sevLower.${u.severityWord}`)} />
                      <span className="min-w-0 flex-1 truncate text-ink">
                        {u.alertId} · {tName('crimeHeads', null, u.headName) || u.headName || ''} — {tName('districts', u.districtId, u.districtName || u.districtId) || ''}
                      </span>
                      <span className={`num shrink-0 text-[11px] ${u.pastSla ? 'text-signal' : 'text-muted'}`}>
                        {t('actions.panel.untouched.age', { d: fmtNum(u.ageHours / 24, 1), h: u.slaHours })}
                      </span>
                    </Link>
                  </li>
                ))}
                {d.untouchedTotal > (compact ? 4 : 10) && (
                  <li className="text-[11px] text-muted">{t('actions.panel.untouched.more', { n: fmtInt(d.untouchedTotal - (compact ? 4 : 10)) })}</li>
                )}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-grid/60 bg-base/40 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('actions.panel.labels.title')}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink">
              {t('actions.panel.labels.sentence', { n: fmtInt(d.labels.labelled), min: d.labels.minimumPerClass, total: d.labels.minimumTotal })}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {d.labels.enoughToEvaluate
                ? t('actions.panel.labels.enough')
                : t('actions.panel.labels.short', {
                  list: OUTCOME_LABELS.filter((k) => (d.labels.shortfall?.[k] || 0) > 0).map((k) => `${t(`actions.outcome.${k}`)} +${d.labels.shortfall[k]}`).join(' · '),
                })}
            </p>
          </div>

          <p className="text-[10px] text-muted/80">{t('actions.panel.source', { source: t(`actions.timeline.source.${source}`) })}</p>
        </div>
      )}
    </Card>
  );
}
