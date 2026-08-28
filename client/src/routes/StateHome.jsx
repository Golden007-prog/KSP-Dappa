// /state — the SCRB / IGP / DGP rollup. The Monthly Crime Review's own shape:
// the three questions from the state totals, one Crime Review sentence per
// head ("There is a decrease in the reported cases of … when compared to the
// previous month and the corresponding month of the previous year"), the
// unit-wise breakup of the rare heads, and the 38-unit × crime-head matrix
// stamped "AS ON <date>" with a status word per unit. Prints A4 landscape.
// Data: GET /tiers/state (lib/tierApi.js useStateHome). Backlog rows 3, 10,
// 23, 32, 42, 43.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card.jsx';
import StatusPill from '../components/StatusPill.jsx';
import ProvenanceStamp from '../components/ProvenanceStamp.jsx';
import PlainSentence from '../components/PlainSentence.jsx';
import { useStateHome } from '../lib/tierApi.js';
import { useI18n } from '../lib/i18n.jsx';
import { fmtInt, fmtNum, fmtPct, dateLabel, monthLabel } from '../lib/format.js';
import { Question, TierHeader, PanelState, useTierRoute } from './tiers/bits.jsx';
import TierPrintStyles from './tiers/tierPrint.jsx';

const dirKey = (v) => (v === 'up' ? 'increase' : v === 'down' ? 'decrease' : 'same');

export default function StateHome() {
  const { t, tName } = useI18n();
  useTierRoute('state'); // arriving from the sidebar must switch the app into state wording
  const q = useStateHome();
  const d = q.data || null;

  const attention = useMemo(() => {
    if (!d) return null;
    const rising = d.units.filter((u) => u.statusWord === 'rising');
    const watch = d.units.filter((u) => u.statusWord === 'watch');
    return { rising, watch };
  }, [d]);

  const totalsDir = (cur, prev) => (cur > prev ? 'up' : cur < prev ? 'down' : 'same');

  return (
    <div id="state-home" className="tier-home space-y-4" data-tier-home="state">
      <TierPrintStyles tier="state" />
      <TierHeader
        eyebrow={t('tier.eyebrow.state')}
        title={t('tier.state.title')}
        sub={d ? `${t('tier.state.sub', { n: fmtInt(d.units.length), month: monthLabel(d.anchorYm) })} · ${t('tier.state.asOn', { date: dateLabel(d.asOn) })}` : ''}
        readTarget="state-home"
        onPrint={() => window.print()}
        printLabel={t('tier.state.print')}
      />
      <p className="tier-print-only text-[11px]">{t('tier.print.preparedFor', { role: t('tier.role.state'), unit: 'Karnataka' })}</p>

      <PanelState query={q} height={300}>
        {d && attention && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card padded={false}>
                <Question
                  id="state-what"
                  question={t('tier.q.what')}
                  sentence={t('tier.state.what.sentence', {
                    dir: t(`tier.state.dir.${totalsDir(d.totals.cur, d.totals.prev)}`), pct: fmtPct(d.totals.momPct, { sign: true, fraction: false }),
                    dirYoy: t(`tier.state.dir.${totalsDir(d.totals.cur, d.totals.yoy)}`), pctYoy: fmtPct(d.totals.yoyPct, { sign: true, fraction: false }),
                  })}
                >
                  <p className="num text-xs text-muted" data-readable="">{t('tier.state.totals', { cur: fmtInt(d.totals.cur), prev: fmtInt(d.totals.prev), yoy: fmtInt(d.totals.yoy) })}</p>
                </Question>
              </Card>
              <Card padded={false} className={attention.rising.length ? 'border-l-2 border-l-signal' : ''}>
                <Question
                  id="state-attention"
                  question={t('tier.q.attention')}
                  status={attention.rising.length ? 'rising' : attention.watch.length ? 'watch' : 'stable'}
                  sentence={t('tier.state.attention.sentence', { alerts: fmtInt(d.alertsOpen), units: fmtInt(d.unitsWithOpenAlerts), rising: fmtInt(attention.rising.length), watch: fmtInt(attention.watch.length) })}
                >
                  {(attention.rising.length > 0 || attention.watch.length > 0) && (
                    <ul className="flex flex-wrap gap-1.5">
                      {attention.rising.concat(attention.watch).map((u) => (
                        <li key={u.districtId} className="chip !py-1 min-h-[32px]">
                          <StatusPill status={u.statusWord} />
                          <span>{tName('districts', u.districtId, u.districtName)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Question>
              </Card>
              <Card padded={false}>
                <Question id="state-next" question={t('tier.q.next')} sentence={t('tier.state.next.sentence')}>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/alerts" className="btn-primary min-h-[44px] flex-1 justify-center">{t('tier.station.next.open')}</Link>
                    <button type="button" onClick={() => document.getElementById('state-matrix')?.scrollIntoView({ block: 'start' })} className="btn min-h-[44px] flex-1 justify-center">{t('tier.state.matrix.col.unit')} × {t('tier.station.col.head')}</button>
                  </div>
                  <ProvenanceStamp provenance={d.provenance} size="lg" />
                </Question>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <Card title={t('tier.state.review.title')} subtitle={t('tier.state.review.sub')} padded={false} className="lg:col-span-3">
                <ul className="divide-y divide-grid/60">
                  {d.heads.map((h) => (
                    <li key={h.crimeHeadId} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5">
                      <StatusPill status={h.vsPrev === 'up' ? 'watch' : h.vsPrev === 'down' ? 'falling' : 'stable'} label={t(`tier.state.dir.${h.vsPrev}`)} className="mt-0.5" />
                      <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink" data-readable="">
                        {t('tier.state.review.sentence', {
                          dirPrev: t(`tier.state.review.${dirKey(h.vsPrev)}`), head: tName('crimeHeads', h.crimeHeadId, h.headName),
                          cur: fmtInt(h.cur), prev: fmtInt(h.prev), dirYoy: t(`tier.state.review.${dirKey(h.vsYoy)}`), yoy: fmtInt(h.yoy),
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title={t('tier.state.rare.title')} subtitle={t('tier.state.rare.sub')} className="lg:col-span-2">
                {d.rareHeads.length === 0 ? <p className="text-xs text-muted">{t('tier.state.rare.none')}</p> : (
                  <ul className="space-y-3">
                    {d.rareHeads.map((r) => (
                      <li key={r.crimeSubHeadId}>
                        <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium text-ink">
                          <span>{r.subHeadName} <span className="text-muted font-normal">· {r.headName}</span></span>
                          <span className="num text-xs text-muted">{t('tier.state.rare.total', { n: fmtInt(r.total) })}</span>
                        </p>
                        {r.units.length === 0 ? <p className="text-xs text-muted">{t('tier.state.rare.none')}</p> : (
                          <ul className="mt-1 flex flex-wrap gap-1.5">
                            {r.units.map((u) => (
                              <li key={u.districtId} className="chip !py-0.5 text-[11px]">{tName('districts', u.districtId, u.districtName)} <span className="num text-muted">{fmtInt(u.count)}</span></li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <PlainSentence term="rate" size="lg" className="mt-3 text-muted" />
              </Card>
            </div>

            <Card title={t('tier.state.matrix.title')} subtitle={`${t('tier.state.matrix.sub', { n: fmtInt(d.units.length), month: monthLabel(d.anchorYm) })} · ${t('tier.state.asOn', { date: dateLabel(d.asOn) })}`} padded={false}>
              {/* 38 units × every crime head never fits a laptop, let alone a
                  phone: the box scrolls sideways, so it needs tabindex=0 to be
                  reachable by keyboard (WCAG 2.1.1) and a name for the landmark
                  that tabindex creates. */}
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label={t('a11y.scroll.table', { name: t('tier.state.matrix.title') })}
              >
                <table className="w-full text-xs" id="state-matrix">
                  <caption className="sr-only">{t('tier.state.matrix.title')} — {t('tier.state.asOn', { date: dateLabel(d.asOn) })}</caption>
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                      <th scope="col" className="td-sticky px-3 py-2 font-medium">{t('tier.state.matrix.col.unit')}</th>
                      {d.matrix.heads.map((h) => <th key={h.crimeHeadId} scope="col" className="px-2 py-2 font-medium text-right whitespace-nowrap">{tName('crimeHeads', h.crimeHeadId, h.headName)}</th>)}
                      <th scope="col" className="px-2 py-2 font-medium text-right">{t('tier.state.matrix.col.total')}</th>
                      <th scope="col" className="px-2 py-2 font-medium text-right whitespace-nowrap">{t('tier.state.matrix.col.mom')}</th>
                      <th scope="col" className="px-2 py-2 font-medium text-right whitespace-nowrap">{t('tier.state.matrix.col.rate')}</th>
                      <th scope="col" className="px-2 py-2 font-medium text-right whitespace-nowrap">{t('tier.state.matrix.col.alerts')}</th>
                      <th scope="col" className="px-2 py-2 font-medium">{t('tier.state.matrix.col.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.units.map((u) => (
                      <tr key={u.districtId} className="border-t border-grid/60">
                        <th scope="row" className="td-sticky px-3 py-1.5 text-left font-medium text-ink whitespace-nowrap">{tName('districts', u.districtId, u.districtName)}</th>
                        {u.cells.map((n, i) => <td key={i} className="num px-2 py-1.5 text-right text-ink">{n ? fmtInt(n) : <span className="text-muted">0</span>}</td>)}
                        <td className="num px-2 py-1.5 text-right font-semibold text-ink">{fmtInt(u.cur)}</td>
                        <td className="num px-2 py-1.5 text-right text-muted">{u.prev ? fmtPct(u.momPct, { sign: true, fraction: false }) : '—'}</td>
                        <td className="num px-2 py-1.5 text-right text-muted">{u.ratePerLakh === null ? '—' : fmtNum(u.ratePerLakh, 1)}</td>
                        <td className="num px-2 py-1.5 text-right text-muted">{fmtInt(u.openAlerts)}</td>
                        <td className="px-2 py-1.5"><StatusPill status={u.statusWord} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-grid">
                      <th scope="row" className="td-sticky px-3 py-2 text-left font-semibold text-ink">{t('tier.state.matrix.col.total')}</th>
                      {d.matrix.heads.map((h, i) => <td key={h.crimeHeadId} className="num px-2 py-2 text-right font-semibold text-ink">{fmtInt(d.matrix.rows.reduce((s, r) => s + (r.cells[i] || 0), 0))}</td>)}
                      <td className="num px-2 py-2 text-right font-semibold text-ink">{fmtInt(d.totals.cur)}</td>
                      <td className="num px-2 py-2 text-right text-muted">{fmtPct(d.totals.momPct, { sign: true, fraction: false })}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            <p className="text-[11px] text-muted">{t('tier.purpose')}</p>
            <p className="tier-print-only text-[10px]">{t('tier.print.legend')}</p>
          </>
        )}
      </PanelState>
    </div>
  );
}
