// /alerts — user preferences persisted in localStorage: group-by mode, sort
// order, feed/board view mode, sound/desktop notification opt-ins, the
// locally-read alert IDs behind "Mark all read", per-alert snooze timestamps,
// per-alert first-seen timestamps (the SLA countdown anchor), and named saved
// views. Keys follow the existing 'dappa-*' convention (dappa-theme, …).
import { useCallback, useState } from 'react';

const KEY_GROUP = 'dappa-alerts-groupby';
const KEY_SORT = 'dappa-alerts-sort';
const KEY_VIEW = 'dappa-alerts-view';
const KEY_NOTIFY = 'dappa-alerts-notify';
const KEY_READ = 'dappa-alerts-read';
const KEY_SNOOZE = 'dappa-alerts-snooze';
const KEY_VIEWS = 'dappa-alerts-views';
const KEY_SEEN = 'dappa-alerts-firstseen';
const READ_CAP = 500;
const VIEWS_CAP = 8;
const SEEN_CAP = 600;

export const GROUP_MODES = ['severity', 'district', 'date'];
export const SORT_MODES = ['severity', 'z', 'recent'];
export const VIEW_MODES = ['feed', 'board'];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export function useAlertPrefs() {
  const [groupBy, setGroupByState] = useState(() => {
    const v = load(KEY_GROUP, 'severity');
    return GROUP_MODES.includes(v) ? v : 'severity';
  });
  const [sortBy, setSortByState] = useState(() => {
    const v = load(KEY_SORT, 'severity');
    return SORT_MODES.includes(v) ? v : 'severity';
  });
  const [viewMode, setViewModeState] = useState(() => {
    const v = load(KEY_VIEW, 'feed');
    return VIEW_MODES.includes(v) ? v : 'feed';
  });
  const [notify, setNotifyState] = useState(() => {
    const v = load(KEY_NOTIFY, {});
    return { sound: !!v.sound, desktop: !!v.desktop };
  });
  const [readIds, setReadIds] = useState(() => {
    const v = load(KEY_READ, []);
    return new Set(Array.isArray(v) ? v.map(String) : []);
  });
  // {alertId: expiresAtMs} — expired entries are dropped on load.
  const [snoozes, setSnoozes] = useState(() => {
    const v = load(KEY_SNOOZE, {});
    const now = Date.now();
    const out = {};
    if (v && typeof v === 'object') {
      for (const [id, ts] of Object.entries(v)) {
        if (Number(ts) > now) out[String(id)] = Number(ts);
      }
    }
    return out;
  });
  // {alertId: firstSeenMs} — when THIS console first listed the alert; anchors
  // the escalation SLA countdowns (sla.js). Oldest entries pruned at the cap.
  const [firstSeen, setFirstSeen] = useState(() => {
    const v = load(KEY_SEEN, {});
    const out = {};
    if (v && typeof v === 'object') {
      for (const [id, ts] of Object.entries(v)) {
        if (Number.isFinite(Number(ts))) out[String(id)] = Number(ts);
      }
    }
    return out;
  });

  // [{name, search}] — search is a URL query string to re-apply verbatim.
  const [views, setViews] = useState(() => {
    const v = load(KEY_VIEWS, []);
    return Array.isArray(v)
      ? v.filter((x) => x && typeof x.name === 'string' && typeof x.search === 'string').slice(0, VIEWS_CAP)
      : [];
  });

  const setGroupBy = useCallback((v) => {
    setGroupByState(v);
    save(KEY_GROUP, v);
  }, []);

  const setSortBy = useCallback((v) => {
    setSortByState(v);
    save(KEY_SORT, v);
  }, []);

  const setViewMode = useCallback((v) => {
    setViewModeState(v);
    save(KEY_VIEW, v);
  }, []);

  const markSeen = useCallback((ids) => {
    const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
    if (!list.length) return;
    setFirstSeen((prev) => {
      const fresh = list.filter((id) => !(id in prev));
      if (!fresh.length) return prev;
      const now = Date.now();
      let next = { ...prev };
      for (const id of fresh) next[id] = now;
      const entries = Object.entries(next);
      if (entries.length > SEEN_CAP) {
        entries.sort((a, b) => a[1] - b[1]); // oldest first
        next = Object.fromEntries(entries.slice(entries.length - SEEN_CAP));
      }
      save(KEY_SEEN, next);
      return next;
    });
  }, []);

  const setNotify = useCallback((patch) => {
    setNotifyState((prev) => {
      const next = { ...prev, ...patch };
      save(KEY_NOTIFY, next);
      return next;
    });
  }, []);

  const markRead = useCallback((ids) => {
    const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
    if (!list.length) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const id of list) next.add(id);
      // Cap so the key never grows unbounded across demo sessions.
      save(KEY_READ, [...next].slice(-READ_CAP));
      return next;
    });
  }, []);

  const snooze = useCallback((id, ms = 24 * 60 * 60 * 1000) => {
    setSnoozes((prev) => {
      const next = { ...prev, [String(id)]: Date.now() + ms };
      save(KEY_SNOOZE, next);
      return next;
    });
  }, []);

  const unsnooze = useCallback((id) => {
    setSnoozes((prev) => {
      const next = { ...prev };
      delete next[String(id)];
      save(KEY_SNOOZE, next);
      return next;
    });
  }, []);

  const saveView = useCallback((name, search) => {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) return;
    setViews((prev) => {
      const next = [...prev.filter((v) => v.name !== clean), { name: clean, search: String(search || '') }]
        .slice(-VIEWS_CAP);
      save(KEY_VIEWS, next);
      return next;
    });
  }, []);

  const deleteView = useCallback((name) => {
    setViews((prev) => {
      const next = prev.filter((v) => v.name !== name);
      save(KEY_VIEWS, next);
      return next;
    });
  }, []);

  return {
    groupBy, setGroupBy, sortBy, setSortBy, notify, setNotify, readIds, markRead,
    snoozes, snooze, unsnooze, views, saveView, deleteView,
    viewMode, setViewMode, firstSeen, markSeen,
  };
}
