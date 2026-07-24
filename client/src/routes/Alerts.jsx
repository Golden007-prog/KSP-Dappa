// /alerts — anomaly feed. Severity-sorted red-pulse cards (narrative, observed
// vs expected sparkline with band, z-score, affected stations, View-on-map,
// Acknowledge via useAckAlert); acknowledged section below (master spec §7,
// route 7).
import { useMemo, useState } from 'react';
import { useAlerts, useAckAlert, useLookups } from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import FilterBar from '../components/FilterBar.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import Badge from '../components/Badge.jsx';
import PulseDot from '../components/PulseDot.jsx';
import AlertCard from './alerts/AlertCard.jsx';
import { fmtInt } from '../lib/format.js';

const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const sevRank = (s) => SEV_RANK[String(s || '').toLowerCase()] || 0;
const isAcked = (a) => /ack/i.test(String(a?.status || ''));
const bySeverity = (a, b) =>
  sevRank(b.severity) - sevRank(a.severity)
  || Math.abs(Number(b.zScore) || 0) - Math.abs(Number(a.zScore) || 0);

const SEV_FILTERS = [
  ['', 'All'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low'],
];

/** Resolve the "affected stations" chip list for one alert from the lookups. */
function stationsForAlert(a, units) {
  if (!units?.length) return null;
  if (a.unitId) {
    const unit = units.find((u) => String(u.unitId) === String(a.unitId));
    if (unit) return { names: [unit.unitName], more: 0, scope: 'unit' };
  }
  const inDistrict = units.filter((u) => String(u.districtId) === String(a.districtId));
  if (!inDistrict.length) return null;
  return {
    names: inDistrict.slice(0, 4).map((u) => u.unitName),
    more: Math.max(0, inDistrict.length - 4),
    scope: 'district',
  };
}

export default function Alerts() {
  const { apiParams } = useUrlFilters();
  const alerts = useAlerts(apiParams);
  const lookups = useLookups();
  const ack = useAckAlert();
  const [sev, setSev] = useState('');

  const rows = alerts.data || [];
  const filtered = useMemo(
    () => (sev ? rows.filter((a) => String(a.severity || '').toLowerCase() === sev) : rows),
    [rows, sev],
  );
  const open = useMemo(() => filtered.filter((a) => !isAcked(a)).sort(bySeverity), [filtered]);
  const acked = useMemo(() => filtered.filter(isAcked).sort(bySeverity), [filtered]);
  const openAll = rows.filter((a) => !isAcked(a));

  const sevCounts = useMemo(() => {
    const m = {};
    for (const a of openAll) {
      const k = String(a.severity || '').toLowerCase();
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [openAll]);

  const units = lookups.data?.units;
  const ackPendingId = ack.isPending ? ack.variables : null;
  const ackErrorId = ack.isError ? ack.variables : null;

  const renderCard = (a, isAckedCard) => (
    <AlertCard
      key={a.alertId}
      alert={a}
      stations={stationsForAlert(a, units)}
      acked={isAckedCard}
      onAck={(id) => ack.mutate(id)}
      ackPending={ackPendingId === a.alertId}
      ackError={ackErrorId === a.alertId}
    />
  );

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="page-title">Alerts</h1>
          <p className="page-subtitle">
            Anomaly feed — observed vs expected
            {!alerts.isLoading && !alerts.error && (
              <span className="num"> · {fmtInt(openAll.length)} open · {fmtInt(rows.length - openAll.length)} acknowledged</span>
            )}
          </p>
        </div>
        {openAll.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-signal ml-auto">
            <PulseDot /> live anomalies
          </span>
        )}
      </div>

      <FilterBar>
        <div className="flex items-center gap-1" role="group" aria-label="Severity filter">
          {SEV_FILTERS.map(([v, label]) => (
            <button
              key={v || 'all'}
              type="button"
              className={`chip !py-0.5 transition-colors ${sev === v ? '!border-amber/60 !text-amber' : 'hover:border-amber/40'}`}
              aria-pressed={sev === v}
              onClick={() => setSev(v)}
            >
              {label}
              {v && sevCounts[v] ? <span className="num text-muted"> {sevCounts[v]}</span> : null}
            </button>
          ))}
        </div>
      </FilterBar>

      {alerts.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}><LoadingSkeleton lines={4} /></Card>
          ))}
        </div>
      ) : alerts.error ? (
        <Card>
          <EmptyState
            title="Couldn't load alerts"
            message={alerts.error.message}
            action={<button type="button" className="btn" onClick={() => alerts.refetch()}>Retry</button>}
          />
        </Card>
      ) : (
        <>
          {open.length === 0 ? (
            <Card>
              <EmptyState
                title={sev ? `No open ${sev} alerts` : 'No active alerts'}
                message={sev
                  ? 'Nothing at this severity in the current window — clear the severity filter to see the rest.'
                  : 'No anomalies flagged for the current filters. All clear.'}
                action={sev
                  ? <button type="button" className="btn" onClick={() => setSev('')}>Show all severities</button>
                  : null}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {open.map((a) => renderCard(a, false))}
            </div>
          )}

          {acked.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">Acknowledged</h2>
                <Badge tone="slate" className="num">{fmtInt(acked.length)}</Badge>
              </div>
              {acked.map((a) => renderCard(a, true))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
