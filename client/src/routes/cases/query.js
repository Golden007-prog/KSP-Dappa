// Advanced search query language for the Case Explorer's client-side text
// refinement. Plain terms behave exactly like the old substring search (all
// terms must match = implicit AND); power syntax layers on top:
//   field:value   — scope a term to one column (district:mysuru, status:pending)
//   a|b|c         — OR alternatives inside one term (head:theft|robbery)
//   -term         — NOT (exclude rows matching the term)
//   #12345        — exact CaseMasterID match (also drives the jump-to-case chip)
// Everything is case-insensitive substring matching, mirroring buildRefine.
export const QUERY_FIELDS = {
  no: 'crimeNo', crimeno: 'crimeNo',
  case: 'caseNo', caseno: 'caseNo',
  district: 'districtName', dist: 'districtName',
  station: 'unitName', unit: 'unitName',
  head: 'headName',
  subhead: 'subHeadName', sub: 'subHeadName',
  status: 'statusName',
  gravity: 'gravityName',
};

const HAY_KEYS = ['crimeNo', 'caseNo', 'districtName', 'unitName', 'headName', 'subHeadName', 'statusName', 'gravityName'];

const FIELD_LABELS = {
  crimeNo: 'crime no', caseNo: 'case no', districtName: 'district', unitName: 'station',
  headName: 'head', subHeadName: 'subhead', statusName: 'status', gravityName: 'gravity',
};

const FIELD_LABEL_KEYS = {
  crimeNo: 'cases.query.field.crimeNo', caseNo: 'cases.query.field.caseNo',
  districtName: 'cases.query.field.district', unitName: 'cases.query.field.station',
  headName: 'cases.query.field.head', subHeadName: 'cases.query.field.subHead',
  statusName: 'cases.query.field.status', gravityName: 'cases.query.field.gravity',
};

/**
 * parseQuery('head:theft|robbery -attempt #123') →
 * { tokens:[{key,neg,alts:[..]}], advanced, highlight:[..lowercased], jumpId }
 * A null token key means "search every column" (legacy behavior).
 */
export function parseQuery(q) {
  const raw = String(q || '').trim();
  const out = { tokens: [], advanced: false, highlight: [], jumpId: '' };
  if (!raw) return out;
  for (const part of raw.split(/\s+/)) {
    let t = part;
    let neg = false;
    if (t.startsWith('-') && t.length > 1) { neg = true; t = t.slice(1); out.advanced = true; }
    if (t.startsWith('#') && /^\d+$/.test(t.slice(1))) {
      out.advanced = true;
      if (!neg) out.jumpId = t.slice(1);
      out.tokens.push({ key: '#', neg, alts: [t.slice(1)] });
      continue;
    }
    let key = null;
    const m = /^([a-zA-Z]+):(.+)$/.exec(t);
    if (m && QUERY_FIELDS[m[1].toLowerCase()]) {
      key = QUERY_FIELDS[m[1].toLowerCase()];
      t = m[2];
      out.advanced = true;
    }
    const alts = t.split('|').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!alts.length) continue;
    if (alts.length > 1) out.advanced = true;
    out.tokens.push({ key, neg, alts });
    if (!neg) out.highlight.push(...alts);
  }
  return out;
}

/** Row predicate for a parsed query — composes with the other refinements. */
export function buildQueryMatcher(parsed) {
  const tokens = parsed?.tokens || [];
  if (!tokens.length) return () => true;
  return (r) => {
    let hay = null; // lazily built — fielded-only queries never join the haystack
    for (const tok of tokens) {
      let hit;
      if (tok.key === '#') {
        hit = tok.alts.some((a) => String(r?.caseMasterId ?? '') === a);
      } else if (tok.key) {
        const cell = String(r?.[tok.key] ?? '').toLowerCase();
        hit = tok.alts.some((a) => cell.includes(a));
      } else {
        if (hay === null) hay = HAY_KEYS.map((k) => String(r?.[k] ?? '').toLowerCase()).join(' ');
        hit = tok.alts.some((a) => hay.includes(a));
      }
      if (tok.neg ? hit : !hit) return false;
    }
    return true;
  };
}

/** Human chips for how an advanced query was interpreted. `t` is optional —
 * without it the chips stay English (callers outside the language provider). */
export function describeTokens(parsed, t = null) {
  const say = (key, fallback) => (t ? t(key) : fallback);
  return (parsed?.tokens || []).map((tok) => {
    const scope = tok.key === '#'
      ? say('cases.query.field.caseId', 'case id')
      : tok.key
        ? (FIELD_LABEL_KEYS[tok.key] ? say(FIELD_LABEL_KEYS[tok.key], FIELD_LABELS[tok.key]) : tok.key)
        : null;
    const value = tok.alts.join(say('cases.query.or', ' or '));
    return {
      neg: !!tok.neg,
      label: `${tok.neg ? say('cases.query.not', 'NOT ') : ''}${scope ? `${scope}: ` : ''}${value}`,
    };
  });
}

export const QUERY_SYNTAX_HELP = [
  ['term term', 'every term must match (AND)'],
  ['head:theft|robbery', 'scope to a column, | for OR'],
  ['-word', 'exclude rows matching the word'],
  ['#12345', 'exact CaseMasterID'],
  ['fields', 'no · case · district · station · head · subhead · status · gravity'],
];
