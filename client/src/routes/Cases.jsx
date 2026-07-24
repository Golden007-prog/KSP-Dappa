// /cases — Case Explorer: advanced filter builder (district / station / crime
// head / subhead / status / gravity / date range) with removable chips, saved
// presets, full-text search, column chooser + density, sortable columns,
// page-size pagination, CSV export of the current filter, and per-row quick
// actions. Server filters ride the URL (shareable); status / search / anomaly
// are client-side refinements over the newest 200 rows of the server filter,
// because GET /cases has no status or text param (docs/CONTRACTS.md).
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCases, useLookups } from '../lib/api.js';
import { useUrlFilters, DATE_RANGES } from '../lib/filters.js';
import Card from '../components/Card.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import Tooltip from '../components/Tooltip.jsx';
import PulseDot from '../components/PulseDot.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { dateLabel, fmtInt } from '../lib/format.js';
import { CrimeNoInline } from './cases/CrimeNoBreakdown.jsx';
import {
  useExplorerParams, snapshotParams, buildRefine, compareRows,
  readPageSize, persistPageSize, readJson, writeJson, PAGE_SIZES,
} from './cases/explorerState.js';
import { fetchCasesForExport, toCsv, downloadCsv, exportFilename, EXPORT_CAP } from './cases/csv.js';
import { copyText } from './cases/clipboard.js';
import FilterSheet from './cases/FilterSheet.jsx';
import PresetsSheet from './cases/PresetsSheet.jsx';
import ColumnsSheet from './cases/ColumnsSheet.jsx';

const COLUMNS_STORAGE_KEY = 'dappa-cases-columns';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Icon = ({ children, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className="shrink-0">{children}</svg>
);
const ICONS = {
  search: <Icon size={15}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></Icon>,
  filter: <Icon><path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" /></Icon>,
  bookmark: <Icon><path d="M6 3.5h12V21l-6-4-6 4Z" /></Icon>,
  columns: <Icon><rect x="3.5" y="4" width="17" height="16" rx="1.5" /><path d="M9.5 4v16M14.5 4v16" /></Icon>,
  download: <Icon><path d="M12 3v11m0 0 4.5-4.5M12 14 7.5 9.5M4 17.5V20h16v-2.5" /></Icon>,
  copy: <Icon><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Icon>,
  open: <Icon><path d="M5 12h14m0 0-5.5-5.5M19 12l-5.5 5.5" /></Icon>,
  x: <Icon size={11}><path d="M6 6l12 12M18 6 6 18" /></Icon>,
};

// Canonical column set — chooser hides/shows the unlocked ones ('_actions' and
// crimeNo stay). caseNo starts hidden; everything else starts visible.
const buildColumnDefs = ({ onCopy, onOpen }) => [
  {
    key: 'crimeNo', label: 'Crime no', chooserLabel: 'Crime no (identity)', locked: true, sortable: true,
    className: 'font-medium whitespace-nowrap',
    render: (r) => <CrimeNoInline crimeNo={r.crimeNo} />,
  },
  { key: 'registeredDate', label: 'Registered', sortable: true, render: (r) => dateLabel(r.registeredDate) },
  { key: 'caseNo', label: 'Case no', defaultOff: true, className: 'whitespace-nowrap' },
  { key: 'districtName', label: 'District', sortable: true },
  { key: 'unitName', label: 'Station', sortable: true },
  { key: 'headName', label: 'Crime head', sortable: true },
  { key: 'subHeadName', label: 'Subhead', sortable: true },
  { key: 'statusName', label: 'Status', sortable: true },
  {
    key: 'gravityName', label: 'Gravity', sortable: true,
    render: (r) => (r.gravityName
      ? <Badge tone={/hein/i.test(String(r.gravityName)) ? 'red' : 'slate'}>{r.gravityName}</Badge>
      : '—'),
  },
  {
    key: 'anomalyFlag', label: 'Anomaly', chooserLabel: 'Anomaly flag', width: 90, align: 'center', sortable: true,
    render: (r) => (r.anomalyFlag ? <Badge tone="red" pulse>anomaly</Badge> : null),
  },
  {
    key: '_actions', label: '', chooserLabel: 'Quick actions', locked: true, width: 84, align: 'right',
    render: (r) => (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        <Tooltip label="Copy CrimeNo" position="left">
          <button type="button" className="btn-ghost !p-1.5" aria-label={`Copy CrimeNo ${r.crimeNo}`} onClick={() => onCopy(r)}>
            {ICONS.copy}
          </button>
        </Tooltip>
        <Tooltip label="Open case" position="left">
          <button type="button" className="btn-ghost !p-1.5" aria-label={`Open case ${r.crimeNo}`} onClick={() => onOpen(r)}>
            {ICONS.open}
          </button>
        </Tooltip>
      </span>
    ),
  },
];

const DEFAULT_VISIBLE = buildColumnDefs({ onCopy: () => {}, onOpen: () => {} })
  .filter((c) => !c.locked && !c.defaultOff)
  .map((c) => c.key);

function readVisibleColumns() {
  const stored = readJson(COLUMNS_STORAGE_KEY, null);
  if (!Array.isArray(stored)) return DEFAULT_VISIBLE;
  const valid = new Set(DEFAULT_VISIBLE.concat(['caseNo']));
  const kept = stored.filter((k) => valid.has(k));
  return kept.length ? kept : DEFAULT_VISIBLE;
}

function Chip({ label, onRemove }) {
  return (
    <span className="chip !pr-1 animate-fade-in max-w-full">
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`Remove filter: ${label}`}
        className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:text-signal hover:bg-signal/10 transition-colors"
        onClick={onRemove}
      >
        {ICONS.x}
      </button>
    </span>
  );
}

export default function Cases() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const { districtId, crimeHeadId, range, from, to } = useUrlFilters();
  const { unitId, crimeSubHeadId, gravityId, statusId, q, anomalyOnly, setMany, applyParams, clearAll } = useExplorerParams();
  const lookups = useLookups();
  const lk = lookups.data;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize);
  const [sort, setSort] = useState(null);
  const [visibleCols, setVisibleCols] = useState(readVisibleColumns);
  const [sheet, setSheet] = useState(null); // 'filters' | 'presets' | 'columns' | null
  const [exporting, setExporting] = useState(false);

  // Search box: local echo of the URL q param, debounced 300 ms on the way out.
  const [qInput, setQInput] = useState(q);
  useEffect(() => { setQInput(q); }, [q]);
  useEffect(() => {
    if (qInput === q) return undefined;
    const t = setTimeout(() => setMany({ q: qInput }), 300);
    return () => clearTimeout(t);
  }, [qInput, q, setMany]);

  // --- data -----------------------------------------------------------------
  const serverFilterParams = useMemo(() => {
    const p = {};
    if (districtId) p.districtId = districtId;
    if (unitId) p.unitId = unitId;
    if (crimeHeadId) p.crimeHeadId = crimeHeadId;
    if (crimeSubHeadId) p.crimeSubHeadId = crimeSubHeadId;
    if (gravityId) p.gravityId = gravityId;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [districtId, unitId, crimeHeadId, crimeSubHeadId, gravityId, from, to]);

  const clientRefined = !!(q || statusId || anomalyOnly);
  const cases = useCases(clientRefined
    ? { ...serverFilterParams, page: 1, perPage: 200 }
    : { ...serverFilterParams, page, perPage: pageSize });

  // Any filter/page-size change restarts pagination — page 6 of a narrower set is noise.
  const filterKey = JSON.stringify([serverFilterParams, q, statusId, anomalyOnly, pageSize]);
  useEffect(() => { setPage(1); }, [filterKey]);

  const statusName = statusId ? (lk?.statuses || []).find((s) => s.id === statusId)?.name || '' : '';
  const refine = useMemo(
    () => buildRefine({ q, statusName, anomalyOnly }),
    [q, statusName, anomalyOnly],
  );

  const serverRows = cases.data?.rows || [];
  const serverTotal = cases.data?.total;
  const sorted = useMemo(() => {
    const refined = clientRefined ? serverRows.filter(refine) : serverRows;
    return sort ? [...refined].sort((a, b) => compareRows(a, b, sort)) : refined;
  }, [serverRows, clientRefined, refine, sort]);

  const totalMatches = clientRefined ? sorted.length : serverTotal;
  const pageRows = clientRefined ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;
  const scanCapped = clientRefined && Number(serverTotal) > 200;

  // --- actions --------------------------------------------------------------
  const siblings = useMemo(() => sorted.map((r) => String(r.caseMasterId)), [sorted]);

  const openDetail = (r) => {
    navigate(
      { pathname: `/cases/${r.caseMasterId}`, search: location.search },
      { state: { siblings } },
    );
  };

  const copyCrimeNo = async (r) => {
    const ok = await copyText(r.crimeNo);
    if (ok) toast.success(`CrimeNo ${r.crimeNo} copied`);
    else toast.error('Could not copy — clipboard is blocked in this browser.');
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { rows: all, total, truncated } = await fetchCasesForExport(serverFilterParams);
      const finalRows = clientRefined ? all.filter(refine) : all;
      if (!finalRows.length) {
        toast.info('Nothing to export for the current filters.');
        return;
      }
      downloadCsv(exportFilename(), toCsv(finalRows));
      toast.success(truncated
        ? `Exported ${fmtInt(finalRows.length)} rows (newest ${fmtInt(EXPORT_CAP)} of ${fmtInt(total)} scanned)`
        : `Exported ${fmtInt(finalRows.length)} rows to CSV`);
    } catch (err) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const setColumns = (next) => {
    setVisibleCols(next);
    writeJson(COLUMNS_STORAGE_KEY, next);
  };

  const changePageSize = (v) => {
    setPageSize(v);
    persistPageSize(v);
  };

  // --- chips ----------------------------------------------------------------
  const nameOf = (list, idKey, id, nameKey) =>
    (list || []).find((x) => String(x[idKey]) === String(id))?.[nameKey] || id;
  const explicitDates = !!(searchParams.get('from') || searchParams.get('to'));

  const chips = [];
  if (districtId) chips.push({ key: 'districtId', label: `District: ${nameOf(lk?.districts, 'districtId', districtId, 'districtName')}`, remove: () => setMany({ districtId: '' }) });
  if (unitId) chips.push({ key: 'unitId', label: `Station: ${nameOf(lk?.units, 'unitId', unitId, 'unitName')}`, remove: () => setMany({ unitId: '' }) });
  if (crimeHeadId) chips.push({ key: 'crimeHeadId', label: `Head: ${nameOf(lk?.crimeHeads, 'crimeHeadId', crimeHeadId, 'headName')}`, remove: () => setMany({ crimeHeadId: '' }) });
  if (crimeSubHeadId) chips.push({ key: 'crimeSubHeadId', label: `Subhead: ${nameOf(lk?.crimeSubHeads, 'crimeSubHeadId', crimeSubHeadId, 'subHeadName')}`, remove: () => setMany({ crimeSubHeadId: '' }) });
  if (statusId) chips.push({ key: 'status', label: `Status: ${nameOf(lk?.statuses, 'id', statusId, 'name')}`, remove: () => setMany({ status: '' }) });
  if (gravityId) chips.push({ key: 'gravityId', label: `Gravity: ${nameOf(lk?.gravities, 'id', gravityId, 'name')}`, remove: () => setMany({ gravityId: '' }) });
  if (explicitDates) chips.push({ key: 'dates', label: `Dates: ${dateLabel(from)} → ${dateLabel(to)}`, remove: () => setMany({ range: 'all' }) });
  else if (range && range !== 'all') chips.push({ key: 'range', label: `Period: ${DATE_RANGES.find((r) => r.value === range)?.label || range}`, remove: () => setMany({ range: 'all' }) });
  if (q) chips.push({ key: 'q', label: `Search: “${q}”`, remove: () => setMany({ q: '' }) });
  if (anomalyOnly) chips.push({ key: 'anomaly', label: 'Anomalies only', remove: () => setMany({ anomaly: '' }) });
  const activeCount = chips.length;

  const columnDefs = useMemo(
    () => buildColumnDefs({ onCopy: copyCrimeNo, onOpen: openDetail }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siblings, location.search],
  );
  const activeColumns = columnDefs.filter((c) => c.locked || visibleCols.includes(c.key));

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div>
        <h1 className="page-title">Case Explorer</h1>
        <p className="page-subtitle">
          Server-paginated FIR registry
          {Number.isFinite(Number(totalMatches)) ? <> · <span className="num">{fmtInt(totalMatches)}</span> cases match</> : null}
        </p>
      </div>

      {/* toolbar: search + sheet triggers */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Case explorer tools">
        <div className="relative flex-1 min-w-[12rem]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{ICONS.search}</span>
          <input
            type="search"
            className="input-dark w-full !pl-9 !py-2.5 sm:!py-2"
            placeholder="Search CrimeNo, station, head, status…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            aria-label="Search cases"
            enterKeyHint="search"
          />
          {qInput && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-ink transition-colors"
              aria-label="Clear search"
              onClick={() => { setQInput(''); setMany({ q: '' }); }}
            >
              {ICONS.x}
            </button>
          )}
        </div>
        <button type="button" className="btn !py-2.5 sm:!py-2" onClick={() => setSheet('filters')} aria-haspopup="dialog">
          {ICONS.filter}
          Filters
          {activeCount > 0 && (
            <span className="num rounded-full bg-amber/15 text-amber text-[10px] font-semibold px-1.5 py-0.5">{activeCount}</span>
          )}
        </button>
        <button type="button" className="btn !py-2.5 sm:!py-2" onClick={() => setSheet('presets')} aria-haspopup="dialog">
          {ICONS.bookmark}
          Presets
        </button>
        <button type="button" className="btn !py-2.5 sm:!py-2" onClick={() => setSheet('columns')} aria-haspopup="dialog">
          {ICONS.columns}
          Columns
        </button>
        <button
          type="button"
          className="btn !py-2.5 sm:!py-2"
          onClick={handleExport}
          disabled={exporting || !!cases.error}
          aria-label="Export the current filter as CSV"
        >
          {ICONS.download}
          {exporting ? 'Exporting…' : 'CSV'}
        </button>
      </div>

      {/* active-filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => <Chip key={c.key} label={c.label} onRemove={c.remove} />)}
          <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}

      {/* result summary + page size */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="num inline-flex items-center gap-2">
          {Number.isFinite(Number(totalMatches))
            ? <>{fmtInt(totalMatches)} cases{activeCount > 0 ? ` · ${activeCount} filter${activeCount > 1 ? 's' : ''} active` : ''}</>
            : 'Loading…'}
          {scanCapped && (
            <Tooltip label={`The API has no status/search filter — these refine the newest 200 of ${fmtInt(serverTotal)} rows. Narrow with district or dates for full coverage.`}>
              <span className="inline-flex items-center gap-1 text-amber cursor-help">
                <PulseDot color="amber" />
                scans newest 200
              </span>
            </Tooltip>
          )}
          {cases.isFetching && !cases.isLoading && <span className="text-muted/70">updating…</span>}
        </span>
        <label className="inline-flex items-center gap-2">
          Rows per page
          <select
            className="input-dark !py-1 !px-2 !text-xs"
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <Card padded={false}>
        {cases.error ? (
          <EmptyState
            title="Couldn't load cases"
            message={cases.error.message}
            action={<button type="button" className="btn" onClick={() => cases.refetch()}>Retry</button>}
          />
        ) : (
          <DataTable
            columns={activeColumns}
            rows={pageRows}
            rowKey="caseMasterId"
            loading={cases.isLoading}
            emptyMessage={clientRefined
              ? 'No cases match this search/status within the scanned rows — clear the refinement or narrow the server filters.'
              : 'No cases match the current filters — widen the date range or clear a filter.'}
            total={totalMatches}
            page={page}
            perPage={pageSize}
            onPageChange={setPage}
            sort={sort}
            onSortChange={setSort}
            onRowClick={openDetail}
          />
        )}
      </Card>

      <FilterSheet
        open={sheet === 'filters'}
        onClose={() => setSheet(null)}
        values={{ districtId, unitId, crimeHeadId, crimeSubHeadId, gravityId, statusId, range, from, to, anomalyOnly, explicitDates }}
        setMany={setMany}
        onClearAll={clearAll}
        activeCount={activeCount}
      />
      <PresetsSheet
        open={sheet === 'presets'}
        onClose={() => setSheet(null)}
        currentParams={snapshotParams(searchParams)}
        activeCount={activeCount}
        onApply={applyParams}
      />
      <ColumnsSheet
        open={sheet === 'columns'}
        onClose={() => setSheet(null)}
        defs={columnDefs.filter((c) => c.key !== '_actions')}
        visible={visibleCols}
        onChange={setColumns}
        onReset={() => setColumns(DEFAULT_VISIBLE)}
      />
    </div>
  );
}
