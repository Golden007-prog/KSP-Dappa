// Dashboard intelligence helpers — pure, deterministic derivations over the
// normalized hook shapes: spike (z-score) detection for the total trend and
// district sparklines, red-zone extraction from live alerts, derived-population
// socio-economic overlays and their correlation readout, seasonality splits and
// the insight sentences the IntelTicker cycles. No React, no fetch.
import { polygonForUnit, unitInfo } from '../../lib/districtGeoMap.js';
import { fmtInt, fmtNum, fmtPct, monthLabel } from '../../lib/format.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const hh = (h) => String(num(h)).padStart(2, '0');

/** (18, 23) → '18:00–23:00' ('' when either bound is missing). */
export function hourBandLabel(start, end) {
  if (start === undefined || start === null || end === undefined || end === null) return '';
  return `${hh(start)}:00–${hh(end)}:00`;
}

/** Trailing rolling mean; null until `window` points exist. */
export function rollingMean(values, window = 3) {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j += 1) sum += num(values[j]);
    return sum / window;
  });
}

/**
 * Flag months whose value sits ≥ `threshold` σ from a trailing baseline of up
 * to 12 prior months (min `minBaseline`). → [{index, z, dir:'up'|'down'}].
 */
export function detectSpikes(values, { threshold = 2, minBaseline = 6 } = {}) {
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    const base = values.slice(Math.max(0, i - 12), i).map(num);
    if (base.length < minBaseline) continue;
    const mean = base.reduce((a, b) => a + b, 0) / base.length;
    const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length);
    if (sd <= 0) continue;
    const z = (num(values[i]) - mean) / sd;
    if (Math.abs(z) >= threshold) out.push({ index: i, z, dir: z > 0 ? 'up' : 'down' });
  }
  return out;
}

/** Pearson correlation coefficient, or null when degenerate (<3 pairs / no variance). */
export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + num(b), 0) / n;
  const my = ys.reduce((a, b) => a + num(b), 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = num(xs[i]) - mx;
    const dy = num(ys[i]) - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/** Back-solve a unit's population from the server's ratePerLakh
 *  (rate = caseCount / pop × 1e5 ⇒ pop = caseCount / rate × 1e5). */
export function unitPopulation(row) {
  const count = num(row?.caseCount);
  const rate = num(row?.ratePerLakh);
  return count > 0 && rate > 0 ? Math.round((count / rate) * 100000) : null;
}

/** Derived population summed per map polygon → { [polygonName]: people }. */
export function polygonPopulations(geoRows) {
  const acc = {};
  for (const r of geoRows || []) {
    const poly = polygonForUnit(r.districtId ?? r.unitId);
    const pop = unitPopulation(r);
    if (!poly || !pop) continue;
    acc[poly] = (acc[poly] || 0) + pop;
  }
  return acc;
}

/** Pearson r between unit population and case volume → {r, n} or null. */
export function populationCorrelation(geoRows) {
  const xs = [];
  const ys = [];
  for (const r of geoRows || []) {
    const pop = unitPopulation(r);
    if (!pop) continue;
    xs.push(pop);
    ys.push(num(r.caseCount));
  }
  const r = pearson(xs, ys);
  return r === null ? null : { r, n: xs.length };
}

/** Average station risk per polygon → { [polygonName]: avgRisk (rounded) }. */
export function riskPerPolygon(riskRows) {
  const sum = {};
  const cnt = {};
  for (const r of riskRows || []) {
    const poly = polygonForUnit(r.districtId ?? r.unitId);
    if (!poly || !Number.isFinite(Number(r.riskScore))) continue;
    sum[poly] = (sum[poly] || 0) + Number(r.riskScore);
    cnt[poly] = (cnt[poly] || 0) + 1;
  }
  const out = {};
  for (const k of Object.keys(sum)) out[k] = Math.round(sum[k] / cnt[k]);
  return out;
}

/**
 * Red zones from live alerts: polygons with an OPEN alert at |z| ≥ minZ.
 * → [{polygon, maxZ, districtName}] sorted worst first.
 */
export function redZonesFromAlerts(alerts, { minZ = 2 } = {}) {
  const best = new Map();
  for (const a of alerts || []) {
    if (/ack/i.test(String(a?.status || ''))) continue;
    const z = Math.abs(Number(a.zScore) || 0);
    if (z < minZ) continue;
    const poly = polygonForUnit(a.districtId ?? a.unitId);
    if (!poly) continue;
    const prev = best.get(poly);
    if (!prev || z > prev.maxZ) best.set(poly, { polygon: poly, maxZ: z, districtName: a.districtName || poly });
  }
  return [...best.values()].sort((a, b) => b.maxZ - a.maxZ);
}

/** Night (22:00–05:00) share and weekend-vs-weekday delta from the normalized
 *  seasonality shape → { nightPct, weekendDeltaPct } (nulls when degenerate). */
export function seasonalitySplits(s) {
  if (!s || !s.max || !Array.isArray(s.matrix) || s.matrix.length < 7) return null;
  const NIGHT = new Set([22, 23, 0, 1, 2, 3, 4]);
  let total = 0;
  let night = 0;
  const daySums = s.matrix.map((row) => (row || []).reduce((a, b) => a + num(b), 0));
  s.matrix.forEach((row) => (row || []).forEach((v, h) => {
    total += num(v);
    if (NIGHT.has(h)) night += num(v);
  }));
  const weekend = (daySums[5] + daySums[6]) / 2;
  const weekday = (daySums[0] + daySums[1] + daySums[2] + daySums[3] + daySums[4]) / 5;
  return {
    nightPct: total > 0 ? (night / total) * 100 : null,
    weekendDeltaPct: weekday > 0 ? ((weekend - weekday) / weekday) * 100 : null,
  };
}

const unitName = (row) => row?.districtName || unitInfo(row?.districtId)?.name || row?.districtId || 'district';

/**
 * Auto-generated one-liners for the IntelTicker. Every input is optional —
 * insights only render for data that actually arrived. Items:
 * [{id, tone:'up'|'down'|'alert'|'info', text, to}].
 */
export function buildInsights({
  compareView, geoRows, openAlerts, redZones, seasonalityData, splits,
  forecast, riskRows, hotspots, correlation, detectionPct, search = '',
} = {}) {
  const items = [];
  const push = (id, tone, text, to) => { if (text) items.push({ id, tone, text, to: to ? `${to}${search}` : undefined }); };

  const riser = compareView?.items?.find((it) => it.delta > 0);
  if (riser) {
    push('riser', 'alert', `${riser.name} is this month's fastest riser — ${fmtPct(riser.delta, { sign: true })} vs ${monthLabel(compareView.prevYm)}.`, '/trends');
  }
  const faller = [...(compareView?.items || [])].reverse().find((it) => it.delta < 0);
  if (faller) {
    push('faller', 'up', `${faller.name} is easing — ${fmtPct(faller.delta, { sign: true })} month-over-month.`, '/trends');
  }
  const topMover = [...(geoRows || [])]
    .filter((r) => Number.isFinite(Number(r.momDeltaPct)))
    .sort((a, b) => Number(b.momDeltaPct) - Number(a.momDeltaPct))[0];
  if (topMover && Number(topMover.momDeltaPct) > 0) {
    push('mover', 'alert', `${unitName(topMover)} leads district risers at ${fmtPct(Number(topMover.momDeltaPct), { sign: true })} MoM.`, '/map');
  }
  const crit = (openAlerts || []).filter((a) => /critical/i.test(String(a.severity)));
  if (crit.length) {
    const worst = crit.sort((a, b) => Math.abs(Number(b.zScore) || 0) - Math.abs(Number(a.zScore) || 0))[0];
    push('critical', 'down', `${crit.length} critical anomaly alert${crit.length > 1 ? 's' : ''} open — worst z ${fmtNum(worst.zScore, 1)} (${worst.headName || 'anomaly'} in ${unitName(worst)}).`, '/alerts');
  }
  if (redZones?.length) {
    push('redzone', 'down', `${redZones.length} red-zone district${redZones.length > 1 ? 's' : ''} running ≥2σ above historical mean — worst: ${redZones[0].districtName}.`, '/map');
  }
  const fc = forecast?.forecast?.[0];
  const lastActual = forecast?.history?.length ? Number(forecast.history[forecast.history.length - 1].actual) : null;
  if (fc && Number.isFinite(Number(fc.predicted))) {
    const deltaTxt = lastActual > 0
      ? ` (${fmtPct(((Number(fc.predicted) - lastActual) / lastActual) * 100, { sign: true })} vs this month)`
      : '';
    push('forecast', 'info', `${forecast.model || 'Model'} projects ${fmtInt(fc.predicted)} FIRs for ${monthLabel(fc.ym)}${deltaTxt}.`, '/predict');
  }
  const topRisk = [...(riskRows || [])].sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0))[0];
  if (topRisk) {
    push('risk', 'alert', `${topRisk.unitName || 'A station'} tops the 30-day risk watchlist at ${fmtNum(topRisk.riskScore, 1)}.`, '/predict');
  }
  const topHot = [...(hotspots || [])].sort((a, b) => (Number(b.intensity) || 0) - (Number(a.intensity) || 0))[0];
  if (topHot) {
    const band = hourBandLabel(topHot.hourBandStart, topHot.hourBandEnd);
    push('hotspot', 'alert', `Hottest cluster: ${topHot.subHeadName || topHot.label || 'cluster'} around ${unitInfo(topHot.districtId)?.name || 'a district'}${band ? `, active ${band}` : ''}.`, '/map');
  }
  if (splits?.nightPct !== null && splits?.nightPct !== undefined) {
    push('night', 'info', `${splits.nightPct.toFixed(0)}% of incidents occur in the 22:00–05:00 night window.`, '/trends');
  }
  if (correlation) {
    const strength = Math.abs(correlation.r) >= 0.7 ? 'strongly tracks' : Math.abs(correlation.r) >= 0.4 ? 'moderately tracks' : 'only weakly tracks';
    push('corr', 'info', `Case volume ${strength} population (r = ${correlation.r.toFixed(2)} across ${correlation.n} units) — switch the map to Per lakh to isolate true outliers.`, '/map');
  }
  if (Number.isFinite(detectionPct)) {
    const vs = detectionPct >= 65 ? 'above' : 'below';
    push('detect', detectionPct >= 65 ? 'up' : 'down', `Detection rate ${detectionPct.toFixed(1)}% — ${vs} the 65% state target.`, '/predict');
  }
  if (seasonalityData?.max) {
    // peak cell (first max hit)
    for (let d = 0; d < seasonalityData.matrix.length; d += 1) {
      const h = seasonalityData.matrix[d].indexOf(seasonalityData.max);
      if (h !== -1) {
        push('peak', 'info', `Statewide incidents peak ${seasonalityData.days[d]} ${hh(h)}:00–${hh((h + 1) % 24)}:00.`, '/trends');
        break;
      }
    }
  }
  return items;
}
