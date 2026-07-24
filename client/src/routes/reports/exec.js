// Executive summary for the Weekly Brief — auto-composed prose from the same
// useBriefData queries the sections render (select.js keeps the data choices
// identical), plus the officer-edited override persisted in localStorage.
// The composed text degrades gracefully: any section that hasn't loaded (or
// errored) simply contributes no sentence.
import { fmtInt, fmtNum, dateLabel, monthLabel } from '../../lib/format.js';
import {
  sevRank, selectOpenAlerts, selectTopHotspots, selectForecastRows, selectRiskRows,
} from './select.js';

const KEY = 'dappa-brief-exec';

export function loadExecOverride() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function saveExecOverride(text) {
  try {
    if (text) localStorage.setItem(KEY, String(text));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

export const wordCount = (t) => (String(t || '').trim().match(/\S+/g) || []).length;

const hourFmt = (h) => (Number.isFinite(Number(h)) ? `${String(Number(h)).padStart(2, '0')}:00` : '—');

export function composeExecutiveSummary(brief) {
  const parts = [];
  const { win } = brief;
  const k = brief.kpis.data || {};
  const pk = brief.prevKpis?.data || {};

  if (Number.isFinite(Number(k.totalFirs))) {
    let s = `${fmtInt(k.totalFirs)} FIRs were registered in the ${win.days}-day window ${dateLabel(win.from)} – ${dateLabel(win.to)}`;
    const c = Number(k.totalFirs);
    const p = Number(pk.totalFirs);
    if (Number.isFinite(p) && p > 0) {
      const pct = ((c - p) / p) * 100;
      s += Math.abs(pct) < 0.5
        ? `, level with the preceding ${win.days} days`
        : `, ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% on the preceding ${win.days} days`;
    }
    const det = Number(k.detectionRate);
    if (Number.isFinite(det)) s += `; the detection rate stands at ${det.toFixed(1)}%`;
    parts.push(`${s}.`);
  }

  const alerts = selectOpenAlerts(brief, Infinity);
  if (alerts.length) {
    const hot = alerts.filter((a) => sevRank(a.severity) >= 3).length;
    const top = alerts[0];
    parts.push(
      `${fmtInt(alerts.length)} anomaly alert${alerts.length === 1 ? ' is' : 's are'} open`
      + `${hot ? ` (${fmtInt(hot)} high or critical)` : ''}; the sharpest deviation is `
      + `${top.headName || 'an anomaly'} in ${top.districtName || top.districtId || 'an unresolved district'} `
      + `at z ${fmtNum(top.zScore, 1)} (${fmtInt(top.observed)} observed vs ${fmtInt(top.expected)} expected).`,
    );
  }

  const hs = selectTopHotspots(brief, 1)[0];
  if (hs) {
    parts.push(
      `Spatiotemporal clustering ranks ${hs.label || `cluster ${hs.clusterId}`}`
      + `${hs.subHeadName ? ` (${hs.subHeadName})` : ''} as the leading hotspot with `
      + `${fmtInt(hs.caseCount)} cases concentrated in the ${hourFmt(hs.hourBandStart)}–${hourFmt(hs.hourBandEnd)} band.`,
    );
  }

  const nodes = brief.network.data?.nodes || [];
  if (nodes.length) {
    const groups = new Map();
    let largest = 0;
    for (const n of nodes) {
      const id = n.communityId ?? '—';
      groups.set(id, (groups.get(id) || 0) + 1);
      largest = Math.max(largest, groups.get(id));
    }
    if (largest > 1) {
      parts.push(
        `Link analysis resolves ${fmtInt(nodes.length)} offenders into ${fmtInt(groups.size)} co-offending groups; `
        + `the largest counts ${fmtInt(largest)} members.`,
      );
    }
  }

  const f = selectForecastRows(brief, 1)[0];
  const r = selectRiskRows(brief, 1)[0];
  if (f) {
    parts.push(
      `The forecast projects ≈${fmtInt(f.predicted)} FIRs for ${monthLabel(f.ym)} `
      + `(interval ${fmtInt(f.lo)}–${fmtInt(f.hi)})`
      + `${r ? `, and ${r.unitName || r.unitId} carries the highest 30-day station risk (${fmtNum(r.riskScore, 2)})` : ''}.`,
    );
  }

  return parts.join(' ');
}
