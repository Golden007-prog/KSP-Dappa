// KSP DAPPA — shared value formatters (en-IN digit grouping, tabular UI).
import { format, parse } from 'date-fns';

const intFmt = new Intl.NumberFormat('en-IN');
const compactFmt = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

/** 12345 → '12,345' ('—' for null/undefined/NaN). */
export function fmtInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? intFmt.format(Math.round(n)) : '—';
}

/** 12345 → '12.3K'. */
export function fmtCompact(v) {
  const n = Number(v);
  return Number.isFinite(n) ? compactFmt.format(n) : '—';
}

/** Percent formatter. `v` is a PERCENT value by default (fmtPct(50) → '50.0%');
 * pass fraction=true for 0–1 fractions (fmtPct(0.5, {fraction:true}) → '50.0%').
 * The legacy fraction='auto' heuristic (any |n| ≤ 1 treated as a fraction) is
 * still accepted for callers that opt in, but is no longer the default — it
 * mis-rendered genuine small percents like fmtPct(0.5). */
export function fmtPct(v, { digits = 1, sign = false, fraction = false } = {}) {
  let n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (fraction === true || (fraction === 'auto' && Math.abs(n) <= 1 && n !== 0)) n *= 100;
  const s = sign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(digits)}%`;
}

/** '2026-07' → 'Jul 26'. Falls back to the input on parse failure. */
export function monthLabel(ym) {
  try {
    return format(parse(`${ym}-01`, 'yyyy-MM-dd', new Date()), 'MMM yy');
  } catch {
    return String(ym ?? '');
  }
}

/** '2026-07-24' → '24 Jul 2026' (tolerant of full datetimes). */
export function dateLabel(iso) {
  if (!iso) return '—';
  try {
    return format(parse(String(iso).slice(0, 10), 'yyyy-MM-dd', new Date()), 'dd MMM yyyy');
  } catch {
    return String(iso);
  }
}

/** z-score / risk score etc. → fixed decimals. */
export function fmtNum(v, digits = 2) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}
