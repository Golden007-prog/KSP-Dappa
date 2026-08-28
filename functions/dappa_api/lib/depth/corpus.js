'use strict';
// Career corpus: every sampled offender's dated cases, in one cached walk.
//
// The C5 depth endpoints (escalation ladder, MO transitions, recidivism
// survival, pair re-activation, travelling corridors) all need the same thing —
// who did what, where and when, in order — and none of the stored tables carry
// it directly: OffenderProfile has no case ids, NetworkEdge carries case ids
// only per co-accused pair, CaseMaster has the dates. So the corpus is built
// once per container from NetworkEdge (paged, bounded) → CaseMaster (chunked
// IN-lists), keyed by PersonKey, and every endpoint reads the cached result.
// Persons are admitted in RiskScore order until the case budget is spent, whole
// careers at a time: a trajectory measured on half a history is not a
// trajectory, so a person either enters with every case or not at all.

const { getLookups } = require('../lookups');
const { anchorYm } = require('../routes/read');
const { toNum, round, parseJsonSafe } = require('../util');
const an = require('../analytics');
const { gravityOf, parseDay } = require('./common');

const CASE_CHUNK = 80;
const CHUNK_CONCURRENCY = 4;
const CORPUS_TTL_SEC = 900;
const CASE_COLUMNS = ['CaseMasterID', 'CrimeRegisteredDate', 'PoliceStationID', 'CrimeMajorHeadID',
  'CrimeMinorHeadID', 'GravityOffenceID', 'latitude', 'longitude'];

async function fetchCases(ctx, ids) {
  const chunks = an.chunk(ids, CASE_CHUNK);
  const out = [];
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batch = chunks.slice(i, i + CHUNK_CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(batch.map((chunk) => ctx.ds.query({
      table: 'CaseMaster', columns: CASE_COLUMNS,
      where: [{ col: 'CaseMasterID', op: 'in', val: chunk }],
      limit: { count: 300 }
    }).catch(() => [])));
    for (const rows of results) out.push(...rows);
  }
  return out;
}

/**
 * Build the corpus. Returns plain JSON (arrays, not Maps) so it survives the
 * cache round-trip:
 *   { anchorYm, persons: [{ key, name, riskScore, caseCount, moTags, districts,
 *     firstSeen, lastSeen, cases: [{ id, day, date, unitId, districtId, headId,
 *     subHeadId, gravity, heinous, lat, lng }] }],
 *     pairs: [{ a, b, weight, caseIds }], scan }
 */
async function buildCorpus(ctx, opts) {
  const o = opts || {};
  // 9,000 edges is 30 ZCQL pages (~3 s live) and covers every A-end person up
  // to roughly P00900; the full 23,833-row table is allowed but costs ~8 s cold.
  const maxEdges = Math.max(100, Math.min(24000, toNum(o.maxEdges, 9000)));
  const maxCases = Math.max(50, Math.min(4000, toNum(o.maxCases, 2400)));
  const lk = await getLookups(ctx);
  const anchor = await anchorYm(ctx.ds, null);
  const resolve = an.makeDistrictResolver(lk);

  const [edgePage, profilePage] = await Promise.all([
    ctx.ds.queryPaged({
      table: 'NetworkEdge', columns: ['PersonKeyA', 'PersonKeyB', 'Weight', 'CaseIDsJson'],
      orderBy: { col: 'PersonKeyA', tieBreak: 'PersonKeyB' }
    }, { maxRows: maxEdges }),
    ctx.ds.queryPaged({
      table: 'OffenderProfile',
      columns: ['PersonKey', 'CanonicalName', 'CaseCount', 'RiskScore', 'MOTagsJson', 'DistrictsJson', 'FirstSeen', 'LastSeen'],
      orderBy: { col: 'RiskScore', desc: true }
    }, { maxRows: 2400 })
  ]);

  const casesByPerson = new Map();
  const pairs = [];
  for (const e of edgePage.rows) {
    const a = String(e.PersonKeyA);
    const b = String(e.PersonKeyB);
    const ids = an.uniq(parseJsonSafe(e.CaseIDsJson, []).map(String));
    for (const k of [a, b]) {
      if (!casesByPerson.has(k)) casesByPerson.set(k, new Set());
      for (const id of ids) casesByPerson.get(k).add(id);
    }
    pairs.push({ a, b, weight: toNum(e.Weight, 1), caseIds: ids });
  }

  // Admission in risk order, whole careers only, until the case budget is spent.
  // Careers past `maxCareer` edge-visible cases are identity-resolution
  // over-merges (docs/benchmarks/identity_sweep.json: precision 0.03 at the
  // deployed threshold, one "person" carrying 200+ FIRs); admitting them would
  // spend the whole budget on a handful of names that are not one offender.
  const maxCareer = Math.max(10, Math.min(1000, toNum(o.maxCareer, 60)));
  const admitted = [];
  const wanted = new Set();
  let skippedForBudget = 0;
  let skippedOversize = 0;
  for (const p of profilePage.rows) {
    const key = String(p.PersonKey);
    const ids = casesByPerson.get(key);
    if (!ids || !ids.size) continue;
    if (ids.size > maxCareer) { skippedOversize += 1; continue; }
    const fresh = [...ids].filter((id) => !wanted.has(id));
    if (wanted.size + fresh.length > maxCases) { skippedForBudget += 1; continue; }
    for (const id of fresh) wanted.add(id);
    admitted.push({ key, profile: p, ids: [...ids] });
  }

  const caseRows = wanted.size ? await fetchCases(ctx, [...wanted]) : [];
  const caseIndex = new Map();
  for (const r of caseRows) {
    const day = parseDay(r.CrimeRegisteredDate);
    if (day === null) continue;
    const unit = lk.unitById.get(String(r.PoliceStationID));
    const districtId = unit ? an.districtKey(unit.districtId) : null;
    const lat = toNum(r.latitude, null);
    const lng = toNum(r.longitude, null);
    caseIndex.set(String(r.CaseMasterID), {
      id: String(r.CaseMasterID),
      day,
      date: String(r.CrimeRegisteredDate).slice(0, 10),
      unitId: String(r.PoliceStationID),
      districtId,
      headId: toNum(r.CrimeMajorHeadID),
      subHeadId: toNum(r.CrimeMinorHeadID),
      gravity: gravityOf(r.CrimeMinorHeadID, r.CrimeMajorHeadID),
      heinous: toNum(r.GravityOffenceID) === 1,
      lat: lat === null ? null : round(lat, 5),
      lng: lng === null ? null : round(lng, 5)
    });
  }

  const persons = [];
  for (const a of admitted) {
    const cases = a.ids.map((id) => caseIndex.get(id)).filter(Boolean)
      .sort((x, y) => x.day - y.day || x.id.localeCompare(y.id));
    if (!cases.length) continue;
    const p = a.profile;
    persons.push({
      key: a.key,
      name: p.CanonicalName || a.key,
      riskScore: round(toNum(p.RiskScore), 1),
      caseCount: toNum(p.CaseCount),
      moTags: an.uniq(parseJsonSafe(p.MOTagsJson, []).map(String)).slice(0, 8),
      districts: an.uniq(parseJsonSafe(p.DistrictsJson, []).map((d) => resolve(d)).filter(Boolean).map(an.districtKey)),
      firstSeen: p.FirstSeen || null,
      lastSeen: p.LastSeen || null,
      cases
    });
  }
  const admittedKeys = new Set(persons.map((p) => p.key));
  const keptPairs = pairs.filter((e) => admittedKeys.has(e.a) && admittedKeys.has(e.b));

  return {
    anchorYm: anchor,
    persons,
    pairs: keptPairs,
    scan: {
      edgeRows: edgePage.rows.length,
      edgePages: edgePage.pages,
      edgesTruncated: edgePage.truncated,
      profilesScanned: profilePage.rows.length,
      profilesTruncated: profilePage.truncated,
      personsWithEdges: casesByPerson.size,
      personsAdmitted: persons.length,
      personsSkippedForBudget: skippedForBudget,
      personsSkippedOversize: skippedOversize,
      casesRequested: wanted.size,
      casesResolved: caseIndex.size,
      pairsKept: keptPairs.length,
      maxEdges,
      maxCases,
      maxCareer
    }
  };
}

/** Cached corpus (per container, 15 min). `bypass` re-walks the store. */
async function getCorpus(ctx, opts, bypass) {
  const o = opts || {};
  const key = `v1:depth:corpus?maxCases=${toNum(o.maxCases, 2400)}&maxEdges=${toNum(o.maxEdges, 9000)}`;
  const { value, cached } = await ctx.cache.wrap(key, CORPUS_TTL_SEC, Boolean(bypass), () => buildCorpus(ctx, o));
  return { corpus: value, cached };
}

/** Case index (id → case) across every admitted person, for pair look-ups. */
function caseIndexOf(corpus) {
  const idx = new Map();
  for (const p of corpus.persons) for (const c of p.cases) idx.set(c.id, c);
  return idx;
}

module.exports = { buildCorpus, getCorpus, caseIndexOf, CORPUS_TTL_SEC, CASE_CHUNK };
