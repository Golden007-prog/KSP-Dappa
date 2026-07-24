// /alerts — anomaly feed. Severity chips (URL-synced ?sev=) + district/type/
// period filters, group-by toggle (severity/district/date, persisted), red-pulse
// cards with observed-vs-expected sparklines, optimistic acknowledge with
// demo-mode 403 toast, local mark-all-read, opt-in sound/desktop notifications
// for newly arriving anomalies (60s poll while enabled), and CSV export.
import { useEffect, useMemo, useRef } from 'react';
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
import useAckAlertOptimistic from './alerts/useAckAlertOptimistic.js';
import { useAlertPrefs } from './alerts/useAlertPrefs.js';
import { exportAlertsCsv } from './alerts/csv.js';
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

const SEV_FILTERS = [
  ['', 'All'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low'],
];

const GROUP_OPTIONS = [
  { value: 'severity', label: 'Severity' },
  { value: 'district', label: 'District' },
  { value: 'date', label: 'Date' },
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

/** Partition the (already severity-sorted) open alerts into labelled groups. */
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

function ToggleChip({ on, onClick, label, tip, children }) {
  return (
    <Tooltip label={tip}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={label}
        onClick={onClick}
        className={`btn !px-2.5 !text-xs ${on ? '!border-primary/60 !text-primary' : ''}`}
      >
        {children}
        <span className="hidden sm:inline">{label}</span>
      </button>
    </Tooltip>
  );
}

export default function Alerts() {
  const { apiParams } = useUrlFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const alerts = useAlerts(apiParams);
  const lookups = useLookups();
  const ack = useAckAlertOptimistic();
  const toast = useToast();
  const qc = useQueryClient();
  const { groupBy, setGroupBy, notify, setNotify, readIds, markRead } = useAlertPrefs();

  // Severity filter lives in the URL (?sev=) so alert views are shareable.
  const sev = (searchParams.get('sev') || '').toLowerCase();
  const setSev = (v) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set('sev', v); else next.delete('sev');
      return next;
    }, { replace: true });
  };

  const rows = alerts.data || [];
  const filtered = useMemo(
    () => (sev ? rows.filter((a) => String(a.severity || '').toLowerCase() === sev) : rows),
    [rows, sev],
  );
  const open = useMemo(() => filtered.filter((a) => !isAcked(a)).sort(bySeverity), [filtered]);
  const acked = useMemo(() => filtered.filter(isAcked).sort(bySeverity), [filtered]);
  const openAll = rows.filter((a) => !isAcked(a));
  const groups = useMemo(() => groupAlerts(open, groupBy), [open, groupBy]);
  const unreadCount = useMemo(
    () => openAll.filter((a) => !readIds.has(String(a.alertId))).length,
    [openAll, readIds],
  );

  const sevCounts = useMemo(() => {
    const m = {};
    for (const a of openAll) {
      const k = String(a.severity || '').toLowerCase();
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [openAll]);

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

  const markAllRead = () => {
    markRead(rows.map((a) => a.alertId));
    toast.success(`Marked ${fmtInt(unreadCount)} alert${unreadCount === 1 ? '' : 's'} as read`);
  };

  const exportCsv = () => {
    if (!filtered.length) { toast.info('Nothing to export for the current filters.'); return; }
    const n = exportAlertsCsv(filtered);
    toast.success(`Exported ${fmtInt(n)} alert${n === 1 ? '' : 's'} to CSV`);
  };

  const units = lookups.data?.units;
  const ackPendingId = ack.isPending ? ack.variables : null;

  const renderCard = (a, isAckedCard) => (
    <AlertCard
      key={a.alertId}
      alert={a}
      stations={stationsForAlert(a, units)}
      acked={isAckedCard}
      onAck={(id) => ack.mutate(id)}
      ackPending={String(ackPendingId) === String(a.alertId)}
      unread={!readIds.has(String(a.alertId))}
      onRead={(id) => markRead(id)}
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
              <span className="num"> · {fmtInt(openAll.length)} open · {fmtInt(rows.length - openAll.length)} acknowledged
                {unreadCount > 0 && <span className="text-primary"> · {fmtInt(unreadCount)} unread</span>}
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Group by</span>
        <SegmentedControl
          options={GROUP_OPTIONS}
          value={groupBy}
          onChange={setGroupBy}
          ariaLabel="Group alerts by"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip label="Locally mark every listed alert as read">
            <button
              type="button"
              className="btn !px-2.5 !text-xs"
              disabled={unreadCount === 0}
              onClick={markAllRead}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="m2 13 4 4L14 9" /><path d="m10 13 4 4 8-10" /></svg>
              <span className="hidden sm:inline">Mark all read</span>
              {unreadCount > 0 && <span className="num">{fmtInt(unreadCount)}</span>}
            </button>
          </Tooltip>
          <ToggleChip
            on={notify.sound}
            onClick={toggleSound}
            label="Sound"
            tip={notify.sound ? 'Chime on new anomalies — click to turn off' : 'Play a chime when new anomalies arrive'}
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
            >
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
                <path d="M10.3 19a2 2 0 0 0 3.4 0" />
              </svg>
            </ToggleChip>
          )}
          <Tooltip label="Download the filtered alerts as CSV">
            <button type="button" className="btn !px-2.5 !text-xs" onClick={exportCsv}>
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5" /><path d="M4 19h16" /></svg>
              <span className="hidden sm:inline">CSV</span>
            </button>
          </Tooltip>
        </div>
      </div>

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
            <div className="space-y-4">
              {groups.map((g) => (
                <section key={g.key} aria-label={`${g.label} alerts`} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</h2>
                    <Badge tone="slate" className="num">{fmtInt(g.items.length)}</Badge>
                    <div className="flex-1 border-t border-grid/60" aria-hidden="true" />
                  </div>
                  {g.items.map((a) => renderCard(a, false))}
                </section>
              ))}
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
