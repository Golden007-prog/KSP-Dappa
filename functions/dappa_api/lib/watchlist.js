'use strict';
// Offender watchlist: storage + enrichment.
//
// The watchlist used to live only in the browser's localStorage, so it died
// with the tab and was invisible to the rest of the control room. It now
// persists in Catalyst Cache (segment 'dappa'), which means one desk's list is
// readable from the next. Cache is best-effort by construction — it degrades to
// the per-container memory map when Catalyst is unreachable — so a save can
// never fail the request; `persisted` reports which backend actually answered.

const { getLookups } = require('./lookups');
const { toNum, round, parseJsonSafe } = require('./util');
const { makeDistrictResolver, daysBetween } = require('./analytics');

const MAX_KEYS = 200;          // stored list cap (a request still caps at 50)
const WATCH_TTL_SEC = 7 * 24 * 3600;
const LIST_ID_RE = /^[A-Za-z0-9._-]{1,40}$/;
const MODES = ['add', 'replace', 'remove', 'none'];

function listCacheKey(listId) {
  return `v1:watchlist:${listId}`;
}

/** Sanitised list id, or null when the caller sent something unusable. */
function normalizeListId(raw) {
  const s = String(raw === undefined || raw === null || raw === '' ? 'default' : raw).trim();
  return LIST_ID_RE.test(s) ? s : null;
}

function normalizeKeys(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((k) => String(k === undefined || k === null ? '' : k).trim()).filter(Boolean))];
}

async function loadWatchlist(cache, listId) {
  let stored = null;
  try {
    const hit = await cache.get(listCacheKey(listId));
    stored = hit ? hit.value : null;
  } catch (e) {
    stored = null;
  }
  const keys = normalizeKeys(stored && stored.keys).slice(0, MAX_KEYS);
  return {
    listId,
    keys,
    count: keys.length,
    updatedAt: (stored && stored.updatedAt) || null
  };
}

async function saveWatchlist(cache, listId, keys) {
  const value = { keys: keys.slice(0, MAX_KEYS), updatedAt: new Date().toISOString() };
  try {
    await cache.put(listCacheKey(listId), value, WATCH_TTL_SEC);
  } catch (e) {
    // Cache is a best-effort store; the caller still gets its enriched answer.
  }
  return { listId, keys: value.keys, count: value.keys.length, updatedAt: value.updatedAt };
}

/** Apply a request against the stored list. 'none' reads without writing. */
function applyMode(existing, incoming, mode) {
  if (mode === 'none') return existing.slice(0, MAX_KEYS);
  if (mode === 'replace') return incoming.slice(0, MAX_KEYS);
  if (mode === 'remove') {
    const drop = new Set(incoming);
    return existing.filter((k) => !drop.has(k)).slice(0, MAX_KEYS);
  }
  return [...new Set(existing.concat(incoming))].slice(0, MAX_KEYS);
}

/**
 * Enrich person keys into watch-ready profiles: recency, associate count and
 * the open alerts sitting in their districts. Shape is frozen — this is the
 * exact object POST /offenders/watch has always returned.
 */
async function enrichProfiles(ctx, keys) {
  if (!keys.length) return [];
  const [rows, edgesA, edgesB, openAlerts] = await Promise.all([
    ctx.ds.query({
      table: 'OffenderProfile',
      columns: ['PersonKey', 'CanonicalName', 'AliasesJson', 'CaseCount', 'DistrictsJson', 'FirstSeen', 'LastSeen', 'MOTagsJson', 'CommunityID', 'RiskScore'],
      where: [{ col: 'PersonKey', op: 'in', val: keys }]
    }),
    // A hub offender can carry far more than one 300-row ZCQL page of edges;
    // an unpaged read would silently under-count their associates.
    ctx.ds.queryAll({ table: 'NetworkEdge', columns: ['PersonKeyA'], where: [{ col: 'PersonKeyA', op: 'in', val: keys }] }, { maxRows: 1500 }),
    ctx.ds.queryAll({ table: 'NetworkEdge', columns: ['PersonKeyB'], where: [{ col: 'PersonKeyB', op: 'in', val: keys }] }, { maxRows: 1500 }),
    ctx.ds.query({ table: 'AnomalyAlert', columns: ['AlertID', 'DistrictID'], where: [{ col: 'Status', op: '=', val: 'OPEN' }] }).catch(() => [])
  ]);
  const assoc = new Map();
  for (const e of edgesA) assoc.set(String(e.PersonKeyA), (assoc.get(String(e.PersonKeyA)) || 0) + 1);
  for (const e of edgesB) assoc.set(String(e.PersonKeyB), (assoc.get(String(e.PersonKeyB)) || 0) + 1);
  const lk = await getLookups(ctx);
  const resolve = makeDistrictResolver(lk);
  // Alert districts and profile districts are written in different dialects
  // (ids vs names, padded vs not) — compare on the resolved id.
  const alertDistricts = openAlerts.map((a) => resolve(a.DistrictID) || String(a.DistrictID));
  return rows.map((r) => {
    const districts = parseJsonSafe(r.DistrictsJson, []).map(String);
    const resolved = new Set(districts.map((d) => resolve(d) || d));
    const daysSinceLastSeen = daysBetween(r.LastSeen, new Date().toISOString().slice(0, 10));
    return {
      personKey: String(r.PersonKey),
      canonicalName: r.CanonicalName,
      aliases: parseJsonSafe(r.AliasesJson, []),
      caseCount: toNum(r.CaseCount),
      districts,
      districtNames: districts.map((d) => lk.districtName(d)),
      firstSeen: r.FirstSeen,
      lastSeen: r.LastSeen,
      daysSinceLastSeen: daysSinceLastSeen === null ? null : Math.max(0, daysSinceLastSeen),
      moTags: parseJsonSafe(r.MOTagsJson, []),
      communityId: r.CommunityID === undefined || r.CommunityID === null || r.CommunityID === '' ? null : toNum(r.CommunityID),
      riskScore: round(toNum(r.RiskScore), 1),
      associates: assoc.get(String(r.PersonKey)) || 0,
      openAlertsInDistricts: alertDistricts.filter((d) => resolved.has(d)).length
    };
  }).sort((a, b) => b.riskScore - a.riskScore);
}

module.exports = {
  MAX_KEYS,
  WATCH_TTL_SEC,
  MODES,
  listCacheKey,
  normalizeListId,
  normalizeKeys,
  loadWatchlist,
  saveWatchlist,
  applyMode,
  enrichProfiles
};
