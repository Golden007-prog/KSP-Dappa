'use strict';
// Data Store full-text Search.
//
// Real path : ctx.services.search.execute({search, search_table_columns,
//             select_table_columns, start, end}) -> capp.search()
//             .executeSearchQuery(...). Results come back keyed by table.
// Flag      : FEATURE_SEARCH (on by default — a miss costs one failed round
//             trip and instantly degrades, so attempting it is what makes the
//             "Search is wired" claim in /meta/services true).
// Console   : the searched columns must be marked full-text searchable in the
//             Data Store console. Until then every call falls through.
// Fallback  : ZCQL LIKE over the same columns. ZCQL WHERE is AND-only, so an
//             OR across columns is several queries merged and deduped.

const { toNum } = require('./util');
const { getLookups } = require('./lookups');

const CASE_SEARCH_COLUMNS = ['BriefFacts', 'CrimeNo', 'CaseNo'];
// Catalyst Search only accepts columns carrying a console Search Index, and
// the console offers that toggle for Var Char only — Text columns (BriefFacts,
// AliasesJson, MOTagsJson) cannot be indexed. CrimeNo, CaseNo and CanonicalName
// were indexed on 28 Aug 2026; the LIKE fallback still covers the Text columns.
const CASE_INDEXED_COLUMNS = ['CrimeNo', 'CaseNo'];
const CASE_SELECT_COLUMNS = ['CaseMasterID', 'CrimeNo', 'CaseNo', 'CrimeRegisteredDate', 'PoliceStationID',
  'CrimeMajorHeadID', 'CrimeMinorHeadID', 'CaseStatusID', 'BriefFacts'];
const OFFENDER_SEARCH_COLUMNS = ['CanonicalName', 'AliasesJson', 'MOTagsJson'];
const OFFENDER_INDEXED_COLUMNS = ['CanonicalName'];
const OFFENDER_SELECT_COLUMNS = ['PersonKey', 'CanonicalName', 'AliasesJson', 'CaseCount', 'RiskScore', 'DistrictsJson'];

const SCOPES = ['all', 'cases', 'offenders'];

/** ±60 characters of context around the first match, for result lists. */
function snippet(text, q) {
  const s = String(text || '');
  if (!s) return null;
  const at = s.toLowerCase().indexOf(String(q || '').toLowerCase());
  if (at < 0) return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  const from = Math.max(0, at - 60);
  const to = Math.min(s.length, at + String(q).length + 60);
  return `${from > 0 ? '…' : ''}${s.slice(from, to)}${to < s.length ? '…' : ''}`;
}

function caseHit(r, lk, q) {
  const unit = lk.unitById.get(String(r.PoliceStationID));
  return {
    type: 'case',
    id: String(r.CaseMasterID),
    caseMasterId: r.CaseMasterID,
    title: r.CrimeNo ? `FIR ${r.CrimeNo}` : `Case ${r.CaseMasterID}`,
    registeredDate: r.CrimeRegisteredDate || null,
    unitName: unit ? unit.unitName : (r.PoliceStationID === undefined ? null : String(r.PoliceStationID)),
    districtName: unit ? lk.districtName(unit.districtId) : null,
    headName: r.CrimeMajorHeadID === undefined ? null : lk.headName(r.CrimeMajorHeadID),
    subHeadName: r.CrimeMinorHeadID === undefined ? null : lk.subHeadName(r.CrimeMinorHeadID),
    snippet: snippet(r.BriefFacts, q)
  };
}

function offenderHit(r, q) {
  return {
    type: 'offender',
    id: String(r.PersonKey),
    personKey: String(r.PersonKey),
    title: r.CanonicalName || String(r.PersonKey),
    caseCount: toNum(r.CaseCount),
    riskScore: toNum(r.RiskScore),
    snippet: snippet(r.AliasesJson || r.MOTagsJson, q)
  };
}

/** Merge rows keyed on `key`, first occurrence wins. */
function dedupe(rows, key) {
  const seen = new Map();
  for (const r of rows) {
    const k = String(r[key]);
    if (!seen.has(k)) seen.set(k, r);
  }
  return [...seen.values()];
}

async function likeSearch(ctx, q, scope, limit) {
  const perColumn = Math.max(10, Math.min(200, limit * 2));
  const jobs = [];
  if (scope === 'all' || scope === 'cases') {
    for (const col of CASE_SEARCH_COLUMNS) {
      jobs.push(ctx.ds.query({
        table: 'CaseMaster', columns: CASE_SELECT_COLUMNS,
        where: [{ col, op: 'like', val: q }], limit: { count: perColumn }
      }).then((rows) => ({ table: 'CaseMaster', rows })).catch(() => ({ table: 'CaseMaster', rows: [] })));
    }
  }
  if (scope === 'all' || scope === 'offenders') {
    for (const col of OFFENDER_SEARCH_COLUMNS) {
      jobs.push(ctx.ds.query({
        table: 'OffenderProfile', columns: OFFENDER_SELECT_COLUMNS,
        where: [{ col, op: 'like', val: q }],
        orderBy: { col: 'RiskScore', desc: true }, limit: { count: perColumn }
      }).then((rows) => ({ table: 'OffenderProfile', rows })).catch(() => ({ table: 'OffenderProfile', rows: [] })));
    }
  }
  const parts = await Promise.all(jobs);
  const cases = dedupe(parts.filter((p) => p.table === 'CaseMaster').flatMap((p) => p.rows), 'CaseMasterID');
  const offenders = dedupe(parts.filter((p) => p.table === 'OffenderProfile').flatMap((p) => p.rows), 'PersonKey');
  return { cases, offenders };
}

/**
 * Full-text search across cases and offender profiles.
 * Always resolves; `source` says which path answered ('catalyst-search' or
 * 'fallback-zcql-like').
 */
async function searchAll(ctx, opts) {
  const o = opts || {};
  const q = String(o.q || '').trim();
  const scope = SCOPES.includes(String(o.scope)) ? String(o.scope) : 'all';
  const limit = Math.max(1, Math.min(100, toNum(o.limit, 20)));
  if (!q) return { query: q, scope, results: [], counts: { cases: 0, offenders: 0 }, source: 'none', matched: 0 };

  const lk = await getLookups(ctx);
  let cases = [];
  let offenders = [];
  let source = 'fallback-zcql-like';

  if (ctx.flags.search && ctx.services.search) {
    try {
      const searchTables = {};
      const selectTables = {};
      if (scope === 'all' || scope === 'cases') {
        searchTables.CaseMaster = CASE_INDEXED_COLUMNS;
        selectTables.CaseMaster = CASE_SELECT_COLUMNS;
      }
      if (scope === 'all' || scope === 'offenders') {
        searchTables.OffenderProfile = OFFENDER_INDEXED_COLUMNS;
        selectTables.OffenderProfile = OFFENDER_SELECT_COLUMNS;
      }
      const res = await ctx.services.search.execute({
        search: q,
        search_table_columns: searchTables,
        select_table_columns: selectTables,
        start: 1,
        end: limit
      });
      const hit = res || {};
      cases = Array.isArray(hit.CaseMaster) ? hit.CaseMaster : [];
      offenders = Array.isArray(hit.OffenderProfile) ? hit.OffenderProfile : [];
      if (cases.length || offenders.length) source = 'catalyst-search';
    } catch (e) {
      // console index not configured / service unreachable -> ZCQL LIKE
    }
  }

  if (source !== 'catalyst-search') {
    const fb = await likeSearch(ctx, q, scope, limit);
    cases = fb.cases;
    offenders = fb.offenders;
  }

  const results = cases.map((r) => caseHit(r, lk, q))
    .concat(offenders.map((r) => offenderHit(r, q)))
    .slice(0, limit);
  return {
    query: q,
    scope,
    results,
    counts: { cases: cases.length, offenders: offenders.length },
    source,
    matched: cases.length + offenders.length
  };
}

module.exports = { searchAll, snippet, SCOPES, CASE_SEARCH_COLUMNS, OFFENDER_SEARCH_COLUMNS };
