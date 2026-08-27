// A statistical term rendered the officer's way: the plain-language label on
// the card, the technical term and its one-line explanation behind an (i).
// With plain-language mode off (lib/tier.js) the technical term is the label
// and the plain sentence sits behind the (i) instead — nothing is hidden in
// either mode, only the order changes. Glossary: lib/plainlanguage.js.
//
// Props: term (glossary key) · vars? ({n, pct…} interpolated into the
// sentence) · value? (raw metric — rendered through the term's phrasing,
// e.g. z 3.1 → "about 3 swings above normal") · showValue? · className?
import { usePlain } from '../lib/plainlanguage.js';
import Tooltip from './Tooltip.jsx';

const INFO = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
  </svg>
);

export default function PlainTerm({ term, vars, value, showValue = false, className = '', as: Tag = 'span' }) {
  const { term: resolve, fmt, plain } = usePlain();
  const r = resolve(term, vars);
  const hidden = plain ? `${r.technicalName} — ${r.technical}` : r.sentence;
  const first = plain ? r.sentence : `${r.label}`;
  return (
    <Tag className={`inline-flex items-center gap-1 ${className}`}>
      <span>{r.label}{showValue && value !== undefined && value !== null ? `: ${fmt(term, value)}` : ''}</span>
      <Tooltip label={`${first}${hidden ? ` · ${hidden}` : ''}`} position="bottom">
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
          aria-label={`${r.label}: ${r.sentence}${hidden ? ` (${hidden})` : ''}`}
        >
          {INFO}
        </button>
      </Tooltip>
    </Tag>
  );
}
