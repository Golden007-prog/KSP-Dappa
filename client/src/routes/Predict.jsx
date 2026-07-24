// Route 6 /predict — 30-day station-risk league table + Karnataka risk map
// with driver chips, live QuickML outcome panel (probability gauge + model
// source badge + ROC-AUC), and the district × head forecast explorer with CI
// band + backtest MAPE badge. See client/CONTRACT.md.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStationRisk, useLookups } from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import { normalizeUnitCode, unitsForPolygon } from '../lib/districtGeoMap.js';
import FilterBar from '../components/FilterBar.jsx';
import RiskLeagueTable from './predict/RiskLeagueTable.jsx';
import RiskMap from './predict/RiskMap.jsx';
import OutcomePanel from './predict/OutcomePanel.jsx';
import ForecastExplorer from './predict/ForecastExplorer.jsx';

export default function Predict() {
  const navigate = useNavigate();
  const { districtId, crimeHeadId, setFilter } = useUrlFilters();
  const lookups = useLookups();
  const risk = useStationRisk(); // horizon 30 by default (hook contract)

  const districtNames = useMemo(() => {
    const m = new Map();
    for (const d of lookups.data?.districts || []) m.set(String(d.districtId), d.districtName);
    return m;
  }, [lookups.data]);

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

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Predict</h1>
          <p className="page-subtitle">30-day station risk · live outcome scoring · district forecasts</p>
        </div>
      </div>

      <FilterBar show={['district', 'crimeHead']} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <RiskLeagueTable
            rows={rows}
            loading={risk.isLoading}
            error={risk.error}
            onRetry={() => risk.refetch()}
            onRowClick={(r) => r.districtId && navigate(`/map?districtId=${normalizeUnitCode(r.districtId)}`)}
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
    </div>
  );
}
