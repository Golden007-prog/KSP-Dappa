// A glossary term rendered as a VISIBLE plain sentence — the officer-facing
// line first, the technical term one tap away behind the (i). Sibling of
// PlainTerm (which renders the short label): use this where a full sentence
// belongs on the card (forecast band, hotspot patch, network group). With
// plain-language mode off the technical name leads and the sentence sits
// behind the (i) — nothing is hidden in either mode.
//
// Props: term (lib/plainlanguage.js key) · vars? · className? · as? (tag) ·
// size? ('sm' default — the 20 px (i) of the desktop tiers; 'lg' — a 44 px
// touch target for the Beat / Station tiers) · lead? (override the visible
// sentence with the screen's own numbers; the glossary sentence moves behind
// the (i) after the technical term).
import { usePlain } from '../lib/plainlanguage.js';
import Tooltip from './Tooltip.jsx';

const INFO = (size) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
  </svg>
);

export default function PlainSentence({ term, vars, className = '', as: Tag = 'p', size = 'sm', lead: leadOverride }) {
  const { term: resolve, plain } = usePlain();
  const r = resolve(term, vars);
  const lead = leadOverride || (plain ? r.sentence : `${r.technicalName}: ${r.technical}`);
  const behind = leadOverride
    ? `${r.technicalName} — ${r.technical} · ${r.sentence}`
    : (plain ? `${r.technicalName} — ${r.technical}` : r.sentence);
  const dims = size === 'lg' ? 'h-11 w-11 -my-3' : 'h-5 w-5';
  return (
    <Tag className={`text-[13px] leading-snug text-ink ${className}`}>
      <span>{lead}</span>
      {' '}
      <Tooltip label={behind} position="bottom">
        <button
          type="button"
          className={`inline-flex ${dims} align-middle items-center justify-center rounded-full text-muted hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber`}
          aria-label={`${r.label}: ${behind}`}
        >
          {INFO(size === 'lg' ? 16 : 11)}
        </button>
      </Tooltip>
    </Tag>
  );
}
