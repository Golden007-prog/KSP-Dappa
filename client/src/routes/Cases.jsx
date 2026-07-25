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
import { useT, useNames } from '../lib/i18n.jsx';
import { useCaseNames } from './cases/names.js';
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
import FilterSheet, { RANGE_KEYS } from './cases/FilterSheet.jsx';
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
// else starts visible. `t`/`trName` default to pass-throughs so the module-level
// DEFAULT_VISIBLE probe (which only reads key/locked/defaultOff) needs no i18n.
const buildColumnDefs = ({
  onCopy, onOpen, onToggleStar, onToggleCompare, onPeek, stars = {}, compareIds, needles = [],
  t = (k) => k, trName = (kind, v) => v,
}) => [
  {
    key: 'crimeNo', label: t('cases.col.crimeNo'), chooserLabel: t('cases.col.crimeNo.chooser'), locked: true, sortable: true,
    className: 'font-medium whitespace-nowrap',
    render: (r) => <CrimeNoInline crimeNo={r.crimeNo} />,
  },
  {
    key: '_select', label: '', chooserLabel: t('cases.col.select.chooser'), locked: true, width: 44, align: 'center',
    render: (r) => {
      const on = !!compareIds?.has(String(r.caseMasterId));
      return (
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--c-amber)] cursor-pointer align-middle"
          checked={on}
          aria-label={t(on ? 'cases.row.compareRemove' : 'cases.row.compareAdd', { no: r.crimeNo })}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleCompare?.(r)}
        />
      );
    },
  },
  { key: 'registeredDate', label: t('cases.col.registered'), sortable: true, render: (r) => dateLabel(r.registeredDate) },
  { key: 'caseNo', label: t('cases.col.caseNo'), defaultOff: true, className: 'whitespace-nowrap', render: (r) => <Hl text={r.caseNo} needles={needles} /> },
  {
    key: 'ageDays', label: t('cases.col.age'), chooserLabel: t('cases.col.age.chooser', { d: AGE_WARN_DAYS }), defaultOff: true, sortable: true, align: 'right', width: 78,
    render: (r) => (Number.isFinite(r.ageDays)
      ? <span className={`num ${r.ageDays > AGE_WARN_DAYS ? 'text-amber font-medium' : ''}`}>{fmtInt(r.ageDays)}d</span>
      : '—'),
  },
  { key: 'districtName', label: t('cases.col.district'), sortable: true, render: (r) => <Hl text={trName('districts', r.districtName)} needles={needles} /> },
  { key: 'unitName', label: t('cases.col.station'), sortable: true, render: (r) => <Hl text={r.unitName} needles={needles} /> },
  { key: 'headName', label: t('cases.col.head'), sortable: true, render: (r) => <Hl text={trName('crimeHeads', r.headName)} needles={needles} /> },
  { key: 'subHeadName', label: t('cases.col.subHead'), sortable: true, render: (r) => <Hl text={trName('crimeSubHeads', r.subHeadName)} needles={needles} /> },
  { key: 'statusName', label: t('cases.col.status'), sortable: true, render: (r) => <Hl text={trName('statuses', r.statusName)} needles={needles} /> },
  {
    key: 'gravityName', label: t('cases.col.gravity'), sortable: true,
    render: (r) => (r.gravityName
      ? <Badge tone={/hein/i.test(String(r.gravityName)) ? 'red' : 'slate'}>{trName('gravities', r.gravityName)}</Badge>
      : '—'),
  },
  {
    key: 'anomalyFlag', label: t('cases.col.anomaly'), chooserLabel: t('cases.col.anomaly.chooser'), width: 90, align: 'center', sortable: true,
    render: (r) => (r.anomalyFlag ? <Badge tone="red" pulse>{t('cases.badge.anomaly')}</Badge> : null),
  },
  {
    key: '_actions', label: '', chooserLabel: t('cases.col.actions.chooser'), locked: true, width: 170, align: 'right',
    render: (r) => {
      const starred = !!stars[String(r.caseMasterId)];
      return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <Tooltip label={t('cases.row.peek')} position="left">
            <button type="button" className={ROW_BTN} aria-label={t('cases.row.peekAria', { no: r.crimeNo })} onClick={() => onPeek?.(r)}>
              {ICONS.eye}
            </button>
          </Tooltip>
          <Tooltip label={t(starred ? 'cases.row.unstar' : 'cases.row.star')} position="left">
            <button
              type="button"
              className={`${ROW_BTN} ${starred ? '!text-amber' : ''}`}
              aria-label={t(starred ? 'cases.row.unstarAria' : 'cases.row.starAria', { no: r.crimeNo })}
              aria-pressed={starred}
              onClick={() => onToggleStar(r)}
            >
              <StarIcon filled={starred} size={14} />
            </button>
          </Tooltip>
          <Tooltip label={t('cases.row.copyNo')} position="left">
            <button type="button" className={ROW_BTN} aria-label={t('cases.row.copyNoAria', { no: r.crimeNo })} onClick={() => onCopy(r)}>
              {ICONS.copy}
            </button>
          </Tooltip>
          <Tooltip label={t('cases.row.open')} position="left">
            <button type="button" className={ROW_BTN} aria-label={t('cases.row.openAria', { no: r.crimeNo })} onClick={() => onOpen(r)}>
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
  const t = useT();
  return (
    <span className="chip !pr-0.5 animate-fade-in max-w-full">
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={t('cases.chip.remove', { label })}
        className="ml-0.5 -my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-signal hover:bg-signal/10 transition-colors"
        onClick={onRemove}
      >
        {ICONS.x}
      </button>
    </span>
  );
}

export default function Cases() {
  const t = useT();
  const tName = useNames();
  const trName = useCaseNames();
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
      ? t('cases.page.docTitleCount', { n: fmtInt(totalMatches) })
      : t('cases.page.docTitle');
  }, [totalMatches, t]);

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
    if (ok) toast.success(t('cases.toast.copied', { no: r.crimeNo }));
    else toast.error(t('cases.toast.copyBlocked'));
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
      toast.info(t('cases.toast.compareFull', { n: COMPARE_CAP }));
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
    if (ok) toast.success(t('cases.toast.viewLinkCopied'));
    else toast.error(t('cases.toast.copyBlocked'));
  };
  const copyMarkdown = async () => {
    if (!pageRows.length) {
      toast.info(t('cases.toast.nothingToCopy'));
      return;
    }
    const ok = await copyText(toMarkdown(pageRows, buildExportColumns(visibleCols)));
    if (ok) toast.success(t('cases.toast.markdownCopied', { n: fmtInt(pageRows.length) }));
    else toast.error(t('cases.toast.copyBlocked'));
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
    toast.info(t('cases.toast.monthFiltered', { ym }));
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
        toast.info(t('cases.toast.nothingToExport'));
        return;
      }
      // The file mirrors the on-screen column chooser (identity columns always kept).
      downloadCsv(exportFilename(), toCsv(finalRows, buildExportColumns(visibleCols)));
      toast.success(truncated
        ? t('cases.toast.exportedCapped', { n: fmtInt(finalRows.length), cap: fmtInt(EXPORT_CAP), total: fmtInt(total) })
        : t('cases.toast.exported', { n: fmtInt(finalRows.length) }));
    } catch (err) {
      toast.error(t('cases.toast.exportFailed', { msg: err.message }));
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
    else toast.info(t('cases.toast.compareNeedTwo'));
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

  // Filter chips name the SELECTED lookup entry, so the id is in hand — tName
  // translates it directly (no name→id round trip). Stations have no table.
  const chips = [];
  if (districtId) chips.push({ key: 'districtId', label: t('cases.chip.district', { v: tName('districts', districtId, nameOf(lk?.districts, 'districtId', districtId, 'districtName')) }), remove: () => setMany({ districtId: '' }) });
  if (unitId) chips.push({ key: 'unitId', label: t('cases.chip.station', { v: nameOf(lk?.units, 'unitId', unitId, 'unitName') }), remove: () => setMany({ unitId: '' }) });
  if (crimeHeadId) chips.push({ key: 'crimeHeadId', label: t('cases.chip.head', { v: tName('crimeHeads', crimeHeadId, nameOf(lk?.crimeHeads, 'crimeHeadId', crimeHeadId, 'headName')) }), remove: () => setMany({ crimeHeadId: '' }) });
  if (crimeSubHeadId) chips.push({ key: 'crimeSubHeadId', label: t('cases.chip.subHead', { v: tName('crimeSubHeads', crimeSubHeadId, nameOf(lk?.crimeSubHeads, 'crimeSubHeadId', crimeSubHeadId, 'subHeadName')) }), remove: () => setMany({ crimeSubHeadId: '' }) });
  if (statusId) chips.push({ key: 'status', label: t('cases.chip.status', { v: tName('statuses', statusId, nameOf(lk?.statuses, 'id', statusId, 'name')) }), remove: () => setMany({ status: '' }) });
  if (gravityId) chips.push({ key: 'gravityId', label: t('cases.chip.gravity', { v: tName('gravities', gravityId, nameOf(lk?.gravities, 'id', gravityId, 'name')) }), remove: () => setMany({ gravityId: '' }) });
  if (explicitDates) chips.push({ key: 'dates', label: t('cases.chip.dates', { from: dateLabel(from), to: dateLabel(to) }), remove: () => setMany({ range: 'all' }) });
  else if (range && range !== 'all') {
    const preset = DATE_RANGES.find((r) => r.value === range);
    const label = RANGE_KEYS[range] ? t(RANGE_KEYS[range]) : (preset?.label || range);
    chips.push({ key: 'range', label: t('cases.chip.period', { v: label }), remove: () => setMany({ range: 'all' }) });
  }
  if (q) chips.push({ key: 'q', label: t('cases.chip.search', { q }), remove: () => setMany({ q: '' }) });
  if (anomalyOnly) chips.push({ key: 'anomaly', label: t('cases.chip.anomalyOnly'), remove: () => setMany({ anomaly: '' }) });
  if (starredOnly) chips.push({ key: 'starred', label: t('cases.chip.starredOnly'), remove: () => setMany({ starred: '' }) });
  if (minAgeDays) chips.push({ key: 'minAge', label: t('cases.chip.minAge', { d: minAgeDays }), remove: () => setMany({ minAge: '' }) });
  const activeCount = chips.length;

  const needles = parsedQ.highlight;
  const columnDefs = useMemo(
    () => buildColumnDefs({
      onCopy: copyCrimeNo, onOpen: openDetail, onToggleStar: handleToggleStar,
      onToggleCompare: toggleCompare, onPeek: setPeekRow, stars, compareIds, needles, t, trName,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siblings, location.search, stars, compareIds, compareItems, needles, t, trName],
  );
  const activeColumns = columnDefs.filter((c) => c.locked || visibleCols.includes(c.key));

  // Interpreted-query chips — visible whenever the advanced syntax kicks in.
  const queryChips = parsedQ.advanced ? describeTokens(parsedQ, t) : [];

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
  const [groupKey, groupLabelKey, groupKind] = districtId
    ? (unitId ? ['headName', 'cases.profile.groupHead', 'crimeHeads'] : ['unitName', 'cases.profile.groupStation', ''])
    : ['districtName', 'cases.profile.groupDistrict', 'districts'];
  const groupLabel = t(groupLabelKey);

  const emptyText = t(clientRefined ? 'cases.empty.refined' : 'cases.empty.filtered');
  const emptyMessage = activeCount > 0 ? (
    <span className="block">
      <span className="block">{emptyText}</span>
      <span className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {chips.map((c) => <Chip key={c.key} label={c.label} onRemove={c.remove} />)}
        <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={clearAll}>{t('cases.chip.clearAll')}</button>
      </span>
    </span>
  ) : emptyText;

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div>
        <h1 className="page-title">{t('cases.page.title')}</h1>
        <p className="page-subtitle">
          {t('cases.page.subtitle')}
          {Number.isFinite(Number(totalMatches)) ? <> · {t('cases.page.matchCount', { n: fmtInt(totalMatches) })}</> : null}
        </p>
      </div>

      {/* toolbar: search + sheet triggers */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('cases.toolbar.aria')}>
        <div className="relative flex-1 min-w-[12rem]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{ICONS.search}</span>
          <input
            ref={searchRef}
            type="search"
            className="input-dark w-full !pl-9 !py-2.5 sm:!py-2"
            placeholder={t('cases.toolbar.searchPlaceholder')}
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              if (qInput) { setQInput(''); setMany({ q: '' }); } else e.currentTarget.blur();
            }}
            aria-label={t('cases.toolbar.searchAria')}
            enterKeyHint="search"
          />
          {qInput && (
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-ink transition-colors"
              aria-label={t('cases.toolbar.clearSearch')}
              onClick={() => { setQInput(''); setMany({ q: '' }); }}
            >
              {ICONS.x}
            </button>
          )}
        </div>
        <button type="button" className="btn !py-2.5 sm:!py-2" onClick={() => setSheet('filters')} aria-haspopup="dialog">
          {ICONS.filter}
          {t('cases.toolbar.filters')}
          {activeCount > 0 && (
            <span className="num rounded-full bg-amber/15 text-amber text-[10px] font-semibold px-1.5 py-0.5">{activeCount}</span>
          )}
        </button>
        <button type="button" className="btn !py-2.5 sm:!py-2" onClick={() => setSheet('presets')} aria-haspopup="dialog">
          {ICONS.bookmark}
          {t('cases.toolbar.presets')}
        </button>
        <button type="button" className="btn !py-2.5 sm:!py-2" onClick={() => setSheet('columns')} aria-haspopup="dialog">
          {ICONS.columns}
          {t('cases.toolbar.columns')}
        </button>
        <button
          type="button"
          className={`btn !py-2.5 sm:!py-2 ${starredOnly ? '!border-amber/60 !text-amber' : ''}`}
          onClick={() => setMany({ starred: starredOnly ? '' : '1' })}
          aria-pressed={starredOnly}
          aria-label={t(starredOnly ? 'cases.toolbar.showAll' : 'cases.toolbar.showStarredOnly')}
        >
          <StarIcon filled={starredOnly} size={14} />
          {t('cases.toolbar.starred')}
        </button>
        <Tooltip label={t('cases.toolbar.exportTip')}>
          <button
            type="button"
            className="btn !py-2.5 sm:!py-2"
            onClick={handleExport}
            disabled={exporting || !!cases.error}
            aria-label={t('cases.toolbar.exportAria')}
          >
            {ICONS.download}
            {exporting ? t('cases.toolbar.exporting') : t('cases.toolbar.csv')}
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
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label={t('cases.query.aria')}>
          <Tooltip label={t('cases.query.tip')}>
            <span className="eyebrow cursor-help underline decoration-dotted underline-offset-2">{t('cases.query.interpreted')}</span>
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
        <div className="flex flex-wrap items-center gap-1.5" aria-label={t('cases.chip.aria')}>
          {chips.map((c) => <Chip key={c.key} label={c.label} onRemove={c.remove} />)}
          <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={clearAll}>
            {t('cases.chip.clearAll')}
          </button>
        </div>
      )}

      {/* starred cases the 200-row scan can't reach — direct-open chips */}
      {starredOutside.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label={t('cases.outside.aria')}>
          <span className="eyebrow">{t('cases.outside.label')}</span>
          <span>{t(starredOutside.length > 1 ? 'cases.outside.many' : 'cases.outside.one', { n: fmtInt(starredOutside.length) })}</span>
          {starredOutside.map((s) => {
            const digits = String(s.crimeNo || '').replace(/\D/g, '');
            const label = digits.length === 18 ? `…${digits.slice(-9)}` : (s.crimeNo || `#${s.id}`);
            return (
              <button
                key={s.id}
                type="button"
                className="chip num !py-1 hover:border-amber/60 hover:text-amber transition-colors"
                onClick={() => navigate({ pathname: `/cases/${s.id}`, search: location.search })}
                title={t('cases.outside.open', { no: s.crimeNo || s.id })}
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
            ? (
              <>
                {t('cases.summary.cases', { n: fmtInt(totalMatches) })}
                {activeCount > 0
                  ? t(activeCount > 1 ? 'cases.summary.filtersMany' : 'cases.summary.filtersOne', { n: activeCount })
                  : ''}
              </>
            )
            : t('common.state.loading')}
          {scanCapped && (
            <Tooltip label={t('cases.summary.scanCappedTip', { total: fmtInt(serverTotal) })}>
              <span className="inline-flex items-center gap-1 text-amber cursor-help">
                <PulseDot color="amber" />
                {t('cases.summary.scanCapped')}
              </span>
            </Tooltip>
          )}
          {sort && !clientRefined && (
            <Tooltip label={t('cases.summary.sortsPageTip')}>
              <span className="inline-flex items-center gap-1 cursor-help underline decoration-dotted underline-offset-2">
                {t('cases.summary.sortsPage')}
              </span>
            </Tooltip>
          )}
          {cases.isFetching && !cases.isLoading && <span className="text-muted/70">{t('cases.summary.updating')}</span>}
        </span>
        <span className="inline-flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-0.5" role="group" aria-label={t('cases.summary.shareAria')}>
            <Tooltip label={t('cases.summary.copyLinkTip')}>
              <button type="button" className="btn-ghost !p-0 flex h-8 w-8 items-center justify-center" aria-label={t('cases.summary.copyLinkAria')} onClick={copyViewLink}>
                {ICONS.link}
              </button>
            </Tooltip>
            <Tooltip label={t('cases.summary.copyMdTip')}>
              <button type="button" className="btn-ghost !p-0 flex h-8 w-8 items-center justify-center" aria-label={t('cases.summary.copyMdAria')} onClick={copyMarkdown}>
                {ICONS.markdown}
              </button>
            </Tooltip>
            <Tooltip label={t('cases.summary.shortcutsTip')}>
              <button type="button" className="btn-ghost !p-0 flex h-8 w-8 items-center justify-center" aria-label={t('cases.summary.shortcutsAria')} onClick={() => setSheet('shortcuts')}>
                {ICONS.keyboard}
              </button>
            </Tooltip>
            {!STATIC_DEMO && (
              <Tooltip label={t('cases.summary.serverCsvTip')}>
                <a className="btn-ghost !py-1 !px-2 text-[11px]" href={serverCsvHref} download>
                  {t('cases.summary.serverCsv')}
                </a>
              </Tooltip>
            )}
          </span>
          {pages > 1 && (
            <form className="inline-flex items-center gap-1.5" onSubmit={goToPage}>
              <label className="inline-flex items-center gap-1.5">
                {t('cases.summary.jumpTo')}
                <input
                  type="number"
                  min={1}
                  max={pages}
                  className="input-dark !py-1 !px-2 !text-xs w-16 num"
                  value={jump}
                  onChange={(e) => setJump(e.target.value)}
                  placeholder={String(page)}
                  aria-label={t('cases.summary.jumpAria', { pages })}
                />
              </label>
              <button type="submit" className="btn !py-1 !px-2 text-xs" disabled={!jump}>{t('cases.summary.go')}</button>
            </form>
          )}
          <label className="inline-flex items-center gap-2">
            {t('cases.summary.rowsPerPage')}
            <select
              className="input-dark !py-1 !px-2 !text-xs"
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              aria-label={t('cases.summary.rowsPerPage')}
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
          groupKind={groupKind}
          scopeLabel={clientRefined
            ? t('cases.summary.scopeScanned', { n: fmtInt(sorted.length) })
            : t('cases.summary.scopePage', { n: fmtInt(pageRows.length) })}
        />
      )}

      {/* collapsible scan insights: KPIs · status mix · temporal strips */}
      {!cases.isLoading && !cases.error && (
        <ScanInsights
          rows={sorted}
          scopeLabel={clientRefined
            ? t('cases.summary.scopeScanned', { n: fmtInt(sorted.length) })
            : t('cases.summary.scopePage', { n: fmtInt(pageRows.length) })}
          statuses={lk?.statuses || []}
          statusId={statusId}
          onStatus={(id) => setMany({ status: id })}
          onMonthClick={applyMonth}
        />
      )}

      <Card padded={false}>
        {cases.error ? (
          <EmptyState
            title={t('cases.error.load')}
            message={cases.error.message}
            action={<button type="button" className="btn" onClick={() => cases.refetch()}>{t('common.action.retry')}</button>}
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
