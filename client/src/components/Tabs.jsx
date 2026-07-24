// In-page tabs. Props:
//   tabs      — [{value, label, badge?}] (badge renders as a small count chip)
//   value     — active tab value
//   onChange  — (value) => void
//   ariaLabel?, className?
// Proper tablist semantics with ←/→/Home/End roving focus; 44px touch targets;
// horizontally scrollable when tabs overflow on small screens.
import { useRef } from 'react';

export default function Tabs({ tabs = [], value, onChange, ariaLabel = 'Tabs', className = '' }) {
  const listRef = useRef(null);

  const focusTab = (idx) => {
    const btns = listRef.current?.querySelectorAll('[role="tab"]');
    const btn = btns?.[idx];
    if (btn) { btn.focus(); onChange(tabs[idx].value); }
  };

  const onKeyDown = (e, i) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); focusTab((i + 1) % tabs.length); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusTab((i - 1 + tabs.length) % tabs.length); }
    else if (e.key === 'Home') { e.preventDefault(); focusTab(0); }
    else if (e.key === 'End') { e.preventDefault(); focusTab(tabs.length - 1); }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-end gap-1 border-b border-grid overflow-x-auto no-scrollbar ${className}`}
    >
      {tabs.map((t, i) => {
        const activeTab = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={activeTab}
            tabIndex={activeTab ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative -mb-px inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap
              border-b-2 px-3.5 pt-2 pb-2.5 text-sm transition-colors ${
              activeTab
                ? 'border-primary text-ink font-medium'
                : 'border-transparent text-muted hover:text-ink hover:border-grid'
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== null && (
              <span className={`num rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                activeTab ? 'bg-primary/15 text-primary' : 'bg-grid/60 text-muted'
              }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
