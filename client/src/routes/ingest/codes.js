// Reason codes the validator emits (lib/ingest.js + localValidate.js) → the
// i18n key that explains them and the tone the cell mark takes. A code the
// list does not know still renders (its raw code) rather than an empty cell.
export const CODES = [
  'REQUIRED_MISSING', 'TYPE_INT', 'TYPE_DOUBLE', 'TYPE_BOOLEAN', 'DATE_INVALID', 'DATETIME_INVALID', 'DATE_NORMALISED', 'TIME_MISSING',
  'LEN_VARCHAR', 'LEN_TEXT', 'ENCODING_REPLACEMENT', 'DIGIT_GROUPING', 'FK_MISSING', 'CRIMENO_FORMAT', 'CRIMENO_CATEGORY',
  'CRIMENO_DISTRICT_UNKNOWN', 'CRIMENO_UNIT', 'CRIMENO_DISTRICT', 'CRIMENO_YEAR', 'CASENO_MISMATCH', 'SUBHEAD_HEAD_MISMATCH',
  'GEO_INVALID', 'GEO_OUT_OF_STATE', 'GEO_OUT_OF_DISTRICT', 'GEO_PARTIAL', 'DUP_IN_BATCH', 'DUP_IN_STORE',
  'NEVER_USED_DROPPED', 'PII_DROPPED', 'UNKNOWN_COLUMN_IGNORED',
];

export function codeKey(code) {
  return CODES.includes(code) ? `ingest.code.${code}` : null;
}

export const SEVERITY_TONE = { reject: 'signal', warn: 'amber', info: 'muted' };
export const SEVERITY_GLYPH = { reject: '✕', warn: '●', info: 'ℹ' };

/** Row verdict → StatusPill status (colour + glyph + word; the word is overridden per verdict). */
export function verdictStatus(row) {
  if (!row) return 'nodata';
  if (row.verdict === 'reject') return 'rising';
  if ((row.issues || []).some((i) => i.severity === 'warn')) return 'watch';
  return 'stable';
}

/** Batch status → StatusPill status. */
export function batchStatus(status) {
  if (status === 'loaded') return 'stable';
  if (status === 'validated' || status === 'loading' || status === 'receiving') return 'watch';
  if (status === 'rolled-back') return 'falling';
  if (status === 'partial') return 'rising';
  return 'nodata';
}
