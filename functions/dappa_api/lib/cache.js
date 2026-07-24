'use strict';
// Cache wrapper: Catalyst Cache segment 'dappa' when reachable, in-memory Map
// fallback otherwise. TTL is enforced in seconds by embedding the expiry in
// the stored value (Catalyst Cache's native expiry is hour-granular).

const DEFAULT_TTL_SEC = 600;

/**
 * @param {object} [opts]
 * @param {function} [opts.getSegment] async () => Catalyst cache Segment (or null).
 * @param {function} [opts.now] injectable clock for tests.
 */
function createCache(opts) {
  const o = opts || {};
  const now = o.now || (() => Date.now());
  const mem = new Map();
  let segmentPromise = null;
  let catalystHealthy = Boolean(o.getSegment);

  async function segment() {
    if (!o.getSegment || !catalystHealthy) return null;
    if (!segmentPromise) segmentPromise = Promise.resolve().then(o.getSegment).catch(() => null);
    const seg = await segmentPromise;
    if (!seg) catalystHealthy = false;
    return seg;
  }

  function wrapVal(value, ttlSec) {
    return JSON.stringify({ e: now() + (ttlSec || DEFAULT_TTL_SEC) * 1000, v: value });
  }

  function unwrapVal(raw) {
    if (!raw) return undefined;
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj.e !== 'number') return undefined;
      if (obj.e < now()) return undefined;
      return { value: obj.v };
    } catch (e) {
      return undefined;
    }
  }

  return {
    async get(key) {
      const seg = await segment();
      if (seg) {
        try {
          const raw = await seg.getValue(key);
          const hit = unwrapVal(raw);
          if (hit) return hit;
        } catch (e) {
          catalystHealthy = false;
        }
      }
      const local = mem.get(key);
      if (local && local.e >= now()) return { value: local.v };
      if (local) mem.delete(key);
      return undefined;
    },

    async put(key, value, ttlSec) {
      const ttl = ttlSec || DEFAULT_TTL_SEC;
      mem.set(key, { e: now() + ttl * 1000, v: value });
      const seg = await segment();
      if (seg) {
        try {
          // Catalyst expiry is in hours; round up so our embedded expiry governs.
          await seg.put(key, wrapVal(value, ttl), Math.max(1, Math.ceil(ttl / 3600)));
        } catch (e) {
          catalystHealthy = false;
        }
      }
    },

    /** get-or-compute with ?nocache=1 bypass. */
    async wrap(key, ttlSec, bypass, fn) {
      if (!bypass) {
        const hit = await this.get(key);
        if (hit) return { value: hit.value, cached: true };
      }
      const value = await fn();
      await this.put(key, value, ttlSec);
      return { value, cached: false };
    },

    async ping() {
      const key = '__dappa_ping__';
      await this.put(key, 'ok', 30);
      const hit = await this.get(key);
      return Boolean(hit && hit.value === 'ok');
    },

    get backend() {
      return catalystHealthy ? 'catalyst' : 'memory';
    }
  };
}

module.exports = { createCache, DEFAULT_TTL_SEC };
