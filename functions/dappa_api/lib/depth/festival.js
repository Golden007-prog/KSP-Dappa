'use strict';
// Festival uplift estimator: cases per day inside a festival window against the
// surrounding baseline, per crime head, averaged across the festivals in the
// data window with a t-interval. Pure `estimate()` over daily counts; the route
// fetches the grouped counts (one ZCQL GROUP BY per festival, paged).

const { round } = require('../util');
const { parseDay, dayToIso, mean, sd } = require('./common');

// The synthetic generator's own festival calendar (pipeline/dappa_seed.py
// FESTIVALS) — Dasara / Deepavali / Ugadi dates 2023–2026 — so the estimator
// is judged against the days the data actually carries an uplift on.
const FESTIVALS = [
  { date: '2023-10-24', name: 'Dasara (Vijayadashami)' },
  { date: '2023-11-12', name: 'Deepavali' },
  { date: '2024-04-09', name: 'Ugadi' },
  { date: '2024-10-12', name: 'Dasara (Vijayadashami)' },
  { date: '2024-11-01', name: 'Deepavali' },
  { date: '2025-03-30', name: 'Ugadi' },
  { date: '2025-10-02', name: 'Dasara (Vijayadashami)' },
  { date: '2025-10-20', name: 'Deepavali' },
  { date: '2026-03-19', name: 'Ugadi' }
];
const WINDOW_DAYS = 3;   // festival day ± 3 = 7-day window
const BASE_DAYS = 31;    // baseline: the 28 days either side, outside the window

// Two-sided t critical values at 95% for n − 1 degrees of freedom (n festivals).
const T95 = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228 };

function windowsFor(festivalDate) {
  const d = parseDay(festivalDate);
  return {
    from: dayToIso(d - BASE_DAYS), to: dayToIso(d + BASE_DAYS),
    winFrom: d - WINDOW_DAYS, winTo: d + WINDOW_DAYS, baseFrom: d - BASE_DAYS, baseTo: d + BASE_DAYS
  };
}

/**
 * daily = [{ date, headId, count }] covering each festival's ±31 days, already
 * de-duplicated across the per-festival fetches (see mergeDaily) — rows are
 * summed here, so an overlapping day that arrived twice would be counted twice.
 * Returns per-head uplift with a 95% CI across festivals plus the pooled ratio.
 */
function estimate(daily, festivals, heads) {
  const fest = festivals || FESTIVALS;
  const byKey = new Map();
  for (const r of daily) {
    const d = parseDay(r.date);
    if (d === null) continue;
    const key = `${d}|${Number(r.headId)}`;
    byKey.set(key, (byKey.get(key) || 0) + Number(r.count || 0));
  }
  const headIds = heads || [...new Set(daily.map((r) => Number(r.headId)))].sort((a, b) => a - b);
  // Dasara and Deepavali sit 18 days apart, so one festival's window falls
  // inside the other's baseline; every festival window is excluded from every
  // baseline so an uplift is never measured against another uplift.
  const festivalDays = new Set();
  for (const f of fest) {
    const w = windowsFor(f.date);
    for (let d = w.winFrom; d <= w.winTo; d += 1) festivalDays.add(d);
  }
  const perHead = [];
  const totals = [];
  for (const h of headIds.concat(['all'])) {
    const rows = [];
    for (const f of fest) {
      const w = windowsFor(f.date);
      let win = 0; let base = 0; let winDays = 0; let baseDays = 0;
      for (let d = w.baseFrom; d <= w.baseTo; d += 1) {
        const c = h === 'all'
          ? headIds.reduce((s, hh) => s + (byKey.get(`${d}|${hh}`) || 0), 0)
          : (byKey.get(`${d}|${h}`) || 0);
        if (d >= w.winFrom && d <= w.winTo) { win += c; winDays += 1; } else if (!festivalDays.has(d)) { base += c; baseDays += 1; }
      }
      if (!baseDays || base === 0) continue;
      const winRate = win / winDays;
      const baseRate = base / baseDays;
      rows.push({ date: f.date, name: f.name, window: win, baseline: base, windowDays: winDays, baselineDays: baseDays, winRate: round(winRate, 2), baseRate: round(baseRate, 2), upliftPct: round(((winRate - baseRate) / baseRate) * 100, 1) });
    }
    if (!rows.length) continue;
    const ups = rows.map((r) => r.upliftPct);
    const m = mean(ups);
    const s = sd(ups);
    const n = ups.length;
    const t = T95[n - 1] || 1.96;
    const half = s === null ? null : (t * s) / Math.sqrt(n);
    const pooledWin = rows.reduce((a, r) => a + r.window, 0) / rows.reduce((a, r) => a + r.windowDays, 0);
    const pooledBase = rows.reduce((a, r) => a + r.baseline, 0) / rows.reduce((a, r) => a + r.baselineDays, 0);
    const row = {
      headId: h === 'all' ? null : h,
      festivals: n,
      meanUpliftPct: round(m, 1),
      ciLow: half === null ? null : round(m - half, 1),
      ciHigh: half === null ? null : round(m + half, 1),
      pooledUpliftPct: pooledBase ? round(((pooledWin - pooledBase) / pooledBase) * 100, 1) : null,
      verdict: half === null ? 'insufficient' : m - half > 0 ? 'uplift' : m + half < 0 ? 'dip' : 'within-noise',
      perFestival: rows
    };
    if (h === 'all') totals.push(row); else perHead.push(row);
  }
  perHead.sort((a, b) => (b.meanUpliftPct || 0) - (a.meanUpliftPct || 0));
  return {
    windowDays: 2 * WINDOW_DAYS + 1,
    baselineDays: 2 * (BASE_DAYS - WINDOW_DAYS),
    festivals: fest,
    heads: perHead,
    total: totals[0] || null,
    method: `Cases per day in the ${2 * WINDOW_DAYS + 1}-day festival window against cases per day in the ${2 * (BASE_DAYS - WINDOW_DAYS)} surrounding baseline days (±${BASE_DAYS} days, window excluded). Uplift % per festival; the estimate is the mean across festivals with a two-sided 95% t-interval (n − 1 df). "Uplift" is claimed only when the interval sits wholly above zero.`
  };
}

/**
 * Merge the per-festival fetches into one de-duplicated daily series.
 *
 * Each fetch is a GROUP BY over its own ±31-day range, so a row is the COMPLETE
 * count for that (date, head) — but Dasara and Deepavali sit 18–20 days apart,
 * so their ranges overlap and the same day arrives twice. Summing them would
 * double every day in the overlap (the window fully, the baseline only partly),
 * which inflates the uplift. A day carries one true count however many fetches
 * saw it, so merge by max: equal to either value when both are complete, and
 * never the smaller of a complete and a row-capped read.
 *
 * `fetches` = [[{ date, headId, count }, …], …], one array per festival.
 */
function mergeDaily(fetches) {
  const byKey = new Map();
  for (const rows of fetches) {
    for (const r of rows || []) {
      const key = `${String(r.date).slice(0, 10)}|${Number(r.headId)}`;
      const c = Number(r.count || 0);
      const prev = byKey.get(key);
      if (prev === undefined || c > prev.count) byKey.set(key, { date: String(r.date).slice(0, 10), headId: Number(r.headId), count: c });
    }
  }
  return [...byKey.values()];
}

/** Per-case rows (count 1 each) folded into one row per (date, head), so a
 * fetch's own rows are summed exactly once before mergeDaily de-duplicates
 * across fetches. */
function foldDaily(rows) {
  const byKey = new Map();
  for (const r of rows || []) {
    const date = String(r.date).slice(0, 10);
    const headId = Number(r.headId);
    const key = `${date}|${headId}`;
    const prev = byKey.get(key);
    if (prev) prev.count += Number(r.count || 0);
    else byKey.set(key, { date, headId, count: Number(r.count || 0) });
  }
  return [...byKey.values()];
}

module.exports = { estimate, mergeDaily, foldDaily, windowsFor, FESTIVALS, WINDOW_DAYS, BASE_DAYS, T95 };
