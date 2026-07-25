// Route 6 /predict — 30-day station-risk league table (histogram, sparklines,
// station dossier drawer) + Karnataka risk map with driver chips, live QuickML
// outcome panel (probability gauge + sensitivity sweep + run history), the
// district × head forecast explorer with CI band + backtest MAPE badge, the
// client-side backtest scoreboard, the what-if scenario planner, and model
// cards documenting every model's method and caveats. See client/CONTRACT.md.
// The station-risk model has no crime-head dimension, so the FilterBar here
// deliberately shows only the district select — a badge states the scope
// instead of offering a select that silently does nothing.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStationRisk, useLookups } from '../lib/api.js';
import { useT, useNames } from '../lib/i18n.jsx';
import { useUrlFilters, filterSearchString } from '../lib/filters.js';
import { normalizeUnitCode, unitsForPolygon } from '../lib/districtGeoMap.js';
import FilterBar from '../components/FilterBar.jsx';
import Badge from '../components/Badge.jsx';
import RiskLeagueTable from './predict/RiskLeagueTable.jsx';
import RiskMap from './predict/RiskMap.jsx';
import RiskDrawer from './predict/RiskDrawer.jsx';
import OutcomePanel from './predict/OutcomePanel.jsx';
import ForecastExplorer from './predict/ForecastExplorer.jsx';
import BacktestPanel from './predict/BacktestPanel.jsx';
import ScenarioPanel from './predict/ScenarioPanel.jsx';
import ModelCards from './predict/ModelCards.jsx';

export default function Predict() {
  const navigate = useNavigate();
  const t = useT();
  const tName = useNames();
  const [searchParams] = useSearchParams();
  const { districtId, crimeHeadId, setFilter } = useUrlFilters();
  const lookups = useLookups();
  const risk = useStationRisk(); // horizon 30 by default (hook contract)
  const [drawerRow, setDrawerRow] = useState(null);

  // District names are translated once here, so the league table, the dossier
  // drawer and every export downstream read the same localized label.
  const districtNames = useMemo(() => {
    const m = new Map();
    for (const d of lookups.data?.districts || []) {
      m.set(String(d.districtId), tName('districts', d.districtId, d.districtName));
    }
    return m;
  }, [lookups.data, tName]);

  // Rank stations by risk desc; apply the shared district filter client-side
  // (the /risk/stations endpoint returns the full state).
  const rows = useMemo(() => {
    let r = risk.data || [];
    if (districtId) {
      const want = normalizeUnitCode(districtId);
      r = r.filter((x) => normalizeUnitCode(x.districtId) === want);
    }
    return [...r]
      .sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0))
      .map((x, i) => ({
        ...x,
        rank: i + 1,
        districtName: districtNames.get(String(x.districtId)) || x.districtId,
      }));
  }, [risk.data, districtId, districtNames]);

  // Carry the user's current shared filters onto /map instead of rebuilding
  // the URL from scratch (the app-wide URL-filter convention).
  const openOnMap = (r) => {
    if (!r?.districtId) return;
    const qs = new URLSearchParams(filterSearchString(searchParams));
    qs.set('districtId', normalizeUnitCode(r.districtId));
    navigate(`/map?${qs.toString()}`);
  };

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t('trends.predict.page.title')}</h1>
          <p className="page-subtitle">{t('trends.predict.page.subtitle')}</p>
        </div>
        <ModelCards />
      </div>

      <FilterBar show={['district']}>
        <Badge tone="slate">{t('trends.predict.scopeBadge')}</Badge>
      </FilterBar>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <RiskLeagueTable
            rows={rows}
            loading={risk.isLoading}
            error={risk.error}
            onRetry={() => risk.refetch()}
            onRowClick={openOnMap}
            onDetails={setDrawerRow}
          />
        </div>
        <RiskMap
          rows={rows}
          loading={risk.isLoading}
          error={risk.error}
          onRetry={() => risk.refetch()}
          onPolygonClick={(name) => {
            const units = unitsForPolygon(name);
            if (units.length) setFilter('districtId', units[0]);
          }}
        />
      </div>

      <OutcomePanel />

      <ForecastExplorer defaultDistrictId={districtId} defaultCrimeHeadId={crimeHeadId} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <BacktestPanel defaultDistrictId={districtId} defaultCrimeHeadId={crimeHeadId} />
        <ScenarioPanel defaultDistrictId={districtId} defaultCrimeHeadId={crimeHeadId} />
      </div>

      <RiskDrawer
        open={!!drawerRow}
        row={drawerRow}
        rows={rows}
        onClose={() => setDrawerRow(null)}
        onOpenMap={(r) => { setDrawerRow(null); openOnMap(r); }}
      />
    </div>
  );
}
