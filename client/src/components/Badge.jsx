// Small status pill. Props: tone ('neutral'|'amber'|'red'|'teal'|'slate'),
// pulse? (adds a PulseDot before the label), className?, children.
import PulseDot from './PulseDot.jsx';

const TONES = {
  neutral: 'bg-grid/50 text-ink border-grid',
  amber: 'bg-amber/10 text-amber border-amber/40',
  red: 'bg-signal/10 text-signal border-signal/40',
  teal: 'bg-teal/10 text-teal border-teal/40',
  slate: 'bg-panel text-muted border-grid',
};

export default function Badge({ tone = 'neutral', pulse = false, className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONES[tone] || TONES.neutral} ${className}`}>
      {pulse && <PulseDot color={tone === 'red' ? 'red' : tone === 'teal' ? 'teal' : 'amber'} />}
      {children}
    </span>
  );
}
