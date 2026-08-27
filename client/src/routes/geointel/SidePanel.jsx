// GeoIntel side panel — two drill modes:
//   district: stations of the clicked census polygon (1..3 police units,
//             one /geo/stations query per unit) sorted by case volume, plus a
//             12-month trend sparkline and a day×hour seasonality heat-strip;
//   station:  KPI tiles (cases in window, 30-day risk + drivers), recent cases
//             via /cases?unitId with client-side status quick-filters, and a
//             'pin to compare' toggle — two pinned stations render side-by-side
//             KPI columns at the top of the panel.
// /cases rows carry names but no lookup ids, so the route passes `nameIds`
// (name → id reverse maps from /meta/lookups) to translate them via tName.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCases, useStationRisk } from '../../lib/api.js';
import { normalizeUnitCode, unitInfo } from '../../lib/districtGeoMap.js';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { dateLabel, fmtInt, monthLabel } from '../../lib/format.js';
import { useSeasonalityForUnits, useStationsForUnits, useTrendsForUnits } from './hooks.js';
import { risk01, riskColor, riskLabel } from './utils.js';
import HotspotPanel from './HotspotPanel.jsx';
import { useI18n } from '../../lib/i18n.jsx';

const EMPTY_IDS = {};

/** 'Mon' / 'Monday' → the localised 3-glyph weekday label. */
function dayLabel(t, raw) {
  const key = String(raw || '').slice(0, 3).toLowerCase();
  return key ? t(`geointel.day.${key}`) : '';
}

export function PanelHeader({ title, subtitle, onBack, onClose }) {
  const { t } = useI18n();
  return (
    <header className="flex items-center gap-2 px-3 py-2.5 border-b border-grid shrink-0">
      {onBack && (
        <button type="button" className="btn gi-tap !px-2 !py-1" onClick={onBack} title={t('geointel.panel.backTitle')} aria-label={t('geointel.panel.back')}>
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
      <button type="button" className="btn gi-tap !px-2 !py-1 shrink-0" onClick={onClose} title={t('geointel.panel.close')} aria-label={t('geointel.panel.close')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </header>
  );
}

function RiskBar({ r }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-grid overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round((r ?? 0) * 100)}%`, background: riskColor(r) }}
        />
      </div>
      <span className="num text-[10px] text-muted w-14 text-right truncate">
        {r === null ? t('geointel.panel.riskNone') : t('geointel.panel.riskValue', { n: Math.round(r * 100) })}
      </span>
    </div>
  );
}

/** Tiny 12-month SVG sparkline for the district drill. */
function TrendSparkline({ months }) {
  const { t } = useI18n();
  const pts = months.slice(-12);
  if (pts.length < 2) return null;
  const w = 260;
  const h = 40;
  const max = Math.max(1, ...pts.map((p) => p.total));
  const step = w / (pts.length - 1);
  const xy = pts.map((p, i) => [i * step, h - 3 - (p.total / max) * (h - 8)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-10"
        preserveAspectRatio="none"
        role="img"
        aria-label={t('geointel.panel.trendAria', {
          from: monthLabel(pts[0].ym), to: monthLabel(last.ym), n: fmtInt(last.total),
        })}
      >
        <path d={area} fill="rgb(var(--t-amber) / 0.12)" />
        <path d={line} fill="none" stroke="rgb(var(--t-amber))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="2.5" fill="rgb(var(--t-amber))" />
      </svg>
      <div className="flex justify-between text-[9px] text-muted num leading-none mt-0.5">
        <span>{monthLabel(pts[0].ym)}</span>
        <span>{t('geointel.panel.trendLatest', { n: fmtInt(last.total), month: monthLabel(last.ym) })}</span>
      </div>
    </div>
  );
}

/** Day×hour seasonality heat-strip (7×24 cells, amber alpha scale). */
function SeasonalityStrip({ days, matrix, max }) {
  const { t } = useI18n();
  if (!matrix.length || !max) return null;
  return (
    <div className="space-y-px" role="img" aria-label={t('geointel.panel.seasonAria')}>
      {matrix.map((row, d) => {
        const label = dayLabel(t, days[d]);
        return (
          <div key={days[d] || d} className="flex items-center gap-1.5">
            {/* w-8 (not w-6): Kannada weekday stems need the extra px */}
            <span className="w-8 text-[8px] text-muted shrink-0 truncate">{label}</span>
            <div className="flex-1 grid gap-px" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {row.map((v, h) => (
                <span
                  key={h}
                  className="h-2 rounded-[1px]"
                  title={t('geointel.panel.seasonCell', { day: label, hour: `${String(h).padStart(2, '0')}:00`, n: fmtInt(v) })}
                  style={{ background: v > 0 ? `rgb(var(--t-amber) / ${(0.15 + 0.85 * (v / max)).toFixed(2)})` : 'rgb(var(--t-grid) / 0.5)' }}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex justify-between pl-9 text-[8px] text-muted num pt-0.5">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </div>
  );
}

function DistrictDrill({ polygon, unitIds, title, apiParams, onStationSelect, onClose }) {
  const { t, tName } = useI18n();
  const stations = useStationsForUnits(unitIds, apiParams);
  // Enrichment context: same crime-head lens, but the full monthly history so
  // the sparkline always shows a year of shape (the window filter would often
  // truncate it to a flat stub).
  const trendParams = useMemo(
    () => (apiParams.crimeHeadId ? { crimeHeadId: apiParams.crimeHeadId } : {}),
    [apiParams.crimeHeadId],
  );
  const trends = useTrendsForUnits(unitIds, trendParams);
  const seasonality = useSeasonalityForUnits(unitIds, trendParams);
  const rows = useMemo(
    () => [...stations.rows].sort((a, b) => (Number(b.caseCount) || 0) - (Number(a.caseCount) || 0)),
    [stations.rows],
  );
  const totalCases = rows.reduce((acc, s) => acc + (Number(s.caseCount) || 0), 0);
  return (
    <>
      <PanelHeader
        title={title || polygon}
        subtitle={unitIds.length === 1
          ? t('geointel.panel.unitsOne')
          : t('geointel.panel.unitsMany', { n: unitIds.length })}
        onClose={onClose}
      />
      <div className="px-3 py-2 border-b border-grid/60 flex flex-wrap gap-1.5 shrink-0">
        {unitIds.map((id) => (
          <span key={id} className="chip">{tName('districts', id, unitInfo(id)?.name || id)}</span>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {trends.months.length > 1 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{t('geointel.panel.trend12m')}</p>
            <TrendSparkline months={trends.months} />
          </div>
        )}
        {seasonality.max > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{t('geointel.panel.whenIncidents')}</p>
            <SeasonalityStrip days={seasonality.days} matrix={seasonality.matrix} max={seasonality.max} />
          </div>
        )}
        {stations.isLoading ? (
          <LoadingSkeleton lines={6} />
        ) : stations.error ? (
          <EmptyState
            compact
            title={t('geointel.panel.stationsError')}
            message={stations.error.message}
            action={<button type="button" className="btn" onClick={stations.refetch}>{t('common.action.retry')}</button>}
          />
        ) : !rows.length ? (
          <EmptyState compact title={t('geointel.panel.noStations')} message={t('geointel.panel.noStationsMsg')} />
        ) : (
          <>
            <p className="text-[11px] text-muted">
              {t('geointel.panel.stationsCount', { n: fmtInt(rows.length) })}
              {' · '}
              <span className="num">{t('geointel.panel.casesInWindow', { n: fmtInt(totalCases) })}</span>
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

function StationDrill({ station, apiParams, onBack, onClose, pins, onTogglePin, nameIds = EMPTY_IDS }) {
  const { t, tName } = useI18n();
  // unitId already narrows to one station — drop the district filter so a
  // station clicked outside the filtered district still shows its cases.
  const { districtId: _districtFilter, ...windowParams } = apiParams;
  const cases = useCases({ ...windowParams, unitId: station.unitId, perPage: 8 });
  const risk = useStationRisk();
  const [statusFilter, setStatusFilter] = useState('');
  const code = normalizeUnitCode(station.unitId);
  const riskRow = (risk.data || []).find((x) => normalizeUnitCode(x.unitId) === code);
  const r = risk01(riskRow?.riskScore ?? station.riskScore);
  const parent = unitInfo(station.districtId);
  const parentName = tName('districts', station.districtId, parent?.name);
  const rows = cases.data?.rows || [];
  const statuses = useMemo(
    () => [...new Set(rows.map((c) => c.statusName).filter(Boolean))],
    [rows],
  );
  const shownRows = statusFilter ? rows.filter((c) => c.statusName === statusFilter) : rows;
  const pinned = (pins || []).some((p) => String(p.unitId) === String(station.unitId));
  // /cases rows expose names only; the reverse maps recover the lookup id.
  const statusLabel = (name) => tName('statuses', nameIds.statuses?.[name], name);
  const headLabel = (c) => (c.subHeadName
    ? tName('crimeSubHeads', nameIds.crimeSubHeads?.[c.subHeadName], c.subHeadName)
    : tName('crimeHeads', nameIds.crimeHeads?.[c.headName], c.headName));

  return (
    <>
      <PanelHeader
        title={station.unitName || t('geointel.panel.unitFallback', { id: station.unitId })}
        subtitle={parentName ? t('geointel.panel.stationIn', { district: parentName }) : t('geointel.panel.station')}
        onBack={onBack}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-grid bg-base/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">{t('geointel.panel.casesInWindowLabel')}</p>
            <p className="num text-lg font-semibold text-ink">{fmtInt(station.caseCount)}</p>
          </div>
          <div className="rounded-lg border border-grid bg-base/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">{t('geointel.panel.riskScore')}</p>
            <p className="num text-lg font-semibold" style={{ color: riskColor(r) }}>
              {r === null ? '—' : Math.round(r * 100)}
            </p>
            <p className="text-[10px] text-muted">{t('geointel.panel.next30', { label: riskLabel(r, t) })}</p>
          </div>
        </div>

        {onTogglePin && (
          <button
            type="button"
            className={`chip gi-tap transition-colors ${pinned ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'}`}
            aria-pressed={pinned}
            onClick={() => onTogglePin(station)}
            title={t('geointel.panel.pinHint')}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 17v5M9 3h6l1 7 2.5 2.5H5.5L8 10l1-7Z" />
            </svg>
            {pinned ? t('geointel.panel.pinned') : t('geointel.panel.pin')}
          </button>
        )}

        {(riskRow?.drivers || []).length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{t('geointel.panel.riskDrivers')}</p>
            <div className="flex flex-wrap gap-1.5">
              {riskRow.drivers.map((d, i) => (
                <span key={i} className="chip">{d}</span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider text-muted">{t('geointel.panel.recentCases')}</p>
            <Link
              to={`/cases${station.districtId ? `?districtId=${normalizeUnitCode(station.districtId)}` : ''}`}
              className="text-[10px] text-amber hover:underline"
            >
              {t('geointel.panel.openExplorer')}
            </Link>
          </div>
          {statuses.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-1.5" role="group" aria-label={t('geointel.panel.statusFilterAria')}>
              <button
                type="button"
                aria-pressed={!statusFilter}
                className={`chip gi-tap text-[10px] ${!statusFilter ? '!border-primary/60 !text-primary' : 'text-muted hover:text-ink'}`}
                onClick={() => setStatusFilter('')}
              >
                {t('geointel.panel.statusAll')}
              </button>
              {statuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={statusFilter === s}
                  className={`chip gi-tap text-[10px] ${statusFilter === s ? '!border-primary/60 !text-primary' : 'text-muted hover:text-ink'}`}
                  onClick={() => setStatusFilter((cur) => (cur === s ? '' : s))}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          )}
          {cases.isLoading ? (
            <LoadingSkeleton lines={5} />
          ) : cases.error ? (
            <EmptyState
              compact
              title={t('geointel.panel.casesError')}
              message={cases.error.message}
              action={<button type="button" className="btn" onClick={() => cases.refetch()}>{t('common.action.retry')}</button>}
            />
          ) : !rows.length ? (
            <EmptyState compact title={t('geointel.panel.noCases')} message={t('geointel.panel.noCasesMsg')} />
          ) : !shownRows.length ? (
            <p className="text-[11px] text-muted py-1.5">{t('geointel.panel.noCasesStatus')}</p>
          ) : (
            <ul className="divide-y divide-grid/50">
              {shownRows.map((c) => (
                <li key={c.caseMasterId} className="py-1.5">
                  <Link to={`/cases/${c.caseMasterId}`} className="block group">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-[11px] text-ink group-hover:text-amber transition-colors truncate">
                        {c.crimeNo}
                      </span>
                      {c.anomalyFlag ? <Badge tone="red" pulse>{t('geointel.panel.anomaly')}</Badge> : null}
                    </div>
                    <p className="text-[10px] text-muted truncate">
                      {dateLabel(c.registeredDate)} · {headLabel(c)} · {statusLabel(c.statusName)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {Number(cases.data?.total) > rows.length && (
            <p className="text-[10px] text-muted mt-1">
              <span className="num">{t('geointel.panel.totalInWindow', { n: fmtInt(cases.data.total) })}</span>
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** Side-by-side KPI columns for two pinned stations. */
function CompareBlock({ pins, onTogglePin, onClear }) {
  const { t } = useI18n();
  const risk = useStationRisk();
  return (
    <div className="px-3 py-2.5 border-b border-grid shrink-0 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted">{t('geointel.panel.compare')}</p>
        <button type="button" className="text-[10px] text-muted hover:text-ink underline transition-colors" onClick={onClear}>
          {t('common.action.clear')}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {pins.map((s) => {
          const code = normalizeUnitCode(s.unitId);
          const riskRow = (risk.data || []).find((x) => normalizeUnitCode(x.unitId) === code);
          const r = risk01(riskRow?.riskScore ?? s.riskScore);
          const name = s.unitName || t('geointel.panel.unitFallback', { id: s.unitId });
          return (
            <div key={s.unitId} className="rounded-lg border border-grid bg-base/40 p-2 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <p className="text-[11px] text-ink truncate font-medium">{name}</p>
                <button
                  type="button"
                  className="text-muted hover:text-ink shrink-0 transition-colors"
                  aria-label={t('geointel.panel.unpin', { name })}
                  onClick={() => onTogglePin(s)}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
              <p className="num text-sm font-semibold text-ink">{fmtInt(s.caseCount)} <span className="text-[9px] text-muted font-normal">{t('common.unit.cases')}</span></p>
              <p className="num text-sm font-semibold" style={{ color: riskColor(r) }}>
                {r === null ? '—' : Math.round(r * 100)} <span className="text-[9px] text-muted font-normal">{t('geointel.panel.riskUnit')}</span>
              </p>
              {(riskRow?.drivers || []).length > 0 && (
                <p className="text-[9px] text-muted truncate" title={riskRow.drivers.join(', ')}>
                  {riskRow.drivers.slice(0, 2).join(' · ')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SidePanel({
  drill, apiParams, onClose, onStationSelect, onBackToDistrict, pins = [], onTogglePin,
  incidentRows = [], stationsAll = [], headNames = {}, nameIds = EMPTY_IDS,
}) {
  return (
    <div className="h-full flex flex-col bg-panel/95 border border-grid rounded-xl shadow-xl overflow-hidden">
      {pins.length === 2 && (
        <CompareBlock pins={pins} onTogglePin={onTogglePin} onClear={() => pins.forEach((p) => onTogglePin(p))} />
      )}
      {drill.type === 'district' ? (
        <DistrictDrill
          polygon={drill.polygon}
          unitIds={drill.unitIds}
          title={drill.title}
          apiParams={apiParams}
          onStationSelect={onStationSelect}
          onClose={onClose}
        />
      ) : drill.type === 'hotspot' ? (
        <HotspotPanel
          hotspot={drill.hotspot}
          apiParams={apiParams}
          incidentRows={incidentRows}
          stations={stationsAll}
          headNames={headNames}
          onStationSelect={onStationSelect}
          onBack={() => onBackToDistrict({ districtId: drill.hotspot.districtId })}
          onClose={onClose}
        />
      ) : (
        <StationDrill
          station={drill.station}
          apiParams={apiParams}
          onBack={() => onBackToDistrict(drill.station)}
          onClose={onClose}
          pins={pins}
          onTogglePin={onTogglePin}
          nameIds={nameIds}
        />
      )}
    </div>
  );
}
