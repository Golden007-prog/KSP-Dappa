'use strict';
// Link-analysis endpoints computed server-side over the real store, because
// shipping the rows they need to the browser is not an option: Victim alone is
// 53,836 rows and NetworkEdge 23,833. Everything here reads through paged ZCQL
// (never a single unbounded SELECT), caches the expensive aggregate, and
// reports how far it actually scanned so a bounded answer can never read as a
// complete one.
//
//   GET /network/victim-links      victim <-> case <-> suspect adjacency
//   GET /network/locations         recurring-location entities + affiliation
//   GET /network/communities/score organised-crime scoring per CommunityID
//
// Registered ahead of routes/insight so /network/... never falls into a param
// route, and after routes/extras so /network/communities keeps its own handler.

const { ok, fail, asyncH, commonFilters, pagination, nocache, ttlFor } = require('../envelope');
const { getLookups } = require('../lookups');
const { anchorYm } = require('./read');
const { toNum, round, ymAdd, parseJsonSafe } = require('../util');
const an = require('../analytics');

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

/** from/to arrive as free text; a malformed one must 400 rather than quietly
 * widening the window to everything. */
function badDate(filters) {
  for (const [k, v] of [['from', filters.from], ['to', filters.to]]) {
    if (v && !DATE_RE.test(String(v))) return `${k} must be YYYY-MM or YYYY-MM-DD.`;
  }
  return null;
}

function intParam(raw, dflt, min, max) {
  const n = toNum(raw, dflt);
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : dflt)));
}

/** Cache key that deliberately drops page/perPage: the heavy aggregate is
 * computed once for a scope and then sliced per page. */
function scopeCacheKey(prefix, parts) {
  const q = Object.entries(parts)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `v1:${prefix}?${q}`;
}

/**
 * CaseMaster scope for a district / unit / crime-head / date selection.
 * Returns null when a district filter resolves to no stations — an empty unit
 * list must mean "no cases", never "drop the WHERE clause and return the whole
 * state", which is exactly the trap /cases fell into.
 */
async function caseScopeWhere(ctx, filters) {
  const where = [];
  if (filters.from) where.push({ col: 'CrimeRegisteredDate', op: '>=', val: filters.from });
  if (filters.to) where.push({ col: 'CrimeRegisteredDate', op: '<=', val: `${filters.to}${filters.to.length === 7 ? '-31' : ''}` });
  if (filters.unitId) {
    where.push({ col: 'PoliceStationID', op: '=', val: filters.unitId });
  } else if (filters.districtId) {
    const lk = await getLookups(ctx);
    const units = lk.unitsOfDistrict(filters.districtId).map((u) => u.unitId);
    if (!units.length) return null;
    where.push({ col: 'PoliceStationID', op: 'in', val: units });
  }
  if (filters.crimeSubHeadId) where.push({ col: 'CrimeMinorHeadID', op: '=', val: filters.crimeSubHeadId });
  else if (filters.crimeHeadId) where.push({ col: 'CrimeMajorHeadID', op: '=', val: filters.crimeHeadId });
  if (filters.gravityId) where.push({ col: 'GravityOffenceID', op: '=', val: filters.gravityId });
  return where;
}

// One chunk of case ids per round trip. 80 cases yields roughly 96 victim rows
// and 64 accused rows against the live ratios — comfortably inside one 300-row
// ZCQL page, so a chunk never needs a second query.
const CHILD_CHUNK = 80;
const CHILD_PAGE = 300;

/** Fetch child rows (Victim / Accused) for a set of case ids, chunked. */
async function fetchChildren(ctx, table, columns, caseIds) {
  const out = [];
  let truncated = false;
  for (const ids of an.chunk(caseIds, CHILD_CHUNK)) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await ctx.ds.query({
      table,
      columns: columns.concat(['CaseMasterID']),
      where: [{ col: 'CaseMasterID', op: 'in', val: ids }],
      limit: { count: CHILD_PAGE }
    }).catch(() => []);
    if (rows.length >= CHILD_PAGE) truncated = true;
    out.push(...rows);
  }
  return { rows: out, truncated };
}

// ---------------------------------------------------------------------------
// GET /network/victim-links
// ---------------------------------------------------------------------------

const VL_CASE_COLUMNS = ['CaseMasterID', 'CrimeNo', 'CrimeRegisteredDate', 'PoliceStationID',
  'CrimeMajorHeadID', 'CrimeMinorHeadID', 'GravityOffenceID'];

/** Build the whole adjacency for a scope. Returns page-independent data; the
 * route slices `caseRows` for the requested page. */
async function buildVictimLinks(ctx, filters, budget) {
  const lk = await getLookups(ctx);
  const where = await caseScopeWhere(ctx, filters);
  const empty = {
    cases: [], victims: [], suspects: [], links: [], topSuspects: [], topVictims: [], bridgeCases: [],
    summary: emptySummary(),
    scan: { casesScanned: 0, casePages: 0, casesTruncated: false, victimRows: 0, suspectRows: 0, childTruncated: false, budget }
  };
  if (where === null) return empty;

  const casePage = await ctx.ds.queryPaged({
    table: 'CaseMaster', columns: VL_CASE_COLUMNS, where,
    orderBy: { col: 'CrimeRegisteredDate', desc: true }
  }, { maxRows: budget });
  const caseRows = casePage.rows;
  if (!caseRows.length) {
    return Object.assign({}, empty, {
      scan: { casesScanned: 0, casePages: casePage.pages, casesTruncated: casePage.truncated, victimRows: 0, suspectRows: 0, childTruncated: false, budget }
    });
  }

  const caseIds = caseRows.map((r) => String(r.CaseMasterID));
  const [victimPage, accusedPage] = await Promise.all([
    fetchChildren(ctx, 'Victim', ['VictimMasterID', 'VictimName', 'AgeYear', 'GenderID'], caseIds),
    fetchChildren(ctx, 'Accused', ['AccusedMasterID', 'AccusedName', 'AgeYear', 'GenderID', 'PersonID'], caseIds)
  ]);

  const caseById = new Map();
  for (const r of caseRows) {
    const unit = lk.unitById.get(String(r.PoliceStationID));
    caseById.set(String(r.CaseMasterID), {
      id: `case:${r.CaseMasterID}`,
      caseMasterId: String(r.CaseMasterID),
      crimeNo: r.CrimeNo === undefined ? null : String(r.CrimeNo),
      registeredDate: r.CrimeRegisteredDate || null,
      unitId: r.PoliceStationID === undefined || r.PoliceStationID === null ? null : String(r.PoliceStationID),
      unitName: unit ? unit.unitName : (r.PoliceStationID === undefined ? null : String(r.PoliceStationID)),
      districtId: unit ? unit.districtId : null,
      districtName: unit ? lk.districtName(unit.districtId) : null,
      headName: lk.headName(r.CrimeMajorHeadID),
      subHeadName: lk.subHeadName(r.CrimeMinorHeadID),
      gravityName: lk.gravityName(r.GravityOffenceID),
      victimKeys: [],
      suspectKeys: []
    });
  }

  // Victims and suspects are identified by NAME, not by row id: VictimMasterID
  // is per-row and Accused.PersonID is a per-case sequence ('A1'), so keying on
  // either would make every repeat appearance look like a new person.
  const victims = new Map();
  for (const r of victimPage.rows) {
    const c = caseById.get(String(r.CaseMasterID));
    if (!c) continue;
    const key = an.nameKey(r.VictimName);
    if (!key) continue;
    const id = `victim:${key}`;
    if (!victims.has(id)) {
      victims.set(id, {
        id, type: 'victim', key, name: r.VictimName || null,
        age: toNum(r.AgeYear, null), genderId: r.GenderID === undefined ? null : toNum(r.GenderID, null),
        caseIds: [], districts: new Set(), victimIds: []
      });
    }
    const v = victims.get(id);
    if (!v.caseIds.includes(c.caseMasterId)) v.caseIds.push(c.caseMasterId);
    if (r.VictimMasterID !== undefined) v.victimIds.push(String(r.VictimMasterID));
    if (c.districtId) v.districts.add(c.districtId);
    if (!c.victimKeys.includes(id)) c.victimKeys.push(id);
  }

  const suspects = new Map();
  for (const r of accusedPage.rows) {
    const c = caseById.get(String(r.CaseMasterID));
    if (!c) continue;
    const key = an.nameKey(r.AccusedName);
    if (!key) continue;
    const id = `suspect:${key}`;
    if (!suspects.has(id)) {
      suspects.set(id, {
        id, type: 'suspect', key, name: r.AccusedName || null,
        age: toNum(r.AgeYear, null), genderId: r.GenderID === undefined ? null : toNum(r.GenderID, null),
        caseIds: [], districts: new Set(), heads: new Set(), victimKeys: new Set()
      });
    }
    const s = suspects.get(id);
    if (!s.caseIds.includes(c.caseMasterId)) s.caseIds.push(c.caseMasterId);
    if (c.districtId) s.districts.add(c.districtId);
    if (c.headName) s.heads.add(c.headName);
    if (!c.suspectKeys.includes(id)) c.suspectKeys.push(id);
  }
  for (const c of caseById.values()) {
    for (const sid of c.suspectKeys) {
      const s = suspects.get(sid);
      for (const vid of c.victimKeys) s.victimKeys.add(vid);
    }
  }

  // Link list: victim -> case and case -> suspect. The victim/suspect pairing
  // is implicit through the case, which is exactly the adjacency an analyst
  // walks ("who else did this suspect's victims share a case with").
  const links = [];
  for (const c of caseById.values()) {
    for (const vid of c.victimKeys) links.push({ source: vid, target: c.id, type: 'victim-case', caseMasterId: c.caseMasterId });
    for (const sid of c.suspectKeys) links.push({ source: c.id, target: sid, type: 'case-suspect', caseMasterId: c.caseMasterId });
  }

  const nodeIds = [...caseById.values()].map((c) => c.id)
    .concat([...victims.keys()], [...suspects.keys()]);
  const compSizes = an.componentSizes(nodeIds, links.map((l) => [l.source, l.target]));

  const suspectList = [...suspects.values()].map((s) => ({
    suspectKey: s.key,
    name: s.name,
    caseCount: s.caseIds.length,
    victimCount: s.victimKeys.size,
    districtCount: s.districts.size,
    districtNames: [...s.districts].map((d) => lk.districtName(d)).sort(),
    headNames: [...s.heads].sort(),
    caseIds: s.caseIds.slice(0, 25)
  })).sort((a, b) => b.caseCount - a.caseCount || b.victimCount - a.victimCount
    || String(a.name).localeCompare(String(b.name)));

  const victimList = [...victims.values()].map((v) => ({
    victimKey: v.key,
    name: v.name,
    age: v.age,
    genderId: v.genderId,
    caseCount: v.caseIds.length,
    districtCount: v.districts.size,
    districtNames: [...v.districts].map((d) => lk.districtName(d)).sort(),
    caseIds: v.caseIds.slice(0, 25)
  })).sort((a, b) => b.caseCount - a.caseCount || String(a.name).localeCompare(String(b.name)));

  const topSuspects = suspectList.slice(0, 20);
  await attachOffenderProfiles(ctx, topSuspects);

  const bridgeCases = [...caseById.values()]
    .map((c) => ({
      caseMasterId: c.caseMasterId,
      crimeNo: c.crimeNo,
      registeredDate: c.registeredDate,
      unitName: c.unitName,
      districtName: c.districtName,
      subHeadName: c.subHeadName,
      victims: c.victimKeys.length,
      suspects: c.suspectKeys.length,
      degree: c.victimKeys.length + c.suspectKeys.length
    }))
    .filter((c) => c.degree > 0)
    .sort((a, b) => b.degree - a.degree || b.suspects - a.suspects
      || Number(a.caseMasterId) - Number(b.caseMasterId))
    .slice(0, 10);

  const victimLinks = links.filter((l) => l.type === 'victim-case').length;
  const suspectLinks = links.filter((l) => l.type === 'case-suspect').length;
  const cases = [...caseById.values()];
  const summary = {
    cases: cases.length,
    victims: victims.size,
    suspects: suspects.size,
    victimLinks,
    suspectLinks,
    victimSuspectPairs: cases.reduce((s, c) => s + c.victimKeys.length * c.suspectKeys.length, 0),
    casesWithVictims: cases.filter((c) => c.victimKeys.length > 0).length,
    casesWithSuspects: cases.filter((c) => c.suspectKeys.length > 0).length,
    casesWithBoth: cases.filter((c) => c.victimKeys.length > 0 && c.suspectKeys.length > 0).length,
    multiVictimCases: cases.filter((c) => c.victimKeys.length > 1).length,
    multiSuspectCases: cases.filter((c) => c.suspectKeys.length > 1).length,
    repeatVictims: victimList.filter((v) => v.caseCount > 1).length,
    repeatSuspects: suspectList.filter((s) => s.caseCount > 1).length,
    crossDistrictSuspects: suspectList.filter((s) => s.districtCount > 1).length,
    avgVictimsPerCase: round(victimLinks / Math.max(1, cases.length), 2),
    avgSuspectsPerCase: round(suspectLinks / Math.max(1, cases.length), 2),
    components: compSizes.length,
    largestComponent: compSizes.length ? compSizes[0] : 0
  };

  return {
    cases,
    victims: [...victims.values()].map((v) => ({
      id: v.id, type: 'victim', label: v.name, key: v.key,
      age: v.age, genderId: v.genderId, caseCount: v.caseIds.length
    })),
    suspects: [...suspects.values()].map((s) => ({
      id: s.id, type: 'suspect', label: s.name, key: s.key,
      age: s.age, genderId: s.genderId, caseCount: s.caseIds.length, victimCount: s.victimKeys.size
    })),
    links,
    topSuspects,
    topVictims: victimList.filter((v) => v.caseCount > 1).slice(0, 20),
    bridgeCases,
    summary,
    scan: {
      casesScanned: caseRows.length,
      casePages: casePage.pages,
      casesTruncated: casePage.truncated,
      victimRows: victimPage.rows.length,
      suspectRows: accusedPage.rows.length,
      childTruncated: victimPage.truncated || accusedPage.truncated,
      budget
    }
  };
}

function emptySummary() {
  return {
    cases: 0, victims: 0, suspects: 0, victimLinks: 0, suspectLinks: 0, victimSuspectPairs: 0,
    casesWithVictims: 0, casesWithSuspects: 0, casesWithBoth: 0,
    multiVictimCases: 0, multiSuspectCases: 0, repeatVictims: 0, repeatSuspects: 0,
    crossDistrictSuspects: 0, avgVictimsPerCase: 0, avgSuspectsPerCase: 0,
    components: 0, largestComponent: 0
  };
}

/** Resolve the loudest suspects to their OffenderProfile so a click from the
 * link graph lands on a real profile page. Best-effort: a miss just leaves the
 * personKey null rather than failing the request. */
async function attachOffenderProfiles(ctx, suspects) {
  const names = suspects.map((s) => s.name).filter(Boolean).slice(0, 20);
  if (!names.length) return;
  try {
    const rows = await ctx.ds.query({
      table: 'OffenderProfile',
      columns: ['PersonKey', 'CanonicalName', 'RiskScore', 'CaseCount', 'CommunityID'],
      where: [{ col: 'CanonicalName', op: 'in', val: names }],
      limit: { count: 200 }
    });
    const byName = new Map(rows.map((r) => [an.nameKey(r.CanonicalName), r]));
    for (const s of suspects) {
      const hit = byName.get(s.suspectKey);
      s.personKey = hit ? String(hit.PersonKey) : null;
      s.riskScore = hit ? round(toNum(hit.RiskScore), 1) : null;
      s.profileCaseCount = hit ? toNum(hit.CaseCount) : null;
      s.communityId = hit && hit.CommunityID !== undefined && hit.CommunityID !== null && hit.CommunityID !== ''
        ? toNum(hit.CommunityID) : null;
    }
  } catch (e) {
    for (const s of suspects) {
      s.personKey = null;
      s.riskScore = null;
      s.profileCaseCount = null;
      s.communityId = null;
    }
  }
}

// ---------------------------------------------------------------------------
// GET /network/locations
// ---------------------------------------------------------------------------

/** Per-district offender roll-up: who operates there, which communities are
 * present, how much risk they carry. Feeds every location's affiliation. */
function districtAffiliation(profiles, resolve) {
  const byDistrict = new Map();
  for (const p of profiles) {
    const districts = an.uniq(parseJsonSafe(p.DistrictsJson, []).map((d) => resolve(d)).filter(Boolean));
    const cid = p.CommunityID === undefined || p.CommunityID === null || p.CommunityID === '' ? null : String(p.CommunityID);
    for (const d of districts) {
      if (!byDistrict.has(d)) byDistrict.set(d, { offenders: 0, riskSum: 0, communities: new Map(), top: [] });
      const e = byDistrict.get(d);
      e.offenders += 1;
      e.riskSum += toNum(p.RiskScore);
      if (cid !== null) e.communities.set(cid, (e.communities.get(cid) || 0) + 1);
      e.top.push({
        personKey: String(p.PersonKey),
        name: p.CanonicalName || String(p.PersonKey),
        riskScore: round(toNum(p.RiskScore), 1),
        communityId: cid === null ? null : toNum(cid)
      });
    }
  }
  for (const e of byDistrict.values()) {
    e.top.sort((a, b) => b.riskScore - a.riskScore || String(a.personKey).localeCompare(String(b.personKey)));
    e.top = e.top.slice(0, 5);
  }
  return byDistrict;
}

/**
 * Per-unit AggMonthly roll-up. The rich form asks for SUM + MIN/MAX in one
 * grouped select; not every store answers a mixed-aggregate select, so a
 * failure (or an empty answer) retries with the SUM-only form that
 * /summary/kpis already proves works. Losing MIN/MAX only costs the
 * persistence driver its precision — never the whole endpoint.
 */
async function unitAggregate(ctx, where) {
  const paged = (columns) => ctx.ds.queryAll({
    table: 'AggMonthly', columns, where, groupBy: ['UnitID'], orderBy: { col: 'UnitID' }
  }, { maxRows: 1500 });
  try {
    const rich = await paged(['UnitID', 'SUM(CaseCount)', 'SUM(HeinousCount)', 'MIN(Ym)', 'MAX(Ym)']);
    if (rich.length) return { rows: rich, mode: 'with-span' };
  } catch (e) {
    // fall through to the plain form
  }
  try {
    return { rows: await paged(['UnitID', 'SUM(CaseCount)', 'SUM(HeinousCount)']), mode: 'sum-only' };
  } catch (e) {
    return { rows: [], mode: 'unavailable' };
  }
}

/** A missing coordinate stays null: 0,0 is the Gulf of Guinea, not a station. */
function coord(row, col) {
  if (!row) return null;
  const v = toNum(row[col], null);
  return v === null ? null : round(v, 5);
}

function communityView(map) {
  const total = [...map.values()].reduce((s, n) => s + n, 0);
  const top = [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 5)
    .map(([communityId, offenders]) => ({
      communityId: toNum(communityId),
      offenders,
      sharePct: total ? round((offenders / total) * 100, 1) : 0
    }));
  return { distinct: map.size, top };
}

// ---------------------------------------------------------------------------
// GET /network/communities/score
// ---------------------------------------------------------------------------

const SCORE_WEIGHTS = {
  size: 0.20,
  cohesion: 0.20,
  reach: 0.15,
  moConcentration: 0.15,
  recency: 0.15,
  repeatShare: 0.15
};

/** Edge counts per community, exactly. Grouping in ZCQL beats paging 23,833
 * rows into the function just to count them; the paged scan stays as the
 * fallback for a store that rejects the grouped select. */
async function communityEdgeCounts(ctx) {
  try {
    const rows = await ctx.ds.queryAll({
      table: 'NetworkEdge', columns: ['CommunityID', 'COUNT(PersonKeyA)', 'SUM(Weight)'],
      groupBy: ['CommunityID'], orderBy: { col: 'CommunityID' }
    }, { maxRows: 900 });
    if (!rows.length) throw new Error('no grouped edge rows');
    const byCommunity = new Map();
    for (const r of rows) {
      const cid = r.CommunityID === undefined || r.CommunityID === null || r.CommunityID === '' ? null : String(toNum(r.CommunityID));
      if (cid === null) continue;
      byCommunity.set(cid, { edges: toNum(r['COUNT(PersonKeyA)']), weight: toNum(r['SUM(Weight)']) });
    }
    return { byCommunity, mode: 'grouped', truncated: false, scanned: rows.length };
  } catch (e) {
    const page = await ctx.ds.queryPaged({
      table: 'NetworkEdge', columns: ['PersonKeyA', 'Weight', 'CommunityID'], orderBy: { col: 'PersonKeyA' }
    }, { maxRows: 6000 });
    const byCommunity = new Map();
    for (const r of page.rows) {
      const cid = r.CommunityID === undefined || r.CommunityID === null || r.CommunityID === '' ? null : String(toNum(r.CommunityID));
      if (cid === null) continue;
      if (!byCommunity.has(cid)) byCommunity.set(cid, { edges: 0, weight: 0 });
      const e = byCommunity.get(cid);
      e.edges += 1;
      e.weight += toNum(r.Weight, 1);
    }
    return { byCommunity, mode: 'scan', truncated: page.truncated, scanned: page.rows.length };
  }
}

function register(router) {
  // -------------------------------------------------------------------------
  // Victim <-> case <-> suspect adjacency for a selection.
  // -------------------------------------------------------------------------
  router.get('/network/victim-links', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const dateErr = badDate(filters);
    if (dateErr) return fail(res, 400, 'BAD_REQUEST', dateErr);
    const budget = intParam(req.query.sample, 400, 50, 1200);
    const { page, perPage, offset } = pagination(req);
    const ttl = ttlFor(req, 600);
    const key = scopeCacheKey('network:victim-links', {
      districtId: filters.districtId, unitId: filters.unitId,
      crimeHeadId: filters.crimeHeadId, crimeSubHeadId: filters.crimeSubHeadId,
      gravityId: filters.gravityId, from: filters.from, to: filters.to, sample: budget
    });
    const { value, cached } = await ctx.cache.wrap(key, ttl, nocache(req), () => buildVictimLinks(ctx, filters, budget));

    // The page slices the CASE list; nodes/links come back scoped to that page
    // so a client can stream the graph in without ever holding all of it.
    const pageCases = value.cases.slice(offset, offset + perPage);
    const pageCaseIds = new Set(pageCases.map((c) => c.id));
    const pageLinks = value.links.filter((l) => pageCaseIds.has(l.source) || pageCaseIds.has(l.target));
    const keep = new Set();
    for (const l of pageLinks) { keep.add(l.source); keep.add(l.target); }
    const nodes = pageCases
      .map((c) => ({
        id: c.id, type: 'case', label: c.crimeNo || c.caseMasterId, caseMasterId: c.caseMasterId,
        registeredDate: c.registeredDate, unitName: c.unitName, districtName: c.districtName,
        headName: c.headName, subHeadName: c.subHeadName, gravityName: c.gravityName,
        victims: c.victimKeys.length, suspects: c.suspectKeys.length
      }))
      .concat(value.victims.filter((v) => keep.has(v.id)))
      .concat(value.suspects.filter((s) => keep.has(s.id)));

    ok(res, {
      scope: {
        districtId: filters.districtId || null,
        unitId: filters.unitId || null,
        crimeHeadId: filters.crimeHeadId || null,
        crimeSubHeadId: filters.crimeSubHeadId || null,
        from: filters.from || null,
        to: filters.to || null,
        sample: budget
      },
      summary: value.summary,
      nodes,
      links: pageLinks,
      topSuspects: value.topSuspects,
      topVictims: value.topVictims,
      bridgeCases: value.bridgeCases,
      scan: value.scan
    }, {
      cached, ttlSec: ttl, page, perPage,
      total: value.summary.cases,
      nodeCount: nodes.length,
      linkCount: pageLinks.length
    });
  }));

  // -------------------------------------------------------------------------
  // Recurring-location entities: stations and hotspot clusters, each carrying
  // how strongly the offender network is affiliated with it and how many
  // distinct communities show up there.
  // -------------------------------------------------------------------------
  router.get('/network/locations', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const dateErr = badDate(filters);
    if (dateErr) return fail(res, 400, 'BAD_REQUEST', dateErr);
    const type = ['all', 'unit', 'hotspot'].includes(String(req.query.type || 'all')) ? String(req.query.type || 'all') : 'all';
    const minCases = intParam(req.query.minCases, 1, 0, 100000);
    const { page, perPage, offset } = pagination(req);
    const ttl = ttlFor(req, 900);
    const key = scopeCacheKey('network:locations', {
      districtId: filters.districtId, crimeHeadId: filters.crimeHeadId,
      crimeSubHeadId: filters.crimeSubHeadId, from: filters.from, to: filters.to, type, minCases
    });

    const { value, cached } = await ctx.cache.wrap(key, ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const resolve = an.makeDistrictResolver(lk);
      const anchor = await anchorYm(ctx.ds, null);
      const toYm = filters.to ? String(filters.to).slice(0, 7) : anchor;
      const fromYm = filters.from ? String(filters.from).slice(0, 7) : ymAdd(toYm, -11);
      const windowMonths = Math.max(1, (an.ymDiff(fromYm, toYm) || 0) + 1);

      // A caller may send the padded district form ('0101') while the fact
      // tables hold the bare one ('101') or vice versa; resolving through the
      // District master first is what stops the filter matching nothing and
      // quietly answering for the whole state.
      const wantDistrict = filters.districtId ? (resolve(filters.districtId) || String(filters.districtId)) : null;
      const aggWhere = [{ col: 'Ym', op: '>=', val: fromYm }, { col: 'Ym', op: '<=', val: toYm }];
      if (wantDistrict) aggWhere.push({ col: 'DistrictID', op: '=', val: wantDistrict });
      if (filters.crimeSubHeadId) aggWhere.push({ col: 'CrimeSubHeadID', op: '=', val: filters.crimeSubHeadId });
      else if (filters.crimeHeadId) aggWhere.push({ col: 'CrimeHeadID', op: '=', val: filters.crimeHeadId });

      // 359 stations is past one ZCQL page, so every grouped read below pages.
      const [unitAggResult, districtAgg, riskRows, profilePage, hotspots, centroids] = await Promise.all([
        unitAggregate(ctx, aggWhere),
        ctx.ds.queryAll({
          table: 'AggMonthly', columns: ['DistrictID', 'SUM(CaseCount)'],
          where: aggWhere, groupBy: ['DistrictID'], orderBy: { col: 'DistrictID' }
        }, { maxRows: 300 }).catch(() => []),
        ctx.ds.queryAll({
          table: 'StationRisk', columns: ['UnitID', 'RiskScore', 'DriversJson'],
          orderBy: { col: 'RiskScore', desc: true }
        }, { maxRows: 1500 }).catch(() => []),
        ctx.ds.queryPaged({
          table: 'OffenderProfile',
          columns: ['PersonKey', 'CanonicalName', 'DistrictsJson', 'CommunityID', 'RiskScore', 'CaseCount'],
          orderBy: { col: 'RiskScore', desc: true }
        }, { maxRows: 2400 }),
        ctx.ds.queryAll({
          table: 'HotspotCluster',
          columns: ['ClusterID', 'CrimeHeadID', 'CentroidLat', 'CentroidLng', 'RadiusM', 'CaseCount',
            'HourBandStart', 'HourBandEnd', 'WindowStart', 'WindowEnd', 'Intensity', 'Label', 'DistrictID'],
          orderBy: { col: 'Intensity', desc: true }
        }, { maxRows: 600 }).catch(() => []),
        // Station coordinates are the mean of their cases' points — the same
        // source /geo/stations uses, so a location pin lands where the station
        // marker already is. Unfiltered on purpose: a centroid does not move
        // with the reporting window, and this way the 359 groups are read once.
        ctx.ds.queryAll({
          table: 'CaseMaster', columns: ['PoliceStationID', 'AVG(latitude)', 'AVG(longitude)'],
          groupBy: ['PoliceStationID'], orderBy: { col: 'PoliceStationID' }
        }, { maxRows: 1500 }).catch(() => [])
      ]);

      const unitAgg = unitAggResult.rows;
      const centroidByUnit = new Map(centroids.map((r) => [String(r.PoliceStationID), r]));
      const byDistrict = districtAffiliation(profilePage.rows, resolve);
      const maxDistrictOffenders = Math.max(1, ...[...byDistrict.values()].map((e) => e.offenders));
      const districtCases = new Map();
      for (const r of districtAgg) {
        const d = resolve(r.DistrictID) || String(r.DistrictID);
        districtCases.set(d, (districtCases.get(d) || 0) + toNum(r['SUM(CaseCount)']));
      }
      const riskByUnit = new Map(riskRows.map((r) => [String(r.UnitID), r]));

      const unitLocations = [];
      for (const r of unitAgg) {
        const unitId = String(r.UnitID);
        const unit = lk.unitById.get(unitId);
        const districtId = unit ? (resolve(unit.districtId) || String(unit.districtId)) : null;
        const caseCount = toNum(r['SUM(CaseCount)']);
        if (caseCount < minCases) continue;
        if (wantDistrict && districtId && districtId !== wantDistrict) continue;
        const aff = districtId ? byDistrict.get(districtId) : null;
        const dCases = districtId ? (districtCases.get(districtId) || 0) : 0;
        const unitShare = dCases > 0 ? Math.min(1, caseCount / dCases) : 0;
        const offenders = aff ? aff.offenders : 0;
        const risk = riskByUnit.get(unitId);
        const centroid = centroidByUnit.get(unitId);
        // Without MIN/MAX(Ym) the active span is unknown; assume the full
        // window rather than claiming a single month the data never said.
        const spanMonths = an.ymOfDate(r['MIN(Ym)']) === null && !/^\d{4}-\d{2}$/.test(String(r['MIN(Ym)'] || ''))
          ? windowMonths
          : (an.ymDiff(r['MIN(Ym)'], r['MAX(Ym)']) || 0) + 1;
        unitLocations.push({
          locationId: `unit:${unitId}`,
          locationType: 'unit',
          name: unit ? unit.unitName : `Unit ${unitId}`,
          unitId,
          districtId,
          districtName: districtId ? lk.districtName(districtId) : null,
          lat: coord(centroid, 'AVG(latitude)'),
          lng: coord(centroid, 'AVG(longitude)'),
          caseCount,
          heinousCount: toNum(r['SUM(HeinousCount)']),
          firstYm: r['MIN(Ym)'] || null,
          lastYm: r['MAX(Ym)'] || null,
          monthsActive: Math.max(0, Math.min(windowMonths, spanMonths)),
          persistencePct: round((Math.max(0, Math.min(windowMonths, spanMonths)) / windowMonths) * 100, 1),
          riskScore: risk ? round(toNum(risk.RiskScore), 1) : null,
          riskDrivers: risk ? parseJsonSafe(risk.DriversJson, []) : [],
          offenderAffiliation: {
            offenders,
            basis: 'district',
            unitCaseSharePct: round(unitShare * 100, 1),
            strength: round(100 * unitShare * (offenders / maxDistrictOffenders), 1),
            topOffenders: aff ? aff.top : []
          },
          communities: aff ? communityView(aff.communities) : { distinct: 0, top: [] }
        });
      }

      const hotspotLocations = [];
      for (const h of hotspots) {
        const districtId = resolve(h.DistrictID) || String(h.DistrictID);
        const caseCount = toNum(h.CaseCount);
        if (caseCount < minCases) continue;
        if (wantDistrict && districtId !== wantDistrict) continue;
        if (filters.crimeHeadId && toNum(h.CrimeHeadID) !== filters.crimeHeadId) continue;
        const aff = byDistrict.get(districtId);
        const offenders = aff ? aff.offenders : 0;
        const spanMonths = (an.ymDiff(an.ymOfDate(h.WindowStart), an.ymOfDate(h.WindowEnd)) || 0) + 1;
        hotspotLocations.push({
          locationId: `hotspot:${h.ClusterID}`,
          locationType: 'hotspot',
          name: h.Label || String(h.ClusterID),
          clusterId: String(h.ClusterID),
          districtId,
          districtName: lk.districtName(districtId),
          lat: toNum(h.CentroidLat, null),
          lng: toNum(h.CentroidLng, null),
          radiusM: toNum(h.RadiusM, null),
          crimeHeadId: toNum(h.CrimeHeadID),
          headName: lk.headName(h.CrimeHeadID),
          hourBandStart: toNum(h.HourBandStart, null),
          hourBandEnd: toNum(h.HourBandEnd, null),
          caseCount,
          intensity: round(toNum(h.Intensity), 1),
          firstYm: an.ymOfDate(h.WindowStart),
          lastYm: an.ymOfDate(h.WindowEnd),
          monthsActive: Math.max(0, spanMonths),
          persistencePct: round((Math.max(0, Math.min(windowMonths, spanMonths)) / windowMonths) * 100, 1),
          offenderAffiliation: {
            offenders,
            basis: 'district',
            unitCaseSharePct: null,
            strength: round(100 * (offenders / maxDistrictOffenders), 1),
            topOffenders: aff ? aff.top : []
          },
          communities: aff ? communityView(aff.communities) : { distinct: 0, top: [] }
        });
      }

      const pool = type === 'unit' ? unitLocations : type === 'hotspot' ? hotspotLocations
        : unitLocations.concat(hotspotLocations);
      const maxCases = Math.max(1, ...pool.map((l) => l.caseCount));
      const maxCommunities = Math.max(1, ...pool.map((l) => l.communities.distinct));
      for (const l of pool) {
        const scored = an.weightedScore([
          { key: 'volume', label: 'Case volume at the location', value: l.caseCount, unit: 'cases', normalized: an.scale100(l.caseCount, 0, maxCases), weight: 0.40 },
          { key: 'affiliation', label: 'Offender-network affiliation', value: l.offenderAffiliation.strength, unit: 'index', normalized: l.offenderAffiliation.strength, weight: 0.30 },
          { key: 'coLocation', label: 'Distinct communities co-located', value: l.communities.distinct, unit: 'communities', normalized: an.scale100(l.communities.distinct, 0, maxCommunities), weight: 0.15 },
          { key: 'persistence', label: 'Months active in the window', value: l.monthsActive, unit: 'months', normalized: l.persistencePct, weight: 0.15 }
        ]);
        l.recurrenceScore = scored.score;
        l.band = an.band(scored.score);
        l.drivers = scored.drivers;
        l.crossCommunity = l.communities.distinct > 1;
      }
      pool.sort((a, b) => b.recurrenceScore - a.recurrenceScore || b.caseCount - a.caseCount
        || String(a.locationId).localeCompare(String(b.locationId)));

      return {
        window: { fromYm, toYm, months: windowMonths },
        method: 'recurrenceScore = 0.40·case volume + 0.30·offender affiliation + 0.15·co-located communities + 0.15·persistence. Affiliation is district-level: OffenderProfile records the districts a person operates in, not the station, so a unit inherits its district affiliation scaled by the unit\'s share of that district\'s cases.',
        locations: pool,
        summary: {
          locations: pool.length,
          units: pool.filter((l) => l.locationType === 'unit').length,
          hotspots: pool.filter((l) => l.locationType === 'hotspot').length,
          crossCommunity: pool.filter((l) => l.crossCommunity).length,
          districtsCovered: an.uniq(pool.map((l) => l.districtId).filter(Boolean)).length,
          offendersMapped: profilePage.rows.length
        },
        scan: {
          unitGroups: unitAgg.length,
          unitAggMode: unitAggResult.mode,
          districtGroups: districtAgg.length,
          stationRiskRows: riskRows.length,
          profilesScanned: profilePage.rows.length,
          profilePages: profilePage.pages,
          profilesTruncated: profilePage.truncated,
          hotspotRows: hotspots.length
        }
      };
    });

    const slice = value.locations.slice(offset, offset + perPage);
    ok(res, {
      window: value.window,
      method: value.method,
      locations: slice,
      summary: value.summary,
      scan: value.scan
    }, { cached, ttlSec: ttl, page, perPage, total: value.locations.length, count: slice.length, type });
  }));

  // -------------------------------------------------------------------------
  // Organised-crime scoring per CommunityID, with the driver breakdown behind
  // each score so a commander can see WHY a community ranks where it does.
  // -------------------------------------------------------------------------
  router.get('/network/communities/score', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const minSize = intParam(req.query.minSize, 1, 1, 5000);
    const { page, perPage, offset } = pagination(req);
    const ttl = ttlFor(req, 900);
    const key = scopeCacheKey('network:communities:score', { minSize });

    const { value, cached } = await ctx.cache.wrap(key, ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const resolve = an.makeDistrictResolver(lk);
      const anchor = await anchorYm(ctx.ds, null);
      const [profilePage, edgeInfo] = await Promise.all([
        ctx.ds.queryPaged({
          table: 'OffenderProfile',
          columns: ['PersonKey', 'CanonicalName', 'CaseCount', 'RiskScore', 'CommunityID', 'DistrictsJson',
            'MOTagsJson', 'FirstSeen', 'LastSeen', 'DegreeCentrality'],
          orderBy: { col: 'RiskScore', desc: true }
        }, { maxRows: 2400 }),
        communityEdgeCounts(ctx)
      ]);

      const comms = new Map();
      let unassigned = 0;
      for (const p of profilePage.rows) {
        if (p.CommunityID === undefined || p.CommunityID === null || p.CommunityID === '') { unassigned += 1; continue; }
        const cid = String(toNum(p.CommunityID));
        if (!comms.has(cid)) {
          comms.set(cid, {
            members: [], districts: new Map(), moCounts: new Map(), lastYms: [], totalCases: 0, repeat: 0
          });
        }
        const c = comms.get(cid);
        const lastYm = an.ymOfDate(p.LastSeen);
        const cases = toNum(p.CaseCount);
        c.members.push({
          personKey: String(p.PersonKey),
          name: p.CanonicalName || String(p.PersonKey),
          caseCount: cases,
          riskScore: round(toNum(p.RiskScore), 1),
          degree: round(toNum(p.DegreeCentrality), 4),
          lastSeen: p.LastSeen || null
        });
        c.totalCases += cases;
        if (cases >= 3) c.repeat += 1;
        if (lastYm) c.lastYms.push(lastYm);
        for (const d of an.uniq(parseJsonSafe(p.DistrictsJson, []).map((x) => resolve(x)).filter(Boolean))) {
          c.districts.set(d, (c.districts.get(d) || 0) + 1);
        }
        for (const t of an.uniq(parseJsonSafe(p.MOTagsJson, []))) c.moCounts.set(t, (c.moCounts.get(t) || 0) + 1);
      }

      const rows = [];
      for (const [cid, c] of comms) {
        const size = c.members.length;
        if (size < minSize) continue;
        const edge = edgeInfo.byCommunity.get(cid) || { edges: 0, weight: 0 };
        const possible = size > 1 ? (size * (size - 1)) / 2 : 0;
        const density = possible > 0 ? Math.min(1, edge.edges / possible) : 0;
        const lastYm = c.lastYms.length ? c.lastYms.slice().sort()[c.lastYms.length - 1] : null;
        const monthsSinceActive = lastYm === null ? null : Math.max(0, an.ymDiff(lastYm, anchor) || 0);
        const districts = [...c.districts.entries()]
          .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
        const moTags = [...c.moCounts.entries()]
          .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
        const moConc = an.concentration(moTags.map(([, n]) => n));
        const repeatShare = size ? c.repeat / size : 0;
        const ranked = c.members.slice().sort((a, b) => b.riskScore - a.riskScore
          || String(a.personKey).localeCompare(String(b.personKey)));
        rows.push({
          communityId: toNum(cid),
          memberCount: size,
          edgeCount: edge.edges,
          edgeWeight: edge.weight,
          density: round(density, 3),
          totalCases: c.totalCases,
          districtSpan: districts.length,
          districtBreakdown: districts.slice(0, 5).map(([districtId, offenders]) => ({
            districtId, districtName: lk.districtName(districtId), offenders
          })),
          topMoTags: moTags.slice(0, 5).map(([tag, offenders]) => ({ tag, offenders })),
          moConcentration: moConc,
          lastActiveYm: lastYm,
          monthsSinceActive,
          repeatOffenderShare: round(repeatShare, 3),
          avgRisk: round(ranked.reduce((s, m) => s + m.riskScore, 0) / Math.max(1, size), 1),
          maxRisk: ranked.length ? ranked[0].riskScore : 0,
          keyPerson: ranked[0] || null,
          topMembers: ranked.slice(0, 10)
        });
      }

      const maxSize = Math.max(1, ...rows.map((r) => r.memberCount));
      const totalDistricts = Math.max(1, (lk.districts || []).length);
      for (const r of rows) {
        const recencyNorm = r.monthsSinceActive === null ? 0 : an.clamp(100 - (r.monthsSinceActive / 12) * 100, 0, 100);
        const scored = an.weightedScore([
          { key: 'size', label: 'Members in the community', value: r.memberCount, unit: 'members', normalized: an.scale100(r.memberCount, 0, maxSize), weight: SCORE_WEIGHTS.size },
          { key: 'cohesion', label: 'Edge density between members', value: r.density, unit: 'ratio', normalized: r.density * 100, weight: SCORE_WEIGHTS.cohesion },
          { key: 'reach', label: 'Districts the community spans', value: r.districtSpan, unit: 'districts', normalized: an.scale100(r.districtSpan, 0, totalDistricts), weight: SCORE_WEIGHTS.reach },
          { key: 'moConcentration', label: 'How concentrated the shared MO is', value: r.moConcentration, unit: 'HHI', normalized: r.moConcentration * 100, weight: SCORE_WEIGHTS.moConcentration },
          { key: 'recency', label: 'How recently the community was active', value: r.monthsSinceActive, unit: 'months', normalized: recencyNorm, weight: SCORE_WEIGHTS.recency },
          { key: 'repeatShare', label: 'Share of members with 3+ cases', value: r.repeatOffenderShare, unit: 'ratio', normalized: r.repeatOffenderShare * 100, weight: SCORE_WEIGHTS.repeatShare }
        ]);
        r.score = scored.score;
        r.band = an.band(scored.score);
        r.drivers = scored.drivers;
      }
      rows.sort((a, b) => b.score - a.score || b.memberCount - a.memberCount || a.communityId - b.communityId);

      return {
        communities: rows,
        weights: SCORE_WEIGHTS,
        method: 'Each driver is normalised to 0-100 and combined with the published weights; the drivers array on every row carries the value, the normalised figure and the points it contributed, so the score is auditable rather than a black box.',
        population: {
          communities: comms.size,
          scored: rows.length,
          offenders: profilePage.rows.length,
          unassignedOffenders: unassigned,
          anchorYm: anchor
        },
        scan: {
          profilesScanned: profilePage.rows.length,
          profilePages: profilePage.pages,
          profilesTruncated: profilePage.truncated,
          edgeMode: edgeInfo.mode,
          edgeRowsScanned: edgeInfo.scanned,
          edgesTruncated: edgeInfo.truncated
        }
      };
    });

    const slice = value.communities.slice(offset, offset + perPage);
    ok(res, {
      communities: slice,
      weights: value.weights,
      method: value.method,
      population: value.population,
      scan: value.scan
    }, { cached, ttlSec: ttl, page, perPage, total: value.communities.length, count: slice.length, minSize });
  }));
}

module.exports = { register, buildVictimLinks, caseScopeWhere, SCORE_WEIGHTS };
