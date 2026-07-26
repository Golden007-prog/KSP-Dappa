// GeoIntel analysis workbench — a docked, tabbed drawer for the statistical
// views that need more room than a map chip: the hotspot ranking table, the
// grid/Gi* density statistics, station catchment allocation and the weekday ×
// hour explorer. The route owns every tab's data and passes rendered nodes, so
// this shell stays presentational (and the same nodes drop straight into the
// mobile sheet at 360px).
import { useT } from '../../lib/i18n.jsx';

export default function AnalysisDock({ tabs, tab, onTab, onClose, className = '', style }) {
  const t = useT();
  const active = tabs.find((x) => x.key === tab) || tabs[0];
  return (
    <section
      className={`pointer-events-auto flex flex-col bg-panel/95 border border-grid rounded-xl shadow-lift overflow-hidden ${className}`}
      style={style}
      aria-label={t('geointel.dock.title')}
    >
      <header className="flex items-center gap-1 px-2 py-1.5 border-b border-grid shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted shrink-0 pl-1 pr-1 hidden lg:inline">
          {t('geointel.dock.title')}
        </span>
        <div role="tablist" aria-label={t('geointel.dock.title')} className="flex gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          {tabs.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={active?.key === x.key}
              onClick={() => onTab(x.key)}
              className={`chip gi-tap shrink-0 text-[11px] transition-colors ${
                active?.key === x.key ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        {onClose && (
          <button
            type="button"
            className="btn-ghost gi-tap gi-tap-w !px-1.5 !py-1 shrink-0"
            onClick={onClose}
            aria-label={t('geointel.dock.close')}
            title={t('geointel.dock.close')}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </header>
      <div role="tabpanel" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2.5 space-y-2.5">
        {active?.node}
      </div>
    </section>
  );
}

/** Small labelled stat used across the workbench tabs. */
export function StatTile({ label, value, hint, tone = 'ink' }) {
  return (
    <div className="rounded-lg border border-grid bg-base/40 px-2 py-1.5 min-w-0">
      <p className="text-[9px] uppercase tracking-wider text-muted truncate">{label}</p>
      <p className={`num text-sm font-semibold truncate ${tone === 'signal' ? 'text-signal' : tone === 'amber' ? 'text-amber' : tone === 'teal' ? 'text-teal' : 'text-ink'}`}>
        {value}
      </p>
      {hint && <p className="text-[9px] text-muted truncate">{hint}</p>}
    </div>
  );
}
