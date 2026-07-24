// GeoIntel-local helpers: color ramps, risk normalisation, hour-band labels,
// month windows for the heat-layer time scrubber.
import { format, parse, endOfMonth } from 'date-fns';

const LOW = [0x23, 0x31, 0x50]; // #233150 — same ramp as the dashboard mini-choropleth
const HIGH = [0xf5, 0xa6, 0x23]; // #F5A623

/** 0..1 → dark-slate → amber density color. */
export function rampColor(t) {
  const k = Math.max(0, Math.min(1, t));
  const c = LOW.map((lo, i) => Math.round(lo + (HIGH[i] - lo) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** riskScore arrives either as 0..1 or 0..100 — normalise to 0..1 (null when absent). */
export function risk01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return Math.max(0, n);
  return Math.min(n, 100) / 100;
}

export function riskColor(r) {
  if (r === null) return '#8A94A8';
  if (r >= 0.7) return '#E5484D';
  if (r >= 0.4) return '#F5A623';
  return '#2DD4BF';
}

export function riskLabel(r) {
  if (r === null) return 'No score';
  if (r >= 0.7) return 'High risk';
  if (r >= 0.4) return 'Medium risk';
  return 'Low risk';
}

/** 22 → '22:00'. */
export function hourLabel(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return null;
  return `${String(((Math.round(n) % 24) + 24) % 24).padStart(2, '0')}:00`;
}

/** (22, 2) → '22:00–02:00' (null when either bound is missing). */
export function hourBand(start, end) {
  const a = hourLabel(start);
  const b = hourLabel(end);
  return a && b ? `${a}–${b}` : null;
}

/** 'YYYY-MM' → {from, to} ISO dates covering that month ({} on bad input). */
export function monthWindow(ym) {
  try {
    const d = parse(`${ym}-01`, 'yyyy-MM-dd', new Date());
    if (Number.isNaN(d.getTime())) return {};
    return { from: format(d, 'yyyy-MM-dd'), to: format(endOfMonth(d), 'yyyy-MM-dd') };
  } catch {
    return {};
  }
}

/** Minimal HTML escaping for string-built Leaflet tooltip/popup content. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
