// /alerts — anomaly triage. Feed AND kanban board views (?view=board), severity
// chips (URL-synced ?sev=) + district/type/period filters, district roll-up
// chips, text search (?q=), unread-only (?unread=1) and SLA-breached
// (?breached=1) toggles, group-by and sort (?group= / ?sort=, defaulting from
// localStorage), saved views, triage-progress meter, escalation SLA countdowns
// (first-seen persisted), red-pulse cards with observed-vs-expected sparklines
// and mini bars, per-alert detail sheet (z gauge, similar alerts, case drill),
// optimistic acknowledge with demo-mode handling, snooze-24h, per-card copy,
// local mark-all-read, opt-in sound/desktop notifications (60s poll while
// enabled, with a test button), keyboard shortcuts (j/k/a/m/s/c/e/u/v/o//,
// 0–4), and CSV export.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAlerts, useLookups } from '../lib/api.js';
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
import useAckAlertOptimistic from './alerts/useAckAlertOptimistic.js';
import useAlertShortcuts from './alerts/useAlertShortcuts.js';
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

const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const sevRank = (s) => SEV_RANK[String(s || '').toLowerCase()] || 0;
const isAcked = (a) => /ack/i.test(String(a?.status || ''));
const bySeverity = (a, b) =>
  sevRank(b.severity) - sevRank(a.severity)
  || Math.abs(Number(b.zScore) || 0) - Math.abs(Number(a.zScore) || 0);

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
      const sev = String(a.severity || '').toLowerCase() || 'unrated';
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
  const { apiParams, districtId, setFilter } = useUrlFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const alerts = useAlerts(apiParams);
  const lookups = useLookups();
  const ack = useAckAlertOptimistic();
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

  const rows = alerts.data || [];
  const searched = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((a) =>
      [a.narrative, a.districtName, a.districtId, a.headName, a.severity]
        .filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [rows, q]);
  const filtered = useMemo(
    () => (sev ? searched.filter((a) => String(a.severity || '').toLowerCase() === sev) : searched),
    [searched, sev],
  );
  const openAll = useMemo(() => rows.filter((a) => !isAcked(a)), [rows]);
  const openFiltered = useMemo(() => filtered.filter((a) => !isAcked(a)), [filtered]);
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
  const slaOf = (a) => slaFor(a, firstSeen[String(a.alertId)], now);
  const breachedCount = useMemo(
    () => openActive.filter((a) => slaFor(a, firstSeen[String(a.alertId)], now).breached).length,
    [openActive, firstSeen, now],
  );
  const open = useMemo(
    () => (breachedOnly
      ? openActive.filter((a) => slaFor(a, firstSeen[String(a.alertId)], now).breached)
      : openActive),
    [openActive, breachedOnly, firstSeen, now],
  );
  const acked = useMemo(() => [...filtered.filter(isAcked)].sort(cmp), [filtered, cmp]);
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
      const k = String(a.severity || '').toLowerCase();
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [openAll]);

  // Record when this console first listed each alert — the SLA anchor.
  useEffect(() => {
    if (alerts.data?.length) markSeen(alerts.data.map((a) => String(a.alertId)));
  }, [alerts.data, markSeen]);

  // New-anomaly detection: absorb the first load (and any filter change)
  // silently, then chime / desktop-notify on IDs never seen this session.
  const filterSig = JSON.stringify(apiParams);
  const seenRef = useRef({ sig: null, ids: new Set() });
  useEffect(() => {
    if (!alerts.data) return;
    const s = seenRef.current;
    const fresh = alerts.data.filter((a) => !s.ids.has(String(a.alertId)) && !isAcked(a));
    for (const a of alerts.data) s.ids.add(String(a.alertId));
    if (s.sig !== filterSig) { s.sig = filterSig; return; }
    if (!fresh.length) return;
    if (notify.sound) playChime();
    if (notify.desktop) {
      const top = fresh.sort(bySeverity)[0];
      const sevKey = String(top.severity || '').toLowerCase() || 'unrated';
      showDesktopNotification(
        t(fresh.length === 1 ? 'alerts.notify.title.one' : 'alerts.notify.title.other', { n: fresh.length }),
        t('alerts.notify.body', {
          sev: t(`alerts.sev.${sevKey}`),
          head: tName('crimeHeads', top.crimeHeadId, top.headName) || t('alerts.anomaly'),
          district: tName('districts', top.districtId, top.districtName || top.districtId) || '',
        }),
      );
    }
  }, [alerts.data, filterSig, notify.sound, notify.desktop, t, tName]);

  // Poll for fresh anomalies while either notification channel is on.
  const watching = notify.sound || notify.desktop;
  useEffect(() => {
    if (!watching) return undefined;
    const t = setInterval(() => qc.invalidateQueries({ queryKey: ['alerts'] }), 60000);
    return () => clearInterval(t);
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
    toast.success(t(ids.length === 1 ? 'alerts.toast.markedRead.one' : 'alerts.toast.markedRead.other', { n: fmtInt(ids.length) }));
  };

  const exportCsv = () => {
    const exportRows = unreadOnly ? openVisible : filtered;
    if (!exportRows.length) { toast.info(t('alerts.toast.nothingToExport')); return; }
    const n = exportAlertsCsv(exportRows, t, tName);
    toast.success(t(n === 1 ? 'alerts.toast.exported.one' : 'alerts.toast.exported.other', { n: fmtInt(n) }));
  };

  const doSnooze = (id) => {
    snooze(id);
    toast.info(t('alerts.toast.snoozed'));
  };
  const doUnsnooze = (id) => {
    unsnooze(id);
    toast.success(t('alerts.toast.unsnoozed'));
  };
  const copyAlert = async (a) => {
    const ok = await copyText(alertShareText(a, t, tName));
    if (ok) toast.success(t('alerts.toast.copied'));
    else toast.error(t('alerts.toast.copyFailed'));
  };

  // Alert detail sheet (feed info button, board card tap, or `o` shortcut).
  const detailAlert = useMemo(
    () => rows.find((a) => String(a.alertId) === String(detailId)) || null,
    [rows, detailId],
  );
  const openDetail = (a) => { markRead(a.alertId); setDetailId(String(a.alertId)); };
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
  const moveFocus = (dir) => {
    const ids = flatOpen.map((a) => String(a.alertId));
    if (!ids.length) return;
    const i = ids.indexOf(String(focusId));
    const next = i === -1
      ? (dir > 0 ? ids[0] : ids[ids.length - 1])
      : ids[(i + dir + ids.length) % ids.length];
    setFocusId(next);
    cardRefs.current.get(next)?.focus();
  };
  useAlertShortcuts({
    next: () => moveFocus(1),
    prev: () => moveFocus(-1),
    ack: () => { if (focusedAlert) { markRead(focusedAlert.alertId); ack.mutate(focusedAlert.alertId); } },
    read: () => focusedAlert && markRead(focusedAlert.alertId),
    copy: () => focusedAlert && copyAlert(focusedAlert),
    snooze: () => focusedAlert && doSnooze(focusedAlert.alertId),
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

  const renderCard = (a, opts = {}) => {
    const id = String(a.alertId);
    const focused = focusId === id;
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
          onAck={(aid) => ack.mutate(aid)}
          ackPending={String(ackPendingId) === id}
          ackError={String(ackErrorId) === id}
          unread={!readIds.has(id)}
          onRead={(aid) => markRead(aid)}
          onCopy={copyAlert}
          onSnooze={opts.acked || opts.snoozed ? undefined : doSnooze}
          snoozedUntil={opts.snoozed ? (snoozes[id] || 0) : 0}
          onUnsnooze={doUnsnooze}
          sla={opts.acked || opts.snoozed ? null : slaOf(a)}
          onOpenDetail={openDetail}
        />
      </div>
    );
  };

  const emptyTitle = snoozedList.length ? t('alerts.empty.snoozed.title')
    : breachedOnly ? t('alerts.empty.breached.title')
      : unreadOnly ? t('alerts.empty.unread.title')
        : q ? t('alerts.empty.search.title')
          : sev ? t('alerts.empty.sev.title', { sev: t(`alerts.sevLower.${sev}`) })
            : t('alerts.empty.none.title');
  const emptyMessage = snoozedList.length
    ? t('alerts.empty.snoozed.msg')
    : breachedOnly ? t('alerts.empty.breached.msg')
      : unreadOnly ? t('alerts.empty.unread.msg')
        : q ? t('alerts.empty.search.msg', { q })
          : sev ? t('alerts.empty.sev.msg')
            : t('alerts.empty.none.msg');
  const emptyAction = breachedOnly
    ? <button type="button" className="btn" onClick={() => setParam('breached', '')}>{t('alerts.empty.showAllOpen')}</button>
    : q
      ? <button type="button" className="btn" onClick={() => setParam('q', '')}>{t('alerts.empty.clearSearch')}</button>
      : unreadOnly
        ? <button type="button" className="btn" onClick={() => setParam('unread', '')}>{t('alerts.empty.showAll')}</button>
        : sev
          ? <button type="button" className="btn" onClick={() => setSev('')}>{t('alerts.empty.showAllSev')}</button>
          : null;

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="page-title">{t('alerts.title')}</h1>
          <p className="page-subtitle">
            {t('alerts.subtitle')}
            {!alerts.isLoading && !alerts.error && (
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

      {!alerts.isLoading && !alerts.error && rows.length > 0 && (
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

      {!alerts.isLoading && !alerts.error && (
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
        </div>
      </div>

      {!alerts.isLoading && !alerts.error && (
        <TriageProgress rows={filtered} readIds={readIds} snoozes={snoozes} isAcked={isAcked} />
      )}

      <p className="hidden md:block text-[11px] text-muted">
        {t('alerts.shortcut.label')} <span className="num">j/k</span> {t('alerts.shortcut.navigate')} · <span className="num">a</span> {t('alerts.shortcut.acknowledge')} ·{' '}
        <span className="num">m</span> {t('alerts.shortcut.read')} · <span className="num">s</span> {t('alerts.shortcut.snooze')} · <span className="num">c</span> {t('alerts.shortcut.copy')} ·{' '}
        <span className="num">o</span> {t('alerts.shortcut.details')} · <span className="num">v</span> {t('alerts.shortcut.board')} ·{' '}
        <span className="num">u</span> {t('alerts.shortcut.unread')} · <span className="num">e</span> {t('alerts.shortcut.csv')} · <span className="num">/</span> {t('alerts.shortcut.search')} ·{' '}
        <span className="num">1–4</span> {t('alerts.shortcut.severity')} · <span className="num">0</span> {t('alerts.shortcut.all')}
      </p>

      {alerts.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}><LoadingSkeleton lines={4} /></Card>
          ))}
        </div>
      ) : alerts.error ? (
        <Card>
          <EmptyState
            title={t('alerts.error.title')}
            message={alerts.error.message}
            action={<button type="button" className="btn" onClick={() => alerts.refetch()}>{t('common.action.retry')}</button>}
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
            onAck={(aid) => ack.mutate(aid)}
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
                <h2 className="text-sm font-semibold text-ink">{t('alerts.feed.acknowledged')}</h2>
                <Badge tone="slate" className="num">{fmtInt(acked.length)}</Badge>
              </div>
              {acked.map((a) => renderCard(a, { acked: true }))}
            </div>
          )}
        </>
      )}

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

      <AlertDetailSheet
        alert={detailAlert}
        onClose={() => setDetailId(null)}
        sla={detailAlert && !isAcked(detailAlert) ? slaOf(detailAlert) : null}
        stations={detailAlert ? stationsForAlert(detailAlert, units) : null}
        acked={detailAlert ? isAcked(detailAlert) : false}
        snoozedUntil={detailAlert ? (snoozes[String(detailAlert.alertId)] || 0) : 0}
        onAck={(aid) => { markRead(aid); ack.mutate(aid); }}
        ackPending={detailAlert ? String(ackPendingId) === String(detailAlert.alertId) : false}
        onSnooze={doSnooze}
        onUnsnooze={doUnsnooze}
        onCopy={copyAlert}
        similar={similarAlerts}
        onJump={openDetail}
      />
    </div>
  );
}
