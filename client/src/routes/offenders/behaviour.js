// Behavioural analytics for a single offender: how the modus operandi shifts
// over time, whether the offending is escalating or winding down, and how the
// person reads against a like-for-like peer group.
//
// Everything here runs off the /offenders/:personKey timeline, which carries a
// dated row per FIR with unit, crime head, sub-head and status — verified
// against the live store (P00475 returns 43 rows spanning 2023-08 to 2026-06).
// Nothing is inferred from anything the API does not actually send.

/**
 * Offence gravity, 0–10, keyed on the official sub-head vocabulary from
 * /meta/lookups. This is an ordering of offence seriousness only — body and
 * women's-safety offences outrank property, property outranks paperwork. No
 * demographic attribute of any person is involved in the scale or anywhere
 * downstream of it.
 */
export const GRAVITY = {
  Murder: 10,
  Rape: 10,
  'Attempt to Murder': 9,
  Dacoity: 8,
  Kidnapping: 8,
  'Grievous Hurt': 7,
  Robbery: 7,
  'NDPS Trafficking': 7,
  Dowry: 7,
  Molestation: 6,
  'Cruelty by Husband': 6,
  'Chain Snatching': 5,
  'HB Night': 5,
  Riot: 5,
  'HB Day': 4,
  'NDPS Possession': 4,
  Counterfeiting: 4,
  'Criminal Breach of Trust': 4,
  'Identity Theft': 4,
  Theft: 3,
  'Vehicle Theft': 3,
  'Online Fraud': 3,
  Cheating: 3,
  'Social-Media Offence': 2,
  'Unlawful Assembly': 2,
  'Missing Person': 1,
  'Accidental Death': 1,
};

/** Head-level fallback when a sub-head is missing or unrecognised. */
const HEAD_GRAVITY = {
  'Crimes Against Body': 8,
  'Crimes Against Women': 8,
  Narcotics: 5,
  'Property Crimes': 4,
  'Public Order': 3,
  'Economic Offences': 3,
  'Cyber Crimes': 3,
  Others: 1,
};

/** Sub-heads treated as heinous for the trajectory read-out. */
export const HEINOUS = new Set([
  'Murder', 'Attempt to Murder', 'Rape', 'Dacoity', 'Kidnapping',
  'Grievous Hurt', 'Robbery', 'NDPS Trafficking', 'Dowry',
]);

export function gravityOf(row) {
  const sub = String(row?.subHeadName || '');
  if (GRAVITY[sub] !== undefined) return GRAVITY[sub];
  const head = String(row?.headName || '');
  return HEAD_GRAVITY[head] !== undefined ? HEAD_GRAVITY[head] : 3;
}

const DAY = 86400000;
const ymOf = (iso) => String(iso || '').slice(0, 7);
const yearOf = (iso) => String(iso || '').slice(0, 4);
const tsOf = (iso) => {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : null;
};

/** Timeline sorted oldest-first with parsed timestamps; unparseable rows drop. */
export function normalizeTimeline(timeline = []) {
  return timeline
    .map((r) => ({ ...r, ts: tsOf(r?.registeredDate), gravity: gravityOf(r) }))
    .filter((r) => r.ts !== null)
    .sort((a, b) => a.ts - b.ts);
}

/** Shannon entropy of a label mix, normalised 0–1 against a uniform mix. */
export function normalizedEntropy(counts = []) {
  const total = counts.reduce((s, v) => s + v, 0);
  if (total <= 0 || counts.length < 2) return 0;
  let h = 0;
  for (const v of counts) {
    if (v <= 0) continue;
    const p = v / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(counts.length);
}

/**
 * MO evolution — how the repertoire shifts year by year across FirstSeen..LastSeen.
 * Returns the per-year offence mix, the tags entering and leaving the
 * repertoire, and a diversification-vs-specialisation read from the trend in
 * mix entropy.
 */
export function moEvolution(timeline = [], { key = 'subHeadName' } = {}) {
  const rows = normalizeTimeline(timeline);
  if (!rows.length) return null;

  const years = [...new Set(rows.map((r) => yearOf(r.registeredDate)))].sort();
  const labels = [...new Set(rows.map((r) => String(r[key] || '—')))].sort();

  const byYear = years.map((y) => {
    const inYear = rows.filter((r) => yearOf(r.registeredDate) === y);
    const counts = new Map();
    for (const r of inYear) {
      const l = String(r[key] || '—');
      counts.set(l, (counts.get(l) || 0) + 1);
    }
    const gravities = inYear.map((r) => r.gravity);
    return {
      year: y,
      total: inYear.length,
      counts,
      labels: [...counts.keys()],
      entropy: normalizedEntropy([...counts.values()]),
      avgGravity: gravities.length ? gravities.reduce((s, v) => s + v, 0) / gravities.length : 0,
      heinous: inYear.filter((r) => HEINOUS.has(String(r.subHeadName || ''))).length,
    };
  });

  // Entering / leaving are read across the first and last third of the record
  // rather than adjacent years — a single quiet year should not read as the
  // whole repertoire turning over.
  const third = Math.max(1, Math.floor(rows.length / 3));
  const early = new Set(rows.slice(0, third).map((r) => String(r[key] || '—')));
  const late = new Set(rows.slice(-third).map((r) => String(r[key] || '—')));
  const entering = [...late].filter((l) => !early.has(l)).sort();
  const leaving = [...early].filter((l) => !late.has(l)).sort();
  const retained = [...late].filter((l) => early.has(l)).sort();

  // Entropy trend across years with ≥2 cases — noisy single-case years would
  // otherwise dominate a slope computed over three points.
  const usable = byYear.filter((y) => y.total >= 2);
  let entropyDelta = 0;
  if (usable.length >= 2) entropyDelta = usable[usable.length - 1].entropy - usable[0].entropy;
  const direction = Math.abs(entropyDelta) < 0.08
    ? 'stable'
    : entropyDelta > 0 ? 'diversifying' : 'specialising';

  return {
    years,
    labels,
    byYear,
    entering,
    leaving,
    retained,
    entropyDelta,
    direction,
    firstYear: years[0],
    lastYear: years[years.length - 1],
    breadthEarly: early.size,
    breadthLate: late.size,
  };
}

/** Cases per 30 days over a window, guarding zero-length spans. */
function rate(rows, fromTs, toTs) {
  const span = Math.max(DAY, toTs - fromTs);
  const n = rows.filter((r) => r.ts >= fromTs && r.ts <= toTs).length;
  return (n / span) * 30 * DAY;
}

/**
 * Behavioural change detection — escalation AND de-escalation, surfaced as
 * reviewable call-outs rather than a bare number. Each call-out carries the
 * numbers behind it so an investigator can disagree with it.
 *
 * @param anchor ISO date treated as "now". Defaults to today, because dormancy
 *        only means anything measured against the present — anchoring on the
 *        person's own last case would make every offender permanently active.
 *        A handful of live records carry a registration date a day or two
 *        ahead of today, so the anchor never runs earlier than the last case.
 */
export function behaviourFlags(timeline = [], { anchor, recentDays = 365, dormantDays = 270 } = {}) {
  const rows = normalizeTimeline(timeline);
  const out = [];
  if (rows.length < 3) return { flags: out, rows, enough: false };

  const firstTs = rows[0].ts;
  const lastTs = rows[rows.length - 1].ts;
  const anchorTs = Math.max(tsOf(anchor) ?? Date.now(), lastTs);

  // ── Gravity trajectory: mean offence gravity, first half vs second half ──
  const mid = Math.floor(rows.length / 2);
  const meanG = (arr) => (arr.length ? arr.reduce((s, r) => s + r.gravity, 0) / arr.length : 0);
  const gEarly = meanG(rows.slice(0, mid));
  const gLate = meanG(rows.slice(mid));
  const gDelta = gLate - gEarly;
  if (Math.abs(gDelta) >= 0.6) {
    out.push({
      id: gDelta > 0 ? 'gravityUp' : 'gravityDown',
      tone: gDelta > 0 ? 'red' : 'teal',
      direction: gDelta > 0 ? 'up' : 'down',
      vars: { early: gEarly, late: gLate, delta: Math.abs(gDelta) },
    });
  }

  // ── Heinous share shift ────────────────────────────────────────────────
  const heinousShare = (arr) => (arr.length
    ? arr.filter((r) => HEINOUS.has(String(r.subHeadName || ''))).length / arr.length
    : 0);
  const hEarly = heinousShare(rows.slice(0, mid));
  const hLate = heinousShare(rows.slice(mid));
  if (hLate - hEarly >= 0.15) {
    out.push({
      id: 'heinousUp',
      tone: 'red',
      direction: 'up',
      vars: { early: hEarly * 100, late: hLate * 100 },
    });
  }

  // ── Offence-frequency acceleration ─────────────────────────────────────
  const recentFrom = anchorTs - recentDays * DAY;
  const recentRate = rate(rows, recentFrom, anchorTs);
  const baseRate = rate(rows, firstTs, Math.max(firstTs + DAY, recentFrom));
  if (baseRate > 0 && rows.filter((r) => r.ts >= recentFrom).length >= 2) {
    const ratio = recentRate / baseRate;
    if (ratio >= 1.4) {
      out.push({ id: 'tempoUp', tone: 'red', direction: 'up', vars: { pct: (ratio - 1) * 100, recent: recentRate, base: baseRate } });
    } else if (ratio <= 0.6) {
      out.push({ id: 'tempoDown', tone: 'teal', direction: 'down', vars: { pct: (1 - ratio) * 100, recent: recentRate, base: baseRate } });
    }
  }

  // ── District-spread expansion / contraction ────────────────────────────
  const unitsOf = (arr) => new Set(arr.map((r) => String(r.unitName || '')).filter(Boolean));
  const uEarly = unitsOf(rows.slice(0, mid));
  const uLate = unitsOf(rows.slice(mid));
  const fresh = [...uLate].filter((u) => !uEarly.has(u));
  if (fresh.length >= 2 && uLate.size > uEarly.size) {
    out.push({ id: 'spreadUp', tone: 'amber', direction: 'up', vars: { n: fresh.length, early: uEarly.size, late: uLate.size } });
  } else if (uEarly.size - uLate.size >= 2) {
    out.push({ id: 'spreadDown', tone: 'teal', direction: 'down', vars: { early: uEarly.size, late: uLate.size } });
  }

  // ── Dormancy and re-activation ─────────────────────────────────────────
  let longestGap = 0;
  let gapEndIdx = -1;
  for (let i = 1; i < rows.length; i += 1) {
    const gap = rows[i].ts - rows[i - 1].ts;
    if (gap > longestGap) { longestGap = gap; gapEndIdx = i; }
  }
  const gapDays = Math.round(longestGap / DAY);
  const afterGap = gapEndIdx >= 0 ? rows.length - gapEndIdx : 0;
  if (gapDays >= dormantDays && afterGap >= 2) {
    out.push({
      id: 'reactivated',
      tone: 'red',
      direction: 'up',
      vars: { days: gapDays, since: rows[gapEndIdx].registeredDate, n: afterGap },
    });
  }
  const silentDays = Math.round((anchorTs - lastTs) / DAY);
  if (silentDays >= dormantDays) {
    out.push({ id: 'dormant', tone: 'slate', direction: 'down', vars: { days: silentDays, last: rows[rows.length - 1].registeredDate } });
  }

  return {
    flags: out,
    rows,
    enough: true,
    gravityEarly: gEarly,
    gravityLate: gLate,
    recentRate,
    baseRate,
    longestGapDays: gapDays,
    silentDays,
    activeMonths: new Set(rows.map((r) => ymOf(r.registeredDate))).size,
  };
}

/** Per-year mean gravity series for the trajectory chart. */
export function gravitySeries(timeline = []) {
  const rows = normalizeTimeline(timeline);
  const byYear = new Map();
  for (const r of rows) {
    const y = yearOf(r.registeredDate);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(r.gravity);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, vals]) => ({
      year,
      avg: vals.reduce((s, v) => s + v, 0) / vals.length,
      max: Math.max(...vals),
      n: vals.length,
    }));
}

const jaccard = (a, b) => {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
};

/**
 * Peer-cohort selection — find the people this offender should actually be
 * judged against, then say where they sit inside that group.
 *
 * Absolute risk rankings tell an investigator that a 200-case cross-state
 * operator outranks a 4-case local, which they already knew. The useful
 * question is whether somebody is unusual FOR THEIR PEER GROUP: among people
 * with a comparable caseload, comparable geographic footprint and a comparable
 * MO family, who is the outlier?
 */
export function peerCohort(subject, rows = [], signalByKey, { size = 40, minSimilarity = 0.05 } = {}) {
  if (!subject || !subject.personKey) return null;
  const key = String(subject.personKey);
  const subCases = Number(subject.caseCount) || 0;
  const subDistricts = new Set(subject.districts || []);
  const subTags = new Set(signalByKey?.get(key) || subject.moTags || []);

  const scored = [];
  for (const r of rows) {
    const k = String(r.personKey);
    if (k === key) continue;
    const cases = Number(r.caseCount) || 0;
    // Caseload proximity on a log scale — 4 vs 8 cases is a far bigger
    // difference in kind than 180 vs 200.
    const caseSim = 1 - Math.min(1, Math.abs(Math.log1p(cases) - Math.log1p(subCases)) / Math.log1p(60));
    const geoSim = jaccard(subDistricts, new Set(r.districts || []));
    const moSim = jaccard(subTags, new Set(signalByKey?.get(k) || r.moTags || []));
    const sameCommunity = r.communityId !== null && r.communityId !== undefined
      && String(r.communityId) === String(subject.communityId) ? 1 : 0;
    const similarity = caseSim * 0.45 + geoSim * 0.2 + moSim * 0.25 + sameCommunity * 0.1;
    if (similarity < minSimilarity) continue;
    scored.push({ row: r, similarity, caseSim, geoSim, moSim });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  const cohort = scored.slice(0, size);
  if (cohort.length < 5) return { cohort, enough: false, metrics: [] };

  const metricDefs = [
    { id: 'riskScore', get: (r) => Number(r.riskScore) || 0, higherIsWorse: true },
    { id: 'caseCount', get: (r) => Number(r.caseCount) || 0, higherIsWorse: true },
    { id: 'districtCount', get: (r) => (r.districts || []).length, higherIsWorse: true },
    { id: 'moBreadth', get: (r) => (signalByKey?.get(String(r.personKey)) || r.moTags || []).length, higherIsWorse: true },
    { id: 'aliasCount', get: (r) => (r.aliases || []).length, higherIsWorse: true },
  ];

  const metrics = metricDefs.map((d) => {
    const vals = cohort.map((c) => d.get(c.row));
    const mine = d.get(subject);
    const n = vals.length;
    const mean = vals.reduce((s, v) => s + v, 0) / n;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    const below = vals.filter((v) => v < mine).length;
    const equal = vals.filter((v) => v === mine).length;
    // Mid-rank percentile so ties do not push a median value to 0 or 100.
    const percentile = ((below + equal / 2) / n) * 100;
    const z = sd > 0 ? (mine - mean) / sd : 0;
    return {
      id: d.id,
      mine,
      mean,
      sd,
      z,
      percentile,
      outlier: Math.abs(z) >= 1.5,
      direction: z > 0 ? 'above' : z < 0 ? 'below' : 'level',
      higherIsWorse: d.higherIsWorse,
    };
  });

  const standouts = metrics.filter((m) => m.outlier).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return {
    cohort,
    enough: true,
    metrics,
    standouts,
    avgSimilarity: cohort.reduce((s, c) => s + c.similarity, 0) / cohort.length,
    verdict: standouts.length
      ? (standouts[0].z > 0 ? 'outlierHigh' : 'outlierLow')
      : 'typical',
  };
}
