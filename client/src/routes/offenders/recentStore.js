// Recently-viewed offenders — a small localStorage ring pushed from Offender
// 360 on load and rendered as a chip row on /offenders. Newest first, deduped,
// capped at 8. Private-mode safe (all ops no-op on storage failure).
const KEY = 'dappa-recent-offenders';
const MAX = 8;

export function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((r) => r && r.key).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(personKey, name) {
  const key = String(personKey || '');
  if (!key) return;
  const next = [
    { key, name: String(name || key) },
    ...readRecent().filter((r) => r.key !== key),
  ].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
}

export function clearRecent() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
