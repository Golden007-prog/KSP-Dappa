// Offender 360 — identity card + alias chips, Karnataka mini-map with district
// hops, vertical case timeline, MO signature chips, community link back to the
// Network Explorer. Spec: master prompt §7 route 5.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOffender, useOffenders } from '../lib/api.js';
import { UNITS, unitInfo, aggregateCountsPerPolygon } from '../lib/districtGeoMap.js';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import Badge from '../components/Badge.jsx';
import MiniChoropleth from '../components/MiniChoropleth.jsx';
import { fmtInt, dateLabel } from '../lib/format.js';
import { RiskBadge, OutcomeBadge, MoChips } from './offenders/common.jsx';
import { communityColor } from './network/graphUtils.js';

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
  const off = useOffender(personKey);
  const registry = useOffenders({ perPage: 200 }); // associate name enrichment (cached with /offenders)

  const p = off.data || {};
  const timeline = p.timeline || [];

  const nameByKey = useMemo(() => {
    const m = new Map();
    for (const r of registry.data?.rows || []) m.set(String(r.personKey), r.canonicalName);
    return m;
  }, [registry.data]);

  // Cases per district — parsed from each CrimeNo (digits 2–5 are the district
  // code, per the pinned format); profile district names as fallback.
  const districtCounts = useMemo(() => {
    const byCode = {};
    for (const t of timeline) {
      const code = districtCodeFromCrimeNo(t.crimeNo);
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
        return u ? { lat: u.lat, lng: u.lng, label: u.name, value: v, unitId: code } : null;
      })
      .filter(Boolean),
    [districtCounts],
  );

  // District hop sequence — chronological, consecutive duplicates collapsed.
  const hops = useMemo(() => {
    const asc = [...timeline].sort((a, b) => String(a.registeredDate).localeCompare(String(b.registeredDate)));
    const out = [];
    for (const t of asc) {
      const code = districtCodeFromCrimeNo(t.crimeNo);
      if (!code) continue;
      const name = unitInfo(code)?.name || code;
      if (out[out.length - 1] !== name) out.push(name);
    }
    return out;
  }, [timeline]);

  const hasCommunity = p.communityId !== null && p.communityId !== undefined && p.communityId !== '';

  if (off.isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Offender 360</h1>
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
          <h1 className="page-title">Offender 360</h1>
          <p className="page-subtitle num">{personKey}</p>
        </div>
        <Card>
          <EmptyState
            title={off.error.status === 404 ? 'Offender not found' : "Couldn't load this offender"}
            message={off.error.message}
            action={(
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => off.refetch()}>Retry</button>
                <Link to="/offenders" className="btn">← Back to offenders</Link>
              </div>
            )}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/offenders" className="text-xs text-muted hover:text-amber transition-colors">← Offenders</Link>
          <h1 className="page-title mt-0.5">{p.canonicalName || personKey}</h1>
          <p className="page-subtitle num">{p.personKey || personKey}</p>
        </div>
        {hasCommunity && (
          <Link
            to={`/network?communityId=${encodeURIComponent(p.communityId)}&focus=${encodeURIComponent(p.personKey || personKey)}`}
            className="btn-primary !py-1.5 text-xs inline-flex items-center gap-1.5"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: communityColor(p.communityId) }} />
            Community #{String(p.communityId)} in Network →
          </Link>
        )}
      </div>

      <Card title="Identity" subtitle="Single resolved person across multiple FIR name spellings">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
          <Fact label="Risk score"><RiskBadge score={p.riskScore} pulse /></Fact>
          <Fact label="Cases">{fmtInt(p.caseCount)}</Fact>
          <Fact label="Districts">{fmtInt((p.districts || []).length)}</Fact>
          <Fact label="Network degree">{fmtInt(p.degree)}</Fact>
          <Fact label="First seen">{dateLabel(p.firstSeen)}</Fact>
          <Fact label="Last seen">{dateLabel(p.lastSeen)}</Fact>
        </div>
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Known aliases</p>
          {(p.aliases || []).length ? (
            <div className="flex flex-wrap gap-1.5">
              {(p.aliases || []).map((a) => <span key={a} className="chip">{a}</span>)}
            </div>
          ) : (
            <p className="text-xs text-muted">No alternate spellings on file.</p>
          )}
          <p className="text-[11px] text-muted mt-2">
            <Badge tone="teal" className="mr-1.5">identity-resolution</Badge>
            Aliases linked by fuzzy name + shared phone/address signals (~0.9 precision on the synthetic ground truth).
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="space-y-4">
          <Card title="Operating area" subtitle="Cases per district, decoded from CrimeNo">
            <MiniChoropleth values={choroValues} markers={markers} height={260} />
            {hops.length > 1 && (
              <div className="mt-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted mb-1">District hops (chronological)</p>
                <p className="text-xs text-ink leading-5">
                  {hops.map((h, i) => (
                    <span key={`${h}-${i}`}>
                      {i > 0 && <span className="text-amber"> → </span>}
                      {h}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </Card>

          <Card title="MO signature" subtitle="Recurring modus-operandi tags across this person's cases">
            {(p.moTags || []).length ? (
              <div className="flex flex-wrap gap-1.5">
                {(p.moTags || []).map((t) => <Badge key={t} tone="amber">{t}</Badge>)}
              </div>
            ) : (
              <EmptyState compact title="No MO tags" message="No recurring modus-operandi pattern detected." />
            )}
          </Card>

          <Card title="Known associates" subtitle="Co-accused links from the network graph">
            {(p.associates || []).length ? (
              <ul className="divide-y divide-grid/50">
                {[...(p.associates || [])]
                  .sort((a, b) => (b.sharedCases || 0) - (a.sharedCases || 0))
                  .slice(0, 8)
                  .map((a) => (
                    <li key={a.personKey} className="py-1.5 first:pt-0 last:pb-0">
                      <Link to={`/offenders/${encodeURIComponent(a.personKey)}`} className="flex items-center gap-2 group">
                        <span className="text-xs text-ink truncate flex-1 group-hover:text-amber transition-colors">
                          {nameByKey.get(String(a.personKey)) || a.personKey}
                        </span>
                        <Badge tone="slate">{fmtInt(a.sharedCases)} shared</Badge>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <EmptyState compact title="No associates" message="No shared-case links for this person." />
            )}
          </Card>
        </div>

        <Card
          className="xl:col-span-2"
          title="Case timeline"
          subtitle={`${fmtInt(timeline.length)} linked FIR${timeline.length === 1 ? '' : 's'}, most recent first`}
        >
          {timeline.length ? (
            <ol className="relative border-l border-grid ml-2 space-y-4">
              {timeline.map((t) => (
                <li key={t.caseMasterId || t.crimeNo} className="ml-4 relative">
                  <span className="absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rounded-full bg-amber border-2 border-panel" aria-hidden="true" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/cases/${encodeURIComponent(t.caseMasterId)}`}
                      className="text-sm font-medium text-ink num hover:text-amber transition-colors"
                    >
                      {t.crimeNo}
                    </Link>
                    <OutcomeBadge status={t.statusName} />
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {t.subHeadName || t.headName || 'Case'} · {t.unitName || 'Unknown station'} · {dateLabel(t.registeredDate)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              compact
              title="No linked cases"
              message="The network snapshot has no shared cases recorded for this person."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
