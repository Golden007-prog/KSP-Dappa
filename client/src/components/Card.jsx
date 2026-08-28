// Panel card — the base surface of every screen.
// Props: title?, subtitle?, actions? (node, right side of header), padded? (default true),
// className?, children. Renders header row only when title/subtitle/actions given.
export default function Card({ title, subtitle, actions, padded = true, className = '', children }) {
  const hasHeader = title || subtitle || actions;
  return (
    // min-w-0: as a flex/grid item a card's automatic minimum size is its
    // min-content, so one nowrap table inside (ChartTable) widened the whole
    // Station grid track past the phone viewport. Bounded, the card's own
    // inner scrollers take the overflow instead of the page.
    <section className={`min-w-0 bg-panel border border-grid rounded-xl shadow-card ${className}`}>
      {hasHeader && (
        // Wrapping header: on a 360-px phone an actions group that cannot
        // shrink below its content used to be laid over the title instead of
        // moving under it. flex-wrap + a basis on the title block sends the
        // actions to their own line rather than on top of the words.
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 px-4 pt-3 pb-2 border-b border-grid/60">
          <div className="min-w-0 flex-1 basis-[11rem]">
            {title && <h2 className="text-sm font-semibold text-ink truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {/* max-w-full: shrink-0 kept this group at its max-content width, so
              a header with several action controls ran past the screen edge on
              a 360-px phone; capped, its own flex-wrap folds them into rows. */}
          {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}
