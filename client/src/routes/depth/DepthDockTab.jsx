// GeoIntel workbench tab "Repeats" — two spatial-depth views over the current
// district / crime-head / date scope:
//   near-repeat  originator / repeat / near-repeat classes, the Knox
//                space–time test, and the open prediction zones on a mini-map
//   trajectory   emerging-hotspot classes over the monthly Gi* series, the
//                month-to-month stability index and the two-period comparison
// Data: GET /depth/near-repeat, GET /depth/hotspot-trajectory.
import { useMemo, useState } from 'react';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import PlainSentence from '../../components/PlainSentence.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { useDepthNearRepeat, useDepthTrajectory } from '../../lib/depthApi.js';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, fmtPct, dateLabel, monthLabel } from '../../lib/format.js';
import ArcMap from './ArcMap.jsx';
import { MethodInfo, StatTile, Bars, MiniBars, statusOf } from './DepthBits.jsx';

function State({ q, children, emptyWhen, emptyMessage }) {
  const t = useT();
  if (q.isLoading) return <LoadingSkeleton lines={5} />;
  if (q.error) return <EmptyState compact title={t('common.state.error')} message={q.error.message} action={<button type="button" className="btn min-h-[44px]" onClick={() => q.refetch()}>{t('common.action.retry')}</button>} />;
  if (emptyWhen) return <EmptyState compact title={t('common.state.empty')} message={emptyMessage} />;
  return children;
}

export function NearRepeatPanel({ apiParams }) {
  const t = useT();
  const [distM, setDistM] = useState(500);
  const [days, setDays] = useState(14);
  const q = useDepthNearRepeat({ ...apiParams, distM, days });
  const d = q.data;
  const cls = d?.classification;
  const kx = d?.knox;
  const knoxStatus = !kx || kx.ratio === null ? 'nodata' : kx.pValue !== null && kx.pValue <= 0.05 && kx.ratio > 1 ? 'rising' : kx.ratio > 1 ? 'watch' : 'stable';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlainSentence term="nearrepeat" vars={{ pct: cls ? Math.round(((cls.shares.nearRepeat || 0) + (cls.shares.repeat || 0)) * 100) : '—', m: distM, d: days }} className="flex-1 min-w-[12rem]" />
        <MethodInfo text={t('depth.nr.method')} detail={d?.method} />
      </div>
      <div className="flex flex-wrap gap-2">
        <SegmentedControl ariaLabel={t('depth.nr.distAria')} value={distM} onChange={setDistM} options={[250, 500, 1000].map((v) => ({ value: v, label: `${v} m` }))} />
        <SegmentedControl ariaLabel={t('depth.nr.daysAria')} value={days} onChange={setDays} options={[7, 14, 28].map((v) => ({ value: v, label: t('depth.common.daysN', { n: v }) }))} />
      </div>
      <State q={q} emptyWhen={Boolean(d) && (!cls || cls.cases.length === 0)} emptyMessage={t('depth.nr.empty')}>
        {cls && kx && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['originator', 'nearRepeat', 'repeat', 'isolated'].map((k) => (
                <StatTile key={k} label={t(`depth.nr.cls.${k}`)} value={fmtInt(cls.tally[k])} hint={fmtPct((cls.shares[k] || 0) * 100, { digits: 0 })} tone={k === 'nearRepeat' || k === 'repeat' ? 'text-signal' : ''} />
              ))}
            </div>
            <div className="bg-base/60 border border-grid rounded-lg px-3 py-2 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={knoxStatus} label={t(`depth.nr.knoxStatus.${knoxStatus}`)} />
                <span className="text-[12px] text-ink">{kx.ratio === null ? t('depth.nr.knoxNone') : t('depth.nr.knoxLine', { ratio: fmtNum(kx.ratio, 2), p: kx.pValue === null ? '—' : fmtNum(kx.pValue, 3) })}</span>
              </div>
              <p className="text-[11px] text-muted num">{t('depth.nr.knoxDetail', { obs: fmtInt(kx.observed), exp: kx.expected === null ? '—' : fmtNum(kx.expected, 1), n: fmtInt(kx.n), perms: fmtInt(kx.perms) })}</p>
            </div>
            <ArcMap
              height={220}
              fit="points"
              ariaLabel={t('depth.nr.mapAria', { n: fmtInt(d.zones.zones.length) })}
              circles={d.zones.zones.slice(0, 40).map((z) => ({ lat: z.lat, lng: z.lng, radiusM: z.radiusM, label: t('depth.nr.zoneLabel', { until: dateLabel(z.until), n: fmtInt(z.chainSize) }) }))}
              points={cls.cases.filter((c) => c.cls !== 'isolated').slice(0, 300).map((c) => ({ lat: c.lat, lng: c.lng, label: `${dateLabel(c.date)} · ${t(`depth.nr.cls.${c.cls}`)}`, tone: c.cls === 'originator' ? 'alt' : 'point', radius: 3 }))}
            />
            <p className="text-[11px] text-muted">{t('depth.nr.zonesLine', { n: fmtInt(d.zones.zones.length), asOf: d.zones.asOf ? dateLabel(d.zones.asOf) : '—', chains: fmtInt(cls.chainCount), largest: fmtInt(cls.largestChain) })}</p>
            {cls.chains.length > 0 && (
              <ol className="text-[11px] space-y-0.5">
                {cls.chains.slice(0, 5).map((ch) => (
                  <li key={ch.originatorId} className="flex justify-between gap-2"><span className="text-ink">{t('depth.nr.chainRow', { n: fmtInt(ch.size), from: dateLabel(ch.from), to: dateLabel(ch.to) })}</span><span className="num text-muted">{fmtNum(ch.lat, 3)}, {fmtNum(ch.lng, 3)}</span></li>
                ))}
              </ol>
            )}
            <p className="text-[10px] text-muted">{t('depth.common.scan', { n: fmtInt(d.scan?.casesGeocoded || 0) })}{d.scan?.truncated ? ` · ${t('depth.common.truncated')}` : ''}</p>
          </>
        )}
      </State>
    </div>
  );
}

const CLASS_ORDER = ['new', 'consecutive', 'intensifying', 'persistent', 'diminishing', 'sporadic', 'oscillating', 'historical'];

export function TrajectoryPanel({ apiParams }) {
  const t = useT();
  const [cellKm, setCellKm] = useState(2);
  const params = useMemo(() => ({ districtId: apiParams?.districtId || '0101', crimeHeadId: apiParams?.crimeHeadId, months: 12, cellKm }), [apiParams, cellKm]);
  const q = useDepthTrajectory(params);
  const d = q.data;
  const tj = d?.trajectory;
  const classes = tj ? tj.classes.filter((c) => c.cells > 0) : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlainSentence term="trajectory" vars={{ n: tj ? fmtInt(tj.cellCount) : '—', months: tj ? tj.months.length : 12 }} className="flex-1 min-w-[12rem]" />
        <MethodInfo text={t('depth.tj.method')} detail={d?.method} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl ariaLabel={t('depth.tj.cellAria')} value={cellKm} onChange={setCellKm} options={[1, 2, 5].map((v) => ({ value: v, label: `${v} km` }))} />
        {!apiParams?.districtId && <span className="text-[11px] text-muted">{t('depth.tj.defaultDistrict')}</span>}
      </div>
      <State q={q} emptyWhen={Boolean(tj) && tj.cellCount === 0} emptyMessage={t('depth.tj.empty')}>
        {tj && (
          <>
            <Bars rows={CLASS_ORDER.filter((k) => classes.some((c) => c.cls === k)).map((k) => ({ label: t(`depth.tj.cls.${k}`), value: classes.find((c) => c.cls === k).cells, tone: statusOf(k) === 'rising' ? 'bg-signal/70' : statusOf(k) === 'falling' ? 'bg-teal/70' : 'bg-amber/70' }))} min={0} max={Math.max(1, ...classes.map((c) => c.cells))} unit="" />
            <div className="grid grid-cols-2 gap-2">
              <StatTile label={t('depth.tj.kpiStability')} value={tj.stability.mean === null ? '—' : fmtNum(tj.stability.mean, 2)} hint={t('depth.tj.kpiStabilityHint')} />
              <StatTile label={t('depth.tj.kpiTwoPeriod')} value={`+${fmtInt(tj.twoPeriod?.changes.newHot || 0)} / −${fmtInt(tj.twoPeriod?.changes.cooled || 0)}`} hint={t('depth.tj.kpiTwoPeriodHint', { a: monthLabel(tj.twoPeriod?.periodA.from), b: monthLabel(tj.twoPeriod?.periodB.to) })} />
            </div>
            {tj.stability.series.length > 0 && (
              <div className="text-[11px] text-muted flex items-center gap-2">
                <span>{t('depth.tj.stabilitySeries')}</span>
                <MiniBars values={tj.stability.series.map((s) => (s.jaccard === null ? 0 : s.jaccard))} />
                <span className="num">{tj.stability.series.map((s) => (s.jaccard === null ? '—' : fmtNum(s.jaccard, 2))).join(' · ')}</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <caption className="sr-only">{t('depth.tj.tableCaption')}</caption>
                <thead><tr><th scope="col" className="text-left text-muted font-normal px-1">{t('depth.tj.colCell')}</th><th scope="col" className="text-left text-muted font-normal px-1">{t('depth.tj.colClass')}</th><th scope="col" className="text-right text-muted font-normal px-1">{t('depth.tj.colHot')}</th><th scope="col" className="text-left text-muted font-normal px-1">{t('depth.tj.colSeries')}</th></tr></thead>
                <tbody>
                  {tj.cells.slice(0, 10).map((c) => (
                    <tr key={c.key} className="border-t border-grid/40">
                      <th scope="row" className="text-left font-normal text-ink px-1 num whitespace-nowrap">{fmtNum(c.lat, 3)}, {fmtNum(c.lng, 3)}</th>
                      <td className="px-1"><StatusPill status={statusOf(c.cls)} label={t(`depth.tj.cls.${c.cls}`)} /></td>
                      <td className="text-right num px-1">{fmtInt(c.hotMonths)}/{tj.months.length}</td>
                      <td className="px-1"><MiniBars values={c.counts} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted">{t('depth.common.scan', { n: fmtInt(d.scan?.casesGeocoded || 0) })}{d.scan?.truncated ? ` · ${t('depth.common.truncated')}` : ''}</p>
          </>
        )}
      </State>
    </div>
  );
}

export default function DepthDockTab({ apiParams }) {
  const t = useT();
  const [view, setView] = useState('nearrepeat');
  return (
    <div className="space-y-3 p-2">
      <SegmentedControl ariaLabel={t('depth.dock.viewAria')} value={view} onChange={setView} options={[{ value: 'nearrepeat', label: t('depth.dock.nearRepeat') }, { value: 'trajectory', label: t('depth.dock.trajectory') }]} />
      {view === 'nearrepeat' ? <NearRepeatPanel apiParams={apiParams} /> : <TrajectoryPanel apiParams={apiParams} />}
    </div>
  );
}
