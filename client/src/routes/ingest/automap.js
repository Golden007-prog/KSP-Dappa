// Header → ER column auto-mapping: exact (normalised) match first, then the
// best normalised-Levenshtein candidate above a threshold, then a preset (the
// CCTNS IIF-1 preset ships from GET /ingest/tables flagged unverified).

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing in common (normalised on the longer length). */
export function similarity(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

// Common aliases seen in exports (lower-cased, punctuation dropped).
const ALIASES = {
  crimeno: ['firno', 'firnumber', 'crimenumber', 'crno'],
  crimeregistereddate: ['firdate', 'registereddate', 'dateofregistration', 'regdate'],
  policestationid: ['pscode', 'pscd', 'stationid', 'unitid', 'station'],
  policepersonid: ['ioid', 'io', 'officerid'],
  crimemajorheadid: ['majorhead', 'crimehead', 'headid'],
  crimeminorheadid: ['minorhead', 'subhead', 'crimesubhead'],
  casestatusid: ['status', 'casestatus'],
  latitude: ['lat', 'y'],
  longitude: ['lng', 'lon', 'long', 'x'],
  brieffacts: ['facts', 'narrative', 'description', 'briefdescription'],
  districtid: ['district', 'distcode'],
};

/**
 * @returns {{ mapping: Object<string,string|null>, scores: Object<string,number>, sources: Object<string,'exact'|'alias'|'fuzzy'|'preset'|'none'> }}
 */
export function autoMap(tableDef, headers, preset) {
  const mapping = {};
  const scores = {};
  const sources = {};
  const used = new Set();
  const hs = headers.map((h) => ({ raw: h, n: norm(h) }));
  const claim = (col, h, score, src) => { mapping[col] = h; scores[col] = score; sources[col] = src; used.add(h); };
  // pass 1: exact
  for (const c of tableDef.columns) {
    const hit = hs.find((h) => h.n === norm(c.name) && !used.has(h.raw));
    if (hit) claim(c.name, hit.raw, 1, 'exact');
  }
  // pass 2: preset (explicit export names)
  if (preset && preset.mapping) {
    for (const c of tableDef.columns) {
      if (mapping[c.name]) continue;
      const want = norm(preset.mapping[c.name]);
      const hit = want && hs.find((h) => h.n === want && !used.has(h.raw));
      if (hit) claim(c.name, hit.raw, 0.95, 'preset');
    }
  }
  // pass 3: aliases
  for (const c of tableDef.columns) {
    if (mapping[c.name]) continue;
    const al = ALIASES[norm(c.name)] || [];
    const hit = hs.find((h) => al.includes(h.n) && !used.has(h.raw));
    if (hit) claim(c.name, hit.raw, 0.9, 'alias');
  }
  // pass 4: fuzzy (best unclaimed header ≥ 0.72)
  for (const c of tableDef.columns) {
    if (mapping[c.name]) continue;
    let best = null;
    for (const h of hs) {
      if (used.has(h.raw)) continue;
      const s = similarity(c.name, h.raw);
      if (!best || s > best.s) best = { h: h.raw, s };
    }
    if (best && best.s >= 0.72) claim(c.name, best.h, Math.round(best.s * 100) / 100, 'fuzzy');
    else { mapping[c.name] = null; scores[c.name] = 0; sources[c.name] = 'none'; }
  }
  return { mapping, scores, sources };
}
