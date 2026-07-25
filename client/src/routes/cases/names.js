// Translate API-supplied case attribute NAMES (district / crime head / subhead /
// status / gravity / category) for display.
//
// The /cases list payload carries names only — no lookup ids
// (functions/dappa_api/lib/routes/cases.js listRow) — while the shared data
// dictionaries (locales/{kn,hi}/data.js) are keyed by id. So we build a
// name→id reverse index from /meta/lookups once and hand the id to tName().
// English is a pass-through, and an unresolved name falls back to itself, so a
// lookup miss degrades to the API string rather than to a blank cell.
//
// Filtering and sorting still run on the raw English names — only the rendered
// text changes.
import { useCallback, useMemo } from 'react';
import { useLookups } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';

// [tName kind, useLookups() list, name field, id field]
const REVERSE = [
  ['districts', 'districts', 'districtName', 'districtId'],
  ['crimeHeads', 'crimeHeads', 'headName', 'crimeHeadId'],
  ['crimeSubHeads', 'crimeSubHeads', 'subHeadName', 'crimeSubHeadId'],
  ['statuses', 'statuses', 'name', 'id'],
  ['gravities', 'gravities', 'name', 'id'],
  ['categories', 'categories', 'name', 'id'],
];

/** useCaseNames() → tr(kind, apiName) — 'Mysuru City' → 'ಮೈಸೂರು ನಗರ'. */
export function useCaseNames() {
  const { lang, tName } = useI18n();
  const lookups = useLookups();
  const lk = lookups.data;

  const maps = useMemo(() => {
    const out = {};
    for (const [kind, listKey, nameKey, idKey] of REVERSE) {
      const m = new Map();
      for (const row of lk?.[listKey] || []) {
        const name = row?.[nameKey];
        if (name) m.set(String(name), String(row[idKey]));
      }
      out[kind] = m;
    }
    return out;
  }, [lk]);

  return useCallback((kind, name) => {
    const s = name === undefined || name === null ? '' : String(name);
    if (!s || lang === 'en') return s;
    const id = maps[kind] ? maps[kind].get(s) : undefined;
    return id ? tName(kind, id, s) : s;
  }, [maps, lang, tName]);
}
