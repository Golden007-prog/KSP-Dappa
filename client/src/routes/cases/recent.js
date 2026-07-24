// Recently viewed cases — CaseDetail pushes {id, crimeNo, viewedAt} on load;
// the explorer shows the list as one-tap return chips. Deduped by id, newest
// first, capped so the row never crowds the toolbar.
import { readJson, writeJson } from './explorerState.js';

const STORAGE_KEY = 'dappa-cases-recent';
const CAP = 8;

export function readRecent() {
  const list = readJson(STORAGE_KEY, []);
  return Array.isArray(list) ? list.filter((x) => x && x.id) : [];
}

export function pushRecent({ id, crimeNo }) {
  if (!id) return readRecent();
  const key = String(id);
  const next = [
    { id: key, crimeNo: crimeNo ? String(crimeNo) : '', viewedAt: new Date().toISOString() },
    ...readRecent().filter((x) => String(x.id) !== key),
  ].slice(0, CAP);
  writeJson(STORAGE_KEY, next);
  return next;
}

export function clearRecent() {
  writeJson(STORAGE_KEY, []);
}
