// Weekly Brief classification levels — chosen in the /reports builder,
// persisted to localStorage, carried to /print/brief via ?class= and stamped
// into the header banner, the repeating print footer and (for confidential)
// a diagonal print watermark. Demo labelling only — not a real IS marking.
const KEY = 'dappa-brief-class';

export const CLASS_LEVELS = ['unclassified', 'internal', 'confidential'];

export const CLASS_META = {
  unclassified: { label: 'Unclassified', banner: null, footer: 'DAPPA Weekly Intelligence Brief' },
  internal: {
    label: 'Internal',
    banner: 'INTERNAL — For official use only',
    footer: 'INTERNAL — For official use only',
  },
  confidential: {
    label: 'Confidential',
    banner: 'CONFIDENTIAL — Restricted circulation',
    footer: 'CONFIDENTIAL — Restricted circulation',
  },
};

export const normalizeClass = (v) =>
  (CLASS_LEVELS.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : 'unclassified');

export function loadClassification() {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? 'internal' : normalizeClass(v);
  } catch {
    return 'internal';
  }
}

export function saveClassification(v) {
  try {
    localStorage.setItem(KEY, normalizeClass(v));
  } catch {
    /* private mode */
  }
}
