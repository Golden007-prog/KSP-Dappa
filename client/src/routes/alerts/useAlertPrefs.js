// /alerts — user preferences persisted in localStorage: group-by mode,
// sound/desktop notification opt-ins, and the locally-read alert IDs behind
// "Mark all read". Keys follow the existing 'dappa-*' convention
// (dappa-theme, dappa-density).
import { useCallback, useState } from 'react';

const KEY_GROUP = 'dappa-alerts-groupby';
const KEY_NOTIFY = 'dappa-alerts-notify';
const KEY_READ = 'dappa-alerts-read';
const READ_CAP = 500;

export const GROUP_MODES = ['severity', 'district', 'date'];

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
  const [notify, setNotifyState] = useState(() => {
    const v = load(KEY_NOTIFY, {});
    return { sound: !!v.sound, desktop: !!v.desktop };
  });
  const [readIds, setReadIds] = useState(() => {
    const v = load(KEY_READ, []);
    return new Set(Array.isArray(v) ? v.map(String) : []);
  });

  const setGroupBy = useCallback((v) => {
    setGroupByState(v);
    save(KEY_GROUP, v);
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

  return { groupBy, setGroupBy, notify, setNotify, readIds, markRead };
}
