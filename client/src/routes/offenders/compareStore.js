// Cross-route compare set — up to 3 personKeys persisted in localStorage so
// "Add to compare" works from Offender 360 and the Network node drawer, and the
// tray on /offenders survives navigation. Plain functions (no React) — the
// Offenders route owns the reactive state and writes back through these.
const KEY = 'dappa-compare';
export const COMPARE_MAX = 3;

export function readCompare() {
  try {
    const v = localStorage.getItem(KEY);
    return v ? v.split(',').filter(Boolean).slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

export function writeCompare(keys = []) {
  try {
    localStorage.setItem(KEY, keys.slice(0, COMPARE_MAX).join(','));
  } catch { /* private mode */ }
}

/** Add a personKey → {status:'added'|'exists'|'full', keys}. */
export function addToCompare(personKey) {
  const k = String(personKey);
  const cur = readCompare();
  if (cur.includes(k)) return { status: 'exists', keys: cur };
  if (cur.length >= COMPARE_MAX) return { status: 'full', keys: cur };
  const keys = [...cur, k];
  writeCompare(keys);
  return { status: 'added', keys };
}
