// GeoIntel-local helpers: color ramps (theme-aware), risk normalisation,
// hour-band labels, month windows for the heat-layer time scrubber, distance
// + clipboard helpers for the measure tool / share links.
import { format, parse, endOfMonth } from 'date-fns';

const LOW = [0x23, 0x31, 0x50]; // #233150 — same ramp as the dashboard mini-choropleth
const HIGH = [0xf5, 0xa6, 0x23]; // #F5A623
const LOW_LIGHT = [0xe4, 0xe9, 0xf4]; // #E4E9F4 pale slate on light OSM
const HIGH_LIGHT = [0xd9, 0x77, 0x06]; // #D97706 deep amber — readable on light tiles

const mix = (a, b, k) => a.map((lo, i) => Math.round(lo + (b[i] - lo) * k));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** 0..1 → slate → amber density color (light=true flips to the light-theme ramp). */
export function rampColor(t, light = false) {
  const k = Math.max(0, Math.min(1, t));
  return rgb(light ? mix(LOW_LIGHT, HIGH_LIGHT, k) : mix(LOW, HIGH, k));
}

const DIV_NEUTRAL = [0x24, 0x30, 0x49]; // #243049
const DIV_NEUTRAL_LIGHT = [0xe4, 0xe9, 0xf4];
const DIV_RED = [0xe5, 0x48, 0x4d];
const DIV_RED_LIGHT = [0xb4, 0x23, 0x18];
const DIV_TEAL = [0x2d, 0xd4, 0xbf];
const DIV_TEAL_LIGHT = [0x0f, 0x76, 0x6e];

/** -1..1 → teal (down) → neutral → red (up) diverging color for MoM deltas. */
export function divergeColor(t, light = false) {
  const k = Math.max(-1, Math.min(1, t));
  const neutral = light ? DIV_NEUTRAL_LIGHT : DIV_NEUTRAL;
  if (k >= 0) return rgb(mix(neutral, light ? DIV_RED_LIGHT : DIV_RED, k));
  return rgb(mix(neutral, light ? DIV_TEAL_LIGHT : DIV_TEAL, -k));
}

/** Choropleth zero-value fill / polygon stroke per theme. */
export const choroZeroFill = (light) => (light ? '#E9EDF6' : '#141d31');
export const choroStroke = (light) => (light ? '#C3CDE0' : '#1E2A44');

/** Legend gradient CSS for the active metric + theme. */
export function legendGradient(diverging, light) {
  if (diverging) {
    return light
      ? 'linear-gradient(90deg,#0F766E,#E4E9F4,#B42318)'
      : 'linear-gradient(90deg,#2DD4BF,#243049,#E5484D)';
  }
  return light
    ? 'linear-gradient(90deg,#E4E9F4,#D97706)'
    : 'linear-gradient(90deg,#233150,#F5A623)';
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

/** Risk band as a translation-key suffix: none | high | medium | low. */
export function riskLabelKey(r) {
  if (r === null) return 'none';
  if (r >= 0.7) return 'high';
  if (r >= 0.4) return 'medium';
  return 'low';
}

/** Translated risk band; pass the `t` from useT() (English when omitted). */
export function riskLabel(r, t) {
  const key = riskLabelKey(r);
  if (t) return t(`geointel.risk.${key}`);
  return { none: 'No score', high: 'High risk', medium: 'Medium risk', low: 'Low risk' }[key];
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

/** Great-circle distance in km between two [lat,lng] pairs (measure tool). */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Clipboard write with a hidden-textarea fallback. Resolves true on success. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Hotspot hour-band bucket from its start hour: night 22–06, day 06–17,
 * evening 17–22 (null when the start hour is missing). */
export function bandBucket(startHour) {
  const h = Number(startHour);
  if (!Number.isFinite(h)) return null;
  const s = ((Math.round(h) % 24) + 24) % 24;
  if (s >= 22 || s < 6) return 'night';
  if (s < 17) return 'day';
  return 'evening';
}

/** Whether hour `h` falls inside the [start, end) band, wrap-aware
 * (22 → 6 covers 22,23,0..5). Missing bounds → true (can't judge, keep it). */
export function hourInBand(start, end, h) {
  const s = Number(start);
  const e = Number(end);
  const n = Number(h);
  if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(n)) return true;
  const ss = ((Math.round(s) % 24) + 24) % 24;
  const ee = ((Math.round(e) % 24) + 24) % 24;
  const hh = ((Math.round(n) % 24) + 24) % 24;
  if (ss === ee) return true; // degenerate band = all day
  return ss < ee ? hh >= ss && hh < ee : hh >= ss || hh < ee;
}

/**
 * Display name for a hotspot cluster. The server label ('Chain snatching
 * cluster 4') is English-only, so in Kannada we fall back to the translated
 * crime-head name via tName — which returns `base` verbatim under English.
 */
export function hotspotName(h, tName, fallback = '') {
  const base = (h && (h.label || h.subHeadName)) || fallback;
  return tName ? tName('crimeHeads', h && h.crimeHeadId, base) : base;
}

/** Loose match rank for the locate box: 0 = substring, 1 = in-order
 * subsequence ('mysct' → 'Mysuru City'), -1 = no match. */
export function fuzzyRank(needle, hay) {
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  if (!n) return -1;
  if (h.includes(n)) return 0;
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i += 1;
    if (i === n.length) return 1;
  }
  return -1;
}
