// Friendly empty / error state. Props: title, message?, icon? (node), action? (node,
// e.g. a retry button), compact? (smaller paddings for in-card use), className?.
export default function EmptyState({ title, message, icon, action, compact = false, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-6 px-3' : 'py-14 px-6'} ${className}`}>
      <div className="text-muted mb-2">
        {icon || (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.8-3.8" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {message && <p className="text-xs text-muted mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
