// CSS-only tooltip (see .tt rules in index.css — shows on hover AND keyboard
// focus). WCAG 1.4.13: Escape dismisses the tip without moving focus or the
// pointer (data-tt-off until the pointer leaves / focus moves on), and the tip
// itself is hoverable (pointer-events: auto while shown). Props:
//   label     — tooltip text (plain string; keep it short)
//   position? — 'top' (default) | 'bottom' | 'left' | 'right'
//   className?, children — the trigger (should be focusable, e.g. a button)
import { useState } from 'react';

export default function Tooltip({ label, position = 'top', className = '', children }) {
  const [off, setOff] = useState(false);
  const pos = position === 'top' ? '' : ` tt-${position}`;
  if (!label) return children;
  return (
    <span
      className={`tt${pos} inline-flex ${className}`}
      data-tip={label}
      data-tt-off={off ? '' : undefined}
      onKeyDown={(e) => { if (e.key === 'Escape') setOff(true); }}
      onMouseLeave={() => setOff(false)}
      onBlur={() => setOff(false)}
    >
      {children}
    </span>
  );
}
