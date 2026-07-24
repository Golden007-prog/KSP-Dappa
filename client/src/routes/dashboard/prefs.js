// Dashboard user preferences — pinboard, collapsed panels, auto-refresh.
// All persisted in localStorage so the layout survives reloads; storage
// failures (private mode) degrade to in-memory state, never a crash.
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const PIN_KEY = 'dappa-dash-pins';
const COLLAPSE_KEY = 'dappa-dash-collapsed';
const AUTO_KEY = 'dappa-dash-autorefresh';

function readIds(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(key, ids) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* private mode */ }
}

/**
 * usePanelPrefs() → { pinned:[id…], collapsed:[id…], togglePin(id),
 *   toggleCollapse(id), collapseAll(ids), expandAll(), resetLayout() }
 * `pinned` keeps pin ORDER (first pinned renders first); both lists persist.
 */
export function usePanelPrefs() {
  const [pinned, setPinned] = useState(() => readIds(PIN_KEY));
  const [collapsed, setCollapsed] = useState(() => readIds(COLLAPSE_KEY));

  const togglePin = useCallback((id) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeIds(PIN_KEY, next);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((id) => {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeIds(COLLAPSE_KEY, next);
      return next;
    });
  }, []);

  const collapseAll = useCallback((ids) => {
    const next = [...ids];
    writeIds(COLLAPSE_KEY, next);
    setCollapsed(next);
  }, []);

  const expandAll = useCallback(() => {
    writeIds(COLLAPSE_KEY, []);
    setCollapsed([]);
  }, []);

  const resetLayout = useCallback(() => {
    writeIds(PIN_KEY, []);
    writeIds(COLLAPSE_KEY, []);
    setPinned([]);
    setCollapsed([]);
  }, []);

  return { pinned, collapsed, togglePin, toggleCollapse, collapseAll, expandAll, resetLayout };
}

/** Every react-query key root the dashboard renders from (refresh scope). */
export const DASH_QUERY_KEYS = [
  'kpis', 'geo-districts', 'trends-monthly', 'trends-category-share',
  'trends-seasonality', 'alerts',
];

/**
 * useAutoRefresh(intervalSec=60) → { enabled, toggle, remaining, refreshNow }
 * The shared api.js hooks don't take per-call react-query options, so the 60s
 * cadence invalidates the dashboard query keys instead of setting
 * refetchInterval — same refetch machinery, driven from outside the hooks.
 * A 1s tick powers the countdown chip; the preference persists.
 */
export function useAutoRefresh(intervalSec = 60) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; }
  });
  const [remaining, setRemaining] = useState(intervalSec);

  const refreshNow = useCallback(() => {
    for (const key of DASH_QUERY_KEYS) qc.invalidateQueries({ queryKey: [key] });
    setRemaining(intervalSec);
  }, [qc, intervalSec]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(AUTO_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    setRemaining(intervalSec);
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [enabled, intervalSec]);

  useEffect(() => {
    if (!enabled || remaining > 0) return;
    refreshNow();
  }, [enabled, remaining, refreshNow]);

  return { enabled, toggle, remaining, refreshNow };
}
