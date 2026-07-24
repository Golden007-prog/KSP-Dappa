// Weekly Brief data selection shared by BriefContent (render), summary.js
// (share text), markdown.js (.md export) and exports.js (CSV) — one place so
// the four never disagree on ordering or cutoffs.

/** critical > high > medium > low > unrated (low outranks unknown). */
export const sevRank = (s) =>
  ({ critical: 4, high: 3, medium: 2, low: 1 }[String(s || '').toLowerCase()] ?? 0);

export const isOpenAlert = (a) => !/ack/i.test(String(a?.status || ''));

/** Open alerts, most severe first (|z| breaks ties). */
export function selectOpenAlerts(brief, n = 8) {
  return (brief.alerts.data || [])
    .filter(isOpenAlert)
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity)
      || Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0))
    .slice(0, n);
}

/** Hotspot clusters by intensity, then case count. */
export function selectTopHotspots(brief, n = 6) {
  return [...(brief.hotspots.data || [])]
    .sort((a, b) => (Number(b.intensity) || 0) - (Number(a.intensity) || 0)
      || (b.caseCount || 0) - (a.caseCount || 0))
    .slice(0, n);
}

/** Largest co-offending communities from the network graph. */
export function selectCommunities(brief, n = 5) {
  const byId = new Map();
  for (const node of brief.network.data?.nodes || []) {
    const id = node.communityId ?? '—';
    if (!byId.has(id)) byId.set(id, { id, members: 0, cases: 0, top: null });
    const g = byId.get(id);
    g.members += 1;
    g.cases += Number(node.caseCount) || 0;
    if (!g.top || (Number(node.degree) || 0) > (Number(g.top.degree) || 0)) g.top = node;
  }
  return [...byId.values()].sort((a, b) => b.members - a.members).slice(0, n);
}

/** Next-quarter forecast rows. */
export function selectForecastRows(brief, n = 3) {
  return (brief.forecast.data?.forecast || []).slice(0, n);
}

/** Highest-risk stations. */
export function selectRiskRows(brief, n = 5) {
  return [...(brief.risk.data || [])]
    .sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0))
    .slice(0, n);
}
