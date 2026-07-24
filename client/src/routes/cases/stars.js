// Starred cases — localStorage map caseMasterId → { crimeNo, at }. A map (not
// a list) so row rendering is an O(1) lookup; guarded reads survive private
// mode and stale/corrupt payloads.
import { readJson, writeJson } from './explorerState.js';

const STORAGE_KEY = 'dappa-cases-starred';

export function readStars() {
  const v = readJson(STORAGE_KEY, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** Toggle one id; persists and returns the next map (callers setState with it). */
export function toggleStar(stars, id, meta = {}) {
  const key = String(id);
  const next = { ...stars };
  if (next[key]) delete next[key];
  else next[key] = { crimeNo: meta.crimeNo ? String(meta.crimeNo) : '', at: new Date().toISOString().slice(0, 10) };
  writeJson(STORAGE_KEY, next);
  return next;
}
