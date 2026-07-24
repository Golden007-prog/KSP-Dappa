// Segmented control (radio-group). Props:
//   options   — [{value, label, icon?}]
//   value     — selected value
//   onChange  — (value) => void
//   ariaLabel — required for screen readers
//   size?     — 'sm' (default) | 'md'
//   className?
// ←/→ move selection (standard radio-group behaviour).
export default function SegmentedControl({
  options = [], value, onChange, ariaLabel, size = 'sm', className = '',
}) {
  const pad = size === 'md' ? 'px-3.5 py-2 text-sm min-h-[44px]' : 'px-2.5 py-1.5 text-xs min-h-[44px] sm:min-h-[36px]';

  const onKeyDown = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`inline-flex items-center rounded-lg border border-grid bg-base/50 p-0.5 ${className}`}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${pad} ${
              on ? 'bg-panel text-ink shadow-card border border-grid' : 'text-muted hover:text-ink border border-transparent'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
