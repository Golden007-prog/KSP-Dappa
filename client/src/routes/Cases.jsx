// /cases — Case Explorer: advanced filter builder (district / station / crime
// head / subhead / status / gravity / date range) with removable chips, saved
// presets (optionally capturing columns+sort), full-text search with term
// highlighting, column chooser + density, URL-persisted sortable columns,
// starred cases, recently-viewed row, filter-profile bar, CSV export of the
// current filter, keyboard shortcuts ('/' search · 'e' export), and per-row
// quick actions. Server filters ride the URL (shareable); status / search /
// anomaly / starred are client-side refinements over the newest 200 rows of
// the server filter, because GET /cases has no status or text param
// (docs/CONTRACTS.md).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  parseSortParam, serializeSort, caseAgeDays,
} from './cases/explorerState.js';
import { fetchCasesForExport, toCsv, downloadCsv, exportFilename, buildExportColumns, EXPORT_CAP } from './cases/csv.js';
import { copyText } from './cases/clipboard.js';
import { readStars, toggleStar } from './cases/stars.js';
import FilterSheet from './cases/FilterSheet.jsx';
import PresetsSheet from './cases/PresetsSheet.jsx';
import ColumnsSheet from './cases/ColumnsSheet.jsx';
import RecentCasesRow from './cases/RecentCasesRow.jsx';
import SummaryBar from './cases/SummaryBar.jsx';

const COLUMNS_STORAGE_KEY = 'dappa-cases-columns';
const AGE_WARN_DAYS = 90;

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

const StarIcon = ({ filled = false, size = 15 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
    aria-hidden="true"
    className="shrink-0"
  >
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8Z" />
  </svg>
);

/** Highlight the active search needle inside a plain-text cell with <mark>. */
function Hl({ text, needle }) {
  const s = text === undefined || text === null ? '' : String(text);
  if (!s) return '—';
  if (!needle) return s;
  const lower = s.toLowerCase();
  if (!lower.includes(needle)) return s;
  const segs = [];
  let i = 0;
  for (let j = lower.indexOf(needle); j !== -1; j = lower.indexOf(needle, i)) {
    if (j > i) segs.push({ t: s.slice(i, j) });
    segs.push({ t: s.slice(j, j + needle.length), hit: true });
    i = j + needle.length;
  }
  if (i < s.length) segs.push({ t: s.slice(i) });
  return (
    <>
      {segs.map((seg, k) => (seg.hit
        ? <mark key={k} className="bg-amber/25 text-amber rounded px-0.5">{seg.t}</mark>
        : <span key={k}>{seg.t}</span>))}
    </>
  );
}

// 40px touch targets on phones (32px on desktop where a pointer is precise).
const ROW_BTN = 'btn-ghost !p-0 flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center';

// Canonical column set — chooser hides/shows the unlocked ones ('_actions' and
// crimeNo stay). caseNo and ageDays start hidden; everything else starts visible.
const buildColumnDefs = ({ onCopy, onOpen, onToggleStar, stars = {}, needle = '' }) => [
  {
    key: 'crimeNo', label: 'Crime no', chooserLabel: 'Crime no (identity)', locked: true, sortable: true,
    className: 'font-medium whitespace-nowrap',
    render: (r) => <CrimeNoInline crimeNo={r.crimeNo} />,
  },
  { key: 'registeredDate', label: 'Registered', sortable: true, render: (r) => dateLabel(r.registeredDate) },
  { key: 'caseNo', label: 'Case no', defaultOff: true, className: 'whitespace-nowrap', render: (r) => <Hl text={r.caseNo} needle={needle} /> },
  {
    key: 'ageDays', label: 'Age', chooserLabel: `Age (days · amber past ${AGE_WARN_DAYS}d)`, defaultOff: true, sortable: true, align: 'right', width: 78,
    render: (r) => (Number.isFinite(r.ageDays)
      ? <span className={`num ${r.ageDays > AGE_WARN_DAYS ? 'text-amber font-medium' : ''}`}>{fmtInt(r.ageDays)}d</span>
      : '—'),
  },
  { key: 'districtName', label: 'District', sortable: true, render: (r) => <Hl text={r.districtName} needle={needle} /> },
  { key: 'unitName', label: 'Station', sortable: true, render: (r) => <Hl text={r.unitName} needle={needle} /> },
  { key: 'headName', label: 'Crime head', sortable: true, render: (r) => <Hl text={r.headName} needle={needle} /> },
  { key: 'subHeadName', label: 'Subhead', sortable: true, render: (r) => <Hl text={r.subHeadName} needle={needle} /> },
  { key: 'statusName', label: 'Status', sortable: true, render: (r) => <Hl text={r.statusName} needle={needle} /> },
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
    key: '_actions', label: '', chooserLabel: 'Quick actions', locked: true, width: 128, align: 'right',
    render: (r) => {
      const starred = !!stars[String(r.caseMasterId)];
      return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <Tooltip label={starred ? 'Unstar' : 'Star case'} position="left">
            <button
              type="button"
              className={`${ROW_BTN} ${starred ? '!text-amber' : ''}`}
              aria-label={`${starred ? 'Unstar' : 'Star'} case ${r.crimeNo}`}
              aria-pressed={starred}
              onClick={() => onToggleStar(r)}
            >
              <StarIcon filled={starred} size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Copy CrimeNo" position="left">
            <button type="button" className={ROW_BTN} aria-label={`Copy CrimeNo ${r.crimeNo}`} onClick={() => onCopy(r)}>
              {ICONS.copy}
            </button>
          </Tooltip>
          <Tooltip label="Open case" position="left">
            <button type="button" className={ROW_BTN} aria-label={`Open case ${r.crimeNo}`} onClick={() => onOpen(r)}>
              {ICONS.open}
            </button>
          </Tooltip>
        </span>
      );
    },
  },
];

const noop = () => {};
const DEFAULT_VISIBLE = buildColumnDefs({ onCopy: noop, onOpen: noop, onToggleStar: noop })
  .filter((c) => !c.locked && !c.defaultOff)
  .map((c) => c.key);
const VALID_COLUMN_KEYS = new Set(DEFAULT_VISIBLE.concat(['caseNo', 'ageDays']));

function readVisibleColumns() {
  const stored = readJson(COLUMNS_STORAGE_KEY, null);
  if (!Array.isArray(stored)) return DEFAULT_VISIBLE;
  const kept = stored.filter((k) => VALID_COLUMN_KEYS.has(k));
  return kept.length ? kept : DEFAULT_VISIBLE;
}

function Chip({ label, onRemove }) {
  return (
    <span className="chip !pr-0.5 animate-fade-in max-w-full">
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`Remove filter: ${label}`}
        className="ml-0.5 -my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-signal hover:bg-signal/10 transition-colors"
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { districtId, crimeHeadId, range, from, to } = useUrlFilters();
  const {
    unitId, crimeSubHeadId, gravityId, statusId, q, anomalyOnly, starredOnly,
    setMany, applyParams, clearAll,
  } = useExplorerParams();
  const lookups = useLookups();
  const lk = lookups.data;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize);
  // Sort rides the URL (?sort=key.dir) so a shared link reproduces the view.
  const [sort, setSortState] = useState(() => parseSortParam(searchParams.get('sort')));
  const [visibleCols, setVisibleCols] = useState(readVisibleColumns);
  const [stars, setStars] = useState(readStars);
  const [sheet, setSheet] = useState(null); // 'filters' | 'presets' | 'columns' | null
  const [exporting, setExporting] = useState(false);
  const [jump, setJump] = useState('');
  const searchRef = useRef(null);

  const setSort = useCallback((next) => {
    setSortState(next);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      const v = serializeSort(next);
      if (v) p.set('sort', v); else p.delete('sort');
      return p;
    }, { replace: true });
  }, [setSearchParams]);

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

  const clientRefined = !!(q || statusId || anomalyOnly || starredOnly);
  const cases = useCases(clientRefined
    ? { ...serverFilterParams, page: 1, perPage: 200 }
    : { ...serverFilterParams, page, perPage: pageSize });

  // Any filter/page-size change restarts pagination — page 6 of a narrower set is noise.
  const filterKey = JSON.stringify([serverFilterParams, q, statusId, anomalyOnly, starredOnly, pageSize]);
  useEffect(() => { setPage(1); }, [filterKey]);

  const statusName = statusId ? (lk?.statuses || []).find((s) => s.id === statusId)?.name || '' : '';
  const refine = useMemo(
    () => buildRefine({ q, statusName, anomalyOnly, starredOnly, starredIds: stars }),
    [q, statusName, anomalyOnly, starredOnly, stars],
  );

  const serverRows = cases.data?.rows || [];
  // Client-computed case age so the column and its sort both work.
  const rowsWithAge = useMemo(
    () => serverRows.map((r) => ({ ...r, ageDays: caseAgeDays(r.registeredDate) })),
    [serverRows],
  );
  const serverTotal = cases.data?.total;
  const sorted = useMemo(() => {
    const refined = clientRefined ? rowsWithAge.filter(refine) : rowsWithAge;
    return sort ? [...refined].sort((a, b) => compareRows(a, b, sort)) : refined;
  }, [rowsWithAge, clientRefined, refine, sort]);

  const totalMatches = clientRefined ? sorted.length : serverTotal;
  const pageRows = clientRefined ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;
  const scanCapped = clientRefined && Number(serverTotal) > 200;
  const pages = Number.isFinite(Number(totalMatches)) && pageSize
    ? Math.max(1, Math.ceil(Number(totalMatches) / pageSize))
    : 1;

  // Tab title mirrors the result count; restored on unmount.
  useEffect(() => {
    const prev = document.title;
    return () => { document.title = prev; };
  }, []);
  useEffect(() => {
    document.title = Number.isFinite(Number(totalMatches))
      ? `Case Explorer (${fmtInt(totalMatches)} matches) · DAPPA`
      : 'Case Explorer · DAPPA';
  }, [totalMatches]);

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

  const handleToggleStar = (r) => {
    setStars((prev) => toggleStar(prev, r.caseMasterId, { crimeNo: r.crimeNo }));
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
      // The file mirrors the on-screen column chooser (identity columns always kept).
      downloadCsv(exportFilename(), toCsv(finalRows, buildExportColumns(visibleCols)));
      toast.success(truncated
        ? `Exported ${fmtInt(finalRows.length)} rows (newest ${fmtInt(EXPORT_CAP)} of ${fmtInt(total)} scanned)`
        : `Exported ${fmtInt(finalRows.length)} rows to CSV`);
    } catch (err) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  // Keyboard shortcuts: '/' focuses search, 'e' exports (ref dodges stale closures).
  const exportRef = useRef(handleExport);
  exportRef.current = handleExport;
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        exportRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setColumns = (next) => {
    setVisibleCols(next);
    writeJson(COLUMNS_STORAGE_KEY, next);
  };

  const changePageSize = (v) => {
    setPageSize(v);
    persistPageSize(v);
  };

  // Presets v2: optionally restore columns + sort captured with the filters.
  const applyView = (view) => {
    if (Array.isArray(view?.columns)) {
      const kept = view.columns.filter((k) => VALID_COLUMN_KEYS.has(k));
      if (kept.length) setColumns(kept);
    }
    const s = view?.sort;
    if (s && typeof s.key === 'string' && (s.dir === 'asc' || s.dir === 'desc')) setSort({ key: s.key, dir: s.dir });
    else if (s === null || s === undefined) setSort(null);
  };

  const goToPage = (e) => {
    e.preventDefault();
    const n = Math.round(Number(jump));
    if (Number.isFinite(n) && n >= 1) setPage(Math.min(pages, n));
    setJump('');
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
  if (starredOnly) chips.push({ key: 'starred', label: 'Starred only', remove: () => setMany({ starred: '' }) });
  const activeCount = chips.length;

  const needle = q.trim().toLowerCase();
  const columnDefs = useMemo(
    () => buildColumnDefs({ onCopy: copyCrimeNo, onOpen: openDetail, onToggleStar: handleToggleStar, stars, needle }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siblings, location.search, stars, needle],
  );
  const activeColumns = columnDefs.filter((c) => c.locked || visibleCols.includes(c.key));

  // Filter-profile grouping narrows with the filters: district → station → head.
  const [groupKey, groupLabel] = districtId
    ? (unitId ? ['headName', 'crime head'] : ['unitName', 'station'])
    : ['districtName', 'district'];

  const emptyText = clientRefined
    ? 'No cases match this search/status within the scanned rows — clear the refinement or narrow the server filters.'
    : 'No cases match the current filters — widen the date range or clear a filter.';
  const emptyMessage = activeCount > 0 ? (
    <span className="block">
      <span className="block">{emptyText}</span>
      <span className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {chips.map((c) => <Chip key={c.key} label={c.label} onRemove={c.remove} />)}
        <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={clearAll}>Clear all</button>
      </span>
    </span>
  ) : emptyText;

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
            ref={searchRef}
            type="search"
            className="input-dark w-full !pl-9 !py-2.5 sm:!py-2"
            placeholder="Search CrimeNo, station, head…  ( / )"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              if (qInput) { setQInput(''); setMany({ q: '' }); } else e.currentTarget.blur();
            }}
            aria-label="Search cases (press / to focus, Escape to clear)"
            enterKeyHint="search"
          />
          {qInput && (
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-ink transition-colors"
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
          className={`btn !py-2.5 sm:!py-2 ${starredOnly ? '!border-amber/60 !text-amber' : ''}`}
          onClick={() => setMany({ starred: starredOnly ? '' : '1' })}
          aria-pressed={starredOnly}
          aria-label={starredOnly ? 'Show all cases' : 'Show starred cases only'}
        >
          <StarIcon filled={starredOnly} size={14} />
          Starred
        </button>
        <Tooltip label="Export the current filter as CSV (press e)">
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
        </Tooltip>
      </div>

      <RecentCasesRow />

      {/* active-filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => <Chip key={c.key} label={c.label} onRemove={c.remove} />)}
          <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}

      {/* result summary + jump-to-page + page size */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="num inline-flex flex-wrap items-center gap-2">
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
          {sort && !clientRefined && (
            <Tooltip label="The API has no sort parameter — sorting reorders the rows on this page only. Add a search/status refinement to sort across the scanned set.">
              <span className="inline-flex items-center gap-1 cursor-help underline decoration-dotted underline-offset-2">
                sorts this page
              </span>
            </Tooltip>
          )}
          {cases.isFetching && !cases.isLoading && <span className="text-muted/70">updating…</span>}
        </span>
        <span className="inline-flex flex-wrap items-center gap-3">
          {pages > 1 && (
            <form className="inline-flex items-center gap-1.5" onSubmit={goToPage}>
              <label className="inline-flex items-center gap-1.5">
                Jump to
                <input
                  type="number"
                  min={1}
                  max={pages}
                  className="input-dark !py-1 !px-2 !text-xs w-16 num"
                  value={jump}
                  onChange={(e) => setJump(e.target.value)}
                  placeholder={String(page)}
                  aria-label={`Jump to page (1 to ${pages})`}
                />
              </label>
              <button type="submit" className="btn !py-1 !px-2 text-xs" disabled={!jump}>Go</button>
            </form>
          )}
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
        </span>
      </div>

      {/* collapsible filter-profile bar */}
      {!cases.isLoading && !cases.error && (
        <SummaryBar
          rows={sorted}
          groupKey={groupKey}
          groupLabel={groupLabel}
          scopeLabel={clientRefined ? `${fmtInt(sorted.length)} scanned rows` : `this page (${fmtInt(pageRows.length)} rows)`}
        />
      )}

      <Card padded={false}>
        {cases.error ? (
          <EmptyState
            title="Couldn't load cases"
            message={cases.error.message}
            action={<button type="button" className="btn" onClick={() => cases.refetch()}>Retry</button>}
          />
        ) : (
          <DataTable
            exportFilename="dappa-cases"
            columns={activeColumns}
            rows={pageRows}
            rowKey="caseMasterId"
            loading={cases.isLoading}
            emptyMessage={emptyMessage}
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
        currentView={{ columns: visibleCols, sort }}
        onApplyView={applyView}
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
