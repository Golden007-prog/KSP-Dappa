// Command Dashboard — KPI tiles w/ MoM, Karnataka mini-choropleth, 12-month
// stacked trend, top rising subhead chips, live alert ticker, Ask-DAPPA omnibox.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useKpis, useDistrictsGeo, useTrendsMonthly, useCategoryShare, useAlerts,
} from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import { aggregateCountsPerPolygon, polygonForUnit, unitsForPolygon } from '../lib/districtGeoMap.js';
import Card from '../components/Card.jsx';
import KpiTile from '../components/KpiTile.jsx';
import ChartPanel from '../components/ChartPanel.jsx';
import FilterBar from '../components/FilterBar.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import PulseDot from '../components/PulseDot.jsx';
import MiniChoropleth from '../components/MiniChoropleth.jsx';
import { fmtInt, fmtPct, fmtNum, monthLabel } from '../lib/format.js';

const SUGGESTION = 'chain snatching in Mysuru City last 3 months';

function QueryFallback({ query, what }) {
  if (query.isLoading) return <LoadingSkeleton lines={4} />;
  return (
    <EmptyState
      compact
      title={`Couldn't load ${what}`}
      message={query.error?.message}
      action={<button type="button" className="btn" onClick={() => query.refetch()}>Retry</button>}
    />
  );
}

function OmniBox() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const text = q.trim();
    if (text) navigate(`/copilot?q=${encodeURIComponent(text)}`);
  };
  return (
    <form onSubmit={submit} className="relative">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" strokeLinecap="round" />
      </svg>
      <input
        className="input-dark w-full !pl-10 !py-2.5 !rounded-xl text-sm"
        placeholder={`Ask DAPPA — e.g. “${SUGGESTION}”`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Ask DAPPA"
      />
      <button type="submit" className="btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 !py-1.5">
        Ask
      </button>
    </form>
  );
}

function RisingChips({ kpis, share }) {
  const chips = useMemo(() => {
    const items = [];
    const top = kpis.data?.topRisingSubhead;
    if (top?.name) items.push({ id: `kpi-${top.id}`, name: top.name, deltaPct: Number(top.deltaPct) });
    const withDelta = (share.data || []).filter((s) => Number.isFinite(Number(s.deltaPct)));
    const pool = withDelta.length ? withDelta : (share.data || []);
    const sorted = [...pool].sort((a, b) => (Number(b.deltaPct) || 0) - (Number(a.deltaPct) || 0) || b.count - a.count);
    for (const s of sorted) {
      if (items.length >= 5) break;
      if (items.some((it) => it.name === s.name)) continue;
      items.push({ id: s.id, name: s.name, deltaPct: Number.isFinite(Number(s.deltaPct)) ? Number(s.deltaPct) : null });
    }
    return items.slice(0, 5);
  }, [kpis.data, share.data]);

  if (kpis.isLoading && share.isLoading) return <LoadingSkeleton lines={2} />;
  if (!chips.length) return <EmptyState compact title="No rising categories" message="Nothing trending upward in this window." />;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <Link key={c.id || i} to="/trends" className="chip hover:border-amber/50 transition-colors" title="Open Trends">
          <span className="truncate max-w-[11rem]">{c.name}</span>
          {c.deltaPct !== null && Number.isFinite(c.deltaPct) && (
            <span className={`num font-semibold ${c.deltaPct >= 0 ? 'text-signal' : 'text-teal'}`}>
              {c.deltaPct >= 0 ? '▲' : '▼'}{fmtPct(Math.abs(c.deltaPct), { fraction: false, digits: 0 })}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

const isOpenAlert = (a) => !/ack/i.test(String(a?.status || ''));
const sevRank = (s) => ({ critical: 3, high: 2, medium: 1 }[String(s || '').toLowerCase()] ?? 0);

function AlertTicker({ alerts }) {
  if (alerts.isLoading) return <LoadingSkeleton lines={4} />;
  if (alerts.error) return <QueryFallback query={alerts} what="alerts" />;
  const open = (alerts.data || []).filter(isOpenAlert)
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0))
    .slice(0, 6);
  if (!open.length) return <EmptyState compact title="No active alerts" message="No anomalies flagged in the current window." />;
  return (
    <ul className="divide-y divide-grid/50">
      {open.map((a) => (
        <li key={a.alertId} className="py-2 first:pt-0 last:pb-0">
          <Link to="/alerts" className="flex items-center gap-3 group">
            <PulseDot />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink truncate group-hover:text-amber transition-colors">
                {a.narrative || `${a.headName || 'Anomaly'} spike`}
              </p>
              <p className="text-[11px] text-muted truncate">
                {a.districtName || a.districtId} · {a.headName || ''}
              </p>
            </div>
            <Badge tone="red">z {fmtNum(a.zScore, 1)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { apiParams, districtId } = useUrlFilters();
  const kpis = useKpis(apiParams);
  const geo = useDistrictsGeo(apiParams);
  const trends = useTrendsMonthly(apiParams);
  const share = useCategoryShare(apiParams);
  const alerts = useAlerts();

  const k = kpis.data || {};
  const detectionPct = Number(k.detectionRate) <= 1 ? Number(k.detectionRate) * 100 : Number(k.detectionRate);

  const choroValues = useMemo(() => aggregateCountsPerPolygon(geo.data || []), [geo.data]);
  const alertPolygons = useMemo(
    () => [...new Set((geo.data || []).filter((d) => d.alert).map((d) => polygonForUnit(d.districtId)).filter(Boolean))],
    [geo.data],
  );

  const trendOption = useMemo(() => {
    const t = trends.data || { months: [], series: [] };
    if (!t.months.length) return null;
    const months = t.months.slice(-12);
    const offset = t.months.length - months.length;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0, type: 'scroll' },
      grid: { left: 44, right: 12, top: 16, bottom: 34 },
      xAxis: { type: 'category', data: months.map(monthLabel) },
      yAxis: { type: 'value' },
      series: t.series.map((s) => ({
        name: s.name,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 20,
        emphasis: { focus: 'series' },
        data: s.data.slice(offset),
      })),
    };
  }, [trends.data]);

  const openAlertCount = (alerts.data || []).filter(isOpenAlert).length;

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Command Dashboard</h1>
          <p className="page-subtitle">Statewide crime intelligence at a glance</p>
        </div>
        <FilterBar className="!bg-transparent !border-0 !px-0 !py-0" />
      </div>

      <OmniBox />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile
          label="FIRs this month"
          value={k.totalFirs}
          delta={Number(k.momPct)}
          positiveIsGood={false}
          loading={kpis.isLoading}
          hint="vs previous month"
        />
        <KpiTile
          label="Heinous cases"
          value={k.heinousCount}
          accent="red"
          loading={kpis.isLoading}
          hint="gravity: heinous"
        />
        <KpiTile
          label="Detection rate"
          value={Number.isFinite(detectionPct) ? `${detectionPct.toFixed(1)}%` : '—'}
          accent="teal"
          loading={kpis.isLoading}
          hint="chargesheet A / (A + C)"
        />
        <KpiTile
          label="Active alerts"
          value={k.activeAlerts}
          accent="red"
          pulse={Number(k.activeAlerts) > 0}
          loading={kpis.isLoading}
          hint="unacknowledged anomalies"
        />
      </div>
      {kpis.error && (
        <Card><QueryFallback query={kpis} what="headline KPIs" /></Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card
          title="Karnataka — case density"
          subtitle={districtId ? 'Filtered district highlighted by volume' : 'All police units, summed per census district'}
          actions={<Link to="/map" className="text-xs text-amber hover:underline">Open GeoIntel →</Link>}
        >
          {geo.error ? (
            <QueryFallback query={geo} what="the choropleth" />
          ) : geo.isLoading ? (
            <LoadingSkeleton height={300} />
          ) : (
            <>
              <MiniChoropleth
                values={choroValues}
                alerts={alertPolygons}
                height={300}
                onPolygonClick={(name) => {
                  const units = unitsForPolygon(name);
                  navigate(`/map${units.length ? `?districtId=${units[0]}` : ''}`);
                }}
              />
              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted">
                <span>Low</span>
                <span className="h-1.5 w-24 rounded-full" style={{ background: 'linear-gradient(90deg,#233150,#F5A623)' }} />
                <span>High</span>
                {alertPolygons.length > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1.5"><PulseDot /> anomaly district</span>
                )}
              </div>
            </>
          )}
        </Card>

        <div className="xl:col-span-2">
          <ChartPanel
            title="12-month trend by crime head"
            subtitle="Stacked monthly FIR counts"
            option={trendOption}
            loading={trends.isLoading}
            empty={!trends.isLoading && !trendOption}
            emptyMessage={trends.error?.message || 'No monthly aggregates for the current filters.'}
            height={332}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Card title="Rising crime subheads" subtitle="Largest month-over-month increases">
            <RisingChips kpis={kpis} share={share} />
          </Card>
        </div>
        <Card
          title="Live alerts"
          subtitle={openAlertCount ? `${fmtInt(openAlertCount)} open anomalies` : 'Anomaly feed'}
          actions={<Link to="/alerts" className="text-xs text-amber hover:underline">All alerts →</Link>}
        >
          <AlertTicker alerts={alerts} />
        </Card>
      </div>
    </div>
  );
}
