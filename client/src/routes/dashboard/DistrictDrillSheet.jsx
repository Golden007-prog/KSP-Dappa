// District drill sheet — opens when a choropleth polygon (or city marker) is
// clicked, instead of instantly navigating away. Shows the polygon's police
// units (switchable when a census district hosts 2+ units), headline stats,
// a 12-month sparkline with 2σ spike dots, top crime heads, the district's
// spatiotemporal peak window, its highest-risk station and open alerts, plus
// one-tap actions: filter the dashboard, or open GeoIntel / Trends / Cases
// with the district merged into the current filters.
// Props: polygon, onClose, baseParams (apiParams sans districtId), rows
// (unfiltered geo rows), alerts, hotspots, riskRows, linkSearch,
// activeDistrictId, onFilterDistrict(unitId).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useTrendsMonthly, useCategoryShare } from '../../lib/api.js';
import { unitsForPolygon, unitInfo, normalizeUnitCode } from '../../lib/districtGeoMap.js';
import { fmtInt, fmtNum, fmtCompact, monthLabel } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { isOpenAlert, sevRank, relTime } from './AlertsFeed.jsx';
import { detectSpikes, hourBandLabel, unitPopulation } from './insights.js';
import DashChart from './DashChart.jsx';

const SEV_TONE = { critical: 'red', high: 'red', medium: 'amber', low: 'neutral' };

function Stat({ label, children }) {
  return (
    <div className="rounded-lg border border-grid bg-canvas/40 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="num mt-0.5 text-sm font-semibold text-ink">{children}</p>
    </div>
  );
}

function Sparkline({ trends }) {
  const t = useT();
  const option = useMemo(() => {
    const d = trends.data;
    if (!d || !d.months?.length) return null;
    const totals = d.months.map((_, i) => (d.series || []).reduce((a, s) => a + (Number(s.data?.[i]) || 0), 0));
    const months = d.months.slice(-12);
    const values = totals.slice(-12);
    if (!values.some((v) => v > 0)) return null;
    const spikes = detectSpikes(totals).filter((s) => s.index >= totals.length - 12);
    const offset = totals.length - values.length;
    return {
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtInt(v) },
      grid: { left: 36, right: 8, top: 8, bottom: 20 },
      xAxis: { type: 'category', data: months.map(monthLabel), axisLabel: { fontSize: 9, interval: 2 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 9 }, splitNumber: 3 },
      series: [
        { name: t('dashboard.series.firs'), type: 'line', smooth: true, showSymbol: false, areaStyle: { opacity: 0.12 }, data: values },
        {
          name: t('dashboard.series.spike'),
          type: 'scatter',
          symbolSize: 7,
          itemStyle: { color: '#E5484D' },
          data: spikes.map((s) => [s.index - offset, totals[s.index]]),
          tooltip: { valueFormatter: (v) => fmtInt(Array.isArray(v) ? v[1] : v) },
        },
      ],
    };
  }, [trends.data, t]);

  if (trends.isLoading) return <LoadingSkeleton height={110} />;
  if (!option) return <p className="text-[11px] text-muted">{t('dashboard.drill.noHistory')}</p>;
  return <DashChart option={option} height={110} />;
}

export default function DistrictDrillSheet({
  polygon, onClose, baseParams = {}, rows = [], alerts = [], hotspots = [],
  riskRows = [], linkSearch = '', activeDistrictId = '', onFilterDistrict,
}) {
  const t = useT();
  const tName = useNames();
  const units = useMemo(() => unitsForPolygon(polygon), [polygon]);
  const unitRows = useMemo(
    () => rows.filter((r) => units.includes(normalizeUnitCode(r.districtId))),
    [rows, units],
  );
  const defaultUnit = useMemo(() => {
    const busiest = [...unitRows].sort((a, b) => (b.caseCount || 0) - (a.caseCount || 0))[0];
    return normalizeUnitCode(busiest?.districtId) || units[0] || '';
  }, [unitRows, units]);
  const [picked, setPicked] = useState('');
  const unit = units.includes(picked) ? picked : defaultUnit;

  const params = useMemo(() => ({ ...baseParams, districtId: unit }), [baseParams, unit]);
  const trends = useTrendsMonthly(params);
  const share = useCategoryShare(params);

  const row = unitRows.find((r) => normalizeUnitCode(r.districtId) === unit);
  const polygonTotal = unitRows.reduce((a, r) => a + (Number(r.caseCount) || 0), 0);
  const population = row ? unitPopulation(row) : null;

  const topHeads = useMemo(() => {
    const items = [...(share.data || [])].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 5);
    const max = Math.max(1, ...items.map((s) => s.count || 0));
    return { items, max };
  }, [share.data]);

  const peak = useMemo(() => {
    const mine = (hotspots || []).filter((h) => units.includes(normalizeUnitCode(h.districtId)));
    return [...mine].sort((a, b) => (Number(b.intensity) || 0) - (Number(a.intensity) || 0))[0] || null;
  }, [hotspots, units]);

  const topRisk = useMemo(() => {
    const mine = (riskRows || []).filter((r) => units.includes(normalizeUnitCode(r.districtId)));
    return [...mine].sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0))[0] || null;
  }, [riskRows, units]);

  const openAlerts = useMemo(
    () => (alerts || [])
      .filter((a) => isOpenAlert(a) && units.includes(normalizeUnitCode(a.districtId)))
      .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
      .slice(0, 3),
    [alerts, units],
  );

  const linkTo = (path) => {
    const qs = new URLSearchParams(linkSearch ? linkSearch.slice(1) : '');
    if (unit) qs.set('districtId', unit);
    const s = qs.toString();
    return `${path}${s ? `?${s}` : ''}`;
  };

  const isActive = normalizeUnitCode(activeDistrictId) === unit;

  return (
    <Sheet open={!!polygon} onClose={onClose} title={polygon || t('dashboard.drill.district')}>
      <div className="space-y-3.5 px-1">
        {units.length > 1 && (
          <div role="group" aria-label={t('dashboard.drill.unitsAria')} className="flex flex-wrap gap-1.5">
            {units.map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={u === unit}
                onClick={() => setPicked(u)}
                className={`chip min-h-[36px] px-2.5 transition-colors ${
                  u === unit ? '!border-amber/60 !text-amber bg-amber/5' : 'hover:border-amber/40'
                }`}
              >
                {tName('districts', u, unitInfo(u)?.name || u) || u}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="slate">{tName('districts', unit, unitInfo(unit)?.name || unit) || unit}</Badge>
          {row?.alert && <Badge tone="red" pulse>{t('dashboard.drill.anomaly')}</Badge>}
          {peak && (
            <Badge tone="amber">
              {t('dashboard.drill.peak', { band: hourBandLabel(peak.hourBandStart, peak.hourBandEnd) })}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label={t('dashboard.drill.casesPeriod')}>{fmtInt(row?.caseCount)}</Stat>
          <Stat label={t('dashboard.drill.ratePerLakh')}>
            {Number.isFinite(Number(row?.ratePerLakh)) ? fmtNum(row.ratePerLakh, 1) : '—'}
          </Stat>
          <Stat label={t('dashboard.drill.momChange')}>
            <StatDelta value={Number(row?.momDeltaPct)} positiveIsGood={false} />
          </Stat>
          <Stat label={t('dashboard.drill.population')}>{population ? fmtCompact(population) : '—'}</Stat>
        </div>
        {units.length > 1 && (
          <p className="text-[11px] text-muted">
            {t('dashboard.drill.districtTotal', { n: units.length, total: fmtInt(polygonTotal) })}
          </p>
        )}

        <section>
          <p className="eyebrow mb-1">{t('dashboard.drill.trendHeading')}</p>
          <Sparkline trends={trends} />
        </section>

        <section>
          <p className="eyebrow mb-1.5">{t('dashboard.drill.topHeads')}</p>
          {share.isLoading ? (
            <LoadingSkeleton lines={4} />
          ) : !topHeads.items.length ? (
            <EmptyState
              compact
              title={t('dashboard.drill.noCategory')}
              message={t('dashboard.drill.noCategoryHint')}
            />
          ) : (
            <ul className="space-y-1.5">
              {topHeads.items.map((s) => (
                <li key={s.id || s.name} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">
                    {tName('crimeHeads', s.id, s.name) || s.name}
                  </span>
                  <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-grid/50" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-amber/80"
                      style={{ width: `${Math.max(5, Math.round(((s.count || 0) / topHeads.max) * 100))}%` }}
                    />
                  </span>
                  <span className="num w-12 shrink-0 text-right text-xs text-muted">{fmtInt(s.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {topRisk && (
          <p className="text-[11px] text-muted">
            {t('dashboard.drill.topRiskPrefix')}{' '}
            <Link to={linkTo('/predict')} className="text-amber hover:underline">
              {topRisk.unitName || topRisk.unitId}
            </Link>{' '}
            {t('dashboard.drill.topRiskSuffix', { score: fmtNum(topRisk.riskScore, 1) })}
          </p>
        )}

        {openAlerts.length > 0 && (
          <section>
            <p className="eyebrow mb-1.5">{t('dashboard.drill.openAlerts')}</p>
            <ul className="space-y-1.5">
              {openAlerts.map((a, i) => {
                const sev = String(a.severity || 'medium').toLowerCase();
                return (
                  <li key={a.alertId || i} className="flex items-center gap-2">
                    <Badge tone={SEV_TONE[sev] || 'neutral'} pulse={sev === 'critical'}>{t(`dashboard.sev.${sev}`)}</Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">
                      {tName('crimeHeads', a.crimeHeadId, a.headName) || t('dashboard.alerts.anomaly')}
                    </span>
                    <span className="num shrink-0 text-[11px] text-muted">{t('dashboard.alerts.z', { v: fmtNum(a.zScore, 1) })}</span>
                    <span className="num shrink-0 text-[10px] text-muted/80">{relTime(a.periodEnd, t)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className={`btn min-h-[44px] ${isActive ? '!border-amber/60 !text-amber' : ''}`}
            onClick={() => onFilterDistrict?.(isActive ? '' : unit)}
          >
            {t(isActive ? 'dashboard.drill.clearFilter' : 'dashboard.drill.filter')}
          </button>
          <Link to={linkTo('/map')} className="btn min-h-[44px]">{t('dashboard.link.geointel')}</Link>
          <Link to={linkTo('/trends')} className="btn min-h-[44px]">{t('dashboard.link.trends')}</Link>
          <Link to={linkTo('/cases')} className="btn min-h-[44px]">{t('dashboard.link.cases')}</Link>
        </div>
      </div>
    </Sheet>
  );
}
