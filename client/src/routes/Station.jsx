// /station — the SHO's console (SI / Inspector). Three questions above the
// fold, then: this week's registrations by crime head against the usual level
// with the Crime Review's month-vs-month triad beside it, the needs-action
// alerts with SLA clocks, a possible-series scan scoped to the unit, the
// 8-week unit sparkline against the district median (with its table for
// print and screen readers), undetected property cases older than 30 days
// (the CCS-17 "UN" lens) and the officers' caseload. Every control is 44 px.
// Data: GET /tiers/station (lib/tierApi.js useStationHome). Backlog rows 3,
// 9, 20, 21, 30, 36, 39, 42, 43, 47, 55.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card.jsx';
import StatusPill from '../components/StatusPill.jsx';
import ProvenanceStamp from '../components/ProvenanceStamp.jsx';
import PlainSentence from '../components/PlainSentence.jsx';
import ChartTable from '../components/ChartTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useStationHome } from '../lib/tierApi.js';
import { useTierStore } from '../lib/tier.js';
import { usePlain } from '../lib/plainlanguage.js';
import { useI18n } from '../lib/i18n.jsx';
import { fmtInt, fmtNum, fmtPct, dateLabel } from '../lib/format.js';
import { Question, TierHeader, UnitPicker, PanelState, todayLabel, alertSla, ageLabel, useTierRoute } from './tiers/bits.jsx';
import DismissSheet from './tiers/DismissSheet.jsx';
import TierPrintStyles from './tiers/tierPrint.jsx';
import { recordDecision } from './tiers/actionLog.js';

/** Two-line sparkline (unit vs district median) — pure SVG, no dependency. */
function SparkCompare({ unit = [], median = [], labels = [] }) {
  const w = 320;
  const h = 96;
  const pad = 6;
  const all = unit.concat(median.filter((v) => v !== null)).map(Number).filter(Number.isFinite);
  const max = Math.max(1, ...all);
  const x = (i, n) => pad + (i * (w - 2 * pad)) / Math.max(1, n - 1);
  const y = (v) => h - pad - ((Number(v) || 0) / max) * (h - 2 * pad);
  const pts = (arr) => arr.map((v, i) => (v === null ? null : `${x(i, arr.length).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true" className="block">
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={pad} x2={w - pad} y1={(h - pad) - f * (h - 2 * pad)} y2={(h - pad) - f * (h - 2 * pad)} className="stroke-grid" strokeWidth="1" />)}
      <polyline points={pts(median)} fill="none" className="stroke-muted" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />
      <polyline points={pts(unit)} fill="none" className="stroke-primary" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {unit.map((v, i) => <circle key={i} cx={x(i, unit.length)} cy={y(v)} r={i === unit.length - 1 ? 3.5 : 2} className="fill-primary" />)}
    </svg>
  );
}

/** First / middle / last week labels as HTML (SVG text would stretch with the
 * preserveAspectRatio="none" line above). */
function SparkAxis({ labels = [] }) {
  if (labels.length < 2) return null;
  const mid = labels[Math.floor(labels.length / 2)];
  return (
    <div className="num flex justify-between text-[10px] text-muted" aria-hidden="true">
      <span>{labels[0]}</span><span>{mid}</span><span>{labels[labels.length - 1]}</span>
    </div>
  );
}

export default function Station() {
  const { t, lang, tName } = useI18n();
  const { fmt } = usePlain();
  const toast = useToast();
  const tier = useTierStore((s) => s.tier);
  useTierRoute('station'); // arriving from the sidebar must switch the app into station wording
  const [searchParams, setSearchParams] = useSearchParams();
  const unitId = searchParams.get('unitId') || '';
  const q = useStationHome(unitId ? { unitId } : {});
  const [dismissOpen, setDismissOpen] = useState(false);
  const d = q.data || null;
  const unitName = d ? tName('units', d.unit?.unitId, d.unit?.unitName) || d.unit?.unitName || '' : '';
  const topAlert = (d?.alerts || [])[0] || null;
  const risingHeads = (d?.weekByHead || []).filter((r) => r.statusWord === 'rising' || r.statusWord === 'watch');

  const sparkTable = useMemo(() => {
    if (!d) return null;
    return {
      columns: [t('tier.station.spark.colWeek'), t('tier.station.spark.unit'), t('tier.station.spark.median')],
      rows: d.spark8w.weeks.map((w, i) => [`${dateLabel(w.from)} → ${dateLabel(w.to)}`, d.spark8w.unit[i] ?? 0, d.spark8w.districtMedian[i] ?? '—']),
    };
  }, [d, t]);

  const chooseUnit = (v) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set('unitId', v); else next.delete('unitId');
      return next;
    });
  };

  const record = async (actionType, note) => {
    const rec = await recordDecision({ alertKey: topAlert?.alertId || null, actionType, note, unit: d?.unit?.unitId, tier });
    toast[rec.source === 'api' ? 'success' : 'info'](rec.source === 'api' ? t('tier.beat.dismiss.saved', { when: dateLabel(rec.ts), reason: rec.note }) : t('tier.beat.dismiss.local'));
    return rec;
  };

  const weekSentence = !d ? '' : d.week.total === 0
    ? t('tier.station.week.none', { usual: fmtNum(d.week.usualPerWeek, 0) })
    : t(`tier.station.week.sentence${d.week.total === 1 ? '.one' : ''}`, { n: fmtInt(d.week.total), usual: fmtNum(d.week.usualPerWeek, 0), phrase: fmt('zscore', d.week.swings) });

  return (
    <div id="station-home" className="tier-home space-y-4" data-tier-home="station">
      <TierPrintStyles tier="station" />
      <TierHeader
        eyebrow={`${t('tier.eyebrow.station')} · ${todayLabel(lang)}`}
        title={d ? t('tier.station.title', { unit: unitName }) : t('tier.nav.station')}
        sub={d ? `${tName('districts', d.unit?.districtId, d.unit?.districtName)} · ${t('tier.prov.asOn', { date: dateLabel(d.asOf) })}` : ''}
        readTarget="station-home"
        onPrint={() => window.print()}
        printLabel={t('tier.station.print')}
      >
        <UnitPicker value={unitId} onChange={chooseUnit} compact />
      </TierHeader>
      <p className="tier-print-only text-[11px]">{t('tier.print.preparedFor', { role: t('tier.role.station'), unit: unitName })}</p>

      <PanelState query={q} height={260}>
        {d && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card padded={false} className={d.week.statusWord === 'rising' ? 'border-l-2 border-l-signal' : ''}>
                <Question id="station-what" question={t('tier.q.what')} status={d.week.statusWord} sentence={weekSentence}>
                  {risingHeads.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {risingHeads.map((r) => (
                        <li key={r.crimeHeadId} className="chip !py-1 min-h-[32px]">
                          <StatusPill status={r.statusWord} />
                          <span>{tName('crimeHeads', r.crimeHeadId, r.headName)} {fmtInt(r.thisWeek)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Question>
              </Card>
              <Card padded={false}>
                <Question
                  id="station-attention"
                  question={t('tier.q.attention')}
                  status={topAlert ? topAlert.statusWord : (d.series.length || d.undetected30.count ? 'watch' : 'stable')}
                  sentence={t('tier.station.attention.sentence', { alerts: fmtInt(d.alerts.length), series: fmtInt(d.series.length), undetected: fmtInt(d.undetected30.count) })}
                />
              </Card>
              <Card padded={false}>
                <Question
                  id="station-next"
                  question={t('tier.q.next')}
                  sentence={topAlert ? t('tier.station.next.top', { head: tName('crimeHeads', topAlert.crimeHeadId, topAlert.headName), phrase: fmt('zscore', topAlert.zScore) }) : t('tier.station.next.none')}
                >
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/alerts?districtId=${encodeURIComponent(d.unit?.districtId || '')}`} className="btn-primary min-h-[44px] flex-1 justify-center">{t('tier.station.next.open')}</Link>
                    <button type="button" onClick={() => setDismissOpen(true)} className="btn min-h-[44px] flex-1 justify-center">{t('tier.station.next.dismiss')}</button>
                  </div>
                  <ProvenanceStamp provenance={d.provenance} size="lg" />
                </Question>
              </Card>
            </div>

            <Card title={t('tier.station.byHead.title')} subtitle={t('tier.station.byHead.sub')} padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                      <th scope="col" className="td-sticky px-4 py-2 font-medium">{t('tier.station.col.head')}</th>
                      <th scope="col" className="px-3 py-2 font-medium text-right">{t('tier.station.col.thisWeek')}</th>
                      <th scope="col" className="px-3 py-2 font-medium text-right">{t('tier.station.col.usual')}</th>
                      <th scope="col" className="px-3 py-2 font-medium">{t('tier.station.col.status')}</th>
                      <th scope="col" className="px-3 py-2 font-medium text-right">{t('tier.station.col.triad')}</th>
                      <th scope="col" className="px-3 py-2 font-medium text-right">{t('tier.station.col.mom')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.weekByHead.map((r) => (
                      <tr key={r.crimeHeadId} className="border-t border-grid/60">
                        <th scope="row" className="td-sticky px-4 py-2 text-left font-medium text-ink">{tName('crimeHeads', r.crimeHeadId, r.headName)}</th>
                        <td className="num px-3 py-2 text-right text-ink">{fmtInt(r.thisWeek)}</td>
                        <td className="num px-3 py-2 text-right text-muted">{fmtNum(r.usualPerWeek, 1)}</td>
                        <td className="px-3 py-2"><StatusPill status={r.statusWord} /></td>
                        <td className="num px-3 py-2 text-right text-ink">{fmtInt(r.month.cur)} · {fmtInt(r.month.prev)} · {fmtInt(r.month.yoy)}</td>
                        <td className="num px-3 py-2 text-right text-muted">{r.month.prev ? fmtPct(r.month.momPct, { sign: true, fraction: false }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-5">
              <Card title={t('tier.station.alerts.title')} subtitle={t('tier.station.alerts.sub', { n: fmtInt(d.alerts.length) })} padded={false} className="lg:col-span-3">
                {d.alerts.length === 0 ? <EmptyState compact title={t('tier.station.alerts.none')} /> : (
                  <ul className="divide-y divide-grid/60">
                    {d.alerts.map((a) => {
                      const sla = alertSla(a);
                      const hrs = Math.round(Math.abs(sla.remainingMs) / 3600000);
                      return (
                        <li key={a.alertId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 min-h-[52px]">
                          <StatusPill status={a.statusWord} size="md" pulse={a.statusWord === 'rising'} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink truncate">{tName('crimeHeads', a.crimeHeadId, a.headName)}{a.scope === 'district' ? ` · ${tName('districts', a.districtId, a.districtName)}` : ''}</p>
                            <p className="text-xs text-muted" data-readable="">{fmt('zscore', a.zScore)} · {fmtInt(a.observed)} vs {fmtInt(a.expected)} · {t('tier.station.alerts.age', { age: ageLabel(a.ageHours, t) })}</p>
                          </div>
                          <StatusPill status={sla.breached ? 'rising' : (sla.warning ? 'watch' : 'stable')} label={sla.breached ? t('tier.station.alerts.slaOver', { h: hrs }) : t('tier.station.alerts.slaLeft', { h: hrs })} className="!normal-case !tracking-normal" />
                          <Link to={`/alerts?districtId=${encodeURIComponent(a.districtId)}`} className="btn min-h-[44px] text-xs">{t('tier.station.next.open')}</Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              <Card title={t('tier.station.series.title')} subtitle={t('tier.station.series.sub')} className="lg:col-span-2">
                {d.series.length === 0 ? <p className="text-xs text-muted">{t('tier.station.series.none')}</p> : (
                  <ul className="space-y-2">
                    {d.series.map((s) => (
                      <li key={s.crimeSubHeadId} className="rounded-lg border border-grid bg-panel-raised px-3 py-2">
                        <p className="text-sm text-ink" data-readable="">
                          {t('tier.station.series.sentence', { n: fmtInt(s.count), sub: s.subHeadName, days: fmtInt(s.spanDays), band: s.band ? t('tier.station.series.mostly', { band: t(`tier.band.${s.band}`) }) : '' })}
                        </p>
                        <p className="num text-[11px] text-muted mt-1">{dateLabel(s.firstDate)} → {dateLabel(s.lastDate)} · {s.crimeNos.slice(0, 3).join(', ')}{s.crimeNos.length > 3 ? '…' : ''}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <PlainSentence term="seasonality" size="lg" className="mt-3 text-muted" />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={t('tier.station.spark.title')} subtitle={t('tier.station.spark.sub', { n: fmtInt(d.spark8w.unitsCompared) })}>
                <SparkCompare unit={d.spark8w.unit} median={d.spark8w.districtMedian} />
                <SparkAxis labels={d.spark8w.weeks.map((w) => dateLabel(w.from))} />
                <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-primary" />{t('tier.station.spark.unit')}</span>
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 border-t border-dashed border-muted" />{t('tier.station.spark.median')}</span>
                </div>
                <ChartTable table={sparkTable} caption={t('tier.station.spark.title')} visible className="mt-2" />
              </Card>
              <Card title={t('tier.station.undetected.title')} subtitle={t('tier.station.undetected.sub')} padded={false}>
                {d.undetected30.count === 0 ? <EmptyState compact title={t('tier.station.undetected.none')} /> : (
                  <ul className="divide-y divide-grid/60">
                    {d.undetected30.rows.map((c) => (
                      <li key={c.caseMasterId}>
                        <Link to={`/cases/${encodeURIComponent(c.caseMasterId)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 min-h-[52px] hover:bg-grid/20">
                          <div className="min-w-0 flex-1">
                            <p className="num text-[13px] font-medium text-ink truncate">FIR {c.crimeNo} · {c.subHeadName}</p>
                            <p className="text-xs text-muted">{t('tier.beat.cases.pending', { n: fmtInt(c.pendingDays ?? 0) })}{c.officer ? ` · ${t('tier.beat.cases.officer', { name: c.officer })}` : ''}</p>
                          </div>
                          <StatusPill status={c.pendingDays > 60 ? 'rising' : 'watch'} size="md" />
                        </Link>
                      </li>
                    ))}
                    {d.undetected30.count > d.undetected30.rows.length && (
                      <li className="px-4 py-2 text-[11px] text-muted">+{fmtInt(d.undetected30.count - d.undetected30.rows.length)}</li>
                    )}
                  </ul>
                )}
              </Card>
            </div>

            <Card title={t('tier.station.caseload.title')} subtitle={t('tier.station.caseload.sub')} padded={false}>
              {d.caseload.length === 0 ? <EmptyState compact title={t('tier.station.caseload.none')} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                        <th scope="col" className="td-sticky px-4 py-2 font-medium">{t('tier.station.col.officer')}</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">{t('tier.station.col.open')}</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">{t('tier.station.col.median')}</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">{t('tier.station.col.over30')}</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">{t('tier.station.col.over60')}</th>
                        <th scope="col" className="px-3 py-2 font-medium">{t('tier.station.col.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.caseload.map((r) => (
                        <tr key={r.employeeId || 'none'} className="border-t border-grid/60">
                          <th scope="row" className="td-sticky px-4 py-2 text-left font-medium text-ink">{r.employeeId ? r.name : t('tier.station.caseload.unassigned')}{r.rank ? <span className="text-muted font-normal"> · {r.rank}</span> : null}</th>
                          <td className="num px-3 py-2 text-right text-ink">{fmtInt(r.open)}</td>
                          <td className="num px-3 py-2 text-right text-ink">{r.medianDays === null ? '—' : fmtInt(r.medianDays)}</td>
                          <td className="num px-3 py-2 text-right text-muted">{fmtInt(r.over30)}</td>
                          <td className="num px-3 py-2 text-right text-muted">{fmtInt(r.over60)}</td>
                          <td className="px-3 py-2"><StatusPill status={r.statusWord} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <p className="text-[11px] text-muted">{t('tier.purpose')}</p>
            <p className="tier-print-only text-[10px]">{t('tier.print.legend')}</p>
          </>
        )}
      </PanelState>

      <DismissSheet open={dismissOpen} onClose={() => setDismissOpen(false)} onSave={(reason) => record('dismiss', reason)} title={t('tier.station.next.dismiss')} />
    </div>
  );
}
