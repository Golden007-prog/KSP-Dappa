'use strict';
// Second-pass endpoints: challenge coverage map, socio-economic correlation,
// emerging patterns, network shortest-path + community roll-ups, MO signature
// mining, offender watchlist validation, and alert triage summary.
// Registered BEFORE routes/insight so /alerts/summary and /offenders/mo-patterns
// win over the /alerts/:id and /offenders/:personKey param routes.

const { ok, fail, asyncH, commonFilters, nocache, cacheKey, ttlFor } = require('../envelope');
const { getLookups } = require('../lookups');
const { anchorYm, ymWindow } = require('./read');
const network = require('../network');
const { CANNED_UTTERANCES } = require('../copilot');
const { toNum, round, ymAdd, ymRange, pctDelta, pearson, parseJsonSafe } = require('../util');

// ---------------------------------------------------------------------------
// Challenge coverage map (About page): how the API maps onto the six official
// KSP Datathon capability areas.
// ---------------------------------------------------------------------------

const CAPABILITIES = [
  {
    id: 1,
    key: 'advanced-visualization',
    title: 'Advanced Visualization',
    status: 'covered',
    summary: 'Interactive dashboards and geospatial maps with district-to-station drill-down, hour-band hotspot layering and emerging-trend alerting.',
    highlights: [
      'KPI dashboard with month-on-month deltas and top-rising-pattern call-out',
      'District choropleth drilling down to per-station markers and incident points',
      'Spatiotemporal clusters layering time-of-day bands over location',
      'Red-zone alerting when a crime category spikes vs its historical baseline'
    ],
    endpoints: ['/summary/kpis', '/trends/monthly', '/trends/compare', '/trends/seasonality', '/trends/category-share', '/geo/districts', '/geo/stations', '/geo/incidents', '/geo/hotspots', '/alerts', '/alerts/summary', '/insight/emerging'],
    services: ['Data Store', 'Cache', 'Serverless Functions']
  },
  {
    id: 2,
    key: 'network-link-analysis',
    title: 'Criminological Network & Link Analysis',
    status: 'covered',
    summary: 'Relationship mapping across suspects and cases, repeat-offender tracking with MO across jurisdictions, and hidden-association discovery.',
    highlights: [
      'Co-accusal network graph with community detection and ego drill-down',
      'Shortest association path between any two persons with shared-case evidence',
      'Repeat offender profiles with aliases, districts spanned and MO tags',
      'Watchlist validation enriching person keys with live risk context'
    ],
    endpoints: ['/network/graph', '/network/path', '/network/communities', '/offenders', '/offenders/:personKey', '/offenders/watch', '/search/cases'],
    services: ['NoSQL', 'Stratus', 'Data Store', 'Data Store full-text Search']
  },
  {
    id: 3,
    key: 'sociological-predictive',
    title: 'Sociological & AI-Driven Predictive Dashboards',
    status: 'covered',
    summary: 'Socio-economic overlays explaining the "why" behind the "where", predictive risk scoring and anomaly call-outs.',
    highlights: [
      'Per-district socio-economic context (population, urbanisation, literacy, density, income)',
      'Pearson correlation of crime rate per lakh vs each socio indicator',
      'Station-level 30-day predictive risk scores with named drivers',
      'Case-outcome probability model (A vs C final) with AUC reporting'
    ],
    endpoints: ['/meta/socio', '/insight/socio-correlation', '/risk/stations', '/forecast', '/predict/outcome', '/ml/models'],
    services: ['Data Store', 'QuickML', 'Zia AutoML', 'Cache']
  },
  {
    id: 4,
    key: 'pattern-trend-discovery',
    title: 'Pattern & Trend Discovery',
    status: 'covered',
    summary: 'Statistical spatial and temporal hotspot discovery for resource deployment.',
    highlights: [
      'Weekday-by-hour seasonality matrix from incident timestamps',
      'Spatial clusters ranked by intensity with hour bands',
      'Emerging vs cooling category movers (last 3 months vs prior-9 baseline)',
      'Case-similarity linking (same pattern, hour proximity, geography)'
    ],
    endpoints: ['/trends/seasonality', '/geo/hotspots', '/trends/category-share', '/insight/emerging', '/cases/:id/similar', '/search/cases'],
    services: ['Data Store', 'Data Store full-text Search', 'Cache']
  },
  {
    id: 5,
    key: 'behavioral-analysis',
    title: 'Network & Behavioral Analysis',
    status: 'covered',
    summary: 'Suspect connections, organized-crime community roll-ups and recurring modus operandi.',
    highlights: [
      'Community roll-ups: members, density, districts spanned, key person',
      'MO signature mining with cross-jurisdiction detection',
      'Narrative MO extraction (weapon / vehicle / entry / approach vocabulary)',
      'Offender timelines across stations and districts'
    ],
    endpoints: ['/network/communities', '/offenders/mo-patterns', '/ai/narrative', '/offenders/:personKey', '/zia/ocr'],
    services: ['NoSQL', 'Data Store', 'Zia Services']
  },
  {
    id: 6,
    key: 'ai-ml-intelligence',
    title: 'AI/ML-Driven Intelligence',
    status: 'covered',
    summary: 'ML models surfacing hidden correlations, anomalies and emerging crime risks, plus a natural-language copilot.',
    highlights: [
      'Robust z-score anomaly alerts with severity, plus live event-driven checks',
      'Holt-Winters monthly forecasts with 80% bands and MAPE backtests',
      'Logistic outcome model with QuickML flag path',
      'Deterministic NL copilot including "why is X rising" diagnostics'
    ],
    endpoints: ['/alerts', '/forecast', '/predict/outcome', '/copilot/query', '/insight/socio-correlation', '/insight/emerging', '/ml/models', '/zia/ocr', '/zia/translate', '/admin/circuit/nightly-refresh'],
    services: ['QuickML LLM Serving', 'Zia Services', 'Zia AutoML', 'Circuits', 'Signals + Event Functions', 'Cron']
  }
];

function interpretR(r) {
  if (r === null) {
    return { strength: 'n/a', direction: null, note: 'not computable (fewer than 3 districts or no variance in the indicator)' };
  }
  const a = Math.abs(r);
  const strength = a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'negligible';
  const direction = r >= 0 ? 'positive' : 'negative';
  return { strength, direction, note: `${strength} ${direction} association with the crime rate per lakh` };
}

function register(router) {
  router.get('/meta/challenge', asyncH(async (req, res) => {
    const distinct = new Set();
    for (const c of CAPABILITIES) for (const e of c.endpoints) distinct.add(e);
    ok(res, {
      challenge: 'KSP Datathon 2026 — AI-Driven Crime Analytics & Visualization Platform',
      capabilities: CAPABILITIES,
      counts: {
        capabilities: CAPABILITIES.length,
        covered: CAPABILITIES.filter((c) => c.status === 'covered').length,
        distinctEndpoints: distinct.size,
        copilotUtterances: CANNED_UTTERANCES.length
      }
    }, { source: 'static' });
  }));

  // The "why" behind the "where": Pearson r of the per-lakh crime rate against
  // each socio-economic indicator across districts, with the raw scatter
  // points so the client can draw the relationship it is quantifying.
  router.get('/insight/socio-correlation', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const { fromYm, toYm } = ymWindow(filters, null);
    const ttl = ttlFor(req);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const crimeCond = [];
      if (filters.crimeSubHeadId) crimeCond.push({ col: 'CrimeSubHeadID', op: '=', val: filters.crimeSubHeadId });
      else if (filters.crimeHeadId) crimeCond.push({ col: 'CrimeHeadID', op: '=', val: filters.crimeHeadId });
      const rows = await ctx.ds.query({
        table: 'AggMonthly', columns: ['DistrictID', 'SUM(CaseCount)'],
        where: [{ col: 'Ym', op: '>=', val: fromYm }, { col: 'Ym', op: '<=', val: toYm }].concat(crimeCond),
        groupBy: ['DistrictID']
      });
      const socioBy = new Map(lk.socio.map((s) => [s.districtId, s]));
      const points = [];
      for (const r of rows) {
        const id = String(r.DistrictID);
        const s = socioBy.get(id);
        if (!s || !s.population) continue;
        points.push({
          districtId: id,
          districtName: lk.districtName(id),
          caseCount: toNum(r['SUM(CaseCount)']),
          ratePerLakh: round((toNum(r['SUM(CaseCount)']) / s.population) * 100000, 2),
          population: s.population,
          urbanPct: s.urbanPct,
          literacyPct: s.literacyPct,
          densityPerKm2: s.densityPerKm2,
          perCapitaIncomeIdx: s.perCapitaIncomeIdx
        });
      }
      const INDICATORS = [
        ['urbanPct', 'Urbanisation %'],
        ['literacyPct', 'Literacy %'],
        ['densityPerKm2', 'Population density / km²'],
        ['perCapitaIncomeIdx', 'Per-capita income index'],
        ['population', 'Population']
      ];
      const indicators = INDICATORS.map(([key, label]) => {
        const pairs = points.filter((p) => p[key] !== null && p[key] !== undefined);
        const r = pearson(pairs.map((p) => p.ratePerLakh), pairs.map((p) => p[key]));
        const gloss = interpretR(r);
        return {
          key,
          label,
          r: r === null ? null : round(r, 3),
          n: pairs.length,
          strength: gloss.strength,
          direction: gloss.direction,
          note: gloss.note
        };
      });
      return {
        fromYm,
        toYm,
        crimeHeadId: filters.crimeHeadId || null,
        crimeSubHeadId: filters.crimeSubHeadId || null,
        points: points.sort((a, b) => b.ratePerLakh - a.ratePerLakh),
        indicators
      };
    });
    ok(res, value, { cached, ttlSec: ttl, districts: value.points.length });
  }));

  // Emerging vs cooling crime patterns: last-3-months average against the
  // prior-9-months baseline per sub-head, with a 12-month spark series.
  // rows with growth >= 15% carry emerging:true (red-zone pulse material).
  router.get('/insight/emerging', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const ttl = ttlFor(req);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const anchor = await anchorYm(ctx.ds, null);
      const fromYm = ymAdd(anchor, -11);
      const months = ymRange(fromYm, anchor);
      const where = [{ col: 'Ym', op: '>=', val: fromYm }, { col: 'Ym', op: '<=', val: anchor }];
      if (filters.districtId) where.push({ col: 'DistrictID', op: '=', val: filters.districtId });
      // 27 sub-heads x 12 months = 324 groups, past the 300-row ZCQL page.
      const rows = await ctx.ds.queryAll({
        table: 'AggMonthly', columns: ['CrimeSubHeadID', 'Ym', 'SUM(CaseCount)'],
        where, groupBy: ['CrimeSubHeadID', 'Ym'], orderBy: { col: 'CrimeSubHeadID' }
      }, { maxRows: 1200 });
      const subById = new Map(lk.subHeads.map((s) => [s.id, s]));
      const per = new Map();
      for (const r of rows) {
        const id = toNum(r.CrimeSubHeadID);
        if (!per.has(id)) per.set(id, new Map());
        per.get(id).set(r.Ym, toNum(r['SUM(CaseCount)']));
      }
      const split = months.length - 3;
      const movers = [];
      for (const [id, byYm] of per) {
        const spark = months.map((m) => byYm.get(m) || 0);
        const recent = spark.slice(split);
        const base = spark.slice(0, split);
        const recentAvg = recent.reduce((s, n) => s + n, 0) / Math.max(1, recent.length);
        const baselineAvg = base.reduce((s, n) => s + n, 0) / Math.max(1, base.length);
        if (recentAvg === 0 && baselineAvg === 0) continue;
        const growthPct = pctDelta(recentAvg, baselineAvg);
        const sub = subById.get(id) || {};
        movers.push({
          subHeadId: id,
          subHeadName: sub.name || String(id),
          headId: sub.headId === undefined ? null : sub.headId,
          headName: sub.headId === undefined ? null : lk.headName(sub.headId),
          recentAvg: round(recentAvg, 1),
          baselineAvg: round(baselineAvg, 1),
          growthPct,
          emerging: growthPct >= 15,
          spark
        });
      }
      return {
        anchorYm: anchor,
        fromYm,
        districtId: filters.districtId || null,
        rising: movers.filter((m) => m.growthPct > 0).sort((a, b) => b.growthPct - a.growthPct).slice(0, 5),
        falling: movers.filter((m) => m.growthPct < 0).sort((a, b) => a.growthPct - b.growthPct).slice(0, 5)
      };
    });
    ok(res, value, { cached, ttlSec: ttl });
  }));

  // Shortest association path between two persons (BFS over the co-accusal
  // graph, same loader chain as /network/graph). Evidence per hop: the shared
  // case ids on that edge. found:false is a 200 — "no link" is an answer.
  router.get('/network/path', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    if (!from || !to) return fail(res, 400, 'BAD_REQUEST', 'Provide both from and to personKeys.');
    if (from === to) return fail(res, 400, 'BAD_REQUEST', 'from and to must be different persons.');
    const maxDepth = Math.max(1, Math.min(6, toNum(req.query.maxDepth, 6)));
    const { graph, source } = await network.getGraph({}, {
      ds: ctx.ds, loaders: ctx.services.graphLoaders, cache: ctx.cache
    });
    const nodeById = new Map(graph.nodes.map((n) => [String(n.id), n]));
    const missing = [from, to].filter((k) => !nodeById.has(k));
    if (missing.length) {
      return ok(res, { found: false, from, to, reason: `not in the association network: ${missing.join(', ')}`, path: [], edges: [] }, { source });
    }
    const adj = new Map();
    const edgeByPair = new Map();
    const pairKey = (a, b) => `${a}|${b}`;
    for (const e of graph.edges) {
      const a = String(e.source);
      const b = String(e.target);
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b);
      adj.get(b).push(a);
      edgeByPair.set(pairKey(a, b), e);
      edgeByPair.set(pairKey(b, a), e);
    }
    const parent = new Map([[from, null]]);
    let frontier = [from];
    let found = false;
    for (let d = 0; d < maxDepth && frontier.length && !found; d += 1) {
      const next = [];
      for (const n of frontier) {
        for (const nb of adj.get(n) || []) {
          if (parent.has(nb)) continue;
          parent.set(nb, n);
          if (nb === to) { found = true; break; }
          next.push(nb);
        }
        if (found) break;
      }
      frontier = next;
    }
    if (!found) {
      return ok(res, { found: false, from, to, reason: `no association path within ${maxDepth} hops`, path: [], edges: [] }, { source });
    }
    const ids = [];
    for (let cur = to; cur !== null; cur = parent.get(cur)) ids.unshift(cur);
    const pathNodes = ids.map((id) => {
      const n = nodeById.get(id) || {};
      return {
        personKey: id,
        name: n.label || id,
        caseCount: toNum(n.caseCount),
        communityId: n.communityId === undefined ? null : n.communityId
      };
    });
    const pathEdges = [];
    for (let i = 1; i < ids.length; i += 1) {
      const e = edgeByPair.get(pairKey(ids[i - 1], ids[i])) || {};
      pathEdges.push({ source: ids[i - 1], target: ids[i], weight: toNum(e.weight, 1), caseIds: e.caseIds || [] });
    }
    const weights = pathEdges.map((e) => e.weight);
    ok(res, {
      found: true,
      from,
      to,
      hops: ids.length - 1,
      totalWeight: weights.reduce((s, n) => s + n, 0),
      weakestLink: weights.length ? Math.min(...weights) : 0,
      path: pathNodes,
      edges: pathEdges
    }, { source, nodeCount: graph.nodes.length });
  }));

  // Organized-crime community roll-up: per detected community — members
  // (risk-ranked), edge density, linked cases, districts spanned, top MO tags.
  router.get('/network/communities', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const ttl = ttlFor(req);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      // NetworkEdge is ~24k rows and OffenderProfile ~2k — both far past the
      // 300-row ZCQL page. Page with a bounded budget (20 round trips) rather
      // than either truncating silently or walking the whole table inside one
      // request; `truncated` is reported so the number is never overclaimed.
      const [edgePage, profilePage] = await Promise.all([
        ctx.ds.queryPaged({
          table: 'NetworkEdge', columns: ['PersonKeyA', 'PersonKeyB', 'Weight', 'CaseIDsJson', 'CommunityID'],
          orderBy: { col: 'PersonKeyA' }
        }, { maxRows: 6000 }),
        ctx.ds.queryPaged({
          table: 'OffenderProfile',
          columns: ['PersonKey', 'CanonicalName', 'CaseCount', 'RiskScore', 'CommunityID', 'DistrictsJson', 'MOTagsJson'],
          orderBy: { col: 'RiskScore', desc: true }
        }, { maxRows: 3000 })
      ]);
      const edges = edgePage.rows;
      const profiles = profilePage.rows;
      const comms = new Map();
      const memberComm = new Map();
      for (const p of profiles) {
        if (p.CommunityID === undefined || p.CommunityID === null || p.CommunityID === '') continue;
        const cid = toNum(p.CommunityID);
        if (!comms.has(cid)) comms.set(cid, { members: [], edges: 0, caseIds: new Set(), districts: new Set(), moCounts: new Map() });
        const c = comms.get(cid);
        c.members.push({
          personKey: String(p.PersonKey),
          name: p.CanonicalName,
          caseCount: toNum(p.CaseCount),
          riskScore: round(toNum(p.RiskScore), 1)
        });
        memberComm.set(String(p.PersonKey), cid);
        for (const d of parseJsonSafe(p.DistrictsJson, [])) c.districts.add(String(d));
        for (const t of parseJsonSafe(p.MOTagsJson, [])) c.moCounts.set(t, (c.moCounts.get(t) || 0) + 1);
      }
      for (const e of edges) {
        const cid = e.CommunityID !== undefined && e.CommunityID !== null && e.CommunityID !== ''
          ? toNum(e.CommunityID)
          : memberComm.get(String(e.PersonKeyA));
        if (cid === undefined || !comms.has(cid)) continue;
        const c = comms.get(cid);
        c.edges += 1;
        for (const id of parseJsonSafe(e.CaseIDsJson, [])) c.caseIds.add(id);
      }
      const communities = [...comms.entries()].map(([communityId, c]) => {
        const m = c.members.length;
        const ranked = c.members.slice().sort((a, b) => b.riskScore - a.riskScore);
        const districts = [...c.districts].sort();
        return {
          communityId,
          memberCount: m,
          edgeCount: c.edges,
          linkedCases: c.caseIds.size,
          districts,
          districtNames: districts.map((d) => lk.districtName(d)),
          topMoTags: [...c.moCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t),
          avgRisk: m ? round(ranked.reduce((s, x) => s + x.riskScore, 0) / m, 1) : 0,
          keyPerson: ranked[0] || null,
          density: m > 1 ? round((2 * c.edges) / (m * (m - 1)), 2) : 0,
          members: ranked
        };
      }).sort((a, b) => b.memberCount - a.memberCount || a.communityId - b.communityId);
      // The response DATA stays the plain array (contract); the scan census
      // rides in meta so a bounded read can never read as a complete one.
      return {
        communities,
        scan: {
          edgesScanned: edges.length,
          edgePages: edgePage.pages,
          edgesTruncated: edgePage.truncated,
          profilesScanned: profiles.length,
          profilePages: profilePage.pages,
          profilesTruncated: profilePage.truncated
        }
      };
    });
    ok(res, value.communities, { cached, ttlSec: ttl, count: value.communities.length, scan: value.scan });
  }));

  // Recurring MO signature mining across offender profiles, flagging tags that
  // recur across two or more districts (cross-jurisdiction patterns).
  router.get('/offenders/mo-patterns', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const ttl = ttlFor(req);
    const minOffenders = Math.max(1, toNum(req.query.minOffenders, 1));
    const district = req.query.districtId || req.query.district || null;
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const where = [];
      if (district) where.push({ col: 'DistrictsJson', op: 'like', val: String(district) });
      // ZCQL caps a single select at 300 rows; pageing widens the MO sample to
      // the top 1200 by risk, which is the slice that matters for signature
      // mining across a 2048-row offender table.
      const rows = await ctx.ds.queryAll({
        table: 'OffenderProfile',
        columns: ['PersonKey', 'CanonicalName', 'MOTagsJson', 'DistrictsJson', 'CaseCount', 'RiskScore'],
        where, orderBy: { col: 'RiskScore', desc: true }
      }, { maxRows: 1200 });
      const tally = new Map();
      for (const r of rows) {
        const tags = parseJsonSafe(r.MOTagsJson, []);
        const districts = parseJsonSafe(r.DistrictsJson, []).map(String);
        for (const tag of tags) {
          if (!tally.has(tag)) tally.set(tag, { offenders: [], districts: new Set(), totalCases: 0 });
          const t = tally.get(tag);
          t.offenders.push({
            personKey: String(r.PersonKey),
            name: r.CanonicalName,
            riskScore: round(toNum(r.RiskScore), 1),
            caseCount: toNum(r.CaseCount)
          });
          t.totalCases += toNum(r.CaseCount);
          for (const d of districts) t.districts.add(d);
        }
      }
      return [...tally.entries()]
        .map(([tag, t]) => {
          const districts = [...t.districts].sort();
          return {
            tag,
            offenders: t.offenders.length,
            totalCases: t.totalCases,
            districts,
            districtNames: districts.map((d) => lk.districtName(d)),
            crossJurisdiction: districts.length >= 2,
            avgRisk: round(t.offenders.reduce((s, o) => s + o.riskScore, 0) / t.offenders.length, 1),
            topOffenders: t.offenders.slice().sort((a, b) => b.riskScore - a.riskScore).slice(0, 3)
          };
        })
        .filter((t) => t.offenders >= minOffenders)
        .sort((a, b) => b.offenders - a.offenders || b.totalCases - a.totalCases || a.tag.localeCompare(b.tag));
    });
    ok(res, value, { cached, ttlSec: ttl, count: value.length });
  }));

  // Watchlist validation: POST a list of personKeys, get back enriched
  // profiles (recency, associate counts, open alerts in their districts) plus
  // the keys that resolved to nothing.
  router.post('/offenders/watch', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    const raw = Array.isArray(body.personKeys) ? body.personKeys : Array.isArray(body.keys) ? body.keys : null;
    if (!raw || !raw.length) return fail(res, 400, 'BAD_REQUEST', 'Provide personKeys as a non-empty array.');
    if (raw.length > 50) return fail(res, 400, 'BAD_REQUEST', 'Max 50 personKeys per request.');
    const keys = [...new Set(raw.map((k) => String(k).trim()).filter(Boolean))];
    if (!keys.length) return fail(res, 400, 'BAD_REQUEST', 'No usable personKeys in the list.');
    const [rows, edgesA, edgesB, openAlerts] = await Promise.all([
      ctx.ds.query({
        table: 'OffenderProfile',
        columns: ['PersonKey', 'CanonicalName', 'AliasesJson', 'CaseCount', 'DistrictsJson', 'FirstSeen', 'LastSeen', 'MOTagsJson', 'CommunityID', 'RiskScore'],
        where: [{ col: 'PersonKey', op: 'in', val: keys }]
      }),
      ctx.ds.query({ table: 'NetworkEdge', columns: ['PersonKeyA'], where: [{ col: 'PersonKeyA', op: 'in', val: keys }] }),
      ctx.ds.query({ table: 'NetworkEdge', columns: ['PersonKeyB'], where: [{ col: 'PersonKeyB', op: 'in', val: keys }] }),
      ctx.ds.query({ table: 'AnomalyAlert', columns: ['AlertID', 'DistrictID'], where: [{ col: 'Status', op: '=', val: 'OPEN' }] }).catch(() => [])
    ]);
    const assoc = new Map();
    for (const e of edgesA) assoc.set(String(e.PersonKeyA), (assoc.get(String(e.PersonKeyA)) || 0) + 1);
    for (const e of edgesB) assoc.set(String(e.PersonKeyB), (assoc.get(String(e.PersonKeyB)) || 0) + 1);
    const lk = await getLookups(ctx);
    const profiles = rows.map((r) => {
      const districts = parseJsonSafe(r.DistrictsJson, []).map(String);
      let daysSinceLastSeen = null;
      const ls = String(r.LastSeen || '');
      const parsed = new Date(ls.length === 7 ? `${ls}-01` : ls.replace(' ', 'T'));
      if (!Number.isNaN(parsed.getTime())) daysSinceLastSeen = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
      return {
        personKey: String(r.PersonKey),
        canonicalName: r.CanonicalName,
        aliases: parseJsonSafe(r.AliasesJson, []),
        caseCount: toNum(r.CaseCount),
        districts,
        districtNames: districts.map((d) => lk.districtName(d)),
        firstSeen: r.FirstSeen,
        lastSeen: r.LastSeen,
        daysSinceLastSeen,
        moTags: parseJsonSafe(r.MOTagsJson, []),
        communityId: r.CommunityID === undefined || r.CommunityID === null ? null : toNum(r.CommunityID),
        riskScore: round(toNum(r.RiskScore), 1),
        associates: assoc.get(String(r.PersonKey)) || 0,
        openAlertsInDistricts: openAlerts.filter((a) => districts.includes(String(a.DistrictID))).length
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
    const foundSet = new Set(profiles.map((p) => p.personKey));
    ok(res, { profiles, notFound: keys.filter((k) => !foundSet.has(k)), requested: keys.length }, { count: profiles.length });
  }));

  // Alert triage summary for dashboard badges: counts by status, open counts
  // by severity, the districts carrying the most open alerts, newest alert.
  router.get('/alerts/summary', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const ttl = ttlFor(req);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const [statusRows, sevRows, distRows, latestRows] = await Promise.all([
        ctx.ds.query({ table: 'AnomalyAlert', columns: ['Status', 'COUNT(AlertID)'], groupBy: ['Status'] }),
        ctx.ds.query({ table: 'AnomalyAlert', columns: ['Severity', 'COUNT(AlertID)'], where: [{ col: 'Status', op: '=', val: 'OPEN' }], groupBy: ['Severity'] }),
        ctx.ds.query({ table: 'AnomalyAlert', columns: ['DistrictID', 'COUNT(AlertID)'], where: [{ col: 'Status', op: '=', val: 'OPEN' }], groupBy: ['DistrictID'] }),
        ctx.ds.query({ table: 'AnomalyAlert', columns: ['MAX(CreatedAt)'] }).catch(() => [])
      ]);
      const byStatus = {};
      let total = 0;
      for (const r of statusRows) {
        const c = toNum(r['COUNT(AlertID)']);
        byStatus[String(r.Status)] = c;
        total += c;
      }
      const bySeverity = {};
      for (const r of sevRows) bySeverity[String(r.Severity)] = toNum(r['COUNT(AlertID)']);
      const topDistricts = distRows
        .map((r) => ({
          districtId: String(r.DistrictID),
          districtName: lk.districtName(r.DistrictID),
          openCount: toNum(r['COUNT(AlertID)'])
        }))
        .sort((a, b) => b.openCount - a.openCount)
        .slice(0, 5);
      return {
        total,
        byStatus,
        bySeverity,
        topDistricts,
        latestCreatedAt: latestRows.length ? latestRows[0]['MAX(CreatedAt)'] || null : null
      };
    });
    ok(res, value, { cached, ttlSec: ttl });
  }));
}

module.exports = { register };
