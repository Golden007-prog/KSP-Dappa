// Status pill — colour + glyph + word, never colour alone (lib/status.js).
// Props: status ('rising'|'watch'|'stable'|'falling'|'nodata'), label?
// (override the word), size? ('sm' | 'md' — md is a 32-px touch-safe pill for
// the Beat / Station tiers), pulse? (rising only), className?.
// Prints in black on white with the glyph and word intact (index.css forces
// white pages; the tint backgrounds drop under print-color-adjust: economy).
import PulseDot from './PulseDot.jsx';
import { STATUS } from '../lib/status.js';
import { useT } from '../lib/i18n.jsx';

const TONES = {
  signal: 'bg-signal/10 text-signal border-signal/40',
  amber: 'bg-amber/10 text-amber border-amber/40',
  teal: 'bg-teal/10 text-teal border-teal/40',
  primary: 'bg-primary/10 text-primary border-primary/40',
  muted: 'bg-grid/40 text-muted border-grid',
};

export default function StatusPill({ status = 'nodata', label, size = 'sm', pulse = false, className = '' }) {
  const t = useT();
  const s = STATUS[status] || STATUS.nodata;
  const word = label || t(s.labelKey);
  const dims = size === 'md' ? 'h-8 px-3 text-xs' : 'h-6 px-2 text-[11px]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide whitespace-nowrap print:border-black print:text-black ${dims} ${TONES[s.tone]} ${className}`}
      data-status={status}
    >
      {pulse && status === 'rising' && <PulseDot />}
      <span aria-hidden="true" className="leading-none">{s.glyph}</span>
      <span>{word}</span>
    </span>
  );
}
