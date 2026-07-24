// /cases — Case Explorer: advanced filter builder (district / station / crime
// head / subhead / status / gravity / pending-age / date range) with removable
// chips, saved presets (optionally capturing columns+sort), full-text search
// with an advanced boolean syntax (AND terms, | OR, - NOT, field: scoping,
// #id jump) and term highlighting, live CrimeNo decoding with one-tap pivots,
// scan-insight KPIs + temporal strips (month density with click-to-filter,
// weekday profile), a 2–3 case compare tray with a diff-highlighted side-by-
// side sheet, per-row quick-look peek, column chooser + density, URL-persisted
// sortable columns, starred cases, recently-viewed row, filter-profile bar,
// client + server CSV export, Markdown/link copy, and keyboard shortcuts
// ('/' search · 'e' export · 'c' compare · '?' help). Server filters ride the
// URL (shareable); status / search / anomaly / starred / age are client-side
// refinements over the newest 200 rows of the server filter, because
// GET /cases has no status or text param (docs/CONTRACTS.md).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCases, useLookups, API_BASE, prune } from '../lib/api.js';
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
import { fetchCasesForExport, toCsv, downloadCsv, exportFilename, buildExportColumns, toMarkdown, EXPORT_CAP } from './cases/csv.js';
import { parseQuery, buildQueryMatcher, describeTokens } from './cases/query.js';
import { readCompare, writeCompare, snapshotRow, COMPARE_CAP } from './cases/compare.js';
import { copyText } from './cases/clipboard.js';
import { readStars, toggleStar } from './cases/stars.js';
import FilterSheet from './cases/FilterSheet.jsx';
import PresetsSheet from './cases/PresetsSheet.jsx';
import ColumnsSheet from './cases/ColumnsSheet.jsx';
import RecentCasesRow from './cases/RecentCasesRow.jsx';
import SummaryBar from './cases/SummaryBar.jsx';
import ScanInsights from './cases/ScanInsights.jsx';
import CrimeNoSearchHint from './cases/CrimeNoSearchHint.jsx';
import CompareTray from './cases/CompareTray.jsx';
import CompareSheet from './cases/CompareSheet.jsx';
import PeekSheet from './cases/PeekSheet.jsx';
import ShortcutsSheet from './cases/ShortcutsSheet.jsx';

const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

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
  eye: <Icon size={14}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Icon>,
  keyboard: <Icon size={14}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></Icon>,
  link: <Icon size={14}><path d="M10 14a4 4 0 0 0 6 .5l2.5-2.5a4 4 0 1 0-5.7-5.7L11.5 7.6" /><path d="M14 10a4 4 0 0 0-6-.5L5.5 12a4 4 0 1 0 5.7 5.7l1.3-1.3" /></Icon>,
  markdown: <Icon size={14}><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M6 15v-6l2.5 3L11 9v6M15.5 9v6m0 0 -2-2m2 2 2-2" /></Icon>,
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

/** Highlight the active search needles (every positive term of the parsed
 * query, so `head:theft|robbery` marks both words) inside a plain-text cell. */
function Hl({ text, needles }) {
  const s = text === undefined || text === null ? '' : String(text);
  if (!s) return '—';
  const list = (needles || []).filter(Boolean);
  if (!list.length) return s;
  const lower = s.toLowerCase();
  const segs = [];
  let i = 0;
  while (i < s.length) {
    let best = -1;
    let bestLen = 0;
    for (const n of list) {
      const j = lower.indexOf(n, i);
      if (j !== -1 && (best === -1 || j < best || (j === best && n.length > bestLen))) {
        best = j;
        bestLen = n.length;
      }
    }
    if (best === -1) break;
    if (best > i) segs.push({ t: s.slice(i, best) });
    segs.push({ t: s.slice(best, best + bestLen), hit: true });
    i = best + bestLen;
  }
  if (!segs.length) return s;
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

// Canonical column set — chooser hides/shows the unlocked ones ('_select',
// '_actions' and crimeNo stay). caseNo and ageDays start hidden; everything
// else starts visible.
const buildColumnDefs = ({ onCopy, onOpen, onToggleStar, onToggleCompare, onPeek, stars = {}, compareIds, needles = [] }) => [
  {
    key: 'crimeNo', label: 'Crime no', chooserLabel: 'Crime no (identity)', locked: true, sortable: true,
    className: 'font-medium whitespace-nowrap',
    render: (r) => <CrimeNoInline crimeNo={r.crimeNo} />,
  },
  {
    key: '_select', label: '', chooserLabel: 'Compare select', locked: true, width: 44, align: 'center',
    render: (r) => {
      const on = !!compareIds?.has(String(r.caseMasterId));
      return (
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--c-amber)] cursor-pointer align-middle"
          checked={on}
          aria-label={`${on ? 'Remove' : 'Add'} case ${r.crimeNo} ${on ? 'from' : 'to'} the compare tray`}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleCompare?.(r)}
        />
      );
    },
  },
  { key: 'registeredDate', label: 'Registered', sortable: true, render: (r) => dateLabel(r.registeredDate) },
  { key: 'caseNo', label: 'Case no', defaultOff: true, className: 'whitespace-nowrap', render: (r) => <Hl text={r.caseNo} needles={needles} /> },
  {
    key: 'ageDays', label: 'Age', chooserLabel: `Age (days · amber past ${AGE_WARN_DAYS}d)`, defaultOff: true, sortable: true, align: 'right', width: 78,
    render: (r) => (Number.isFinite(r.ageDays)
      ? <span className={`num ${r.ageDays > AGE_WARN_DAYS ? 'text-amber font-medium' : ''}`}>{fmtInt(r.ageDays)}d</span>
      : '—'),
  },
  { key: 'districtName', label: 'District', sortable: true, render: (r) => <Hl text={r.districtName} needles={needles} /> },
  { key: 'unitName', label: 'Station', sortable: true, render: (r) => <Hl text={r.unitName} needles={needles} /> },
  { key: 'headName', label: 'Crime head', sortable: true, render: (r) => <Hl text={r.headName} needles={needles} /> },
  { key: 'subHeadName', label: 'Subhead', sortable: true, render: (r) => <Hl text={r.subHeadName} needles={needles} /> },
  { key: 'statusName', label: 'Status', sortable: true, render: (r) => <Hl text={r.statusName} needles={needles} /> },
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
    key: '_actions', label: '', chooserLabel: 'Quick actions', locked: true, width: 170, align: 'right',
    render: (r) => {
      const starred = !!stars[String(r.caseMasterId)];
      return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <Tooltip label="Quick-look" position="left">
            <button type="button" className={ROW_BTN} aria-label={`Quick-look case ${r.crimeNo}`} onClick={() => onPeek?.(r)}>
              {ICONS.eye}
            </button>
          </Tooltip>
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
    unitId, crimeSubHeadId, gravityId, statusId, q, anomalyOnly, starredOnly, minAgeDays,
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
  const [sheet, setSheet] = useState(null); // 'filters' | 'presets' | 'columns' | 'compare' | 'shortcuts' | null
  const [exporting, setExporting] = useState(false);
  const [jump, setJump] = useState('');
  // Compare tray (sessionStorage) + row quick-look.
  const [compareItems, setCompareItems] = useState(readCompare);
  const [peekRow, setPeekRow] = useState(null);
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

  const clientRefined = !!(q || statusId || anomalyOnly || starredOnly || minAgeDays);
  const cases = useCases(clientRefined
    ? { ...serverFilterParams, page: 1, perPage: 200 }
    : { ...serverFilterParams, page, perPage: pageSize });

  // Any filter/page-size change restarts pagination — page 6 of a narrower set is noise.
  const filterKey = JSON.stringify([serverFilterParams, q, statusId, anomalyOnly, starredOnly, minAgeDays, pageSize]);
  useEffect(() => { setPage(1); }, [filterKey]);

  const statusName = statusId ? (lk?.statuses || []).find((s) => s.id === statusId)?.name || '' : '';
  // The q part now runs through the advanced query parser (AND / | OR / -NOT /
  // field: scoping / #id); the other refinements keep buildRefine's semantics.
  const parsedQ = useMemo(() => parseQuery(q), [q]);
  const refine = useMemo(() => {
    const base = buildRefine({ q: '', statusName, anomalyOnly, starredOnly, starredIds: stars });
    const qMatch = buildQueryMatcher(parsedQ);
    return (r) => base(r)
      && qMatch(r)
      && (!minAgeDays || (Number.isFinite(r.ageDays) && r.ageDays >= minAgeDays));
  }, [statusName, anomalyOnly, starredOnly, stars, parsedQ, minAgeDays]);

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

  // --- compare tray ---------------------------------------------------------
  const compareIds = useMemo(
    () => new Set(compareItems.map((x) => String(x.caseMasterId))),
    [compareItems],
  );
  const toggleCompare = (r) => {
    const key = String(r.caseMasterId);
    let next;
    if (compareIds.has(key)) {
      next = compareItems.filter((x) => String(x.caseMasterId) !== key);
    } else if (compareItems.length >= COMPARE_CAP) {
      toast.info(`Compare holds up to ${COMPARE_CAP} cases — remove one first.`);
      return;
    } else {
      next = [...compareItems, snapshotRow(r)];
    }
    writeCompare(next);
    setCompareItems(next);
  };
  const clearCompare = () => {
    writeCompare([]);
    setCompareItems([]);
  };
  const openFromCompare = (item) => {
    navigate(
      { pathname: `/cases/${item.caseMasterId}`, search: location.search },
      { state: { siblings: compareItems.map((x) => String(x.caseMasterId)) } },
    );
  };

  // --- copy / share utilities ----------------------------------------------
  const copyViewLink = async () => {
    const ok = await copyText(window.location.href);
    if (ok) toast.success('View link copied — filters, sort and search included');
    else toast.error('Could not copy — clipboard is blocked in this browser.');
  };
  const copyMarkdown = async () => {
    if (!pageRows.length) {
      toast.info('Nothing on this page to copy.');
      return;
    }
    const ok = await copyText(toMarkdown(pageRows, buildExportColumns(visibleCols)));
    if (ok) toast.success(`Copied ${fmtInt(pageRows.length)} rows as a Markdown table`);
    else toast.error('Could not copy — clipboard is blocked in this browser.');
  };
  // Server-side CSV keeps full fidelity for the active server filters
  // (client-side refinements can't ride it — the endpoint has no such params).
  const serverCsvHref = `${API_BASE}/cases.csv?${new URLSearchParams(
    Object.entries(prune({ ...serverFilterParams, limit: 5000 })).map(([k, v]) => [k, String(v)]),
  ).toString()}`;

  const applyMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return;
    const last = new Date(y, m, 0).getDate();
    setMany({ from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` });
    toast.info(`Filtered to ${ym}`);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { rows: fetched, total, truncated } = await fetchCasesForExport(serverFilterParams);
      // ageDays is client-derived — refine (pending-age) needs it on raw rows too.
      const all = fetched.map((r) => ({ ...r, ageDays: caseAgeDays(r.registeredDate) }));
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

  // Keyboard shortcuts: '/' search, 'e' export, 'c' compare, '?' help
  // (refs dodge stale closures).
  const exportRef = useRef(handleExport);
  exportRef.current = handleExport;
  const compareOpenRef = useRef(null);
  compareOpenRef.current = () => {
    if (compareItems.length >= 2) setSheet('compare');
    else toast.info('Select at least two cases (checkboxes in the table) to compare.');
  };
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
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        compareOpenRef.current();
      } else if (e.key === '?') {
        e.preventDefault();
        setSheet('shortcuts');
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
  if (minAgeDays) chips.push({ key: 'minAge', label: `Age: over ${minAgeDays}d`, remove: () => setMany({ minAge: '' }) });
  const activeCount = chips.length;

  const needles = parsedQ.highlight;
  const columnDefs = useMemo(
    () => buildColumnDefs({
      onCopy: copyCrimeNo, onOpen: openDetail, onToggleStar: handleToggleStar,
      onToggleCompare: toggleCompare, onPeek: setPeekRow, stars, compareIds, needles,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siblings, location.search, stars, compareIds, compareItems, needles],
  );
  const activeColumns = columnDefs.filter((c) => c.locked || visibleCols.includes(c.key));

  // Interpreted-query chips — visible whenever the advanced syntax kicks in.
  const queryChips = parsedQ.advanced ? describeTokens(parsedQ) : [];

  // Starred cases the 200-row scan can't see — offer direct-open chips so the
  // Starred view is never silently incomplete.
  const starredOutside = useMemo(() => {
    if (!starredOnly || cases.isLoading) return [];
    const seen = new Set(serverRows.map((r) => String(r.caseMasterId)));
    return Object.entries(stars)
      .filter(([id]) => !seen.has(id))
      .map(([id, meta]) => ({ id, crimeNo: meta?.crimeNo || '' }))
      .slice(0, 12);
  }, [starredOnly, cases.isLoading, serverRows, stars]);

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

      {/* live CrimeNo decoding + one-tap pivots for number-like queries */}
      <CrimeNoSearchHint
        q={qInput}
        rows={sorted}
        lookups={lk}
        onApply={setMany}
        onOpenCase={(id) => navigate({ pathname: `/cases/${id}`, search: location.search })}
      />

      {/* how the advanced query was interpreted */}
      {queryChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label="Query interpretation">
          <Tooltip label="Search syntax: terms AND together · field:value scopes a column · a|b is OR · -term excludes · #id is an exact CaseMasterID. Press ? for the full reference.">
            <span className="eyebrow cursor-help underline decoration-dotted underline-offset-2">Interpreted</span>
          </Tooltip>
          {queryChips.map((c, i) => (
            <span key={`${c.label}-${i}`} className={`chip !py-1 num ${c.neg ? '!border-signal/50 !text-signal' : ''}`}>
              {c.label}
            </span>
          ))}
        </div>
      )}

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

      {/* starred cases the 200-row scan can't reach — direct-open chips */}
      {starredOutside.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label="Starred cases outside this scan">
          <span className="eyebrow">Outside scan</span>
          <span>{fmtInt(starredOutside.length)} starred case{starredOutside.length > 1 ? 's' : ''} not in the scanned rows:</span>
          {starredOutside.map((s) => {
            const digits = String(s.crimeNo || '').replace(/\D/g, '');
            const label = digits.length === 18 ? `…${digits.slice(-9)}` : (s.crimeNo || `#${s.id}`);
            return (
              <button
                key={s.id}
                type="button"
                className="chip num !py-1 hover:border-amber/60 hover:text-amber transition-colors"
                onClick={() => navigate({ pathname: `/cases/${s.id}`, search: location.search })}
                title={`Open starred case ${s.crimeNo || s.id}`}
              >
                {label}
              </button>
            );
          })}
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
          <span className="inline-flex items-center gap-0.5" role="group" aria-label="Share and copy tools">
            <Tooltip label="Copy a shareable link to this exact view">
              <button type="button" className="btn-ghost !p-0 flex h-8 w-8 items-center justify-center" aria-label="Copy view link" onClick={copyViewLink}>
                {ICONS.link}
              </button>
            </Tooltip>
            <Tooltip label="Copy this page as a Markdown table (respects the column chooser)">
              <button type="button" className="btn-ghost !p-0 flex h-8 w-8 items-center justify-center" aria-label="Copy visible rows as Markdown" onClick={copyMarkdown}>
                {ICONS.markdown}
              </button>
            </Tooltip>
            <Tooltip label="Keyboard shortcuts & search syntax (?)">
              <button type="button" className="btn-ghost !p-0 flex h-8 w-8 items-center justify-center" aria-label="Keyboard shortcuts and search syntax" onClick={() => setSheet('shortcuts')}>
                {ICONS.keyboard}
              </button>
            </Tooltip>
            {!STATIC_DEMO && (
              <Tooltip label="Full-fidelity server-side CSV of the active server filters (up to 5,000 rows; client refinements not applied)">
                <a className="btn-ghost !py-1 !px-2 text-[11px]" href={serverCsvHref} download>
                  server CSV
                </a>
              </Tooltip>
            )}
          </span>
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

      {/* collapsible scan insights: KPIs · status mix · temporal strips */}
      {!cases.isLoading && !cases.error && (
        <ScanInsights
          rows={sorted}
          scopeLabel={clientRefined ? `${fmtInt(sorted.length)} scanned rows` : `this page (${fmtInt(pageRows.length)} rows)`}
          statuses={lk?.statuses || []}
          statusId={statusId}
          onStatus={(id) => setMany({ status: id })}
          onMonthClick={applyMonth}
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

      {/* sticky compare tray + sheets */}
      <CompareTray
        items={compareItems}
        onRemove={toggleCompare}
        onClear={clearCompare}
        onOpen={() => setSheet('compare')}
      />
      <CompareSheet
        open={sheet === 'compare'}
        onClose={() => setSheet(null)}
        items={compareItems}
        onOpenCase={openFromCompare}
      />
      <PeekSheet
        row={peekRow}
        onClose={() => setPeekRow(null)}
        starred={!!(peekRow && stars[String(peekRow.caseMasterId)])}
        onToggleStar={() => peekRow && handleToggleStar(peekRow)}
        inCompare={!!(peekRow && compareIds.has(String(peekRow.caseMasterId)))}
        onToggleCompare={() => peekRow && toggleCompare(peekRow)}
        onCopy={() => peekRow && copyCrimeNo(peekRow)}
        onOpen={() => { if (peekRow) { const r = peekRow; setPeekRow(null); openDetail(r); } }}
      />
      <ShortcutsSheet open={sheet === 'shortcuts'} onClose={() => setSheet(null)} />

      <FilterSheet
        open={sheet === 'filters'}
        onClose={() => setSheet(null)}
        values={{ districtId, unitId, crimeHeadId, crimeSubHeadId, gravityId, statusId, range, from, to, anomalyOnly, minAgeDays, explicitDates }}
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
        defs={columnDefs.filter((c) => c.key !== '_actions' && c.key !== '_select')}
        visible={visibleCols}
        onChange={setColumns}
        onReset={() => setColumns(DEFAULT_VISIBLE)}
      />
    </div>
  );
}
