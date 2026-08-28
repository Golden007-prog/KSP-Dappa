// "What changed" — backlog row 214. KPIs before/after the batch (the same
// AggMonthly aggregates /summary/kpis reads) and the district × crime-head
// months whose robust z would cross the alert line. Plain sentence first;
// the statistic sits behind the (i) (PlainSentence → lib/plainlanguage.js
// 'ingestDelta').
import Card from '../../components/Card.jsx';
import KpiTile from '../../components/KpiTile.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import PlainSentence from '../../components/PlainSentence.jsx';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtPct, monthLabel } from '../../lib/format.js';

export default function WhatChangedCard({ changed, projected = false, className = '' }) {
  const t = useT();
  const tName = useNames();
  if (!changed) return null;
  if (!changed.applicable) {
    return (
      <Card title={t('ingest.changed.title')} className={className}>
        <p className="text-sm text-muted">{changed.note || t('ingest.changed.notApplicable')}</p>
      </Card>
    );
  }
  const { before, after, delta } = changed.kpis;
  const months = (changed.byMonth || []).map((m) => `${monthLabel(m.ym)} +${fmtInt(m.cases)}`).join(' · ');
  const batch = changed.batch || { rows: delta.totalFirs, month: changed.asOfYm, months: 1 };
  const otherMonth = batch.month && batch.month !== changed.asOfYm;
  const rows = (changed.alerts || []).map((a) => ({
    where: `${tName('district', a.districtId, a.districtName)} · ${tName('crimeHead', a.crimeHeadId, a.headName)}`,
    month: monthLabel(a.ym),
    before: a.observedBefore,
    added: a.added,
    after: a.observedAfter,
    zBefore: a.zBefore,
    zAfter: a.zAfter,
    status: a.status,
    wouldRaise: a.wouldRaise,
  }));
  return (
    <Card
      title={t('ingest.changed.title')}
      subtitle={projected ? t('ingest.changed.projected') : t('ingest.changed.final')}
      className={className}
    >
      <PlainSentence term="ingestDelta" vars={{ n: fmtInt(batch.rows), month: monthLabel(batch.month || changed.asOfYm), k: fmtInt(changed.wouldRaise) }} className="mb-3" />
      {otherMonth && <p className="mb-3 text-xs text-amber">{t('ingest.changed.otherMonth', { month: monthLabel(batch.month), asOf: monthLabel(changed.asOfYm) })}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiTile label={t('ingest.changed.firs')} value={`${fmtInt(before.totalFirs)} → ${fmtInt(after.totalFirs)}`} hint={`${t('ingest.changed.delta')} ${delta.totalFirs >= 0 ? '+' : ''}${fmtInt(delta.totalFirs)}`} accent="amber" />
        <KpiTile label={t('ingest.changed.heinous')} value={`${fmtInt(before.heinousCount)} → ${fmtInt(after.heinousCount)}`} hint={`${t('ingest.changed.delta')} ${delta.heinousCount >= 0 ? '+' : ''}${fmtInt(delta.heinousCount)}`} accent="red" />
        <KpiTile label={t('ingest.changed.mom')} value={`${fmtPct(before.momPct, { sign: true })} → ${fmtPct(after.momPct, { sign: true })}`} hint={t('ingest.changed.momHint', { month: monthLabel(changed.asOfYm) })} accent="teal" />
        <KpiTile label={t('ingest.changed.alerts')} value={`${fmtInt(before.activeAlerts)} → ${fmtInt(before.activeAlerts + changed.wouldRaise)}`} hint={t('ingest.changed.alertsHint', { k: changed.wouldRaise })} accent={changed.wouldRaise ? 'red' : 'teal'} pulse={changed.wouldRaise > 0} />
      </div>
      {months && <p className="mt-2 text-xs text-muted">{t('ingest.changed.byMonth')}: <span className="num">{months}</span></p>}
      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-grid">
          <table className="w-full text-xs min-w-[560px]">
            <caption className="sr-only">{t('ingest.changed.tableTitle')}</caption>
            <thead className="bg-panel-raised text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-2 py-2 text-left">{t('ingest.changed.colWhere')}</th>
                <th scope="col" className="px-2 py-2 text-left">{t('ingest.changed.colMonth')}</th>
                <th scope="col" className="px-2 py-2 text-right">{t('ingest.changed.colBefore')}</th>
                <th scope="col" className="px-2 py-2 text-right">{t('ingest.changed.colAdded')}</th>
                <th scope="col" className="px-2 py-2 text-right">{t('ingest.changed.colAfter')}</th>
                <th scope="col" className="px-2 py-2 text-right">z {t('ingest.changed.colBefore').toLowerCase()}</th>
                <th scope="col" className="px-2 py-2 text-right">z {t('ingest.changed.colAfter').toLowerCase()}</th>
                <th scope="col" className="px-2 py-2 text-left">{t('ingest.changed.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-grid/60">
                  <th scope="row" className="px-2 py-1.5 text-left font-normal text-ink">{r.where}</th>
                  <td className="px-2 py-1.5 num">{r.month}</td>
                  <td className="px-2 py-1.5 num text-right">{fmtInt(r.before)}</td>
                  <td className="px-2 py-1.5 num text-right">+{fmtInt(r.added)}</td>
                  <td className="px-2 py-1.5 num text-right">{fmtInt(r.after)}</td>
                  <td className="px-2 py-1.5 num text-right">{r.zBefore === null ? '—' : r.zBefore.toFixed(2)}</td>
                  <td className="px-2 py-1.5 num text-right">{r.zAfter === null ? '—' : r.zAfter.toFixed(2)}</td>
                  <td className="px-2 py-1.5"><StatusPill status={r.status} label={r.wouldRaise ? t('ingest.changed.wouldRaise') : undefined} pulse={r.wouldRaise} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">{t('ingest.changed.method')}</p>
    </Card>
  );
}
