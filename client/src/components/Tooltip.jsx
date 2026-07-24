// CSS-only tooltip (see .tt rules in index.css — shows on hover AND keyboard
// focus). Props:
//   label     — tooltip text (plain string; keep it short)
//   position? — 'top' (default) | 'bottom' | 'left' | 'right'
//   className?, children — the trigger (should be focusable, e.g. a button)
export default function Tooltip({ label, position = 'top', className = '', children }) {
  const pos = position === 'top' ? '' : ` tt-${position}`;
  if (!label) return children;
  return (
    <span className={`tt${pos} inline-flex ${className}`} data-tip={label}>
      {children}
    </span>
  );
}
