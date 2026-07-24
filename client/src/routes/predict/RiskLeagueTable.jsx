// /predict — 30-day station-risk league table with driver chips.
// Rows arrive pre-ranked (rank field) from Predict.jsx; a driver chip row on
// top filters the table client-side to stations sharing that risk driver.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { fmtNum } from '../../lib/format.js';

const SHOW_DEFAULT = 15;

function DriverChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? 'border-amber/60 bg-amber/10 text-amber'
          : 'border-grid bg-base/60 text-muted hover:border-amber/40 hover:text-ink'
      }`}
      title={active ? 'Clear driver filter' : `Show stations driven by “${label}”`}
    >
      <span className="truncate max-w-[14rem]">{label}</span>
      {count !== undefined && <span className="num font-semibold">{count}</span>}
    </button>
  );
}

export default function RiskLeagueTable({ rows, loading, error, onRetry, onRowClick }) {
  const [driverFilter, setDriverFilter] = useState('');
  const [showAll, setShowAll] = useState(false);

  // Aggregate driver frequency across the (already district-filtered) rows.
  const topDrivers = useMemo(() => {
    const counts = new Map();
    for (const r of rows) {
      for (const d of r.drivers || []) counts.set(d, (counts.get(d) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);

  const visible = useMemo(() => {
    const filtered = driverFilter ? rows.filter((r) => (r.drivers || []).includes(driverFilter)) : rows;
    return showAll ? filtered : filtered.slice(0, SHOW_DEFAULT);
  }, [rows, driverFilter, showAll]);

  const filteredCount = driverFilter ? rows.filter((r) => (r.drivers || []).includes(driverFilter)).length : rows.length;
  const maxRisk = Math.max(1, ...rows.map((r) => Number(r.riskScore) || 0));

  const columns = [
    {
      key: 'rank', label: '#', width: 44,
      render: (r) => <span className="num text-muted">{r.rank}</span>,
    },
    {
      key: 'unitName', label: 'Station', className: 'font-medium',
      render: (r) => (
        <div className="min-w-0">
          <p className="text-ink truncate">{r.unitName}</p>
          <p className="text-[11px] text-muted truncate">{r.districtName || r.districtId || '—'}</p>
        </div>
      ),
    },
    {
      key: 'riskScore', label: 'Risk (30d)', sortable: true, align: 'right', width: 150,
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-20 rounded-full bg-grid overflow-hidden" aria-hidden="true">
            <div
              className="h-full rounded-full bg-amber"
              style={{ width: `${Math.max(4, ((Number(r.riskScore) || 0) / maxRisk) * 100)}%` }}
            />
          </div>
          <span className="num font-semibold text-ink w-10 text-right">{fmtNum(r.riskScore, 1)}</span>
        </div>
      ),
    },
    {
      key: 'drivers', label: 'Drivers',
      render: (r) => {
        const drivers = r.drivers || [];
        if (!drivers.length) return <span className="text-[11px] text-muted">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {drivers.slice(0, 3).map((d) => (
              <span
                key={d}
                className="inline-flex items-center rounded-full border border-grid bg-base/60 px-2 py-0.5 text-[10px] text-muted whitespace-nowrap"
              >
                {d}
              </span>
            ))}
            {drivers.length > 3 && (
              <span className="text-[10px] text-muted self-center" title={drivers.slice(3).join(' · ')}>
                +{drivers.length - 3}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Card
      title="Station risk league — next 30 days"
      subtitle="Every police station scored by the nightly risk model; click a row to open it on the map"
      padded={false}
    >
      {error ? (
        <EmptyState
          title="Couldn't load station risk"
          message={error.message}
          action={<button type="button" className="btn" onClick={onRetry}>Retry</button>}
        />
      ) : (
        <>
          {topDrivers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 border-b border-grid/60">
              <span className="text-[11px] text-muted mr-1">Top drivers:</span>
              {topDrivers.map(([label, count]) => (
                <DriverChip
                  key={label}
                  label={label}
                  count={count}
                  active={driverFilter === label}
                  onClick={() => setDriverFilter((cur) => (cur === label ? '' : label))}
                />
              ))}
            </div>
          )}
          <DataTable
            columns={columns}
            rows={visible}
            rowKey="unitId"
            loading={loading}
            emptyMessage={driverFilter
              ? `No stations with driver “${driverFilter}” under the current filters.`
              : 'No station risk scores for the current filters — run the analytics pass.'}
            onRowClick={onRowClick}
            dense
          />
          {!loading && filteredCount > SHOW_DEFAULT && (
            <div className="p-2.5 border-t border-grid/60 text-center">
              <button type="button" className="btn !py-1 text-xs" onClick={() => setShowAll((v) => !v)}>
                {showAll ? `Show top ${SHOW_DEFAULT}` : `Show all ${filteredCount} stations`}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
