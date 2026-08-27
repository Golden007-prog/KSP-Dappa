// KSP DAPPA — shared value formatters, locale-aware (English · ಕನ್ನಡ).
//
// The active locale is module state set by LanguageProvider (setFormatLocale)
// rather than a per-call argument: these helpers are called from ~150 files and
// threading a language through every call site would be churn without benefit.
// The provider remounts the tree on language change, so no stale formats.
//
// Indian digit grouping is non-negotiable for a police audience (45,23,678 —
// not 4,523,678). ICU's kn-IN locale groups in Western thousands and its
// compact notation says "ಮಿ" (million), neither of which matches how Kannada
// newspapers or KSP reports write numbers, so Kannada borrows en-IN grouping
// and uses hand-written ಸಾವಿರ / ಲಕ್ಷ / ಕೋಟಿ suffixes.
import { format, parse } from 'date-fns';

let activeLang = 'en';

/** Locale used for number/date output. Called by LanguageProvider. */
export function setFormatLocale(lang) {
  activeLang = ['en', 'kn'].includes(lang) ? lang : 'en';
  intFmt = null; compactFmt = null; // rebuilt lazily on next use
}

export function getFormatLocale() {
  return activeLang;
}

/** Number-grouping locale: en-IN for both languages — Kannada borrows its
 * lakh/crore grouping (see above), so there is nothing to switch on. */
function numberLocale() {
  return 'en-IN';
}

/** Date locale: both have correct ICU month/weekday names. */
function dateLocale() {
  return activeLang === 'kn' ? 'kn-IN' : 'en-IN';
}

let intFmt = null;
let compactFmt = null;

/** 1234567 → '12,34,567' ('—' for null/undefined/NaN). */
export function fmtInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (!intFmt) intFmt = new Intl.NumberFormat(numberLocale());
  return intFmt.format(Math.round(n));
}

const KN_UNITS = [
  [10000000, 'ಕೋಟಿ'],
  [100000, 'ಲಕ್ಷ'],
  [1000, 'ಸಾವಿರ'],
];

/** 4523678 → '45.2L' (en) · '45.2 ಲಕ್ಷ' (kn). */
export function fmtCompact(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (activeLang === 'kn') {
    const abs = Math.abs(n);
    for (const [size, unit] of KN_UNITS) {
      if (abs >= size) {
        const scaled = n / size;
        const digits = Math.abs(scaled) >= 100 ? 0 : 1;
        return `${Number(scaled.toFixed(digits))} ${unit}`;
      }
    }
    return fmtInt(n);
  }
  if (!compactFmt) {
    compactFmt = new Intl.NumberFormat(numberLocale(), { notation: 'compact', maximumFractionDigits: 1 });
  }
  return compactFmt.format(n);
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

/** '2026-07' → 'Jul 26' · 'ಜುಲೈ 26'. Falls back to the input. */
export function monthLabel(ym) {
  const s = String(ym ?? '');
  if (activeLang === 'en') {
    try {
      return format(parse(`${s}-01`, 'yyyy-MM-dd', new Date()), 'MMM yy');
    } catch {
      return s;
    }
  }
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return s;
  try {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    const mon = new Intl.DateTimeFormat(dateLocale(), { month: 'short' }).format(d);
    return `${mon} ${m[1].slice(2)}`;
  } catch {
    return s;
  }
}

/** '2026-07-24' → '24 Jul 2026' in the active script (tolerant of datetimes). */
export function dateLabel(iso) {
  if (!iso) return '—';
  const day = String(iso).slice(0, 10);
  if (activeLang === 'en') {
    try {
      return format(parse(day, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy');
    } catch {
      return String(iso);
    }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return String(iso);
  try {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    // Explicit part order keeps the Indian day-month-year reading in every
    // script (ICU's kn-IN default is "ಜುಲೈ 25,2026").
    const mon = new Intl.DateTimeFormat(dateLocale(), { month: 'short' }).format(d);
    return `${m[3]} ${mon} ${m[1]}`;
  } catch {
    return String(iso);
  }
}

/** z-score / risk score etc. → fixed decimals. */
export function fmtNum(v, digits = 2) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}
