// In-app notification centre — the events an officer would be pushed about,
// derived from the same sources whether or not web push is enabled: the open
// alerts feed and the action record (/actions/recent). Unread state is per
// browser (localStorage), so a judge's device remembers what they have seen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from './api.js';
import { useTierStore } from './tier.js';
import { useRecentActions } from '../routes/alerts/actionsApi.js';

const SEEN_KEY = 'dappa-notif-seen';
const SEEN_CAP = 500;
const POLL_MS = 60000;

function loadSeen() {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY));
    return new Set(Array.isArray(v) ? v.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(set) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-SEEN_CAP)));
  } catch { /* private mode */ }
}

const tsOf = (v) => {
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? t : 0;
};

/**
 * Turn open alerts + recent actions into a newest-first event list.
 * kinds: alert · escalation · assignment · outcome · dismissal.
 */
export function deriveEvents({ alerts = [], actions = [], tier = 'district' }) {
  const out = [];
  for (const a of alerts) {
    if (String(a.status || '').toUpperCase() !== 'OPEN') continue;
    out.push({
      id: `alert:${a.alertId}`,
      kind: 'alert',
      ts: tsOf(a.periodEnd || a.periodStart),
      alertKey: String(a.alertId),
      severity: a.severity,
      zScore: a.zScore,
      title: [a.headName, a.districtName || a.districtId].filter(Boolean).join(' — '),
      subtitle: a.narrative || '',
      crimeHeadId: a.crimeHeadId,
      districtId: a.districtId,
      forMe: false,
    });
  }
  for (const x of actions) {
    if (x.subjectType !== 'alert') continue;
    const type = String(x.actionType || '').toLowerCase();
    let kind = null;
    if (type === 'escalate') kind = 'escalation';
    else if (type === 'assign') kind = 'assignment';
    else if (type === 'outcome') kind = 'outcome';
    else if (type === 'dismiss') kind = 'dismissal';
    if (!kind) continue;
    out.push({
      id: `action:${x.actionId}`,
      kind,
      ts: tsOf(x.ts ?? x.clientTs),
      alertKey: x.alertKey,
      severity: x.severity ?? null,
      toTier: x.toTier || null,
      assignTo: x.assignTo || null,
      outcomeLabel: x.outcomeLabel || null,
      reason: x.reason || null,
      actor: x.actor || '',
      seeded: !!x.seeded,
      forMe: kind === 'escalation' && x.toTier === tier,
      // No title: the alert key already leads the row and the StatusPill
      // carries the detail (assignee, tier, outcome label, dismiss reason).
      // Repeating the key here rendered every decision as "AL-001 · AL-001".
      title: '',
      subtitle: x.note || '',
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

export function useNotifications({ enabled = true } = {}) {
  const tier = useTierStore((s) => s.tier);
  const [seen, setSeen] = useState(loadSeen);
  const alerts = useQuery({
    queryKey: ['alerts-open-feed'],
    enabled,
    queryFn: ({ signal }) => apiGet('/alerts', { status: 'OPEN', perPage: 50 }, { signal }).then((r) => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 30 * 1000,
    refetchInterval: POLL_MS,
    retry: 0,
  });
  const recent = useRecentActions({ days: 7, limit: 60 }, { refetchInterval: POLL_MS, enabled });

  const events = useMemo(
    () => deriveEvents({ alerts: alerts.data || [], actions: recent.data?.rows || [], tier }).slice(0, 40),
    [alerts.data, recent.data, tier],
  );
  const unread = useMemo(() => events.filter((e) => !seen.has(e.id)), [events, seen]);

  const markAllRead = useCallback(() => {
    setSeen((prev) => {
      const next = new Set(prev);
      for (const e of events) next.add(e.id);
      saveSeen(next);
      return next;
    });
  }, [events]);

  const markRead = useCallback((id) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveSeen(next);
      return next;
    });
  }, []);

  // Other tabs share the seen set.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === SEEN_KEY) setSeen(loadSeen()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return {
    events,
    unread,
    unreadCount: unread.length,
    isLoading: alerts.isLoading || recent.isLoading,
    error: alerts.error || recent.error || null,
    storage: recent.data?.meta?.storage || null,
    markAllRead,
    markRead,
    isSeen: (id) => seen.has(id),
  };
}
