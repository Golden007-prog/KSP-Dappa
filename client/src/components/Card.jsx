// Panel card — the base surface of every screen.
// Props: title?, subtitle?, actions? (node, right side of header), padded? (default true),
// className?, children. Renders header row only when title/subtitle/actions given.
export default function Card({ title, subtitle, actions, padded = true, className = '', children }) {
  const hasHeader = title || subtitle || actions;
  return (
    <section className={`bg-panel border border-grid rounded-xl ${className}`}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3 pb-2 border-b border-grid/60">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}
