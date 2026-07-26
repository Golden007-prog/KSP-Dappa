// Visual boolean query builder.
//
// The explorer already understands `head:theft|robbery -attempt #123`, but that
// syntax has to be memorised before it is useful. This composes the same string
// from dropdowns: one row per clause (column · include/exclude · value), commas
// in a value become OR alternatives, and the live preview shows exactly the
// query text that will be applied — so the builder teaches the syntax instead of
// replacing it. Opening it seeds the rows from whatever query is already active.
import { useEffect, useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import { useT } from '../../lib/i18n.jsx';
import { QUERY_FIELDS, parseQuery } from './query.js';

// Display order for the field select; value is the query prefix ('' = any column).
const FIELD_OPTIONS = [
  ['', 'cases.builder.fieldAny'],
  ['no', 'cases.query.field.crimeNo'],
  ['case', 'cases.query.field.caseNo'],
  ['district', 'cases.query.field.district'],
  ['station', 'cases.query.field.station'],
  ['head', 'cases.query.field.head'],
  ['subhead', 'cases.query.field.subHead'],
  ['status', 'cases.query.field.status'],
  ['gravity', 'cases.query.field.gravity'],
];

/** Query column name → the short prefix the parser accepts. */
const PREFIX_OF = (() => {
  const out = {};
  for (const [prefix] of FIELD_OPTIONS) {
    if (prefix) out[QUERY_FIELDS[prefix]] = prefix;
  }
  return out;
})();

const blank = () => ({ field: '', neg: false, value: '' });

/** clauses → the advanced query string the explorer parses. */
export function composeQuery(clauses) {
  return (clauses || [])
    .map((c) => {
      const alts = String(c.value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        // A space inside one alternative would split into two AND terms.
        .map((s) => s.replace(/\s+/g, '-'));
      if (!alts.length) return '';
      const body = alts.join('|');
      return `${c.neg ? '-' : ''}${c.field ? `${c.field}:` : ''}${body}`;
    })
    .filter(Boolean)
    .join(' ');
}

/** Existing query string → editable clause rows (best effort, never throws). */
export function decomposeQuery(q) {
  const parsed = parseQuery(q);
  const rows = parsed.tokens
    .filter((tok) => tok.key !== '#')
    .map((tok) => ({
      field: tok.key ? (PREFIX_OF[tok.key] || '') : '',
      neg: !!tok.neg,
      value: tok.alts.join(', '),
    }));
  return rows.length ? rows : [blank()];
}

export default function QueryBuilder({ open, onClose, query, onApply }) {
  const t = useT();
  const [clauses, setClauses] = useState(() => decomposeQuery(query));

  useEffect(() => {
    if (open) setClauses(decomposeQuery(query));
  }, [open, query]);

  const preview = composeQuery(clauses);
  const setAt = (i, patch) => setClauses((prev) => prev.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const removeAt = (i) => setClauses((prev) => (prev.length > 1 ? prev.filter((_, k) => k !== i) : [blank()]));

  return (
    <Sheet open={open} onClose={onClose} title={t('cases.builder.title')} className="md:w-[32rem]">
      <div className="space-y-3 px-1 pb-1">
        <p className="text-[11px] text-muted">{t('cases.builder.help')}</p>

        <div className="space-y-2">
          {clauses.map((c, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className="grid grid-cols-[minmax(0,7rem)_auto_minmax(0,1fr)_auto] items-center gap-1.5">
              <select
                className="input-dark !py-2 !text-xs w-full"
                value={c.field}
                aria-label={t('cases.builder.fieldAria', { n: i + 1 })}
                onChange={(e) => setAt(i, { field: e.target.value })}
              >
                {FIELD_OPTIONS.map(([value, labelKey]) => (
                  <option key={value || 'any'} value={value}>{t(labelKey)}</option>
                ))}
              </select>
              <button
                type="button"
                className={`btn !py-2 !px-2 text-[11px] whitespace-nowrap ${c.neg ? '!border-signal/60 !text-signal' : ''}`}
                aria-pressed={c.neg}
                onClick={() => setAt(i, { neg: !c.neg })}
              >
                {t(c.neg ? 'cases.builder.excludes' : 'cases.builder.includes')}
              </button>
              <input
                type="text"
                className="input-dark !py-2 !text-xs w-full"
                value={c.value}
                placeholder={t('cases.builder.valuePlaceholder')}
                aria-label={t('cases.builder.valueAria', { n: i + 1 })}
                onChange={(e) => setAt(i, { value: e.target.value })}
              />
              <button
                type="button"
                className="btn-ghost !p-0 flex h-9 w-9 items-center justify-center"
                aria-label={t('cases.builder.removeAria', { n: i + 1 })}
                onClick={() => removeAt(i)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="btn !py-1.5 !px-2 text-xs" onClick={() => setClauses((prev) => [...prev, blank()])}>
          {t('cases.builder.addClause')}
        </button>

        <div className="rounded-lg border border-grid/70 bg-base/40 px-2.5 py-2">
          <p className="eyebrow mb-1">{t('cases.builder.preview')}</p>
          <p className="num text-xs text-ink break-all min-h-[1rem]">{preview || t('cases.builder.previewEmpty')}</p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-grid/60 pt-3">
          <button type="button" className="btn-ghost" onClick={() => setClauses([blank()])}>
            {t('cases.builder.reset')}
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn" onClick={() => { onApply(''); onClose(); }}>
              {t('cases.builder.clearSearch')}
            </button>
            <button type="button" className="btn-primary" onClick={() => { onApply(preview); onClose(); }}>
              {t('cases.builder.apply')}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
