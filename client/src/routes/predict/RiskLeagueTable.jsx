// /predict — 30-day station-risk league table with driver chips, station
// search, percentile risk tiers, a score-distribution histogram, per-station
// 6-month sparklines, CSV export and a copyable top-5 briefing.
// Rows arrive pre-ranked (rank field) from Predict.jsx; the driver chip row
// and search box filter the table client-side. The station name in each row
// is a real button so keyboard users can open a station on the map (the row
// onClick on <tr> has no keyboard path — shared DataTable limitation); when
// an onDetails handler is given, clicking a row opens the station drawer.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { downloadCsv } from '../trends/csv.js';
import Sparkline from '../trends/Sparkline.jsx';
import { makeTierOf } from './riskTiers.js';

const SHOW_DEFAULT = 15;
const HIST_BINS = 16;

const BIN_TONE = { red: 'bg-signal/80', amber: 'bg-amber/80', neutral: 'bg-muted/60', slate: 'bg-grid' };

/** Tiny CSS histogram of the league's risk scores, colored by tier. */
function RiskHistogram({ rows, tierOf }) {
  const model = useMemo(() => {
    const scores = rows.map((r) => Number(r.riskScore) || 0);
    if (scores.length < 8) return null;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const span = max - min || 1;
    const bins = Array.from({ length: HIST_BINS }, () => 0);
    for (const s of scores) {
      const b = Math.min(HIST_BINS - 1, Math.floor(((s - min) / span) * HIST_BINS));
      bins[b] += 1;
    }
    const peak = Math.max(...bins, 1);
    return {
      min,
      max,
      bars: bins.map((n, i) => {
        const mid = min + ((i + 0.5) / HIST_BINS) * span;
        return { n, hPct: (n / peak) * 100, tone: tierOf(mid).tone, from: min + (i / HIST_BINS) * span, to: min + ((i + 1) / HIST_BINS) * span };
      }),
    };
  }, [rows, tierOf]);

  if (!model) return null;
  return (
    <div aria-label="Distribution of station risk scores">
      <div className="flex items-end gap-px h-9" aria-hidden="true">
        {model.bars.map((b, i) => (
          <span
            key={i}
            className="group relative flex-1 flex items-end"
            title={`${fmtNum(b.from, 0)}–${fmtNum(b.to, 0)}: ${fmtInt(b.n)} station${b.n === 1 ? '' : 's'}`}
          >
            <span
              className={`w-full rounded-t-sm ${BIN_TONE[b.tone] || 'bg-grid'}`}
              style={{ height: `${Math.max(b.n ? 8 : 2, b.hPct)}%` }}
            />
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted mt-0.5 num">
        <span>{fmtNum(model.min, 0)}</span>
        <span className="text-muted/80">risk score distribution — {fmtInt(rows.length)} stations, colored by tier</span>
        <span>{fmtNum(model.max, 0)}</span>
      </div>
    </div>
  );
}

function DriverChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 min-h-[40px] text-[11px] transition-colors ${
        active
          ? 'border-amber/60 bg-amber/10 text-amber'
          : 'border-grid bg-base/60 text-muted hover:border-amber/40 hover:text-ink'
      }`}
      aria-pressed={active}
      title={active ? 'Clear driver filter' : `Show stations driven by “${label}”`}
    >
      <span className="truncate max-w-[14rem]">{label}</span>
      {count !== undefined && <span className="num font-semibold">{count}</span>}
    </button>
  );
}

export default function RiskLeagueTable({ rows, loading, error, onRetry, onRowClick, onDetails }) {
  const toast = useToast();
  const [driverFilter, setDriverFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  // Aggregate driver frequency across the (already district-filtered) rows.
  const topDrivers = useMemo(() => {
    const counts = new Map();
    for (const r of rows) {
      for (const d of r.drivers || []) counts.set(d, (counts.get(d) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);

  // Tier thresholds come from the FULL league (pre-filter) so a driver or
  // search filter never re-labels the surviving stations.
  const tierOf = useMemo(() => makeTierOf(rows), [rows]);

  const hasSpark = useMemo(
    () => rows.some((r) => Array.isArray(r.spark) && r.spark.some((v) => Number(v) > 0)),
    [rows],
  );

  const filteredAll = useMemo(() => {
    let r = rows;
    if (driverFilter) r = r.filter((x) => (x.drivers || []).includes(driverFilter));
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter((x) =>
        String(x.unitName || '').toLowerCase().includes(q)
        || String(x.districtName || '').toLowerCase().includes(q));
    }
    return r;
  }, [rows, driverFilter, search]);

  const visible = useMemo(
    () => (showAll ? filteredAll : filteredAll.slice(0, SHOW_DEFAULT)),
    [filteredAll, showAll],
  );

  const filteredCount = filteredAll.length;
  const maxRisk = Math.max(1, ...rows.map((r) => Number(r.riskScore) || 0));

  const exportCsv = () => {
    if (!filteredAll.length) return;
    downloadCsv(
      'dappa-station-risk-30d',
      ['rank', 'station', 'district', 'risk_30d', 'tier', 'drivers'],
      filteredAll.map((r) => [
        r.rank, r.unitName, r.districtName || r.districtId || '',
        fmtNum(r.riskScore, 1), tierOf(Number(r.riskScore) || 0).label,
        (r.drivers || []).join('; '),
      ]),
    );
    toast.success(`Exported ${filteredAll.length} stations`);
  };

  const copyBriefing = async () => {
    const top = filteredAll.slice(0, 5);
    if (!top.length) return;
    const lines = [
      'Station risk briefing — next 30 days (DAPPA, synthetic data)',
      ...top.map((r) =>
        `${r.rank}. ${r.unitName} (${r.districtName || '—'}) — risk ${fmtNum(r.riskScore, 1)}, ${tierOf(Number(r.riskScore) || 0).label.toLowerCase()} tier`
        + ((r.drivers || []).length ? ` — drivers: ${r.drivers.join('; ')}` : '')),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('Top-5 risk briefing copied');
    } catch {
      toast.error('Clipboard unavailable in this browser');
    }
  };

  const columns = [
    {
      key: 'rank', label: '#', width: 44,
      render: (r) => <span className="num text-muted">{r.rank}</span>,
    },
    {
      key: 'unitName', label: 'Station', className: 'font-medium',
      render: (r) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full truncate text-left text-ink hover:text-primary transition-colors"
            onClick={(e) => { e.stopPropagation(); onRowClick?.(r); }}
            aria-label={`Open ${r.unitName} on the map`}
          >
            {r.unitName}
          </button>
          <p className="text-[11px] text-muted truncate">{r.districtName || r.districtId || '—'}</p>
        </div>
      ),
    },
    {
      key: 'tier', label: 'Tier', width: 92,
      render: (r) => {
        const t = tierOf(Number(r.riskScore) || 0);
        return <Badge tone={t.tone}>{t.label}</Badge>;
      },
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
    ...(hasSpark ? [{
      key: 'spark', label: '6-mo trend', width: 96,
      render: (r) => (
        Array.isArray(r.spark) && r.spark.some((v) => Number(v) > 0)
          ? <Sparkline values={r.spark} color="currentColor" height={22} className="w-20 text-muted" />
          : <span className="text-[11px] text-muted">—</span>
      ),
    }] : []),
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
      subtitle={onDetails
        ? 'Every police station scored by the nightly risk model (all crime heads); click a row for the station dossier, or the name to open it on the map'
        : 'Every police station scored by the nightly risk model (all crime heads); open a station to see it on the map'}
      padded={false}
      actions={(
        <div className="flex items-center gap-1.5">
          <Tooltip label="Copy a top-5 briefing to the clipboard">
            <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={copyBriefing} disabled={loading || !filteredAll.length}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h8" />
              </svg>
              Brief
            </button>
          </Tooltip>
          <Tooltip label="Download the league as CSV">
            <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={loading || !filteredAll.length}>CSV</button>
          </Tooltip>
        </div>
      )}
    >
      {error ? (
        <EmptyState
          title="Couldn't load station risk"
          message={error.message}
          action={<button type="button" className="btn" onClick={onRetry}>Retry</button>}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 px-3 py-2.5 border-b border-grid/60">
            {!loading && <RiskHistogram rows={rows} tierOf={tierOf} />}
            <input
              type="search"
              className="input-dark w-full sm:max-w-xs !py-2 min-h-[40px]"
              placeholder="Search station or district…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search stations by name or district"
            />
            {topDrivers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
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
          </div>
          <DataTable
            exportFilename="dappa-station-risk"
            columns={columns}
            rows={visible}
            rowKey="unitId"
            loading={loading}
            emptyMessage={driverFilter || search
              ? 'No stations match the current search / driver filter.'
              : 'No station risk scores for the current filters — run the analytics pass.'}
            onRowClick={onDetails || onRowClick}
            dense
          />
          {!loading && filteredCount > SHOW_DEFAULT && (
            <div className="p-2.5 border-t border-grid/60 text-center">
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={() => setShowAll((v) => !v)}>
                {showAll ? `Show top ${SHOW_DEFAULT}` : `Show all ${filteredCount} stations`}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
