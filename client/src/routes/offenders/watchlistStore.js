// Cross-route watchlist — starred people ({key, name}) persisted in
// localStorage. A window CustomEvent keeps every mounted consumer (Offenders
// registry, Network panels, Offender 360 header) in sync without a provider;
// the 'storage' listener extends that sync across browser tabs. Private-mode
// safe: all storage ops degrade to no-ops.
import { useEffect, useMemo, useState } from 'react';

const KEY = 'dappa-watchlist';
const EVT = 'dappa-watchlist-change';
export const WATCH_MAX = 50;

export function readWatchlist() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((r) => r && r.key).slice(0, WATCH_MAX) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, WATCH_MAX))); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* very old browser */ }
}

/** Toggle a person on/off the watchlist → {status:'added'|'removed'|'full', list}. */
export function toggleWatch(personKey, name) {
  const key = String(personKey || '');
  if (!key) return { status: 'removed', list: readWatchlist() };
  const cur = readWatchlist();
  if (cur.some((r) => r.key === key)) {
    const list = cur.filter((r) => r.key !== key);
    write(list);
    return { status: 'removed', list };
  }
  if (cur.length >= WATCH_MAX) return { status: 'full', list: cur };
  const list = [{ key, name: String(name || key) }, ...cur];
  write(list);
  return { status: 'added', list };
}

/** Reactive watchlist → {list, keys:Set<personKey>, toggle}. */
export function useWatchlist() {
  const [list, setList] = useState(readWatchlist);
  useEffect(() => {
    const on = () => setList(readWatchlist());
    window.addEventListener(EVT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  const keys = useMemo(() => new Set(list.map((r) => r.key)), [list]);
  return { list, keys, toggle: toggleWatch };
}
