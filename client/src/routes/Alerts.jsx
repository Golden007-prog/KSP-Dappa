// /alerts — anomaly triage console over the live AnomalyAlert corpus.
//
// Feed AND kanban board views (?view=board), severity chips (URL-synced ?sev=)
// + district/type/period filters, district roll-up chips, text search (?q=),
// unread-only (?unread=1) and SLA-breached (?breached=1) toggles, group-by and
// sort (?group= / ?sort=), saved views, triage-progress meter, escalation SLA
// countdowns (first-seen persisted), red-pulse cards with observed-vs-expected
// sparklines and mini bars, per-alert detail sheet, optimistic acknowledge with
// demo-mode handling, snooze-24h, per-card copy, local mark-all-read, opt-in
// sound/desktop notifications, keyboard shortcuts and CSV export.
//
// Built out for the real corpus:
//   · the whole table is paged in (useAlertsCorpus) instead of one page, and
//     GET /alerts/summary states server-side truth beside it;
//   · Severity arrives as the stored INTEGER band and is decoded by
//     severity.js, which is what makes every severity control work on live rows;
//   · Status is a four-state lifecycle (OPEN / REVIEWED / ACK / DISMISSED), not
//     a boolean, and ?status= filters it;
//   · negative-z alerts are reporting COLLAPSES, filterable via ?dir=;
//   · ?minz=, ?age= and ?owner= narrow by deviation, SLA ageing bucket and
//     assignee;
//   · the shared district / crime-head / date filters now actually narrow the
//     feed (GET /alerts ignores them server-side, so the scoping is client-side);
//   · bulk selection drives acknowledge / dismiss / snooze / read / digest.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLookups, API_BASE } from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import FilterBar from '../components/FilterBar.jsx';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import Badge from '../components/Badge.jsx';
import PulseDot from '../components/PulseDot.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import AlertCard from './alerts/AlertCard.jsx';
import OverviewStrip from './alerts/OverviewStrip.jsx';
import SavedViews from './alerts/SavedViews.jsx';
import OptionsSheet from './alerts/OptionsSheet.jsx';
import TriageBoard from './alerts/TriageBoard.jsx';
import TriageProgress from './alerts/TriageProgress.jsx';
import DistrictRollup from './alerts/DistrictRollup.jsx';
import AlertDetailSheet from './alerts/AlertDetailSheet.jsx';
import CorpusSummary from './alerts/CorpusSummary.jsx';
import IntelPanel from './alerts/IntelPanel.jsx';
import BulkBar from './alerts/BulkBar.jsx';
import DigestComposer from './alerts/DigestComposer.jsx';
import useAckAlertOptimistic from './alerts/useAckAlertOptimistic.js';
import useAlertShortcuts from './alerts/useAlertShortcuts.js';
import { useAlertsCorpus, useAlertsSummary } from './alerts/useAlertsCorpus.js';
import { useAlertDetail, useSocioIndicators, useEmerging } from './alerts/useAlertIntel.js';
import { useSetAlertStatus, useBulkAlertStatus } from './alerts/useAlertStatus.js';
import { useTriageMeta } from './alerts/useTriageMeta.js';
import { bucketOf } from './alerts/AgeingBuckets.jsx';
import {
  sevKey, sevRank, bySeverity, statusKey, isOpenAlert, isAckedAlert,
  direction, STATUS_KEYS,
} from './alerts/severity.js';
import { slaFor, useNow } from './alerts/sla.js';
import { useAlertPrefs, GROUP_MODES, SORT_MODES, VIEW_MODES } from './alerts/useAlertPrefs.js';
import { exportAlertsCsv } from './alerts/csv.js';
import { alertShareText } from './alerts/share.js';
import { copyText } from './copilot/clipboard.js';
import {
  playChime, desktopSupported, ensureDesktopPermission, showDesktopNotification,
} from './alerts/notify.js';
import { fmtInt, dateLabel } from '../lib/format.js';
import { useT, useNames } from '../lib/i18n.jsx';

const isAcked = isAckedAlert;

/** Comparators behind the Sort control (URL ?sort=). */
const CMPS = {
  severity: bySeverity,
  z: (a, b) =>
    Math.abs(Number(b.zScore) || 0) - Math.abs(Number(a.zScore) || 0)
    || sevRank(b.severity) - sevRank(a.severity),
  recent: (a, b) =>
    String(b.periodEnd || b.periodStart || '').localeCompare(String(a.periodEnd || a.periodStart || ''))
    || bySeverity(a, b),
};

const SEV_FILTER_KEYS = ['', 'critical', 'high', 'medium', 'low'];
const DIR_MODES = ['up', 'down'];
const AGE_MODES = ['breached', 'final', 'half', 'fresh'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

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

/** Partition the (already sorted) open alerts into labelled groups. */
function groupAlerts(open, groupBy, t, tName) {
  const groups = new Map();
  const push = (key, label, a) => {
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(a);
  };
  for (const a of open) {
    if (groupBy === 'district') {
      const label = tName('districts', a.districtId, a.districtName || a.districtId)
        || t('alerts.unknownDistrict');
      push(label, label, a);
    } else if (groupBy === 'date') {
      const key = String(a.periodEnd || a.periodStart || '').slice(0, 10) || 'undated';
      push(key, key === 'undated' ? t('alerts.group.undated') : dateLabel(key), a);
    } else {
      const sev = sevKey(a.severity) || 'unrated';
      push(sev, t(`alerts.sev.${sev}`), a);
    }
  }
  const list = [...groups.values()];
  if (groupBy === 'district') list.sort((x, y) => x.label.localeCompare(y.label));
  else if (groupBy === 'date') list.sort((x, y) => y.key.localeCompare(x.key));
  else list.sort((x, y) => sevRank(y.key) - sevRank(x.key));
  return list;
}

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
// 44px touch targets on mobile, compact on sm+ pointer screens.
const TOOL_BTN = 'btn !px-2.5 !text-xs min-h-[44px] sm:min-h-[30px]';

function ToggleChip({ on, onClick, label, tip, className = '', children }) {
  return (
    <Tooltip label={tip} className={className}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={label}
        onClick={onClick}
        className={`${TOOL_BTN} ${on ? '!border-primary/60 !text-primary' : ''}`}
      >
        {children}
        <span className="hidden md:inline">{label}</span>
      </button>
    </Tooltip>
  );
}

export default function Alerts() {
  const t = useT();
  const tName = useNames();
  const { apiParams, districtId, crimeHeadId, from, to, setFilter } = useUrlFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  // GET /alerts ignores district / head / date params server-side (it filters on
  // Status only), so the corpus is fetched once and scoped in the client. That
  // also means the shared FilterBar finally narrows this feed.
  const corpus = useAlertsCorpus();
  const corpusSummary = useAlertsSummary();
  const emerging = useEmerging(apiParams.districtId ? { districtId: apiParams.districtId } : {});
  const socio = useSocioIndicators();
  const lookups = useLookups();
  const ack = useAckAlertOptimistic();
  const setStatus = useSetAlertStatus();
  const bulk = useBulkAlertStatus();
  const triage = useTriageMeta();
  const toast = useToast();
  const qc = useQueryClient();
  const {
    groupBy, setGroupBy, sortBy, setSortBy, notify, setNotify, readIds, markRead,
    snoozes, snooze, unsnooze, views, saveView, deleteView,
    viewMode, setViewMode, firstSeen, markSeen,
  } = useAlertPrefs();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [digestOpen, setDigestOpen] = useState(false);
  const cardRefs = useRef(new Map());
  const searchRef = useRef(null);
  // 30s tick for the SLA countdown badges.
  const now = useNow(30000);

  const GROUP_OPTIONS = [
    { value: 'severity', label: t('alerts.group.severity') },
    { value: 'district', label: t('alerts.group.district') },
    { value: 'date', label: t('alerts.group.date') },
  ];
  const SORT_OPTIONS = [
    { value: 'severity', label: t('alerts.sort.severity') },
    { value: 'z', label: t('alerts.sort.z') },
    { value: 'recent', label: t('alerts.sort.recent') },
  ];
  const VIEW_OPTIONS = [
    { value: 'feed', label: t('alerts.view.feed') },
    { value: 'board', label: t('alerts.view.board') },
  ];

  /** Set/clear one URL search param in place (replace — no history spam). */
  const setParam = (key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  // Severity filter lives in the URL (?sev=) so alert views are shareable.
  const sev = (searchParams.get('sev') || '').toLowerCase();
  const setSev = (v) => setParam('sev', v);
  const q = (searchParams.get('q') || '').trim();
  const unreadOnly = searchParams.get('unread') === '1';
  // Corpus-shaped filters, all shareable.
  const dir = DIR_MODES.includes((searchParams.get('dir') || '').toLowerCase())
    ? searchParams.get('dir').toLowerCase() : '';
  const minAbsZ = Number(searchParams.get('minz')) || 0;
  const statusFilter = STATUS_KEYS.includes((searchParams.get('status') || '').toLowerCase())
    ? searchParams.get('status').toLowerCase() : '';
  const ageBucket = AGE_MODES.includes((searchParams.get('age') || '').toLowerCase())
    ? searchParams.get('age').toLowerCase() : '';
  const ownerFilter = searchParams.get('owner') || '';

  // Group-by / sort: URL wins (?group= / ?sort= → shareable), localStorage
  // pref is the default; changing either writes both.
  const urlGroup = (searchParams.get('group') || '').toLowerCase();
  const group = GROUP_MODES.includes(urlGroup) ? urlGroup : groupBy;
  const changeGroup = (v) => { setGroupBy(v); setParam('group', v); };
  const urlSort = (searchParams.get('sort') || '').toLowerCase();
  const sort = SORT_MODES.includes(urlSort) ? urlSort : sortBy;
  const changeSort = (v) => { setSortBy(v); setParam('sort', v); };
  const cmp = CMPS[sort] || bySeverity;

  // Feed vs triage-board view: URL wins (?view=board → shareable), localStorage
  // is the default; 'feed' keeps the URL clean.
  const urlView = (searchParams.get('view') || '').toLowerCase();
  const view = VIEW_MODES.includes(urlView) ? urlView : viewMode;
  const changeView = (v) => { setViewMode(v); setParam('view', v === 'feed' ? '' : v); };
  const breachedOnly = searchParams.get('breached') === '1';

  const allRows = corpus.data?.rows || [];

  // Shared FilterBar scope. Date overlap, not containment: a weekly anomaly
  // window that straddles the range boundary still belongs to the range.
  const rows = useMemo(() => allRows.filter((a) => {
    if (districtId && String(a.districtId) !== String(districtId)) return false;
    if (crimeHeadId && String(a.crimeHeadId) !== String(crimeHeadId)) return false;
    const s = String(a.periodStart || '').slice(0, 10);
    const e = String(a.periodEnd || a.periodStart || '').slice(0, 10);
    if (ISO_DAY.test(from) && ISO_DAY.test(e) && e < from) return false;
    if (ISO_DAY.test(to) && ISO_DAY.test(s) && s > to) return false;
    return true;
  }), [allRows, districtId, crimeHeadId, from, to]);

  const metaFor = triage.metaFor;
  const searched = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((a) => {
      const m = metaFor(a.alertId);
      return [a.narrative, a.districtName, a.districtId, a.headName, sevKey(a.severity), m.owner, m.note]
        .filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [rows, q, metaFor]);

  const filtered = useMemo(() => searched.filter((a) => {
    if (sev && sevKey(a.severity) !== sev) return false;
    if (dir && direction(a) !== dir) return false;
    if (minAbsZ && Math.abs(Number(a.zScore) || 0) < minAbsZ) return false;
    if (statusFilter && statusKey(a.status) !== statusFilter) return false;
    if (ownerFilter) {
      const owner = metaFor(a.alertId).owner;
      if (ownerFilter === '__none__' ? !!owner : owner !== ownerFilter) return false;
    }
    return true;
  }), [searched, sev, dir, minAbsZ, statusFilter, ownerFilter, metaFor]);

  const openAll = useMemo(() => rows.filter(isOpenAlert), [rows]);
  const openFiltered = useMemo(() => filtered.filter(isOpenAlert), [filtered]);
  const openVisible = useMemo(
    () => (unreadOnly ? openFiltered.filter((a) => !readIds.has(String(a.alertId))) : openFiltered),
    [openFiltered, unreadOnly, readIds],
  );
  const snoozedList = useMemo(
    () => [...openVisible.filter((a) => (snoozes[String(a.alertId)] || 0) > Date.now())].sort(cmp),
    [openVisible, snoozes, cmp],
  );
  const openActive = useMemo(
    () => [...openVisible.filter((a) => !((snoozes[String(a.alertId)] || 0) > Date.now()))].sort(cmp),
    [openVisible, snoozes, cmp],
  );
  // Escalation SLA state, anchored at the persisted first-seen timestamp.
  const slaOf = useCallback(
    (a) => slaFor(a, firstSeen[String(a.alertId)], now),
    [firstSeen, now],
  );
  const breachedCount = useMemo(
    () => openActive.filter((a) => slaOf(a).breached).length,
    [openActive, slaOf],
  );
  const open = useMemo(() => {
    let list = openActive;
    if (breachedOnly) list = list.filter((a) => slaOf(a).breached);
    if (ageBucket) list = list.filter((a) => bucketOf(slaOf(a)) === ageBucket);
    return list;
  }, [openActive, breachedOnly, ageBucket, slaOf]);
  // Everything already off the desk — acknowledged, dismissed, or aged out to
  // REVIEWED by the pipeline. Shown together under the feed.
  const acked = useMemo(() => [...filtered.filter((a) => !isOpenAlert(a))].sort(cmp), [filtered, cmp]);
  const groups = useMemo(() => groupAlerts(open, group, t, tName), [open, group, t, tName]);
  const flatOpen = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const unreadOpenCount = useMemo(
    () => openAll.filter((a) => !readIds.has(String(a.alertId))).length,
    [openAll, readIds],
  );
  const totalUnread = useMemo(
    () => rows.filter((a) => !readIds.has(String(a.alertId))).length,
    [rows, readIds],
  );

  const sevCounts = useMemo(() => {
    const m = {};
    for (const a of openAll) {
      const k = sevKey(a.severity);
      if (k) m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [openAll]);

  // Record when this console first listed each alert — the SLA anchor.
  useEffect(() => {
    if (allRows.length) markSeen(allRows.map((a) => String(a.alertId)));
  }, [allRows, markSeen]);

  // New-anomaly detection: absorb the first load silently, then chime /
  // desktop-notify on IDs never seen this session.
  const seenRef = useRef({ primed: false, ids: new Set() });
  useEffect(() => {
    if (!allRows.length) return;
    const s = seenRef.current;
    const fresh = allRows.filter((a) => !s.ids.has(String(a.alertId)) && isOpenAlert(a));
    for (const a of allRows) s.ids.add(String(a.alertId));
    if (!s.primed) { s.primed = true; return; }
    if (!fresh.length) return;
    if (notify.sound) playChime();
    if (notify.desktop) {
      const top = [...fresh].sort(bySeverity)[0];
      const key = sevKey(top.severity) || 'unrated';
      showDesktopNotification(
        t(fresh.length === 1 ? 'alerts.notify.title.one' : 'alerts.notify.title.other', { n: fresh.length }),
        t('alerts.notify.body', {
          sev: t(`alerts.sev.${key}`),
          head: tName('crimeHeads', top.crimeHeadId, top.headName) || t('alerts.anomaly'),
          district: tName('districts', top.districtId, top.districtName || top.districtId) || '',
        }),
      );
    }
  }, [allRows, notify.sound, notify.desktop, t, tName]);

  // Poll for fresh anomalies while either notification channel is on.
  const watching = notify.sound || notify.desktop;
  useEffect(() => {
    if (!watching) return undefined;
    const timer = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['alerts-corpus'] });
      qc.invalidateQueries({ queryKey: ['alerts-summary'] });
    }, 60000);
    return () => clearInterval(timer);
  }, [watching, qc]);

  const toggleSound = () => {
    const next = !notify.sound;
    setNotify({ sound: next });
    if (next) {
      playChime(); // primes the AudioContext inside the user gesture + previews it
      toast.info(t('alerts.toast.soundOn'));
    }
  };

  const toggleDesktop = async () => {
    if (notify.desktop) { setNotify({ desktop: false }); return; }
    const granted = await ensureDesktopPermission();
    if (granted) {
      setNotify({ desktop: true });
      toast.success(t('alerts.toast.desktopOn'));
    } else {
      toast.error(t('alerts.toast.desktopBlocked'));
    }
  };

  const testNotification = () => {
    playChime();
    if (notify.desktop) {
      showDesktopNotification(t('alerts.notify.testTitle'), t('alerts.notify.testBody'));
      toast.info(t('alerts.toast.testSent'));
    } else {
      toast.info(t('alerts.toast.testChimeOnly'));
    }
  };

  const markAllRead = () => {
    const ids = rows.map((a) => String(a.alertId)).filter((id) => !readIds.has(id));
    if (!ids.length) return;
    markRead(ids);
    for (const id of ids.slice(0, 40)) triage.logEvent(id, 'read');
    toast.success(t(ids.length === 1 ? 'alerts.toast.markedRead.one' : 'alerts.toast.markedRead.other', { n: fmtInt(ids.length) }));
  };

  const exportCsv = () => {
    const exportRows = unreadOnly ? openVisible : filtered;
    if (!exportRows.length) { toast.info(t('alerts.toast.nothingToExport')); return; }
    const n = exportAlertsCsv(exportRows, t, tName, triage.metaFor);
    toast.success(t(n === 1 ? 'alerts.toast.exported.one' : 'alerts.toast.exported.other', { n: fmtInt(n) }));
  };

  const doSnooze = (id) => {
    snooze(id);
    triage.logEvent(id, 'snooze');
    toast.info(t('alerts.toast.snoozed'));
  };
  const doUnsnooze = (id) => {
    unsnooze(id);
    triage.logEvent(id, 'unsnooze');
    toast.success(t('alerts.toast.unsnoozed'));
  };
  const doAck = (id) => {
    triage.logEvent(id, 'ack');
    ack.mutate(id);
  };
  const doDismiss = (id) => {
    triage.logEvent(id, 'dismiss');
    setStatus.mutate({ alertId: id, status: 'DISMISSED' });
  };
  const doReopen = (id) => setStatus.mutate({ alertId: id, status: 'OPEN' });
  const copyAlert = async (a) => {
    const ok = await copyText(alertShareText(a, t, tName));
    if (ok) { triage.logEvent(a.alertId, 'copy'); toast.success(t('alerts.toast.copied')); }
    else toast.error(t('alerts.toast.copyFailed'));
  };

  // ── bulk selection ───────────────────────────────────────────────────────
  const selectableIds = useMemo(() => open.map((a) => String(a.alertId)), [open]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const selectAllVisible = () => setSelected(allSelected ? new Set() : new Set(selectableIds));
  const clearSelection = () => setSelected(new Set());
  const selectedAlerts = useMemo(
    () => rows.filter((a) => selected.has(String(a.alertId))),
    [rows, selected],
  );

  const bulkStatus = async (status) => {
    const ids = [...selected];
    if (!ids.length) return;
    for (const id of ids) triage.logEvent(id, status === 'DISMISSED' ? 'dismiss' : 'ack');
    await bulk.run(ids, status);
    clearSelection();
  };
  const bulkSnooze = () => {
    for (const id of selected) { snooze(id); triage.logEvent(id, 'snooze'); }
    toast.info(t('alerts.toast.bulkSnoozed', { n: fmtInt(selected.size) }));
    clearSelection();
  };
  const bulkRead = () => {
    const ids = [...selected];
    markRead(ids);
    for (const id of ids) triage.logEvent(id, 'read');
    toast.success(t('alerts.toast.markedRead.other', { n: fmtInt(ids.length) }));
    clearSelection();
  };

  // ── digest ───────────────────────────────────────────────────────────────
  const digestSource = selectedAlerts.length ? selectedAlerts : open;
  const copyDigest = async (text) => {
    const ok = await copyText(text);
    if (ok) toast.success(t('alerts.toast.digestCopied'));
    else toast.error(t('alerts.toast.copyFailed'));
    return ok;
  };
  const onDigestSent = (list) => {
    for (const a of list) triage.logEvent(a.alertId, 'digest');
  };

  // Alert detail sheet (feed info button, board card tap, or `o` shortcut).
  const detailAlert = useMemo(
    () => rows.find((a) => String(a.alertId) === String(detailId)) || null,
    [rows, detailId],
  );
  const detailQuery = useAlertDetail(detailAlert ? detailAlert.alertId : '');
  const openDetail = (a) => { markRead(a.alertId); triage.logEvent(a.alertId, 'read'); setDetailId(String(a.alertId)); };
  const similarAlerts = useMemo(() => {
    if (!detailAlert) return [];
    return rows
      .filter((s) => String(s.alertId) !== String(detailAlert.alertId)
        && (String(s.districtId) === String(detailAlert.districtId)
          || (detailAlert.crimeHeadId !== undefined && detailAlert.crimeHeadId !== null
            && String(s.crimeHeadId) === String(detailAlert.crimeHeadId))))
      .sort(bySeverity)
      .slice(0, 4);
  }, [rows, detailAlert]);

  // Keyboard shortcuts: j/k move a focus ring through the open feed.
  const focusedAlert = useMemo(
    () => flatOpen.find((a) => String(a.alertId) === String(focusId)) || null,
    [flatOpen, focusId],
  );
  const moveFocus = (dirStep) => {
    const ids = flatOpen.map((a) => String(a.alertId));
    if (!ids.length) return;
    const i = ids.indexOf(String(focusId));
    const next = i === -1
      ? (dirStep > 0 ? ids[0] : ids[ids.length - 1])
      : ids[(i + dirStep + ids.length) % ids.length];
    setFocusId(next);
    cardRefs.current.get(next)?.focus();
  };
  useAlertShortcuts({
    next: () => moveFocus(1),
    prev: () => moveFocus(-1),
    ack: () => { if (focusedAlert) { markRead(focusedAlert.alertId); doAck(focusedAlert.alertId); } },
    read: () => focusedAlert && markRead(focusedAlert.alertId),
    copy: () => focusedAlert && copyAlert(focusedAlert),
    snooze: () => focusedAlert && doSnooze(focusedAlert.alertId),
    dismiss: () => focusedAlert && doDismiss(focusedAlert.alertId),
    select: () => focusedAlert && toggleSelect(focusedAlert.alertId),
    digest: () => setDigestOpen(true),
    export: exportCsv,
    unread: () => setParam('unread', unreadOnly ? '' : '1'),
    view: () => changeView(view === 'board' ? 'feed' : 'board'),
    open: () => focusedAlert && openDetail(focusedAlert),
    sev: setSev,
    search: () => searchRef.current?.focus(),
  });

  const units = lookups.data?.units;
  const ackPendingId = ack.isPending ? ack.variables : null;
  const ackErrorId = ack.isError ? ack.variables : null;
  const statusPendingId = setStatus.isPending ? setStatus.variables?.alertId : null;

  const renderCard = (a, opts = {}) => {
    const id = String(a.alertId);
    const focused = focusId === id;
    const m = triage.metaFor(id);
    return (
      <div
        key={id}
        ref={(el) => { if (el) cardRefs.current.set(id, el); else cardRefs.current.delete(id); }}
        tabIndex={-1}
        onFocus={() => setFocusId(id)}
        className={`rounded-xl outline-none ${focused ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-base' : ''}`}
        style={{ scrollMarginTop: 96, scrollMarginBottom: 24 }}
      >
        <AlertCard
          alert={a}
          stations={stationsForAlert(a, units)}
          acked={!!opts.acked}
          onAck={doAck}
          ackPending={String(ackPendingId) === id || String(statusPendingId) === id}
          ackError={String(ackErrorId) === id}
          unread={!readIds.has(id)}
          onRead={(aid) => markRead(aid)}
          onCopy={copyAlert}
          onSnooze={opts.acked || opts.snoozed ? undefined : doSnooze}
          snoozedUntil={opts.snoozed ? (snoozes[id] || 0) : 0}
          onUnsnooze={doUnsnooze}
          sla={opts.acked || opts.snoozed ? null : slaOf(a)}
          onOpenDetail={openDetail}
          selected={selected.has(id)}
          onSelect={opts.acked ? undefined : toggleSelect}
          hasNote={triage.notedIds.has(id)}
          owner={m.owner}
          onDismiss={opts.acked ? undefined : doDismiss}
        />
      </div>
    );
  };

  const anyExtraFilter = dir || minAbsZ || statusFilter || ageBucket || ownerFilter;
  const emptyTitle = snoozedList.length ? t('alerts.empty.snoozed.title')
    : breachedOnly ? t('alerts.empty.breached.title')
      : ageBucket ? t('alerts.empty.age.title', { bucket: t(`alerts.age.${ageBucket}.label`) })
        : anyExtraFilter ? t('alerts.empty.narrowed.title')
          : unreadOnly ? t('alerts.empty.unread.title')
            : q ? t('alerts.empty.search.title')
              : sev ? t('alerts.empty.sev.title', { sev: t(`alerts.sevLower.${sev}`) })
                : t('alerts.empty.none.title');
  const emptyMessage = snoozedList.length
    ? t('alerts.empty.snoozed.msg')
    : breachedOnly ? t('alerts.empty.breached.msg')
      : ageBucket ? t('alerts.empty.age.msg')
        : anyExtraFilter ? t('alerts.empty.narrowed.msg')
          : unreadOnly ? t('alerts.empty.unread.msg')
            : q ? t('alerts.empty.search.msg', { q })
              : sev ? t('alerts.empty.sev.msg')
                : t('alerts.empty.none.msg');
  const clearExtras = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of ['dir', 'minz', 'status', 'age', 'owner', 'breached']) next.delete(key);
      return next;
    }, { replace: true });
  };
  const emptyAction = breachedOnly
    ? <button type="button" className="btn" onClick={() => setParam('breached', '')}>{t('alerts.empty.showAllOpen')}</button>
    : anyExtraFilter
      ? <button type="button" className="btn" onClick={clearExtras}>{t('alerts.empty.clearNarrowing')}</button>
      : q
        ? <button type="button" className="btn" onClick={() => setParam('q', '')}>{t('alerts.empty.clearSearch')}</button>
        : unreadOnly
          ? <button type="button" className="btn" onClick={() => setParam('unread', '')}>{t('alerts.empty.showAll')}</button>
          : sev
            ? <button type="button" className="btn" onClick={() => setSev('')}>{t('alerts.empty.showAllSev')}</button>
            : null;

  const csvHref = `${API_BASE}/alerts.csv?limit=5000`;

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="page-title">{t('alerts.title')}</h1>
          <p className="page-subtitle">
            {t('alerts.subtitle')}
            {!corpus.isLoading && !corpus.error && (
              <span className="num"> · {t('alerts.count.open', { n: fmtInt(openAll.length) })} · {t('alerts.count.acknowledged', { n: fmtInt(rows.length - openAll.length) })}
                {unreadOpenCount > 0 && <span className="text-primary"> · {t('alerts.count.unread', { n: fmtInt(unreadOpenCount) })}</span>}
                {breachedCount > 0 && <span className="text-signal"> · {t('alerts.count.breached', { n: fmtInt(breachedCount) })}</span>}
              </span>
            )}
          </p>
        </div>
        {openAll.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-signal ml-auto">
            <PulseDot /> {watching ? t('alerts.live.watching') : t('alerts.live.anomalies')}
          </span>
        )}
      </div>

      {!corpus.isLoading && !corpus.error && (
        <CorpusSummary
          summary={corpusSummary.data}
          loaded={allRows.length}
          total={corpus.data?.total || allRows.length}
          capped={!!corpus.data?.capped}
          partial={!!corpus.data?.partial}
          activeSev={sev}
          activeStatus={statusFilter}
          onSev={setSev}
          onStatus={(v) => setParam('status', v)}
        />
      )}

      {!corpus.isLoading && !corpus.error && rows.length > 0 && (
        <OverviewStrip openAlerts={openAll} sev={sev} onSev={setSev} />
      )}

      <FilterBar>
        <div className="flex items-center gap-1" role="group" aria-label={t('alerts.aria.severityFilter')}>
          {SEV_FILTER_KEYS.map((v) => (
            <button
              key={v || 'all'}
              type="button"
              className={`chip !py-0.5 min-h-[44px] sm:min-h-[26px] transition-colors ${sev === v ? '!border-amber/60 !text-amber' : 'hover:border-amber/40'}`}
              aria-pressed={sev === v}
              onClick={() => setSev(v)}
            >
              {t(`alerts.sev.${v || 'all'}`)}
              {v && sevCounts[v] ? <span className="num text-muted"> {sevCounts[v]}</span> : null}
            </button>
          ))}
        </div>
      </FilterBar>

      <SavedViews
        views={views}
        currentSearch={searchParams.toString()}
        onApply={(search) => setSearchParams(new URLSearchParams(search))}
        onSave={(name) => { saveView(name, searchParams.toString()); toast.success(t('alerts.toast.viewSaved', { name })); }}
        onDelete={deleteView}
      />

      {!corpus.isLoading && !corpus.error && (
        <IntelPanel
          alerts={openFiltered}
          firstSeen={firstSeen}
          now={now}
          emerging={emerging}
          minAbsZ={minAbsZ}
          onZ={(v) => setParam('minz', v ? String(v) : '')}
          activeDistrictId={districtId}
          activeSev={sev}
          onCell={(id, key) => { setFilter('districtId', id); setSev(key); }}
          activeBucket={ageBucket}
          onBucket={(v) => setParam('age', v)}
          onEmerging={(r) => setParam('q', r?.subHeadName || '')}
          breachedCount={breachedCount}
        />
      )}

      {!corpus.isLoading && !corpus.error && (
        <DistrictRollup
          openAlerts={openAll}
          activeDistrictId={districtId}
          onPick={(id) => setFilter('districtId', id)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[11rem]">
          <svg
            width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          >
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" />
          </svg>
          <input
            ref={searchRef}
            className="input-dark w-full !pl-8 !py-2.5 sm:!py-1.5 !text-sm"
            value={searchParams.get('q') || ''}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder={t('alerts.search.placeholder')}
            aria-label={t('alerts.search.aria')}
            type="search"
            enterKeyHint="search"
          />
        </div>
        <button
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => setParam('unread', unreadOnly ? '' : '1')}
          className={`chip !py-1 min-h-[44px] sm:min-h-[30px] transition-colors ${unreadOnly ? '!border-primary/60 !text-primary' : 'hover:border-primary/40'}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${unreadOnly ? 'bg-primary' : 'bg-muted/50'}`}
            aria-hidden="true"
          />
          {t('alerts.toggle.unreadOnly')}
          {unreadOpenCount > 0 && <span className="num text-muted"> {fmtInt(unreadOpenCount)}</span>}
        </button>
        <button
          type="button"
          aria-pressed={breachedOnly}
          onClick={() => setParam('breached', breachedOnly ? '' : '1')}
          title={t('alerts.toggle.slaBreachedTip')}
          className={`chip !py-1 min-h-[44px] sm:min-h-[30px] transition-colors ${breachedOnly ? '!border-signal/60 !text-signal' : 'hover:border-signal/40'}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${breachedCount ? 'bg-signal' : 'bg-muted/50'}`}
            aria-hidden="true"
          />
          {t('alerts.toggle.slaBreached')}
          {breachedCount > 0 && <span className="num text-muted"> {fmtInt(breachedCount)}</span>}
        </button>
      </div>

      {/* Corpus-shaped narrowing: direction, deviation floor, assignee. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">{t('alerts.narrow.label')}</span>
        {DIR_MODES.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={dir === d}
            title={t(d === 'up' ? 'alerts.dir.upTip' : 'alerts.dir.downTip')}
            onClick={() => setParam('dir', dir === d ? '' : d)}
            className={`chip !py-1 min-h-[44px] sm:min-h-[28px] transition-colors ${
              dir === d ? (d === 'up' ? '!border-signal/60 !text-signal' : '!border-teal/60 !text-teal') : 'hover:border-primary/40'
            }`}
          >
            {t(d === 'up' ? 'alerts.dir.up' : 'alerts.dir.down')}
          </button>
        ))}
        {minAbsZ > 0 && (
          <button
            type="button"
            onClick={() => setParam('minz', '')}
            className="chip !py-1 min-h-[44px] sm:min-h-[28px] !border-primary/60 !text-primary"
          >
            |z| ≥ {minAbsZ}
            <svg width="10" height="10" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        )}
        {ageBucket && (
          <button
            type="button"
            onClick={() => setParam('age', '')}
            className="chip !py-1 min-h-[44px] sm:min-h-[28px] !border-amber/60 !text-amber"
          >
            {t(`alerts.age.${ageBucket}.label`)}
            <svg width="10" height="10" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        )}
        {(triage.owners.length > 0 || ownerFilter) && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            {t('alerts.narrow.owner')}
            <select
              className="input-dark !py-1.5 pr-7 !text-xs"
              value={ownerFilter}
              onChange={(e) => setParam('owner', e.target.value)}
              aria-label={t('alerts.narrow.ownerAria')}
            >
              <option value="">{t('alerts.narrow.ownerAny')}</option>
              <option value="__none__">{t('alerts.narrow.ownerNone')}</option>
              {triage.owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        )}
        {anyExtraFilter && (
          <button type="button" className={TOOL_BTN} onClick={clearExtras}>
            {t('alerts.narrow.clear')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden sm:flex items-center gap-2">
          <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={changeView} ariaLabel={t('alerts.aria.viewMode')} />
          {view === 'feed' && (
            <>
              <span className="text-xs text-muted">{t('alerts.group.label')}</span>
              <SegmentedControl options={GROUP_OPTIONS} value={group} onChange={changeGroup} ariaLabel={t('alerts.aria.groupBy')} />
            </>
          )}
          <span className="text-xs text-muted">{t('alerts.sort.label')}</span>
          <SegmentedControl options={SORT_OPTIONS} value={sort} onChange={changeSort} ariaLabel={t('alerts.aria.sortBy')} />
        </div>
        <button
          type="button"
          className={`${TOOL_BTN} sm:hidden`}
          onClick={() => setOptionsOpen(true)}
          aria-haspopup="dialog"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
            <path d="M4 7h10m4 0h2M4 12h2m4 0h10M4 17h10m4 0h2" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="17" r="2" />
          </svg>
          {t('alerts.tool.options')}
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip label={t('alerts.tool.digestTip')}>
            <button type="button" className={TOOL_BTN} onClick={() => setDigestOpen(true)} aria-label={t('alerts.tool.digestAria')}>
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
              </svg>
              <span className="hidden md:inline">{t('alerts.tool.digest')}</span>
            </button>
          </Tooltip>
          <Tooltip label={t('alerts.tool.markAllReadTip')}>
            <button
              type="button"
              className={TOOL_BTN}
              disabled={totalUnread === 0}
              onClick={markAllRead}
              aria-label={t('alerts.tool.markAllReadAria')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="m2 13 4 4L14 9" /><path d="m10 13 4 4 8-10" /></svg>
              <span className="hidden md:inline">{t('alerts.tool.markAllRead')}</span>
              {totalUnread > 0 && <span className="num">{fmtInt(totalUnread)}</span>}
            </button>
          </Tooltip>
          <ToggleChip
            on={notify.sound}
            onClick={toggleSound}
            label={t('alerts.tool.sound')}
            tip={notify.sound ? t('alerts.tool.soundOnTip') : t('alerts.tool.soundOffTip')}
            className="hidden sm:inline-flex"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
              <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
              {notify.sound
                ? <path d="M15 9.5a4 4 0 0 1 0 5m2.6-7.6a7.5 7.5 0 0 1 0 10.2" />
                : <path d="m15.5 9.5 5 5m0-5-5 5" />}
            </svg>
          </ToggleChip>
          {desktopSupported() && (
            <ToggleChip
              on={notify.desktop}
              onClick={toggleDesktop}
              label={t('alerts.tool.desktop')}
              tip={notify.desktop ? t('alerts.tool.desktopOnTip') : t('alerts.tool.desktopOffTip')}
              className="hidden sm:inline-flex"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
                <path d="M10.3 19a2 2 0 0 0 3.4 0" />
              </svg>
            </ToggleChip>
          )}
          <Tooltip label={t('alerts.tool.testTip')} className="hidden sm:inline-flex">
            <button type="button" className={TOOL_BTN} onClick={testNotification} aria-label={t('alerts.tool.testAria')}>
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
                <path d="M10.3 19a2 2 0 0 0 3.4 0" /><path d="m20 3 1.5 1.5M4 3 2.5 4.5" />
              </svg>
              <span className="hidden md:inline">{t('alerts.tool.test')}</span>
            </button>
          </Tooltip>
          <Tooltip label={t('alerts.tool.csvTip')}>
            <button type="button" className={TOOL_BTN} onClick={exportCsv} aria-label={t('alerts.tool.csvAria')}>
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5" /><path d="M4 19h16" /></svg>
              <span className="hidden md:inline">{t('alerts.tool.csv')}</span>
            </button>
          </Tooltip>
          <Tooltip label={t('alerts.tool.serverCsvTip')}>
            <a href={csvHref} className={TOOL_BTN} download aria-label={t('alerts.tool.serverCsvAria')}>
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /><path d="M12 3v11m0 0 4-4m-4 4-4-4" />
              </svg>
              <span className="hidden md:inline">{t('alerts.tool.serverCsv')}</span>
            </a>
          </Tooltip>
        </div>
      </div>

      {!corpus.isLoading && !corpus.error && (
        <TriageProgress rows={filtered} readIds={readIds} snoozes={snoozes} isAcked={isAcked} />
      )}

      <p className="hidden md:block text-[11px] text-muted">
        {t('alerts.shortcut.label')} <span className="num">j/k</span> {t('alerts.shortcut.navigate')} · <span className="num">a</span> {t('alerts.shortcut.acknowledge')} ·{' '}
        <span className="num">d</span> {t('alerts.shortcut.dismiss')} · <span className="num">x</span> {t('alerts.shortcut.select')} ·{' '}
        <span className="num">g</span> {t('alerts.shortcut.digest')} · <span className="num">m</span> {t('alerts.shortcut.read')} · <span className="num">s</span> {t('alerts.shortcut.snooze')} ·{' '}
        <span className="num">c</span> {t('alerts.shortcut.copy')} · <span className="num">o</span> {t('alerts.shortcut.details')} · <span className="num">v</span> {t('alerts.shortcut.board')} ·{' '}
        <span className="num">u</span> {t('alerts.shortcut.unread')} · <span className="num">e</span> {t('alerts.shortcut.csv')} · <span className="num">/</span> {t('alerts.shortcut.search')} ·{' '}
        <span className="num">1–4</span> {t('alerts.shortcut.severity')} · <span className="num">0</span> {t('alerts.shortcut.all')}
      </p>

      {corpus.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}><LoadingSkeleton lines={4} /></Card>
          ))}
        </div>
      ) : corpus.error ? (
        <Card>
          <EmptyState
            title={t('alerts.error.title')}
            message={corpus.error.message}
            action={<button type="button" className="btn" onClick={() => corpus.refetch()}>{t('common.action.retry')}</button>}
          />
        </Card>
      ) : view === 'board' ? (
        (open.length === 0 && snoozedList.length === 0 && acked.length === 0) ? (
          <Card>
            <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
          </Card>
        ) : (
          <TriageBoard
            open={open}
            snoozed={snoozedList}
            acked={acked}
            readIds={readIds}
            slaOf={slaOf}
            onOpen={openDetail}
            onRead={markRead}
            onAck={doAck}
            ackPendingId={ackPendingId}
            onSnooze={doSnooze}
            onUnsnooze={doUnsnooze}
          />
        )
      ) : (
        <>
          {open.length === 0 ? (
            <Card>
              <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
            </Card>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <section key={g.key} aria-label={t('alerts.aria.groupSection', { label: g.label })} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</h2>
                    <Badge tone="slate" className="num">{fmtInt(g.items.length)}</Badge>
                    <div className="flex-1 border-t border-grid/60" aria-hidden="true" />
                  </div>
                  {g.items.map((a) => renderCard(a))}
                </section>
              ))}
            </div>
          )}

          {snoozedList.length > 0 && (
            <div className="space-y-3 pt-2">
              <button
                type="button"
                aria-expanded={showSnoozed}
                onClick={() => setShowSnoozed((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-ink min-h-[44px] sm:min-h-0 hover:text-primary transition-colors"
              >
                <svg
                  width="12" height="12" viewBox="0 0 24 24" {...ICON} aria-hidden="true"
                  className={`transition-transform ${showSnoozed ? 'rotate-90' : ''}`}
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
                {t('alerts.feed.snoozed')}
                <Badge tone="slate" className="num">{fmtInt(snoozedList.length)}</Badge>
              </button>
              {showSnoozed && snoozedList.map((a) => renderCard(a, { snoozed: true }))}
            </div>
          )}

          {acked.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">{t('alerts.feed.handled')}</h2>
                <Badge tone="slate" className="num">{fmtInt(acked.length)}</Badge>
              </div>
              {acked.slice(0, 40).map((a) => renderCard(a, { acked: true }))}
              {acked.length > 40 && (
                <p className="text-[11px] text-muted">{t('alerts.feed.handledMore', { n: fmtInt(acked.length - 40) })}</p>
              )}
            </div>
          )}
        </>
      )}

      <BulkBar
        count={selected.size}
        visibleCount={selectableIds.length}
        allSelected={allSelected}
        progress={bulk.progress}
        onSelectAll={selectAllVisible}
        onClear={clearSelection}
        onAck={() => bulkStatus('ACK')}
        onDismiss={() => bulkStatus('DISMISSED')}
        onSnooze={bulkSnooze}
        onRead={bulkRead}
        onDigest={() => setDigestOpen(true)}
      />

      <OptionsSheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        groupOptions={GROUP_OPTIONS}
        group={group}
        onGroup={changeGroup}
        sortOptions={SORT_OPTIONS}
        sort={sort}
        onSort={changeSort}
        notify={notify}
        onToggleSound={toggleSound}
        onToggleDesktop={toggleDesktop}
        desktopAvailable={desktopSupported()}
        onTestNotification={testNotification}
        viewOptions={VIEW_OPTIONS}
        view={view}
        onView={changeView}
      />

      <DigestComposer
        open={digestOpen}
        onClose={() => setDigestOpen(false)}
        alerts={digestSource}
        metaFor={triage.metaFor}
        onCopy={copyDigest}
        onSent={onDigestSent}
      />

      <AlertDetailSheet
        alert={detailAlert}
        onClose={() => setDetailId(null)}
        sla={detailAlert && isOpenAlert(detailAlert) ? slaOf(detailAlert) : null}
        stations={detailAlert ? stationsForAlert(detailAlert, units) : null}
        acked={detailAlert ? isAcked(detailAlert) : false}
        snoozedUntil={detailAlert ? (snoozes[String(detailAlert.alertId)] || 0) : 0}
        onAck={(aid) => { markRead(aid); doAck(aid); }}
        ackPending={detailAlert ? String(ackPendingId) === String(detailAlert.alertId) : false}
        onSnooze={doSnooze}
        onUnsnooze={doUnsnooze}
        onCopy={copyAlert}
        similar={similarAlerts}
        onJump={openDetail}
        detail={detailQuery}
        socio={socio}
        meta={detailAlert ? triage.metaFor(detailAlert.alertId) : null}
        owners={triage.owners}
        onNote={triage.setNote}
        onOwner={triage.setOwner}
        onDismiss={doDismiss}
        onReopen={doReopen}
      />
    </div>
  );
}
