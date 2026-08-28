// Injected-pattern recovery card — the generator plants 6 spatial-hour
// hotspots, 4 final-8-week anomalies, ~200 repeat offenders and 12 co-accused
// communities; this shows what the analytics pipeline recovered of each, with
// the matching rule behind every row. Data: GET /depth/benchmarks (recovery).
import { useState } from 'react';
import StatusPill from '../../components/StatusPill.jsx';
import { useDepthBenchmarks } from '../../lib/depthApi.js';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { PanelFrame, Bars } from './DepthBits.jsx';

function statusForShare(share) {
  if (!Number.isFinite(share)) return 'nodata';
  if (share >= 0.75) return 'stable';
  if (share >= 0.4) return 'watch';
  return 'rising';
}

export default function RecoveryCard() {
  const t = useT();
  const q = useDepthBenchmarks();
  const r = q.data?.recovery || null;
  const [open, setOpen] = useState('hotspots');
  const rows = r ? [
    { key: 'hotspots', planted: r.hotspots.planted, recovered: r.hotspots.recovered, extra: t('depth.recovery.hotspotExtra', { n: fmtInt(r.hotspots.plantedCellTopRanked), of: fmtInt(r.hotspots.planted) }), rule: r.hotspots.matchRule },
    { key: 'anomalies', planted: r.anomalies.planted, recovered: r.anomalies.recovered, extra: null, rule: r.anomalies.matchRule },
    { key: 'offenders', planted: r.offenders.planted, recovered: r.offenders.recovered, extra: t('depth.recovery.offenderExtra', { cov: fmtPct((r.offenders.medianCoverage || 0) * 100, { digits: 0 }), merge: r.offenders.medianOverMerge === null ? '—' : fmtNum(r.offenders.medianOverMerge, 1) }), rule: r.offenders.matchRule },
    { key: 'communities', planted: r.communities.planted, recovered: r.communities.recovered, extra: t('depth.recovery.communityExtra', { m: fmtInt(r.communities.membersRecovered), of: fmtInt(r.communities.plantedMembers), l: fmtInt(r.communities.louvainCommunities) }), rule: r.communities.matchRule },
  ] : [];
  const overall = rows.length ? rows.reduce((s, x) => s + x.recovered / x.planted, 0) / rows.length : null;
  return (
    <PanelFrame
      title={t('depth.recovery.title')}
      subtitle={t('depth.recovery.subtitle')}
      term="recovery"
      termVars={{ pct: overall === null ? '—' : Math.round(overall * 100) }}
      method={t('depth.recovery.method')}
      methodDetail={r?.generatedFrom}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(q.data) && !r}
      emptyMessage={t('depth.recovery.empty')}
    >
      {r && (
        <div className="space-y-3">
          <Bars rows={rows.map((x) => ({ label: t(`depth.recovery.kind.${x.key}`), value: (x.recovered / x.planted) * 100, tone: statusForShare(x.recovered / x.planted) === 'stable' ? 'bg-teal/70' : statusForShare(x.recovered / x.planted) === 'watch' ? 'bg-amber/70' : 'bg-signal/70', hint: `${x.recovered}/${x.planted}` }))} min={0} max={100} unit="%" />
          <ul className="space-y-1.5">
            {rows.map((x) => (
              <li key={x.key} className="bg-canvas/60 border border-grid rounded-lg px-3 py-2">
                <button type="button" className="w-full flex flex-wrap items-center justify-between gap-2 text-left min-h-[44px]" onClick={() => setOpen(open === x.key ? null : x.key)} aria-expanded={open === x.key}>
                  <span className="inline-flex items-center gap-2">
                    <StatusPill status={statusForShare(x.recovered / x.planted)} label={t(`depth.recovery.status.${statusForShare(x.recovered / x.planted)}`)} />
                    <span className="text-sm text-ink">{t(`depth.recovery.kind.${x.key}`)}</span>
                  </span>
                  <span className="num text-sm text-ink">{t('depth.recovery.ratio', { n: fmtInt(x.recovered), of: fmtInt(x.planted) })}</span>
                </button>
                {x.extra && <p className="text-[11px] text-muted mt-0.5">{x.extra}</p>}
                {open === x.key && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] text-muted">{t('depth.recovery.rule')}: {x.rule}</p>
                    {x.key === 'hotspots' && (
                      <ul className="text-[11px] space-y-0.5">
                        {r.hotspots.rows.map((h) => (
                          <li key={h.label} className="flex flex-wrap justify-between gap-2"><span className="text-ink">{h.label}</span><span className="num text-muted">{h.recovered ? t('depth.recovery.hit', { km: fmtNum(h.nearestClusterKm, 2) }) : t('depth.recovery.miss', { km: h.nearestClusterKm === null ? '—' : fmtNum(h.nearestClusterKm, 0) })} · {t('depth.recovery.rank', { n: fmtInt(h.densityRankOfPlantedCell), cases: fmtInt(h.casesWithin1km) })}</span></li>
                        ))}
                      </ul>
                    )}
                    {x.key === 'anomalies' && (
                      <ul className="text-[11px] space-y-0.5">
                        {r.anomalies.rows.map((a) => (
                          <li key={a.label} className="flex flex-wrap justify-between gap-2"><span className="text-ink">{a.label}</span><span className="num text-muted">{t('depth.recovery.alerts', { n: fmtInt(a.alertsInWindow), z: a.maxZ === null ? '—' : fmtNum(a.maxZ, 1), pct: fmtInt(a.plantedUpliftPct) })}</span></li>
                        ))}
                      </ul>
                    )}
                    {x.key === 'communities' && (
                      <ul className="text-[11px] space-y-0.5">
                        {r.communities.rows.map((c) => (
                          <li key={c.communityId} className="flex flex-wrap justify-between gap-2"><span className="text-ink">{c.communityId} · {t('depth.recovery.members', { n: fmtInt(c.members) })}</span><span className="num text-muted">{t('depth.recovery.commShare', { pct: fmtPct(c.share * 100, { digits: 0 }), l: c.dominantLouvain || '—' })}</span></li>
                        ))}
                      </ul>
                    )}
                    {x.key === 'offenders' && (
                      <p className="text-[11px] text-muted">{t('depth.recovery.offenderNote', { full: fmtInt(r.offenders.fullyRecovered) })}</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </PanelFrame>
  );
}
