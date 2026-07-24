// Dashboard panel frame — Card plus the panel toolbar every dashboard block
// shares: optional CSV / PNG export, pin-to-top and collapse toggles.
// Props:
//   id             — stable panel id (aria wiring)
//   title, subtitle, headerExtra? — header content (headerExtra renders before the icons)
//   pinned, collapsed, onTogglePin, onToggleCollapse
//   onExportCsv?, onExportPng?    — buttons render only when a handler is given
//   padded?=true, className?, children
import Card from '../../components/Card.jsx';
import Tooltip from '../../components/Tooltip.jsx';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const ICONS = {
  csv: (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  ),
  png: (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 18 5-5 3 3 3-3 3 3" />
    </svg>
  ),
  pin: (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z" strokeLinejoin="round" />
      <path d="M12 15v6" />
    </svg>
  ),
  chevron: (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
};

function IconBtn({ label, onClick, active = false, expanded, className = '', icon }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={expanded === undefined ? active : undefined}
        aria-expanded={expanded}
        onClick={onClick}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          active ? 'text-amber bg-amber/10' : 'text-muted hover:text-ink hover:bg-grid/40'
        } ${className}`}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

export default function DashPanel({
  id, title, subtitle, headerExtra, pinned = false, collapsed = false,
  onTogglePin, onToggleCollapse, onExportCsv, onExportPng,
  padded = true, className = '', children,
}) {
  const bodyId = `dash-panel-${id}`;
  const actions = (
    <div className="flex items-center gap-0.5">
      {headerExtra}
      {onExportCsv && <IconBtn label="Download CSV" onClick={onExportCsv} icon={ICONS.csv} />}
      {onExportPng && <IconBtn label="Download PNG" onClick={onExportPng} icon={ICONS.png} />}
      {onTogglePin && (
        <IconBtn
          label={pinned ? 'Unpin from top' : 'Pin to top'}
          onClick={onTogglePin}
          active={pinned}
          icon={ICONS.pin}
        />
      )}
      {onToggleCollapse && (
        <IconBtn
          label={collapsed ? 'Expand panel' : 'Collapse panel'}
          onClick={onToggleCollapse}
          expanded={!collapsed}
          className={collapsed ? '-rotate-90' : ''}
          icon={ICONS.chevron}
        />
      )}
    </div>
  );

  return (
    <Card
      title={title}
      subtitle={collapsed ? undefined : subtitle}
      actions={actions}
      padded={false}
      className={`h-full ${pinned ? 'border-l-2 !border-l-amber' : ''} ${className}`}
    >
      {!collapsed && <div id={bodyId} className={padded ? 'p-4' : ''}>{children}</div>}
    </Card>
  );
}
