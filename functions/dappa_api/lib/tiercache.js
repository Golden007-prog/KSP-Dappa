'use strict';
// Cache segment helper for the per-unit officer-tier cards (backlog row 165).
//
// The tier home endpoints (/tiers/beat, /tiers/station, /tiers/state) are
// small, per-unit and re-read many times a day by many phones at the same
// station — the classic Catalyst Cache shape (key/value, expiry in hours). This
// helper gives phase 4 one call:
//
//   const { value, cached, key } = await tiercache.wrap(ctx, { tier:'station', unitId }, req, () => compute());
//
// Keys are `v1:tiers:<tier>:<scope>` so an operator can find them in the
// console segment; TTL is 300 s (the tier route's own TTL) and the value size
// is checked against lib/cache.js MAX_REMOTE_BYTES so an oversized card stays
// in the container map instead of poisoning the shared segment. A dedicated
// console segment (CACHE_TIER_SEGMENT, e.g. 'dappa_tiers') is optional — when
// unset the shared 'dappa' segment is used, which is what every other cached
// read does today.

const { nocache } = require('./envelope');

const TIER_TTL_SEC = 300;
const PREFIX = 'v1:tiers';

function keyFor(scope) {
  const s = scope || {};
  const tier = String(s.tier || 'district');
  const id = String(s.unitId || s.districtId || 'state');
  const extra = s.extra ? `:${String(s.extra)}` : '';
  return `${PREFIX}:${tier}:${id}${extra}`;
}

async function wrap(ctx, scope, req, fn, ttlSec) {
  const key = keyFor(scope);
  const out = await ctx.cache.wrap(key, ttlSec || TIER_TTL_SEC, nocache(req), fn);
  return { value: out.value, cached: out.cached, key, ttlSec: ttlSec || TIER_TTL_SEC, backend: ctx.cache.backend, segment: String(process.env.CACHE_TIER_SEGMENT || 'dappa') };
}

module.exports = { wrap, keyFor, TIER_TTL_SEC, PREFIX };
