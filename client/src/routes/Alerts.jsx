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

const SEV_FILTERS = [
  ['', 'All'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low'],
];

const GROUP_OPTIONS = [
  { value: 'severity', label: 'Severity' },
  { value: 'district', label: 'District' },
  { value: 'date', label: 'Date' },
];

const SORT_OPTIONS = [
  { value: 'severity', label: 'Severity' },
  { value: 'z', label: 'z-score' },
  { value: 'recent', label: 'Recent' },
];

const VIEW_OPTIONS = [
  { value: 'feed', label: 'Feed' },
  { value: 'board', label: 'Board' },
];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

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
function groupAlerts(open, groupBy) {
  const groups = new Map();
  const push = (key, label, a) => {
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(a);
  };
  for (const a of open) {
    if (groupBy === 'district') {
      const label = a.districtName || a.districtId || 'Unknown district';
      push(label, label, a);
    } else if (groupBy === 'date') {
      const key = String(a.periodEnd || a.periodStart || '').slice(0, 10) || 'undated';
      push(key, key === 'undated' ? 'Undated' : dateLabel(key), a);
    } else {
      const sev = String(a.severity || '').toLowerCase() || 'unrated';
      push(sev, cap(sev), a);
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
  const groups = useMemo(() => groupAlerts(open, group), [open, group]);
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
      showDesktopNotification(
        `DAPPA — ${fresh.length} new anomaly alert${fresh.length > 1 ? 's' : ''}`,
        `${cap(String(top.severity || ''))} · ${top.headName || 'Anomaly'} — ${top.districtName || top.districtId || ''}`,
      );
    }
  }, [alerts.data, filterSig, notify.sound, notify.desktop]);

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
      toast.info('Sound on — you’ll hear a chime when new anomalies arrive (checked every 60s).');
    }
  };

  const toggleDesktop = async () => {
    if (notify.desktop) { setNotify({ desktop: false }); return; }
    const granted = await ensureDesktopPermission();
    if (granted) {
      setNotify({ desktop: true });
      toast.success('Desktop notifications on — new anomalies will pop up even in another tab.');
    } else {
      toast.error('Notifications are blocked for this site — allow them in the browser to enable desktop alerts.');
    }
  };

  const testNotification = () => {
    playChime();
    if (notify.desktop) {
      showDesktopNotification(
        'DAPPA — test alert',
        'Critical · Vehicle Theft — sample anomaly. Your desktop alerts are working.',
      );
      toast.info('Test chime played and a sample desktop notification was sent.');
    } else {
      toast.info('Test chime played — enable Desktop to also get pop-up notifications.');
    }
  };

  const markAllRead = () => {
    const ids = rows.map((a) => String(a.alertId)).filter((id) => !readIds.has(id));
    if (!ids.length) return;
    markRead(ids);
    toast.success(`Marked ${fmtInt(ids.length)} alert${ids.length === 1 ? '' : 's'} as read`);
  };

  const exportCsv = () => {
    const exportRows = unreadOnly ? openVisible : filtered;
    if (!exportRows.length) { toast.info('Nothing to export for the current filters.'); return; }
    const n = exportAlertsCsv(exportRows);
    toast.success(`Exported ${fmtInt(n)} alert${n === 1 ? '' : 's'} to CSV`);
  };

  const doSnooze = (id) => {
    snooze(id);
    toast.info('Snoozed for 24 h — it moves to the Snoozed section below (unsnooze anytime).');
  };
  const doUnsnooze = (id) => {
    unsnooze(id);
    toast.success('Alert restored to the open feed.');
  };
  const copyAlert = async (a) => {
    const ok = await copyText(alertShareText(a));
    if (ok) toast.success('Alert copied as text — paste into WhatsApp or e-mail.');
    else toast.error('Copy failed in this browser.');
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

  const emptyTitle = snoozedList.length ? 'All matching alerts are snoozed'
    : breachedOnly ? 'No SLA-breached alerts'
      : unreadOnly ? 'No unread alerts'
        : q ? 'No alerts match your search'
          : sev ? `No open ${sev} alerts`
            : 'No active alerts';
  const emptyMessage = snoozedList.length
    ? 'Every open alert matching these filters is snoozed — expand the Snoozed section below or unsnooze them.'
    : breachedOnly ? 'Nothing has overrun its triage SLA — clear the breached filter to see the rest of the feed.'
      : unreadOnly ? 'Everything matching the current filters has been read.'
        : q ? `Nothing matches “${q}” — try a district, crime head or narrative keyword.`
          : sev ? 'Nothing at this severity in the current window — clear the severity filter to see the rest.'
            : 'No anomalies flagged for the current filters. All clear.';
  const emptyAction = breachedOnly
    ? <button type="button" className="btn" onClick={() => setParam('breached', '')}>Show all open alerts</button>
    : q
      ? <button type="button" className="btn" onClick={() => setParam('q', '')}>Clear search</button>
      : unreadOnly
        ? <button type="button" className="btn" onClick={() => setParam('unread', '')}>Show all alerts</button>
        : sev
          ? <button type="button" className="btn" onClick={() => setSev('')}>Show all severities</button>
          : null;

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="page-title">Alerts</h1>
          <p className="page-subtitle">
            Anomaly feed — observed vs expected
            {!alerts.isLoading && !alerts.error && (
              <span className="num"> · {fmtInt(openAll.length)} open · {fmtInt(rows.length - openAll.length)} acknowledged
                {unreadOpenCount > 0 && <span className="text-primary"> · {fmtInt(unreadOpenCount)} unread</span>}
                {breachedCount > 0 && <span className="text-signal"> · {fmtInt(breachedCount)} SLA-breached</span>}
              </span>
            )}
          </p>
        </div>
        {openAll.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-signal ml-auto">
            <PulseDot /> {watching ? 'watching for anomalies' : 'live anomalies'}
          </span>
        )}
      </div>

      {!alerts.isLoading && !alerts.error && rows.length > 0 && (
        <OverviewStrip openAlerts={openAll} sev={sev} onSev={setSev} />
      )}

      <FilterBar>
        <div className="flex items-center gap-1" role="group" aria-label="Severity filter">
          {SEV_FILTERS.map(([v, label]) => (
            <button
              key={v || 'all'}
              type="button"
              className={`chip !py-0.5 min-h-[44px] sm:min-h-[26px] transition-colors ${sev === v ? '!border-amber/60 !text-amber' : 'hover:border-amber/40'}`}
              aria-pressed={sev === v}
              onClick={() => setSev(v)}
            >
              {label}
              {v && sevCounts[v] ? <span className="num text-muted"> {sevCounts[v]}</span> : null}
            </button>
          ))}
        </div>
      </FilterBar>

      <SavedViews
        views={views}
        currentSearch={searchParams.toString()}
        onApply={(search) => setSearchParams(new URLSearchParams(search))}
        onSave={(name) => { saveView(name, searchParams.toString()); toast.success(`View “${name}” saved`); }}
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
            placeholder="Search district, crime head, narrative…  ( / )"
            aria-label="Search alerts"
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
          Unread only
          {unreadOpenCount > 0 && <span className="num text-muted"> {fmtInt(unreadOpenCount)}</span>}
        </button>
        <button
          type="button"
          aria-pressed={breachedOnly}
          onClick={() => setParam('breached', breachedOnly ? '' : '1')}
          title="Only open alerts that have overrun their triage SLA"
          className={`chip !py-1 min-h-[44px] sm:min-h-[30px] transition-colors ${breachedOnly ? '!border-signal/60 !text-signal' : 'hover:border-signal/40'}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${breachedCount ? 'bg-signal' : 'bg-muted/50'}`}
            aria-hidden="true"
          />
          SLA breached
          {breachedCount > 0 && <span className="num text-muted"> {fmtInt(breachedCount)}</span>}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden sm:flex items-center gap-2">
          <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={changeView} ariaLabel="Alerts view mode" />
          {view === 'feed' && (
            <>
              <span className="text-xs text-muted">Group</span>
              <SegmentedControl options={GROUP_OPTIONS} value={group} onChange={changeGroup} ariaLabel="Group alerts by" />
            </>
          )}
          <span className="text-xs text-muted">Sort</span>
          <SegmentedControl options={SORT_OPTIONS} value={sort} onChange={changeSort} ariaLabel="Sort alerts by" />
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
          Options
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip label="Locally mark every listed alert as read">
            <button
              type="button"
              className={TOOL_BTN}
              disabled={totalUnread === 0}
              onClick={markAllRead}
              aria-label="Mark all alerts read"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="m2 13 4 4L14 9" /><path d="m10 13 4 4 8-10" /></svg>
              <span className="hidden md:inline">Mark all read</span>
              {totalUnread > 0 && <span className="num">{fmtInt(totalUnread)}</span>}
            </button>
          </Tooltip>
          <ToggleChip
            on={notify.sound}
            onClick={toggleSound}
            label="Sound"
            tip={notify.sound ? 'Chime on new anomalies — click to turn off' : 'Play a chime when new anomalies arrive'}
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
              label="Desktop"
              tip={notify.desktop ? 'Desktop notifications on — click to turn off' : 'Pop a desktop notification for new anomalies'}
              className="hidden sm:inline-flex"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
                <path d="M10.3 19a2 2 0 0 0 3.4 0" />
              </svg>
            </ToggleChip>
          )}
          <Tooltip label="Play the chime (and a sample desktop pop-up if enabled) to verify your opt-ins" className="hidden sm:inline-flex">
            <button type="button" className={TOOL_BTN} onClick={testNotification} aria-label="Send a test notification">
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
                <path d="M10.3 19a2 2 0 0 0 3.4 0" /><path d="m20 3 1.5 1.5M4 3 2.5 4.5" />
              </svg>
              <span className="hidden md:inline">Test</span>
            </button>
          </Tooltip>
          <Tooltip label="Download the filtered alerts as CSV">
            <button type="button" className={TOOL_BTN} onClick={exportCsv} aria-label="Export filtered alerts as CSV">
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5" /><path d="M4 19h16" /></svg>
              <span className="hidden md:inline">CSV</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {!alerts.isLoading && !alerts.error && (
        <TriageProgress rows={filtered} readIds={readIds} snoozes={snoozes} isAcked={isAcked} />
      )}

      <p className="hidden md:block text-[11px] text-muted">
        Shortcuts: <span className="num">j/k</span> navigate · <span className="num">a</span> acknowledge ·{' '}
        <span className="num">m</span> read · <span className="num">s</span> snooze · <span className="num">c</span> copy ·{' '}
        <span className="num">o</span> details · <span className="num">v</span> board ·{' '}
        <span className="num">u</span> unread · <span className="num">e</span> CSV · <span className="num">/</span> search ·{' '}
        <span className="num">1–4</span> severity · <span className="num">0</span> all
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
            title="Couldn't load alerts"
            message={alerts.error.message}
            action={<button type="button" className="btn" onClick={() => alerts.refetch()}>Retry</button>}
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
                <section key={g.key} aria-label={`${g.label} alerts`} className="space-y-3">
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
                Snoozed
                <Badge tone="slate" className="num">{fmtInt(snoozedList.length)}</Badge>
              </button>
              {showSnoozed && snoozedList.map((a) => renderCard(a, { snoozed: true }))}
            </div>
          )}

          {acked.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">Acknowledged</h2>
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
