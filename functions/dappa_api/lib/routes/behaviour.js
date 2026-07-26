'use strict';
// Behavioural-analysis endpoints (challenge area 5).
//
//   GET /offenders/mo-evolution          MO mix over time, lift, MO families
//   GET /offenders/:personKey/behaviour  escalation / de-escalation signals
//   GET /offenders/:personKey/cohort     peer cohort + percentile standing
//
// Registered BEFORE routes/insight so /offenders/mo-evolution wins over the
// /offenders/:personKey param route. The two per-offender routes carry a second
// path segment, so they can never collide with it.

const { ok, fail, asyncH, nocache, cacheKey, ttlFor } = require('../envelope');
const { getLookups } = require('../lookups');
const { anchorYm } = require('./read');
const { toNum, round, ymAdd, ymRange, pctDelta, parseJsonSafe } = require('../util');
const an = require('../analytics');

const KEY_RE = /^[A-Za-z0-9._-]{1,40}$/;
const CASE_CHUNK = 80;

function intParam(raw, dflt, min, max) {
  const n = toNum(raw, dflt);
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : dflt)));
}

function floatParam(raw, dflt, min, max) {
  const n = toNum(raw, dflt);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : dflt));
}

/** The offender's case ids, reached through the co-accusal edges that carry
 * them. Over the cap we keep BOTH ends of the history — a trajectory measured
 * on the tail alone is not a trajectory — and say so via `truncated`. */
async function offenderCaseIds(ctx, key, cap) {
  const [a, b] = await Promise.all([
    ctx.ds.queryAll({ table: 'NetworkEdge', columns: ['CaseIDsJson'], where: [{ col: 'PersonKeyA', op: '=', val: key }] }, { maxRows: 1500 }).catch(() => []),
    ctx.ds.queryAll({ table: 'NetworkEdge', columns: ['CaseIDsJson'], where: [{ col: 'PersonKeyB', op: '=', val: key }] }, { maxRows: 1500 }).catch(() => [])
  ]);
  const ids = new Set();
  for (const e of a.concat(b)) {
    for (const c of parseJsonSafe(e.CaseIDsJson, [])) ids.add(String(c));
  }
  const all = [...ids].sort((x, y) => toNum(x) - toNum(y) || String(x).localeCompare(String(y)));
  if (all.length <= cap) return { ids: all, total: all.length, truncated: false };
  const head = Math.floor(cap / 2);
  return { ids: all.slice(0, head).concat(all.slice(all.length - (cap - head))), total: all.length, truncated: true };
}

async function fetchCases(ctx, caseIds) {
  const out = [];
  for (const ids of an.chunk(caseIds, CASE_CHUNK)) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await ctx.ds.query({
      table: 'CaseMaster',
      columns: ['CaseMasterID', 'CrimeNo', 'CrimeRegisteredDate', 'PoliceStationID', 'CrimeMajorHeadID',
        'CrimeMinorHeadID', 'GravityOffenceID', 'CaseStatusID'],
      where: [{ col: 'CaseMasterID', op: 'in', val: ids }],
      limit: { count: 300 }
    }).catch(() => []);
    out.push(...rows);
  }
  return out;
}

/** Gravity 1 is Heinous in the master; anything else counts as non-heinous. */
function isHeinous(row) {
  return toNum(row.GravityOffenceID) === 1;
}

function shareOf(rows, pred) {
  if (!rows.length) return 0;
  return round(rows.filter(pred).length / rows.length, 3);
}

function spanMonths(rows) {
  const yms = rows.map((r) => an.ymOfDate(r.CrimeRegisteredDate)).filter(Boolean).sort();
  if (!yms.length) return 0;
  return Math.max(1, (an.ymDiff(yms[0], yms[yms.length - 1]) || 0) + 1);
}

function distinctDistricts(rows, lk) {
  const set = new Set();
  for (const r of rows) {
    const unit = lk.unitById.get(String(r.PoliceStationID));
    if (unit) set.add(an.districtKey(unit.districtId));
  }
  return set;
}

function signal(key, label, value, delta, note) {
  const d = value === null || delta === null ? null : delta;
  return {
    key,
    label,
    value,
    delta: d,
    direction: d === null ? 'unknown' : d > 0.0001 ? 'up' : d < -0.0001 ? 'down' : 'flat',
    note
  };
}

function register(router) {
  // -------------------------------------------------------------------------
  // MO evolution across the whole offender population.
  // -------------------------------------------------------------------------
  router.get('/offenders/mo-evolution', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const months = intParam(req.query.months, 24, 3, 60);
    const topTags = intParam(req.query.topTags, 20, 3, 50);
    const minSupport = intParam(req.query.minSupport, 3, 1, 500);
    const minLift = floatParam(req.query.minLift, 1.2, 0, 100);
    const ttl = ttlFor(req, 900);

    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const anchor = await anchorYm(ctx.ds, null);
      const fromYm = ymAdd(anchor, -(months - 1));
      const window = ymRange(fromYm, anchor);
      const windowIndex = new Map(window.map((ym, i) => [ym, i]));

      // 2,048 profiles is seven ZCQL pages; a single SELECT would silently stop
      // at 300 and quietly mis-state every share below.
      const profilePage = await ctx.ds.queryPaged({
        table: 'OffenderProfile',
        columns: ['PersonKey', 'CanonicalName', 'MOTagsJson', 'FirstSeen', 'LastSeen', 'CaseCount', 'RiskScore', 'DistrictsJson'],
        orderBy: { col: 'RiskScore', desc: true }
      }, { maxRows: 2400 });
      const profiles = profilePage.rows;

      const sets = [];
      const tagTotals = new Map();
      const tagCases = new Map();
      const perMonthTag = new Map();          // tag -> counts[] aligned to window
      const activeOffenders = window.map(() => 0);
      let withTags = 0;

      for (const p of profiles) {
        const tags = an.uniq(parseJsonSafe(p.MOTagsJson, []).map(String).filter(Boolean));
        sets.push(tags);
        if (tags.length) withTags += 1;
        const cases = toNum(p.CaseCount);
        for (const t of tags) {
          tagTotals.set(t, (tagTotals.get(t) || 0) + 1);
          tagCases.set(t, (tagCases.get(t) || 0) + cases);
        }
        // A profile's MO is attributed to every month it was active in, so the
        // mix reads as "what the active population was doing", not "when a
        // profile row happened to be written".
        const first = an.ymOfDate(p.FirstSeen) || an.ymOfDate(p.LastSeen);
        const last = an.ymOfDate(p.LastSeen) || first;
        if (!first || !last) continue;
        const startIdx = windowIndex.has(first) ? windowIndex.get(first) : (first < fromYm ? 0 : -1);
        const endIdx = windowIndex.has(last) ? windowIndex.get(last) : (last > anchor ? window.length - 1 : -1);
        if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) continue;
        for (let i = startIdx; i <= endIdx; i += 1) {
          activeOffenders[i] += 1;
          for (const t of tags) {
            if (!perMonthTag.has(t)) perMonthTag.set(t, window.map(() => 0));
            perMonthTag.get(t)[i] += 1;
          }
        }
      }

      const co = an.coOccurrence(sets, { minSupport, topTags });
      const families = an.tagFamilies(co.pairs, co.tagCounts, { minLift, minPairCount: minSupport });

      const series = co.tags.map((tag) => {
        const counts = perMonthTag.get(tag) || window.map(() => 0);
        const recent = counts.slice(-3);
        const prior = counts.slice(0, Math.max(1, counts.length - 3));
        const recentAvg = recent.reduce((s, n) => s + n, 0) / Math.max(1, recent.length);
        const priorAvg = prior.reduce((s, n) => s + n, 0) / Math.max(1, prior.length);
        return {
          tag,
          offenders: tagTotals.get(tag) || 0,
          cases: tagCases.get(tag) || 0,
          counts,
          latest: counts.length ? counts[counts.length - 1] : 0,
          recentAvg: round(recentAvg, 2),
          priorAvg: round(priorAvg, 2),
          growthPct: pctDelta(recentAvg, priorAvg),
          sharePct: profiles.length ? round(((tagTotals.get(tag) || 0) / profiles.length) * 100, 1) : 0
        };
      });

      const familyRows = families.map((f) => {
        const tagSet = new Set(f.tags);
        const members = profiles.filter((p) => parseJsonSafe(p.MOTagsJson, []).some((t) => tagSet.has(String(t))));
        const cases = members.reduce((s, p) => s + toNum(p.CaseCount), 0);
        return {
          familyId: null,
          label: f.label,
          tags: f.tags,
          tagCount: f.tags.length,
          offenders: members.length,
          cases,
          avgRisk: members.length ? round(members.reduce((s, p) => s + toNum(p.RiskScore), 0) / members.length, 1) : 0,
          sharePct: profiles.length ? round((members.length / profiles.length) * 100, 1) : 0
        };
      }).sort((a, b) => b.offenders - a.offenders || b.cases - a.cases || a.label.localeCompare(b.label));
      // Numbered after the ranking so F01 is always the largest family.
      familyRows.forEach((f, i) => { f.familyId = `F${String(i + 1).padStart(2, '0')}`; });

      return {
        window: { fromYm, toYm: anchor, months: window.length },
        months: window,
        activeOffenders,
        series,
        emerging: series.filter((s) => s.growthPct > 0).sort((a, b) => b.growthPct - a.growthPct).slice(0, 5),
        fading: series.filter((s) => s.growthPct < 0).sort((a, b) => a.growthPct - b.growthPct).slice(0, 5),
        cooccurrence: co.pairs.slice(0, 40),
        families: familyRows,
        params: { months, topTags, minSupport, minLift },
        method: 'Tag mix is attributed across each profile\'s FirstSeen..LastSeen window. lift = P(a,b)/(P(a)·P(b)) over profiles; families are the connected components of the pairs clearing minLift and minSupport, labelled by their highest-support tag.',
        scan: {
          profilesScanned: profiles.length,
          profilePages: profilePage.pages,
          profilesTruncated: profilePage.truncated,
          profilesWithTags: withTags,
          distinctTags: tagTotals.size,
          pairsEvaluated: co.pairs.length
        }
      };
    });

    ok(res, value, {
      cached, ttlSec: ttl,
      tags: value.series.length,
      families: value.families.length,
      pairs: value.cooccurrence.length
    });
  }));

  // -------------------------------------------------------------------------
  // Escalation / de-escalation signals for one offender.
  // -------------------------------------------------------------------------
  router.get('/offenders/:personKey/behaviour', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const key = String(req.params.personKey);
    if (!KEY_RE.test(key)) return fail(res, 400, 'BAD_ID', 'Invalid personKey.');
    const months = intParam(req.query.months, 24, 6, 60);
    const maxCases = intParam(req.query.maxCases, 300, 20, 600);
    const ttl = ttlFor(req, 600);

    const profileRows = await ctx.ds.query({
      table: 'OffenderProfile',
      columns: ['PersonKey', 'CanonicalName', 'AliasesJson', 'CaseCount', 'DistrictsJson', 'FirstSeen',
        'LastSeen', 'MOTagsJson', 'CommunityID', 'DegreeCentrality', 'RiskScore'],
      where: [{ col: 'PersonKey', op: '=', val: key }]
    });
    if (!profileRows.length) return fail(res, 404, 'NOT_FOUND', `No offender profile for ${key}.`);
    const p = profileRows[0];

    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const anchor = await anchorYm(ctx.ds, null);
      const sample = await offenderCaseIds(ctx, key, maxCases);
      const caseRows = sample.ids.length ? await fetchCases(ctx, sample.ids) : [];
      const dated = caseRows
        .filter((r) => an.ymOfDate(r.CrimeRegisteredDate))
        .sort((a, b) => String(a.CrimeRegisteredDate).localeCompare(String(b.CrimeRegisteredDate)));

      const firstYm = dated.length ? an.ymOfDate(dated[0].CrimeRegisteredDate) : an.ymOfDate(p.FirstSeen);
      const lastYm = dated.length ? an.ymOfDate(dated[dated.length - 1].CrimeRegisteredDate) : an.ymOfDate(p.LastSeen);
      const fromYm = firstYm && firstYm > ymAdd(anchor, -(months - 1)) ? firstYm : ymAdd(anchor, -(months - 1));
      const timelineMonths = ymRange(fromYm, anchor);
      const byYm = new Map();
      for (const r of dated) {
        const ym = an.ymOfDate(r.CrimeRegisteredDate);
        if (!byYm.has(ym)) byYm.set(ym, { cases: 0, heinous: 0 });
        const e = byYm.get(ym);
        e.cases += 1;
        if (isHeinous(r)) e.heinous += 1;
      }
      const timeline = timelineMonths.map((ym) => ({
        ym,
        cases: (byYm.get(ym) || {}).cases || 0,
        heinous: (byYm.get(ym) || {}).heinous || 0
      }));

      // Self-relative halves: the trajectory is measured against this person's
      // own history, so it stays meaningful whether they were active last month
      // or three years ago.
      const mid = Math.floor(dated.length / 2);
      const early = dated.slice(0, mid);
      const late = dated.slice(mid);
      const earlyMonths = spanMonths(early);
      const lateMonths = spanMonths(late);
      const earlyRate = earlyMonths ? early.length / earlyMonths : 0;
      const lateRate = lateMonths ? late.length / lateMonths : 0;
      const earlyHeinous = shareOf(early, isHeinous);
      const lateHeinous = shareOf(late, isHeinous);
      const earlyDistricts = distinctDistricts(early, lk);
      const lateDistricts = distinctDistricts(late, lk);

      // Anchor-relative view for the client's "is this live right now" badge.
      const recentFrom = ymAdd(anchor, -5);
      const priorFrom = ymAdd(anchor, -11);
      const inRange = (r, a, b) => {
        const ym = an.ymOfDate(r.CrimeRegisteredDate);
        return ym !== null && ym >= a && ym <= b;
      };
      const recentCases = dated.filter((r) => inRange(r, recentFrom, anchor));
      const priorCases = dated.filter((r) => inRange(r, priorFrom, ymAdd(recentFrom, -1)));

      // Dormancy: gaps between consecutive registrations, plus how long it has
      // been quiet as of the dataset's anchor month.
      const gaps = [];
      for (let i = 1; i < dated.length; i += 1) {
        const d = an.daysBetween(dated[i - 1].CrimeRegisteredDate, dated[i].CrimeRegisteredDate);
        if (d !== null) gaps.push(d);
      }
      const longestGap = gaps.length ? Math.max(...gaps) : null;
      const dormantSpells = gaps.filter((d) => d >= 180).length;
      let reactivated = false;
      for (let i = 1; i < dated.length; i += 1) {
        const d = an.daysBetween(dated[i - 1].CrimeRegisteredDate, dated[i].CrimeRegisteredDate);
        if (d !== null && d >= 180 && dated.length - i >= 2) reactivated = true;
      }
      const monthsSinceLastCase = lastYm ? Math.max(0, an.ymDiff(lastYm, anchor) || 0) : null;

      const headMix = new Map();
      for (const r of late) {
        const name = lk.headName(r.CrimeMajorHeadID);
        headMix.set(name, (headMix.get(name) || 0) + 1);
      }

      const enough = dated.length >= 3;
      const freqDelta = enough ? round(lateRate - earlyRate, 3) : null;
      const gravityDelta = enough ? round(lateHeinous - earlyHeinous, 3) : null;
      const spreadDelta = enough ? lateDistricts.size - earlyDistricts.size : null;

      const signals = [
        signal('gravity', 'Gravity trajectory', lateHeinous, gravityDelta,
          enough ? `Heinous share moved from ${round(earlyHeinous * 100, 1)}% to ${round(lateHeinous * 100, 1)}% between the first and second half of this person's case history.`
            : 'Fewer than three dated cases — no trajectory can be claimed.'),
        signal('frequency', 'Offence-frequency acceleration', round(lateRate, 3), freqDelta,
          enough ? `${round(lateRate, 2)} cases/month recently against ${round(earlyRate, 2)} earlier.`
            : 'Not enough dated cases to measure a rate change.'),
        signal('districtSpread', 'District spread', lateDistricts.size, spreadDelta,
          enough ? `${lateDistricts.size} districts in the recent half against ${earlyDistricts.size} earlier.`
            : 'Not enough dated cases to measure spread.'),
        signal('dormancy', 'Dormancy and re-activation', monthsSinceLastCase,
          monthsSinceLastCase === null ? null : -monthsSinceLastCase,
          monthsSinceLastCase === null ? 'No dated case to measure dormancy from.'
            : `${monthsSinceLastCase} month(s) since the last registered case; longest quiet gap ${longestGap === null ? 'n/a' : `${longestGap} days`}${reactivated ? '; re-activated after a dormant spell' : ''}.`)
      ];

      // Escalation score: 50 is "no change". Each signal can move it, and the
      // dormancy penalty is applied last so a quiet offender never reads as
      // escalating on the strength of an old burst.
      let score = 50;
      if (enough) {
        score += an.clamp((freqDelta / Math.max(0.25, earlyRate || 0.25)) * 25, -25, 25);
        score += an.clamp(gravityDelta * 100 * 0.4, -20, 20);
        score += an.clamp(spreadDelta * 5, -15, 15);
      }
      if (monthsSinceLastCase !== null && monthsSinceLastCase > 6) {
        score -= an.clamp((monthsSinceLastCase - 6) * 2.5, 0, 25);
      }
      score = round(an.clamp(score, 0, 100), 1);
      const verdict = !enough ? 'insufficient-data'
        : monthsSinceLastCase !== null && monthsSinceLastCase >= 12 ? 'dormant'
          : score >= 65 ? 'escalating'
            : score <= 35 ? 'de-escalating' : 'stable';

      return {
        personKey: String(p.PersonKey),
        canonicalName: p.CanonicalName,
        riskScore: round(toNum(p.RiskScore), 1),
        communityId: p.CommunityID === undefined || p.CommunityID === null || p.CommunityID === '' ? null : toNum(p.CommunityID),
        moTags: parseJsonSafe(p.MOTagsJson, []),
        firstSeen: p.FirstSeen,
        lastSeen: p.LastSeen,
        anchorYm: anchor,
        escalationScore: score,
        band: an.band(score),
        verdict,
        signals,
        timeline,
        halves: {
          early: { cases: early.length, months: earlyMonths, casesPerMonth: round(earlyRate, 3), heinousShare: earlyHeinous, districts: earlyDistricts.size },
          late: { cases: late.length, months: lateMonths, casesPerMonth: round(lateRate, 3), heinousShare: lateHeinous, districts: lateDistricts.size }
        },
        recent: {
          fromYm: recentFrom,
          cases: recentCases.length,
          priorCases: priorCases.length,
          changePct: pctDelta(recentCases.length, priorCases.length),
          heinousShare: shareOf(recentCases, isHeinous)
        },
        dormancy: {
          monthsSinceLastCase,
          longestGapDays: longestGap,
          dormantSpells,
          reactivated,
          lastCaseYm: lastYm,
          firstCaseYm: firstYm
        },
        recentHeadMix: [...headMix.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5)
          .map(([headName, cases]) => ({ headName, cases })),
        scan: {
          caseIdsLinked: sample.total,
          caseIdsSampled: sample.ids.length,
          caseIdsTruncated: sample.truncated,
          casesResolved: caseRows.length,
          casesDated: dated.length,
          maxCases
        }
      };
    });

    ok(res, value, { cached, ttlSec: ttl, personKey: key, verdict: value.verdict });
  }));

  // -------------------------------------------------------------------------
  // Peer cohort + percentile standing.
  // -------------------------------------------------------------------------
  router.get('/offenders/:personKey/cohort', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const key = String(req.params.personKey);
    if (!KEY_RE.test(key)) return fail(res, 400, 'BAD_ID', 'Invalid personKey.');
    const size = intParam(req.query.size, 25, 5, 100);
    const ttl = ttlFor(req, 900);

    const subjectRows = await ctx.ds.query({
      table: 'OffenderProfile',
      columns: ['PersonKey', 'CanonicalName', 'CaseCount', 'DistrictsJson', 'MOTagsJson', 'CommunityID',
        'DegreeCentrality', 'RiskScore', 'FirstSeen', 'LastSeen'],
      where: [{ col: 'PersonKey', op: '=', val: key }]
    });
    if (!subjectRows.length) return fail(res, 404, 'NOT_FOUND', `No offender profile for ${key}.`);

    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const resolve = an.makeDistrictResolver(lk);
      const page = await ctx.ds.queryPaged({
        table: 'OffenderProfile',
        columns: ['PersonKey', 'CanonicalName', 'CaseCount', 'DistrictsJson', 'MOTagsJson', 'CommunityID',
          'DegreeCentrality', 'RiskScore', 'LastSeen'],
        orderBy: { col: 'RiskScore', desc: true }
      }, { maxRows: 2400 });

      const shape = (r) => {
        const districts = an.uniq(parseJsonSafe(r.DistrictsJson, []).map((d) => resolve(d) || String(d)).filter(Boolean));
        return {
          personKey: String(r.PersonKey),
          canonicalName: r.CanonicalName || String(r.PersonKey),
          caseCount: toNum(r.CaseCount),
          riskScore: round(toNum(r.RiskScore), 1),
          degree: round(toNum(r.DegreeCentrality), 4),
          communityId: r.CommunityID === undefined || r.CommunityID === null || r.CommunityID === '' ? null : toNum(r.CommunityID),
          districts,
          districtSpan: districts.length,
          moTags: an.uniq(parseJsonSafe(r.MOTagsJson, []).map(String)),
          lastSeen: r.LastSeen || null
        };
      };

      const population = page.rows.map(shape);
      const subject = shape(subjectRows[0]);
      const pool = population.filter((r) => r.personKey !== subject.personKey);

      // A peer qualifies on ANY of the four bases; the similarity score then
      // ranks how many of them they satisfy and how closely.
      const lo = Math.max(1, Math.floor(subject.caseCount * 0.5));
      const hi = Math.max(1, Math.ceil(subject.caseCount * 2));
      const subjectTags = new Set(subject.moTags);
      const qualifies = (r) => {
        const sameCommunity = subject.communityId !== null && r.communityId === subject.communityId;
        const nearCases = r.caseCount >= lo && r.caseCount <= hi;
        const nearSpan = Math.abs(r.districtSpan - subject.districtSpan) <= 2;
        const sharedMo = r.moTags.some((t) => subjectTags.has(t));
        return { sameCommunity, nearCases, nearSpan, sharedMo, any: sameCommunity || nearCases || nearSpan || sharedMo };
      };

      const candidates = [];
      for (const r of pool) {
        const q = qualifies(r);
        if (!q.any) continue;
        const caseSim = subject.caseCount > 0 && r.caseCount > 0
          ? an.clamp(1 - Math.abs(Math.log(r.caseCount / subject.caseCount)) / Math.log(4), 0, 1)
          : 0;
        const spanSim = an.clamp(1 - Math.abs(r.districtSpan - subject.districtSpan) / 5, 0, 1);
        const moSim = an.jaccard(r.moTags, subject.moTags);
        const similarity = round(100 * (0.35 * caseSim + 0.20 * (q.sameCommunity ? 1 : 0) + 0.20 * spanSim + 0.25 * moSim), 1);
        candidates.push(Object.assign({}, r, {
          similarity,
          sharedMoTags: r.moTags.filter((t) => subjectTags.has(t)).slice(0, 8),
          sameCommunity: q.sameCommunity,
          matchedOn: ['sameCommunity', 'nearCases', 'nearSpan', 'sharedMo'].filter((k) => q[k])
        }));
      }
      candidates.sort((a, b) => b.similarity - a.similarity || b.riskScore - a.riskScore
        || a.personKey.localeCompare(b.personKey));
      const peers = candidates.slice(0, size);

      const metric = (rows, field) => rows.map((r) => r[field]);
      const cohortRows = peers.concat([subject]);
      const pct = (field) => ({
        cohort: an.percentileOf(metric(cohortRows, field), subject[field]),
        population: an.percentileOf(metric(population, field), subject[field])
      });

      return {
        subject: {
          personKey: subject.personKey,
          canonicalName: subject.canonicalName,
          caseCount: subject.caseCount,
          riskScore: subject.riskScore,
          degree: subject.degree,
          communityId: subject.communityId,
          districtSpan: subject.districtSpan,
          districtNames: subject.districts.map((d) => lk.districtName(d)),
          moTags: subject.moTags,
          moTagCount: subject.moTags.length,
          lastSeen: subject.lastSeen
        },
        cohort: {
          size: peers.length,
          candidates: candidates.length,
          basis: ['sameCommunity', 'nearCases', 'nearSpan', 'sharedMo'],
          criteria: {
            caseCountRange: [lo, hi],
            districtSpanTolerance: 2,
            communityId: subject.communityId,
            moTags: subject.moTags.slice(0, 8)
          },
          medianCaseCount: an.median(metric(peers, 'caseCount')),
          medianRiskScore: an.median(metric(peers, 'riskScore')),
          medianDistrictSpan: an.median(metric(peers, 'districtSpan'))
        },
        peers: peers.map((r) => ({
          personKey: r.personKey,
          canonicalName: r.canonicalName,
          caseCount: r.caseCount,
          riskScore: r.riskScore,
          degree: r.degree,
          communityId: r.communityId,
          districtSpan: r.districtSpan,
          sharedMoTags: r.sharedMoTags,
          sameCommunity: r.sameCommunity,
          matchedOn: r.matchedOn,
          similarity: r.similarity
        })),
        percentiles: {
          caseCount: pct('caseCount'),
          riskScore: pct('riskScore'),
          districtSpan: pct('districtSpan'),
          degree: pct('degree')
        },
        population: {
          offenders: population.length,
          medianCaseCount: an.median(metric(population, 'caseCount')),
          medianRiskScore: an.median(metric(population, 'riskScore')),
          medianDistrictSpan: an.median(metric(population, 'districtSpan'))
        },
        method: 'A peer qualifies on any of: same community, case count within half-to-double, district span within +/-2, or a shared MO tag. Similarity = 0.35·case-count proximity + 0.20·same community + 0.20·span proximity + 0.25·MO Jaccard. Percentiles use mid-rank for ties.',
        scan: {
          profilesScanned: population.length,
          profilePages: page.pages,
          profilesTruncated: page.truncated
        }
      };
    });

    ok(res, value, { cached, ttlSec: ttl, personKey: key, cohortSize: value.cohort.size });
  }));
}

module.exports = { register, offenderCaseIds };
