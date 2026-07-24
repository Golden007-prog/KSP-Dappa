// Small shared hooks/prefs for the Network + Offender routes.
import { useEffect, useState } from 'react';

/** Reactive matchMedia — e.g. useMediaQuery('(min-width: 1280px)'). */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** localStorage read with fallback (private-mode safe). */
export function readPref(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

/** localStorage write (private-mode safe no-op). */
export function writePref(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch { /* private mode */ }
}
