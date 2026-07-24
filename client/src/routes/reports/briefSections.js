// /reports + /print/brief — Weekly Brief section registry and the helpers that
// keep the builder toggles, the ?sections= URL param and localStorage in sync.
// Keys match the query names in useBriefData; 'forecast' covers the combined
// forecast + station-risk section in BriefContent; 'exec' (auto-composed
// executive summary) and 'annex' (methodology notes) are synthesized sections
// with no query of their own. New keys default ON for stored prefs/URLs that
// predate them (loadSections / sectionsFromParam treat absent as enabled).

export const BRIEF_SECTIONS = [
  { key: 'exec', label: 'Executive summary' },
  { key: 'kpis', label: 'Headline indicators' },
  { key: 'alerts', label: 'Anomaly alerts' },
  { key: 'hotspots', label: 'Top hotspots' },
  { key: 'network', label: 'Network changes' },
  { key: 'forecast', label: 'Forecast & risk' },
  { key: 'annex', label: 'Methodology annex' },
];

/** key → display label (used by the printed Contents line). */
export const SECTION_LABELS = Object.fromEntries(BRIEF_SECTIONS.map((s) => [s.key, s.label]));

const KEYS = BRIEF_SECTIONS.map((s) => s.key);
const STORAGE_KEY = 'dappa-brief-sections';
const ORDER_KEY = 'dappa-brief-order';

/** Canonical section order (also the fallback for junk input). */
export const DEFAULT_ORDER = [...KEYS];

/** Sanitize any candidate order: known keys only, deduped, missing appended. */
export function normalizeOrder(candidate) {
  const seen = [];
  for (const k of Array.isArray(candidate) ? candidate : []) {
    if (KEYS.includes(k) && !seen.includes(k)) seen.push(k);
  }
  for (const k of KEYS) if (!seen.includes(k)) seen.push(k);
  return seen;
}

/** 'alerts,kpis,…' → sanitized order array (default order for null/junk). */
export function orderFromParam(str) {
  if (!str) return DEFAULT_ORDER;
  return normalizeOrder(String(str).split(',').map((s) => s.trim()));
}

/** Inverse: '' when the order is the default (keep URLs clean). */
export function orderToParam(order) {
  const o = normalizeOrder(order);
  return o.every((k, i) => k === DEFAULT_ORDER[i]) ? '' : o.join(',');
}

export function loadOrder() {
  try {
    return normalizeOrder(JSON.parse(localStorage.getItem(ORDER_KEY)));
  } catch {
    return DEFAULT_ORDER;
  }
}

export function saveOrder(order) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(normalizeOrder(order)));
  } catch {
    /* private mode */
  }
}

export const allSectionsOn = () => Object.fromEntries(KEYS.map((k) => [k, true]));

/** 'kpis,alerts' → {kpis:true, alerts:true, hotspots:false, …}. Null/''/junk →
 * everything on, so /print/brief without the param keeps its old behavior. */
export function sectionsFromParam(str) {
  if (!str) return allSectionsOn();
  const picked = new Set(String(str).split(',').map((s) => s.trim()).filter((k) => KEYS.includes(k)));
  if (!picked.size) return allSectionsOn();
  return Object.fromEntries(KEYS.map((k) => [k, picked.has(k)]));
}

/** Inverse: '' when everything is on (keep URLs clean), else a CSV of keys. */
export function sectionsToParam(sections) {
  const on = KEYS.filter((k) => sections?.[k] !== false);
  return on.length === KEYS.length ? '' : on.join(',');
}

export function loadSections() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (v && typeof v === 'object') {
      return Object.fromEntries(KEYS.map((k) => [k, v[k] !== false]));
    }
  } catch {
    /* corrupt / private mode */
  }
  return allSectionsOn();
}

export function saveSections(sections) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  } catch {
    /* private mode */
  }
}
