// App shell: collapsible left nav (11 routes + icons), synthetic-data top
// banner, scrollable content outlet. Nav links carry the shared filter search
// params (lib/filters.js FILTER_KEYS) across routes. Renders an active-alert
// count badge on the Alerts item when /summary/kpis reports activeAlerts > 0.
import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { useKpis } from '../lib/api.js';
import { filterSearchString } from '../lib/filters.js';
import { useUiStore } from '../lib/store.js';
import PulseDot from './PulseDot.jsx';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Svg = ({ children }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden="true" className="shrink-0">{children}</svg>
);

const ICONS = {
  dashboard: <Svg><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>,
  map: <Svg><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></Svg>,
  trends: <Svg><path d="M3 17l5-6 4 3 6-8" /><path d="M14 6h4v4" /><path d="M3 21h18" /></Svg>,
  alerts: <Svg><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M10.5 19a2 2 0 0 0 3 0" /></Svg>,
  network: <Svg><circle cx="5" cy="6" r="2.2" /><circle cx="19" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M6.8 7.5 10.5 16M17.2 7.5 13.5 16M7.2 6h9.6" /></Svg>,
  offenders: <Svg><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><circle cx="17.5" cy="9.5" r="2.4" /><path d="M15.5 20a4.6 4.6 0 0 1 5-4.4" /></Svg>,
  predict: <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v4.5l3 2" /><path d="M12 3.5V2M20.5 12H22M12 20.5V22M3.5 12H2" /></Svg>,
  copilot: <Svg><path d="M21 12a8 8 0 0 1-8 8H4l2.4-2.9A8 8 0 1 1 21 12Z" /><path d="M9 11.5h.01M13 11.5h.01M17 11.5h.01" strokeWidth="2.4" /></Svg>,
  cases: <Svg><path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" /></Svg>,
  reports: <Svg><path d="M6 2.5h8L19 7.5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1Z" /><path d="M14 2.5V8h5M8.5 12h7M8.5 16h7" /></Svg>,
  about: <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.8h.01" strokeWidth="2.2" /></Svg>,
};

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/map', label: 'GeoIntel', icon: 'map' },
  { to: '/trends', label: 'Trends', icon: 'trends' },
  { to: '/alerts', label: 'Alerts', icon: 'alerts' },
  { to: '/network', label: 'Network', icon: 'network' },
  { to: '/offenders', label: 'Offenders', icon: 'offenders' },
  { to: '/predict', label: 'Predict', icon: 'predict' },
  { to: '/copilot', label: 'Ask DAPPA', icon: 'copilot' },
  { to: '/cases', label: 'Cases', icon: 'cases' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/about', label: 'About', icon: 'about' },
];

export default function Layout() {
  const [searchParams] = useSearchParams();
  const search = filterSearchString(searchParams);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const kpis = useKpis();
  const activeAlerts = Number(kpis.data?.activeAlerts) || 0;

  return (
    <div className="flex h-full min-h-screen bg-base">
      <aside className={`no-print flex flex-col border-r border-grid bg-panel/60 transition-all duration-200 ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className={`flex items-center gap-2.5 px-4 h-14 border-b border-grid ${collapsed ? 'justify-center px-0' : ''}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
            <path fill="#F5A623" d="M12 2l8 3v6c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V5z" />
            <path fill="#0B1220" d="M12 5.2 17 7v4.2c0 3.4-2.3 6.6-5 7.6-2.7-1-5-4.2-5-7.6V7z" />
            <path fill="#E5484D" d="M12 8.2 15 9.3v2.6c0 2-1.4 4-3 4.6-1.6-.6-3-2.6-3-4.6V9.3z" />
          </svg>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold tracking-wide text-ink">DAPPA</div>
              <div className="text-[10px] text-muted truncate">Karnataka State Police</div>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={{ pathname: item.to, search }}
              end={item.end}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-2.5 py-2 rounded-lg text-sm transition-colors border-l-2 ${
                  isActive
                    ? 'border-amber bg-grid/40 text-amber font-medium'
                    : 'border-transparent text-muted hover:text-ink hover:bg-grid/25'
                } ${collapsed ? 'justify-center px-0 mx-1.5' : ''}`
              }
            >
              {ICONS[item.icon]}
              {!collapsed && <span className="truncate flex-1">{item.label}</span>}
              {!collapsed && item.to === '/alerts' && activeAlerts > 0 && (
                <span className="num inline-flex items-center gap-1.5 rounded-full bg-signal/15 border border-signal/40 text-signal text-[10px] font-semibold px-1.5 py-0.5">
                  <PulseDot />
                  {activeAlerts}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-grid p-2">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted hover:text-ink hover:bg-grid/25 transition-colors"
            onClick={toggleSidebar}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={collapsed ? 'rotate-180' : ''}>
              <path d="M15 5l-7 7 7 7" />
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
          {!collapsed && <p className="text-[10px] text-muted/70 text-center pt-1">KSP Datathon 2026 · v0.1</p>}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="no-print flex items-center justify-center gap-2 h-7 shrink-0 bg-amber/10 border-b border-amber/30 text-[11px] text-amber tracking-wide">
          <svg width="12" height="12" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          Synthetic demonstration data — KSP Datathon 2026 prototype
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
