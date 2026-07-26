// /alerts — canonical severity / status / direction model for the anomaly corpus.
//
// WHY THIS EXISTS. AnomalyAlert.Severity is stored as an INTEGER band, not a
// word: pipeline/analytics.py writes `sev = 1 if |z| < 3 else (2 if |z| < 4
// else 3)` and the API passes it straight through (`severity: toNum(r.Severity)`
// in functions/dappa_api/lib/routes/insight.js). Verified live:
//   GET /alerts → {"severity":3,"zScore":4.2} … {"severity":1,"zScore":2.4}
// This console, however, has always spoken critical/high/medium/low — so with
// real data every severity control (chips, grouping, card tone, SLA hours,
// roll-up dots) silently fell through to "unrated". sevKey() is the single
// bridge: integers map to their band, the legacy English words pass through
// untouched, so every existing caller keeps working AND lights up on live rows.
//
// Statuses are the same story. The corpus carries OPEN and REVIEWED from the
// pipeline plus ACK / DISMISSED written by the triage endpoints, so "not ACK"
// is not the same as "needs triage".
//
// Direction matters too: the detector emits negative z for collapses in
// reporting ("fell to N cases"), not just spikes — a drop is an anomaly worth
// looking at for a different reason, and the console should say which it is.

/** Most severe first — the canonical ordering used everywhere. */
export const SEV_KEYS = ['critical', 'high', 'medium', 'low'];

const WORD_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
/** Integer band (analytics.py) → word. 0 and below is a sub-threshold band. */
const BAND_WORD = { 3: 'critical', 2: 'high', 1: 'medium', 0: 'low' };

/** Badge tone per severity — shared by cards, sheets, boards and matrices. */
export const SEV_TONE = { critical: 'red', high: 'red', medium: 'amber', low: 'neutral' };

/** |z| thresholds behind each band, for the legend and the annex. */
export const SEV_BANDS = [
  { key: 'critical', min: 4, max: null },
  { key: 'high', min: 3, max: 4 },
  { key: 'medium', min: 2, max: 3 },
  { key: 'low', min: 0, max: 2 },
];

/**
 * Any severity representation → 'critical'|'high'|'medium'|'low' (or '').
 * Accepts the integer band the Data Store actually stores (3/2/1/0, and
 * anything above 3 clamps to critical) and the English words older fixtures
 * and saved views use. Unknown input returns '' so callers keep their
 * "unrated" path.
 */
export function sevKey(v) {
  if (v === null || v === undefined || v === '') return '';
  const word = String(v).trim().toLowerCase();
  if (WORD_RANK[word]) return word;
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (n >= 3) return 'critical';
  if (n >= 1) return BAND_WORD[Math.floor(n)] || 'medium';
  return 'low';
}

/** critical 4 → low 1, unknown 0. Sorting and "is this hot" checks. */
export function sevRank(v) {
  return WORD_RANK[sevKey(v)] || 0;
}

/** Band a |z| falls in, independent of what the row claims. */
export function sevFromZ(z) {
  const a = Math.abs(Number(z));
  if (!Number.isFinite(a)) return '';
  if (a >= 4) return 'critical';
  if (a >= 3) return 'high';
  if (a >= 2) return 'medium';
  return 'low';
}

/** Severity comparator: band first, then absolute deviation. */
export function bySeverity(a, b) {
  return sevRank(b?.severity) - sevRank(a?.severity)
    || Math.abs(Number(b?.zScore) || 0) - Math.abs(Number(a?.zScore) || 0);
}

// ── status lifecycle ───────────────────────────────────────────────────────

/** Every status the corpus and the triage endpoints can produce. */
export const STATUS_KEYS = ['open', 'reviewed', 'ack', 'dismissed'];

/** Raw Status → one of STATUS_KEYS ('open' for anything unrecognised). */
export function statusKey(s) {
  const v = String(s || '').trim().toUpperCase();
  if (v === 'ACK' || v === 'ACKNOWLEDGED') return 'ack';
  if (v === 'DISMISSED' || v === 'DISMISS') return 'dismissed';
  if (v === 'REVIEWED' || v === 'CLOSED') return 'reviewed';
  return 'open';
}

/** True only for rows that still need triage. */
export const isOpenAlert = (a) => statusKey(a?.status) === 'open';
/** True once someone (or the pipeline's age rule) has taken it off the desk. */
export const isHandledAlert = (a) => statusKey(a?.status) !== 'open';
/** Acknowledged specifically — the state the ack button writes. */
export const isAckedAlert = (a) => statusKey(a?.status) === 'ack';

// ── direction ──────────────────────────────────────────────────────────────

/** 'up' (surge) | 'down' (collapse in reporting) | '' when undecidable. */
export function direction(a) {
  const z = Number(a?.zScore);
  if (Number.isFinite(z) && Math.abs(z) > 1e-9) return z > 0 ? 'up' : 'down';
  const o = Number(a?.observed);
  const e = Number(a?.expected);
  if (Number.isFinite(o) && Number.isFinite(e) && o !== e) return o > e ? 'up' : 'down';
  return '';
}
