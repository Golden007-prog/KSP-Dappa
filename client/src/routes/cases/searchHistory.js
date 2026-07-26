// Recent search terms — the queries an investigator actually re-runs.
// Deduped (case-insensitively), newest first, capped so the chip row never
// crowds the toolbar. Durable across sessions like stars, unlike the compare
// tray which is session-scoped.
import { readJson, writeJson } from './explorerState.js';

const STORAGE_KEY = 'dappa-cases-searches';
const CAP = 10;

export function readSearches() {
  const list = readJson(STORAGE_KEY, []);
  return Array.isArray(list) ? list.filter((x) => x && typeof x.q === 'string' && x.q.trim()) : [];
}

/** Record a query; returns the next list (callers setState with it). */
export function pushSearch(q) {
  const term = String(q || '').trim();
  if (term.length < 2) return readSearches();
  const next = [
    { q: term, at: new Date().toISOString() },
    ...readSearches().filter((x) => x.q.toLowerCase() !== term.toLowerCase()),
  ].slice(0, CAP);
  writeJson(STORAGE_KEY, next);
  return next;
}

export function removeSearch(q) {
  const next = readSearches().filter((x) => x.q !== q);
  writeJson(STORAGE_KEY, next);
  return next;
}

export function clearSearches() {
  writeJson(STORAGE_KEY, []);
  return [];
}
