// /reports + /print/brief — Weekly Brief section registry and the helpers that
// keep the builder toggles, the ?sections= URL param and localStorage in sync.
// Keys match the query names in useBriefData; 'forecast' covers the combined
// forecast + station-risk section in BriefContent.

export const BRIEF_SECTIONS = [
  { key: 'kpis', label: 'Headline indicators' },
  { key: 'alerts', label: 'Anomaly alerts' },
  { key: 'hotspots', label: 'Top hotspots' },
  { key: 'network', label: 'Network changes' },
  { key: 'forecast', label: 'Forecast & risk' },
];

const KEYS = BRIEF_SECTIONS.map((s) => s.key);
const STORAGE_KEY = 'dappa-brief-sections';

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
