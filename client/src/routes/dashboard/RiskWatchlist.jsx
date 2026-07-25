// Station risk watchlist — top predicted 30-day risk stations from
// /risk/stations with a relative risk bar and driver chips; rows deep-link to
// the Predict workbench with the current filters carried.
// Props: query (useStationRisk result), linkSearch.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { unitInfo } from '../../lib/districtGeoMap.js';
import { fmtNum } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';

const SHOW = 6;

export default function RiskWatchlist({ query, linkSearch = '' }) {
  const t = useT();
  const tName = useNames();
  const top = useMemo(
    () => [...(query.data || [])]
      .filter((r) => Number.isFinite(Number(r.riskScore)))
      .sort((a, b) => Number(b.riskScore) - Number(a.riskScore))
      .slice(0, SHOW),
    [query.data],
  );

  if (query.isLoading) return <LoadingSkeleton lines={6} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title={t('dashboard.risk.error')}
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }
  if (!top.length) {
    return <EmptyState compact title={t('dashboard.risk.empty')} message={t('dashboard.risk.emptyHint')} />;
  }

  const maxRisk = Math.max(1e-9, ...top.map((r) => Number(r.riskScore) || 0));

  return (
    <div className="space-y-2">
      <ol className="divide-y divide-grid/50">
        {top.map((r, i) => {
          const drivers = Array.isArray(r.drivers) ? r.drivers.slice(0, 2) : [];
          const district = tName('districts', r.districtId, unitInfo(r.districtId)?.name);
          return (
            <li key={r.unitId || i}>
              <Link
                to={`/predict${linkSearch}`}
                title={t('dashboard.risk.rowTitle', {
                  station: r.unitName || t('dashboard.risk.station'),
                  score: fmtNum(r.riskScore, 1),
                })}
                className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-grid/30"
              >
                <span className="num w-5 shrink-0 text-center text-[11px] text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-ink">{r.unitName || r.unitId}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {district && <span className="truncate text-[10px] text-muted">{district}</span>}
                    {drivers.map((d) => (
                      <span key={d} className="shrink-0 rounded-full border border-grid bg-base/50 px-1.5 text-[9px] text-muted">
                        {d}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-grid/50 sm:w-20" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-amber/80"
                    style={{ width: `${Math.max(6, Math.round(((Number(r.riskScore) || 0) / maxRisk) * 100))}%` }}
                  />
                </span>
                <span className="num shrink-0 text-xs font-semibold text-ink">{fmtNum(r.riskScore, 1)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="text-[10px] text-muted">{t('dashboard.risk.footnote')}</p>
    </div>
  );
}
