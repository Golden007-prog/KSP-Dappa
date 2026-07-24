// GeoIntel side panel — two drill modes:
//   district: stations of the clicked census polygon (1..3 police units,
//             one /geo/stations query per unit) sorted by case volume;
//   station:  KPI tiles (cases in window, 30-day risk + drivers) and recent
//             cases via /cases?unitId with links into the Case Explorer.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCases, useStationRisk } from '../../lib/api.js';
import { normalizeUnitCode, unitInfo } from '../../lib/districtGeoMap.js';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { useStationsForUnits } from './hooks.js';
import { risk01, riskColor, riskLabel } from './utils.js';

function PanelHeader({ title, subtitle, onBack, onClose }) {
  return (
    <header className="flex items-center gap-2 px-3 py-2.5 border-b border-grid shrink-0">
      {onBack && (
        <button type="button" className="btn !px-2 !py-1" onClick={onBack} title="Back to district drill" aria-label="Back">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-ink truncate">{title}</h2>
        {subtitle && <p className="text-[10px] text-muted truncate">{subtitle}</p>}
      </div>
      <button type="button" className="btn !px-2 !py-1 shrink-0" onClick={onClose} title="Close panel" aria-label="Close panel">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </header>
  );
}

function RiskBar({ r }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-grid overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round((r ?? 0) * 100)}%`, background: riskColor(r) }}
        />
      </div>
      <span className="num text-[10px] text-muted w-12 text-right">
        {r === null ? 'risk —' : `risk ${Math.round(r * 100)}`}
      </span>
    </div>
  );
}

function DistrictDrill({ polygon, unitIds, title, apiParams, onStationSelect, onClose }) {
  const stations = useStationsForUnits(unitIds, apiParams);
  const rows = useMemo(
    () => [...stations.rows].sort((a, b) => (Number(b.caseCount) || 0) - (Number(a.caseCount) || 0)),
    [stations.rows],
  );
  const totalCases = rows.reduce((acc, s) => acc + (Number(s.caseCount) || 0), 0);
  return (
    <>
      <PanelHeader
        title={title || polygon}
        subtitle={`${unitIds.length} police unit${unitIds.length === 1 ? '' : 's'} · station drill`}
        onClose={onClose}
      />
      <div className="px-3 py-2 border-b border-grid/60 flex flex-wrap gap-1.5 shrink-0">
        {unitIds.map((id) => (
          <span key={id} className="chip">{unitInfo(id)?.name || id}</span>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {stations.isLoading ? (
          <LoadingSkeleton lines={6} />
        ) : stations.error ? (
          <EmptyState
            compact
            title="Couldn't load stations"
            message={stations.error.message}
            action={<button type="button" className="btn" onClick={stations.refetch}>Retry</button>}
          />
        ) : !rows.length ? (
          <EmptyState compact title="No stations" message="No station-level data for this district in the current window." />
        ) : (
          <>
            <p className="text-[11px] text-muted">
              {fmtInt(rows.length)} stations · <span className="num">{fmtInt(totalCases)}</span> cases in window
            </p>
            <ul className="space-y-1.5">
              {rows.map((s) => {
                const r = risk01(s.riskScore);
                return (
                  <li key={`${s.districtId}-${s.unitId}`}>
                    <button
                      type="button"
                      onClick={() => onStationSelect(s)}
                      className="w-full text-left rounded-lg border border-grid bg-base/40 hover:border-amber/50 px-2.5 py-2 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-ink truncate">{s.unitName}</span>
                        <span className="num text-xs text-muted shrink-0">{fmtInt(s.caseCount)}</span>
                      </div>
                      <div className="mt-1.5">
                        <RiskBar r={r} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function StationDrill({ station, apiParams, onBack, onClose }) {
  // unitId already narrows to one station — drop the district filter so a
  // station clicked outside the filtered district still shows its cases.
  const { districtId: _districtFilter, ...windowParams } = apiParams;
  const cases = useCases({ ...windowParams, unitId: station.unitId, perPage: 8 });
  const risk = useStationRisk();
  const code = normalizeUnitCode(station.unitId);
  const riskRow = (risk.data || []).find((x) => normalizeUnitCode(x.unitId) === code);
  const r = risk01(riskRow?.riskScore ?? station.riskScore);
  const parent = unitInfo(station.districtId);
  const rows = cases.data?.rows || [];

  return (
    <>
      <PanelHeader
        title={station.unitName || `Unit ${station.unitId}`}
        subtitle={parent ? `${parent.name} · police station` : 'Police station'}
        onBack={onBack}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-grid bg-base/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">Cases in window</p>
            <p className="num text-lg font-semibold text-ink">{fmtInt(station.caseCount)}</p>
          </div>
          <div className="rounded-lg border border-grid bg-base/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">Risk score</p>
            <p className="num text-lg font-semibold" style={{ color: riskColor(r) }}>
              {r === null ? '—' : Math.round(r * 100)}
            </p>
            <p className="text-[10px] text-muted">{riskLabel(r)} · next 30 days</p>
          </div>
        </div>

        {(riskRow?.drivers || []).length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Risk drivers</p>
            <div className="flex flex-wrap gap-1.5">
              {riskRow.drivers.map((d, i) => (
                <span key={i} className="chip">{d}</span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider text-muted">Recent cases</p>
            <Link
              to={`/cases${station.districtId ? `?districtId=${normalizeUnitCode(station.districtId)}` : ''}`}
              className="text-[10px] text-amber hover:underline"
            >
              Open explorer →
            </Link>
          </div>
          {cases.isLoading ? (
            <LoadingSkeleton lines={5} />
          ) : cases.error ? (
            <EmptyState
              compact
              title="Couldn't load cases"
              message={cases.error.message}
              action={<button type="button" className="btn" onClick={() => cases.refetch()}>Retry</button>}
            />
          ) : !rows.length ? (
            <EmptyState compact title="No cases" message="No FIRs for this station in the current window." />
          ) : (
            <ul className="divide-y divide-grid/50">
              {rows.map((c) => (
                <li key={c.caseMasterId} className="py-1.5">
                  <Link to={`/cases/${c.caseMasterId}`} className="block group">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-[11px] text-ink group-hover:text-amber transition-colors truncate">
                        {c.crimeNo}
                      </span>
                      {c.anomalyFlag ? <Badge tone="red" pulse>anomaly</Badge> : null}
                    </div>
                    <p className="text-[10px] text-muted truncate">
                      {dateLabel(c.registeredDate)} · {c.subHeadName || c.headName} · {c.statusName}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {Number(cases.data?.total) > rows.length && (
            <p className="text-[10px] text-muted mt-1">
              <span className="num">{fmtInt(cases.data.total)}</span> total in window
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export default function SidePanel({ drill, apiParams, onClose, onStationSelect, onBackToDistrict }) {
  return (
    <div className="h-full flex flex-col bg-panel/95 border border-grid rounded-xl shadow-xl overflow-hidden">
      {drill.type === 'district' ? (
        <DistrictDrill
          polygon={drill.polygon}
          unitIds={drill.unitIds}
          title={drill.title}
          apiParams={apiParams}
          onStationSelect={onStationSelect}
          onClose={onClose}
        />
      ) : (
        <StationDrill
          station={drill.station}
          apiParams={apiParams}
          onBack={() => onBackToDistrict(drill.station)}
          onClose={onClose}
        />
      )}
    </div>
  );
}
