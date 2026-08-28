// Offender 360 — identity card with risk gauge + percentile + activity
// sparkline, alias chips with resolution-confidence badges, Karnataka mini-map
// with district hops, behavioral tempo + case-mix analytics, mini ego graph,
// associates with risk-at-a-glance, filterable case timeline (year-grouped,
// dormancy gaps flagged), MO signature chips, watchlist star, copy-link,
// prev/next risk-rank navigation, add-to-compare, printable dossier, community
// link back to the Network Explorer. Spec: master prompt §7 route 5.
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useOffender, useOffenders } from '../lib/api.js';
import { UNITS, unitInfo, aggregateCountsPerPolygon } from '../lib/districtGeoMap.js';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import Badge from '../components/Badge.jsx';
import MiniChoropleth from '../components/MiniChoropleth.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { fmtInt, fmtPct, dateLabel } from '../lib/format.js';
import { useI18n } from '../lib/i18n.jsx';
import { communityColor } from './network/graphUtils.js';
import { copyText } from './network/clipboard.js';
import RiskGauge from './offenders/RiskGauge.jsx';
import MiniEgoGraph from './offenders/MiniEgoGraph.jsx';
import YearSparkline from './offenders/YearSparkline.jsx';
import OffenderTimeline from './offenders/Timeline.jsx';
import { TempoCard, CaseMixCard } from './offenders/BehaviorCards.jsx';
import NetworkPosition from './offenders/NetworkPosition.jsx';
import SimilarMo from './offenders/SimilarMo.jsx';
import MoEvolutionCard from './offenders/MoEvolutionCard.jsx';
import BehaviourChangeCard from './offenders/BehaviourChangeCard.jsx';
import PeerCohortCard from './offenders/PeerCohortCard.jsx';
import CrewMembershipCard from './offenders/CrewMembershipCard.jsx';
import FacePanel from './identify/FacePanel.jsx';
import WhyLinkedCard from './depth/WhyLinkedCard.jsx';
import OffenderLadderCard from './depth/OffenderLadderCard.jsx';
import { useMoAnalysis } from './offenders/useMoAnalysis.js';
import { jurisdictionSpan } from './network/analysis.js';
import { RiskBadge, useDistrictName } from './offenders/common.jsx';
import { aliasConfidence, confidenceBand } from './offenders/identity.js';
import { addToCompare, COMPARE_MAX } from './offenders/compareStore.js';
import { pushRecent } from './offenders/recentStore.js';
import { useWatchlist, WATCH_MAX } from './offenders/watchlistStore.js';
import './offenders/offender360-print.css';

/** CrimeNo = [cat 1][district 4][unit 4][year 4][serial 5] → district unit code. */
function districtCodeFromCrimeNo(crimeNo) {
  const cn = String(crimeNo || '');
  const code = cn.slice(1, 5);
  return cn.length >= 10 && /^\d{4}$/.test(code) ? code : null;
}

function Fact({ label, children }) {
  return (
    <div className="bg-base/60 border border-grid rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <div className="text-sm text-ink num mt-0.5">{children}</div>
    </div>
  );
}

export default function Offender360() {
  const { personKey } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t, tName } = useI18n();
  const localDistrict = useDistrictName();
  const off = useOffender(personKey);
  const registry = useOffenders({ perPage: 200 }); // associate name enrichment (cached with /offenders)
  // Whole-population pass — peer cohorts and crew membership are only
  // meaningful against everybody, not against the top-200 slice.
  const analysis = useMoAnalysis();

  const p = off.data || {};
  const timeline = p.timeline || [];

  // Recently-viewed ring for the /offenders chip row.
  useEffect(() => {
    if (off.data?.personKey) pushRecent(off.data.personKey, off.data.canonicalName);
  }, [off.data]);

  const nameByKey = useMemo(() => {
    const m = new Map();
    for (const r of registry.data?.rows || []) m.set(String(r.personKey), r.canonicalName);
    return m;
  }, [registry.data]);

  // Full registry rows by key — risk badges for associate rows.
  const profileByKey = useMemo(() => {
    const m = new Map();
    for (const r of registry.data?.rows || []) m.set(String(r.personKey), r);
    return m;
  }, [registry.data]);

  const { keys: watchKeys, toggle: toggleWatchKey } = useWatchlist();
  const watched = watchKeys.has(String(p.personKey || personKey));

  // Prev/next navigation through the loaded registry in risk order — walk the
  // slice the way the registry table ranks it (top FETCH_CAP by risk).
  const riskRank = useMemo(() => {
    const rows = [...(registry.data?.rows || [])]
      .sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0));
    const i = rows.findIndex((r) => String(r.personKey) === String(p.personKey || personKey));
    return { rows, i };
  }, [registry.data, p.personKey, personKey]);
  const prevOff = riskRank.i > 0 ? riskRank.rows[riskRank.i - 1] : null;
  const nextOff = riskRank.i >= 0 && riskRank.i < riskRank.rows.length - 1
    ? riskRank.rows[riskRank.i + 1]
    : null;

  // Risk percentile against the loaded registry slice (top 200 by risk) —
  // computed client-side, so it is a relative position, not a global rank.
  const riskPercentile = useMemo(() => {
    const rows = registry.data?.rows || [];
    const n = Number(p.riskScore);
    if (!rows.length || !Number.isFinite(n)) return null;
    const scored = rows.filter((r) => Number.isFinite(Number(r.riskScore)));
    if (scored.length < 2) return null;
    const below = scored.filter((r) => Number(r.riskScore) < n).length;
    return Math.round((below / scored.length) * 100);
  }, [registry.data, p.riskScore]);

  // Cases per district — parsed from each CrimeNo (digits 2–5 are the district
  // code, per the pinned format); profile district names as fallback.
  const districtCounts = useMemo(() => {
    const byCode = {};
    for (const row of timeline) {
      const code = districtCodeFromCrimeNo(row.crimeNo);
      if (code) byCode[code] = (byCode[code] || 0) + 1;
    }
    if (!Object.keys(byCode).length) {
      for (const name of p.districts || []) {
        const u = UNITS.find((x) => x.name === name);
        if (u) byCode[u.unitId] = (byCode[u.unitId] || 0) + 1;
      }
    }
    return byCode;
  }, [timeline, p.districts]);

  const choroValues = useMemo(
    () => aggregateCountsPerPolygon(
      Object.entries(districtCounts).map(([districtId, caseCount]) => ({ districtId, caseCount })),
    ),
    [districtCounts],
  );

  const markers = useMemo(
    () => Object.entries(districtCounts)
      .map(([code, v]) => {
        const u = unitInfo(code);
        return u ? { lat: u.lat, lng: u.lng, label: tName('districts', code, u.name), value: v, unitId: code } : null;
      })
      .filter(Boolean),
    [districtCounts, tName],
  );

  // District hop sequence — chronological, consecutive duplicates collapsed.
  const hops = useMemo(() => {
    const asc = [...timeline].sort((a, b) => String(a.registeredDate).localeCompare(String(b.registeredDate)));
    const out = [];
    for (const row of asc) {
      const code = districtCodeFromCrimeNo(row.crimeNo);
      if (!code) continue;
      if (out[out.length - 1]?.code !== code) out.push({ code, name: unitInfo(code)?.name || code });
    }
    return out;
  }, [timeline]);

  // Cross-jurisdiction span — how far this person's offending actually travels.
  // Live profiles average 8.5 districts and reach all 38, so the mobility index
  // (share of consecutive cases that changed district) separates a person who
  // works one town from one who moves after every job.
  const span = useMemo(() => jurisdictionSpan(p.districts || [], hops), [p.districts, hops]);

  const hasCommunity = p.communityId !== null && p.communityId !== undefined && p.communityId !== '';

  const addCompare = () => {
    const r = addToCompare(p.personKey || personKey);
    if (r.status === 'added') toast.success(t('network.toast.compareAddedPlain'));
    else if (r.status === 'exists') toast.info(t('network.toast.compareExists'));
    else toast.info(t('network.toast.compareFull', { n: fmtInt(COMPARE_MAX) }));
  };

  const toggleWatch = () => {
    const r = toggleWatchKey(p.personKey || personKey, p.canonicalName);
    if (r.status === 'added') toast.success(t('network.toast.watchAddedPlain'));
    else if (r.status === 'removed') toast.info(t('network.toast.watchRemoved'));
    else toast.info(t('network.toast.watchFull', { n: fmtInt(WATCH_MAX) }));
  };

  const copyLink = async () => {
    const ok = await copyText(window.location.href);
    if (ok) toast.success(t('network.toast.profileLinkCopied'));
    else toast.error(t('network.toast.copyFailed'));
  };

  if (off.isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">{t('network.o360.title')}</h1>
          <p className="page-subtitle num">{personKey}</p>
        </div>
        <Card><LoadingSkeleton lines={4} /></Card>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card><LoadingSkeleton height={280} /></Card>
          <Card className="xl:col-span-2"><LoadingSkeleton lines={8} /></Card>
        </div>
      </div>
    );
  }

  if (off.error) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">{t('network.o360.title')}</h1>
          <p className="page-subtitle num">{personKey}</p>
        </div>
        <Card>
          <EmptyState
            title={t(off.error.status === 404 ? 'network.o360.notFound' : 'network.o360.loadError')}
            message={off.error.message}
            action={(
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => off.refetch()}>{t('common.action.retry')}</button>
                <Link to="/offenders" className="btn">{t('network.o360.backButton')}</Link>
              </div>
            )}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="off-print-root space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/offenders" className="no-print inline-flex items-center min-h-[36px] text-xs text-muted hover:text-amber transition-colors">{t('network.o360.backToOffenders')}</Link>
          <h1 className="page-title mt-0.5">{p.canonicalName || personKey}</h1>
          <p className="page-subtitle num">{p.personKey || personKey}</p>
          {(watched || (p.districts || []).length >= 2) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {watched && <Badge tone="amber">{t('network.o360.watchlisted')}</Badge>}
              {(p.districts || []).length >= 2 && (
                <Badge tone="teal" className="cursor-help" title={(p.districts || []).map(localDistrict).join(', ')}>
                  {t('network.o360.crossJurisdiction', { n: fmtInt((p.districts || []).length) })}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {prevOff && (
            <Link
              to={`/offenders/${encodeURIComponent(prevOff.personKey)}`}
              className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]"
              title={t('network.o360.higherRiskHint', {
                name: prevOff.canonicalName || prevOff.personKey,
                rank: fmtInt(riskRank.i),
                total: fmtInt(riskRank.rows.length),
              })}
            >
              {t('network.o360.higherRisk')}
            </Link>
          )}
          {nextOff && (
            <Link
              to={`/offenders/${encodeURIComponent(nextOff.personKey)}`}
              className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]"
              title={t('network.o360.lowerRiskHint', {
                name: nextOff.canonicalName || nextOff.personKey,
                rank: fmtInt(riskRank.i + 2),
                total: fmtInt(riskRank.rows.length),
              })}
            >
              {t('network.o360.lowerRisk')}
            </Link>
          )}
          <button
            type="button"
            className={`btn !py-1.5 !px-2.5 text-xs min-h-[40px] ${watched ? '!border-amber/60 text-amber' : ''}`}
            onClick={toggleWatch}
            aria-pressed={watched}
            title={t(watched ? 'network.drawer.unwatchHint' : 'network.o360.watchHint')}
          >
            {t(watched ? 'network.drawer.watching' : 'network.drawer.watch')}
          </button>
          <button
            type="button"
            className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]"
            onClick={copyLink}
            title={t('network.o360.linkHint')}
          >
            {t('network.tool.link')}
          </button>
          <button
            type="button"
            className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]"
            onClick={addCompare}
          >
            {t('network.drawer.addCompare')}
          </button>
          <button
            type="button"
            className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]"
            onClick={() => window.print()}
            title={t('network.o360.printHint')}
          >
            {t('network.o360.print')}
          </button>
          {hasCommunity && (
            <Link
              to={`/network?communityId=${encodeURIComponent(p.communityId)}&focus=${encodeURIComponent(p.personKey || personKey)}`}
              className="btn-primary !py-1.5 text-xs min-h-[40px] inline-flex items-center gap-1.5"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: communityColor(p.communityId) }} />
              {t('network.o360.communityInNetwork', { id: String(p.communityId) })}
            </Link>
          )}
        </div>
      </div>

      <Card title={t('network.o360.identity')} subtitle={t('network.o360.identitySub')}>
        <div className="grid grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)] gap-4 items-start">
          <div>
            <RiskGauge score={p.riskScore} height={150} />
            {riskPercentile !== null && (
              <p className="text-[11px] text-muted text-center mt-1.5">
                {t('network.o360.percentile', { pct: fmtPct(riskPercentile, { digits: 0 }) })}
              </p>
            )}
          </div>
          <div className="space-y-2 min-w-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
              <Fact label={t('network.o360.factCases')}>{fmtInt(p.caseCount)}</Fact>
              <Fact label={t('network.o360.factDistricts')}>{fmtInt((p.districts || []).length)}</Fact>
              <Fact label={t('network.o360.factDegree')}>{fmtInt(p.degree)}</Fact>
              <Fact label={t('network.o360.factFirstSeen')}>{dateLabel(p.firstSeen)}</Fact>
              <Fact label={t('network.o360.factLastSeen')}>{dateLabel(p.lastSeen)}</Fact>
            </div>
            <YearSparkline timeline={timeline} />
          </div>
        </div>
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">{t('network.o360.knownAliases')}</p>
          {(p.aliases || []).length ? (
            <div className="flex flex-wrap gap-1.5">
              {(p.aliases || []).map((a) => {
                const conf = aliasConfidence(a, p.canonicalName);
                const band = confidenceBand(conf);
                const pct = fmtPct(conf, { fraction: true, digits: 0 });
                return (
                  <span
                    key={a}
                    className="chip cursor-help"
                    title={t('network.o360.aliasConfidence', { pct, band: t(`network.confidence.${band.id}`) })}
                  >
                    {a}
                    <span className={`num text-[9px] ${band.text}`}>{pct}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted">{t('network.o360.noAliases')}</p>
          )}
          <p className="text-[11px] text-muted mt-2">
            <Badge tone="teal" className="mr-1.5">{t('network.o360.identityResolution')}</Badge>
            {t('network.o360.identityNote')}
          </p>
        </div>
      </Card>

      <div className="print-stack grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="space-y-4">
          <Card title={t('network.o360.operatingArea')} subtitle={t('network.o360.operatingAreaSub')}>
            <MiniChoropleth values={choroValues} markers={markers} height={260} />
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5" title={t('network.span.districtsHint')}>
                <p className="text-[10px] uppercase tracking-wide text-muted">{t('network.span.districts')}</p>
                <p className="text-sm text-ink num">{fmtInt(span.districts)}</p>
              </div>
              <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5" title={t('network.span.movesHint')}>
                <p className="text-[10px] uppercase tracking-wide text-muted">{t('network.span.moves')}</p>
                <p className="text-sm text-ink num">{fmtInt(span.moves)}</p>
              </div>
              <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5" title={t('network.span.mobilityHint')}>
                <p className="text-[10px] uppercase tracking-wide text-muted">{t('network.span.mobility')}</p>
                <p className="text-sm text-ink num">
                  {span.hops > 1 ? fmtPct(span.mobility * 100, { digits: 0 }) : '—'}
                </p>
              </div>
            </div>
            {span.districts >= 2 && (
              <p className="text-[11px] text-muted mt-1.5">
                {t(span.mobility >= 0.6 ? 'network.span.roamer' : 'network.span.anchored', {
                  n: fmtInt(span.districts),
                })}
              </p>
            )}
            {hops.length > 1 && (
              <div className="mt-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('network.o360.districtHops')}</p>
                <p className="text-xs text-ink leading-5">
                  {hops.map((h, i) => (
                    <span key={`${h.code}-${i}`}>
                      {i > 0 && <span className="text-amber"> → </span>}
                      {tName('districts', h.code, h.name)}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </Card>

          <TempoCard timeline={timeline} lastSeen={p.lastSeen} />

          <CaseMixCard timeline={timeline} />

          <Card title={t('network.o360.moSignature')} subtitle={t('network.o360.moSignatureSub')}>
            {(p.moTags || []).length ? (
              <div className="flex flex-wrap gap-1.5">
                {(p.moTags || []).map((tag) => <Badge key={tag} tone="amber">{tag}</Badge>)}
              </div>
            ) : (
              <EmptyState compact title={t('network.o360.noMoTitle')} message={t('network.o360.noMoMsg')} />
            )}
          </Card>

          <Card title={t('network.o360.associates')} subtitle={t('network.o360.associatesSub')}>
            {(p.associates || []).length ? (
              <>
                <div className="no-print mb-2 rounded-lg border border-grid/60 overflow-hidden">
                  <MiniEgoGraph
                    personKey={p.personKey || personKey}
                    name={p.canonicalName}
                    communityId={p.communityId}
                    associates={p.associates || []}
                    nameByKey={nameByKey}
                    height={210}
                    onTapPerson={(k) => navigate(`/offenders/${encodeURIComponent(k)}`)}
                  />
                  <p className="text-[10px] text-muted text-center pb-1.5">{t('network.o360.tapAssociate')}</p>
                </div>
                <ul className="divide-y divide-grid/50">
                  {[...(p.associates || [])]
                    .sort((a, b) => (b.sharedCases || 0) - (a.sharedCases || 0))
                    .slice(0, 8)
                    .map((a) => {
                      const reg = profileByKey.get(String(a.personKey));
                      return (
                        <li key={a.personKey} className="py-1.5 first:pt-0 last:pb-0">
                          <Link to={`/offenders/${encodeURIComponent(a.personKey)}`} className="flex items-center gap-2 min-h-[36px] group">
                            {watchKeys.has(String(a.personKey)) && (
                              <span className="text-amber text-[11px] shrink-0" title={t('network.o360.onWatchlist')} aria-label={t('network.o360.onWatchlist')}>★</span>
                            )}
                            <span className="text-xs text-ink truncate flex-1 group-hover:text-amber transition-colors">
                              {nameByKey.get(String(a.personKey)) || a.personKey}
                            </span>
                            {reg && <RiskBadge score={reg.riskScore} />}
                            <Badge tone="slate">{t('network.o360.sharedBadge', { n: fmtInt(a.sharedCases) })}</Badge>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </>
            ) : (
              <EmptyState compact title={t('network.o360.noAssociatesTitle')} message={t('network.o360.noAssociatesMsg')} />
            )}
          </Card>

          <NetworkPosition
            personKey={p.personKey || personKey}
            communityId={p.communityId}
            nameByKey={nameByKey}
          />

          <SimilarMo
            subject={{
              personKey: p.personKey || personKey,
              moTags: p.moTags || [],
              districts: p.districts || [],
            }}
            rows={registry.data?.rows || []}
            loading={registry.isLoading}
          />

          <CrewMembershipCard personKey={p.personKey || personKey} analysis={analysis} />
          <FacePanel personKey={p.personKey || personKey} />
          <WhyLinkedCard personKey={p.personKey || personKey} />

          <PeerCohortCard
            subject={{
              personKey: p.personKey || personKey,
              canonicalName: p.canonicalName,
              caseCount: p.caseCount,
              districts: p.districts || [],
              moTags: p.moTags || [],
              aliases: p.aliases || [],
              riskScore: p.riskScore,
              communityId: p.communityId,
            }}
            analysis={analysis}
          />
        </div>

        <div className="xl:col-span-2 space-y-4">
          <BehaviourChangeCard timeline={timeline} />
          <OffenderLadderCard timeline={timeline} />

          <MoEvolutionCard timeline={timeline} />

          <Card
            title={t('network.o360.timeline')}
            subtitle={t(timeline.length === 1 ? 'network.o360.timelineSub.one' : 'network.o360.timelineSub.other',
              { n: fmtInt(timeline.length) })}
          >
            <OffenderTimeline timeline={timeline} />
          </Card>
        </div>
      </div>
    </div>
  );
}
