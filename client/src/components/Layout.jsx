// App shell — police intelligence command center.
// Desktop (md+): collapsible grouped sidebar + translucent sticky topbar
// (command-palette trigger, IST clock, refresh-with-freshness, copy-link,
// live API health pill, theme + density controls).
// Mobile (<md): slim topbar + 5-tab bottom bar (Dashboard · GeoIntel · Cases ·
// Predict · More) where More opens a bottom sheet with the remaining routes
// plus Theme (dark/light/auto) / density / reduce-motion controls.
// Nav links carry the shared filter search params (lib/filters.js FILTER_KEYS)
// across routes; the Alerts item shows a live count from /summary/kpis.
// Global keyboard layer: Ctrl/Cmd-K palette · g,<letter> go-to · t theme ·
// f zen mode · ? shortcuts sheet ('f' is skipped on /map where GeoIntel owns it).
// The inner scroller is #main-scroll (ScrollTopButton targets it; reset to top
// on every pathname change); #main-content is the skip-link target — handled
// in JS because HashRouter would treat '#main-content' as a route.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useHealthz, useKpis, useLookups } from '../lib/api.js';
import { filterSearchString, FILTER_KEYS } from '../lib/filters.js';
import { useUiStore } from '../lib/store.js';
import { useTheme } from './ThemeProvider.jsx';
import CommandPalette from './CommandPalette.jsx';
import DensityToggle from './DensityToggle.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import PrintHeader from './PrintHeader.jsx';
import PulseDot from './PulseDot.jsx';
import ScrollTopButton from './ScrollTopButton.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import Sheet from './Sheet.jsx';
import Tooltip from './Tooltip.jsx';
import { useToast } from './ToastProvider.jsx';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Svg = ({ size = 18, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className="shrink-0">{children}</svg>
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
  search: <Svg size={16}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></Svg>,
  more: <Svg><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></Svg>,
  sun: <Svg size={16}><circle cx="12" cy="12" r="4" /><path d="M12 2.5V5M12 19v2.5M2.5 12H5m14 0h2.5M4.9 4.9 6.7 6.7m10.6 10.6 1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></Svg>,
  moon: <Svg size={16}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" /></Svg>,
  auto: <Svg size={16}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17M12 12a4.25 4.25 0 0 0 0-8.5M12 20.5a4.25 4.25 0 0 0 0-8.5" /></Svg>,
  link: <Svg size={16}><path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 1 0-5.7-5.6L11.6 7.5" /><path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 1 0 5.7 5.6l1.7-1.7" /></Svg>,
  refresh: <Svg size={16}><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 3.5v4.6h-4.6" /></Svg>,
  zen: <Svg size={16}><path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" /></Svg>,
  zenExit: <Svg size={16}><path d="M10 4v6H4M14 20v-6h6M4 10l6.5-6.5M20 14l-6.5 6.5" /></Svg>,
  keyboard: <Svg size={16}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" /></Svg>,
  motion: <Svg size={16}><circle cx="15" cy="12" r="5.5" /><path d="M3 8.5h6M2 12h5M3 15.5h6" /></Svg>,
};

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/map', label: 'GeoIntel', icon: 'map' },
      { to: '/trends', label: 'Trends', icon: 'trends' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/alerts', label: 'Alerts', icon: 'alerts' },
      { to: '/network', label: 'Network', icon: 'network' },
      { to: '/offenders', label: 'Offenders', icon: 'offenders' },
    ],
  },
  {
    label: 'AI tools',
    items: [
      { to: '/predict', label: 'Predict', icon: 'predict' },
      { to: '/copilot', label: 'Ask DAPPA', icon: 'copilot' },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/cases', label: 'Cases', icon: 'cases' },
      { to: '/reports', label: 'Reports', icon: 'reports' },
    ],
  },
  {
    label: 'System',
    items: [{ to: '/about', label: 'About', icon: 'about' }],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, section: g.label })));

// mobile: 4 primary tabs + More (rest live in the bottom sheet)
const TAB_ROUTES = ['/', '/map', '/cases', '/predict'];
const TABS = TAB_ROUTES.map((to) => ALL_NAV.find((n) => n.to === to));
const MORE_ROUTES = ALL_NAV.filter((n) => !TAB_ROUTES.includes(n.to));

// g-then-key go-to map for the global shortcut layer
const GO_KEYS = [
  ['d', '/', 'Dashboard'],
  ['m', '/map', 'GeoIntel map'],
  ['t', '/trends', 'Trends'],
  ['a', '/alerts', 'Alerts'],
  ['c', '/cases', 'Case explorer'],
  ['n', '/network', 'Network'],
  ['o', '/offenders', 'Offenders'],
  ['p', '/predict', 'Predict'],
  ['r', '/reports', 'Reports'],
];

function viewNameFor(pathname) {
  if (pathname.startsWith('/offenders/') && pathname !== '/offenders') return 'Offender 360';
  if (pathname.startsWith('/cases/') && pathname !== '/cases') return 'FIR detail';
  const hit = ALL_NAV.find((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`)));
  return hit ? hit.label : 'Not found';
}

function Shield({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <path d="M32 3 57 12.4v17.1c0 15.1-10.6 28.1-25 31.5C17.6 57.6 7 44.6 7 29.5V12.4Z" fill="#0B1220" />
      <path d="M32 7.4 53 15.3v14.2c0 12.9-8.9 23.9-21 26.9-12.1-3-21-14-21-26.9V15.3Z" fill="#5B9DFF" />
      <path d="M32 13 47.5 18.8v10.7c0 9.6-6.6 17.9-15.5 20.2-8.9-2.3-15.5-10.6-15.5-20.2V18.8Z" fill="#0B1220" />
      <path d="M32 21.5 40.5 24.7v6.1c0 5.4-3.5 10.2-8.5 11.7-5-1.5-8.5-6.3-8.5-11.7v-6.1Z" fill="#F5A623" />
    </svg>
  );
}

function AlertCountBadge({ count }) {
  if (!count) return null;
  return (
    <span className="num inline-flex items-center gap-1.5 rounded-full bg-signal/15 border border-signal/40 text-signal text-[10px] font-semibold px-1.5 py-0.5">
      <PulseDot />
      {count > 99 ? '99+' : count}
    </span>
  );
}

function HealthPill() {
  const health = useHealthz();
  const state = health.isError ? 'down' : health.isPending ? 'checking' : 'live';
  const styles = {
    live: { dot: 'teal', cls: 'border-teal/40 text-teal', text: 'Live' },
    checking: { dot: 'amber', cls: 'border-grid text-muted', text: 'Checking' },
    down: { dot: 'red', cls: 'border-signal/40 text-signal', text: 'API down' },
  }[state];
  // dot-only below sm so mobile still gets a liveness signal
  return (
    <Tooltip label={`Catalyst API health: ${styles.text}`} position="bottom">
      <span
        role="status"
        aria-label={`API health: ${styles.text}`}
        className={`inline-flex items-center gap-1.5 rounded-full border bg-panel/60 px-2 sm:px-2.5 py-1 text-[11px] font-medium ${styles.cls}`}
      >
        <PulseDot color={styles.dot} />
        <span className="hidden sm:inline">{styles.text}</span>
      </span>
    </Tooltip>
  );
}

/** IST wall clock — command-center chrome, desktop only. */
function SessionClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const fmt = useMemo(
    () => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    [],
  );
  return (
    <span
      className="num hidden xl:inline-flex items-center gap-1.5 rounded-full border border-grid bg-panel/60 px-2.5 py-1 text-[11px] text-muted"
      title="Indian Standard Time"
    >
      {fmt.format(now)} <span className="text-muted/70">IST</span>
    </span>
  );
}

/** Data freshness + manual refresh — invalidates every react-query cache. */
function RefreshControl() {
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const toast = useToast();
  const [lastDone, setLastDone] = useState(() => Date.now());
  const [, forceTick] = useState(0);
  const wasFetching = useRef(false);

  useEffect(() => {
    if (wasFetching.current && fetching === 0) setLastDone(Date.now());
    wasFetching.current = fetching > 0;
  }, [fetching]);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = async () => {
    try {
      await qc.invalidateQueries();
      toast.success('Data refreshed.');
    } catch {
      toast.error('Refresh failed — check the API connection.');
    }
  };

  const mins = Math.floor((Date.now() - lastDone) / 60000);
  const freshness = fetching > 0 ? 'refreshing…' : mins < 1 ? 'updated just now' : `updated ${mins}m ago`;

  return (
    <Tooltip label={`Refresh all data (${freshness})`} position="bottom">
      <button
        type="button"
        onClick={refresh}
        aria-label={`Refresh all data — ${freshness}`}
        className="flex items-center gap-2 h-11 min-w-[44px] justify-center rounded-lg px-0 md:px-2.5 text-muted hover:text-primary hover:bg-grid/30 transition-colors"
      >
        <span className={fetching > 0 ? 'animate-spin' : ''}>{ICONS.refresh}</span>
        <span className="num hidden md:inline text-[11px]">{freshness}</span>
      </button>
    </Tooltip>
  );
}

function Key({ children }) {
  return (
    <kbd className="num inline-flex min-w-[1.6rem] items-center justify-center rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[11px] text-ink">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex items-center gap-1">{keys}</span>
    </li>
  );
}

function GlobalShortcutsSheet({ open, onClose, isMac }) {
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="space-y-4 px-1 pb-1">
        <section>
          <p className="eyebrow mb-1">Everywhere</p>
          <ul className="divide-y divide-grid/40">
            <ShortcutRow label="Command palette" keys={<><Key>{isMac ? '⌘' : 'Ctrl'}</Key><Key>K</Key></>} />
            <ShortcutRow label="Toggle dark / light theme" keys={<Key>t</Key>} />
            <ShortcutRow label="Zen mode (hide chrome for wall displays)" keys={<Key>f</Key>} />
            <ShortcutRow label="This shortcuts sheet" keys={<Key>?</Key>} />
            <ShortcutRow label="Close a dialog or sheet" keys={<Key>Esc</Key>} />
          </ul>
        </section>
        <section>
          <p className="eyebrow mb-1">Go to… (press g, then a letter)</p>
          <ul className="divide-y divide-grid/40">
            {GO_KEYS.map(([key, , label]) => (
              <ShortcutRow key={key} label={label} keys={<><Key>g</Key><Key>{key}</Key></>} />
            ))}
          </ul>
        </section>
        <p className="text-[11px] text-muted">
          Shortcuts pause while you type in any input. On GeoIntel, <Key>f</Key> drives the map’s own fullscreen instead.
        </p>
      </div>
    </Sheet>
  );
}

const isTyping = (el) => {
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
};

export default function Layout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = filterSearchString(searchParams);
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const zen = useUiStore((s) => s.zenMode);
  const toggleZen = useUiStore((s) => s.toggleZen);
  const density = useUiStore((s) => s.density);
  const setStoreDensity = useUiStore((s) => s.setDensity);
  const motionReduced = useUiStore((s) => s.motionReduced);
  const setMotionReduced = useUiStore((s) => s.setMotionReduced);
  const { theme, pref, setTheme, toggleTheme } = useTheme();
  const kpis = useKpis();
  const lookups = useLookups();
  const activeAlerts = Number(kpis.data?.activeAlerts) || 0;

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // close the More sheet whenever navigation happens from inside it, and reset
  // the inner scroller so every view starts at the top (search-param-only
  // changes — filter edits — deliberately do NOT jump the page)
  useEffect(() => {
    setMoreOpen(false);
    document.getElementById('main-scroll')?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // document title tracks the view (+ pending alert count for the tab strip)
  useEffect(() => {
    const base = `${viewNameFor(location.pathname)} — KSP DAPPA`;
    document.title = activeAlerts > 0 ? `(${activeAlerts > 99 ? '99+' : activeAlerts}) ${base}` : base;
  }, [location.pathname, activeAlerts]);

  // global Ctrl/Cmd-K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const copyLink = async () => {
    const url = window.location.href;
    const done = () => toast.success('Link copied — filters travel with it.');
    try {
      await navigator.clipboard.writeText(url);
      done();
    } catch {
      // http / older-browser fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      if (ok) done(); else toast.error('Could not copy the link on this browser.');
    }
  };

  const zenToast = () => {
    const turningOn = !useUiStore.getState().zenMode;
    toggleZen();
    if (turningOn) toast.info('Zen mode — chrome hidden. Press f (or use the topbar button) to exit.');
  };

  // global shortcut layer: g,<letter> go-to · t theme · f zen · ? help.
  // Skipped while typing, while any dialog is open, and 'f' is left to
  // GeoIntel's own fullscreen handler on /map.
  const shortcutRefs = useRef({});
  shortcutRefs.current = { search, zenToast, toggleTheme, pathname: location.pathname };
  useEffect(() => {
    let armedAt = 0; // pending 'g' timestamp
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const s = shortcutRefs.current;
      const k = String(e.key);
      if (armedAt && Date.now() - armedAt < 1600) {
        armedAt = 0;
        const hit = GO_KEYS.find(([key]) => key === k.toLowerCase());
        if (hit) {
          e.preventDefault();
          navigate(hit[1] + s.search);
        }
        return;
      }
      if (k === 'g' || k === 'G') { armedAt = Date.now(); return; }
      if (k === 't' || k === 'T') { e.preventDefault(); s.toggleTheme(); }
      else if ((k === 'f' || k === 'F') && s.pathname !== '/map') { e.preventDefault(); s.zenToast(); }
      else if (k === '?') { e.preventDefault(); setShortcutsOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '');
  const kbdHint = isMac ? '⌘K' : 'Ctrl K';
  const filtersActive = !!search;

  const paletteActions = useMemo(() => [
    ...ALL_NAV.map((item) => ({
      id: `nav-${item.to}`,
      label: item.label,
      section: item.section,
      icon: ICONS[item.icon],
      keywords: item.to,
      perform: () => navigate({ pathname: item.to, search }),
    })),
    {
      id: 'act-theme',
      label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
      section: 'Actions',
      icon: theme === 'dark' ? ICONS.sun : ICONS.moon,
      keywords: 'theme dark light mode appearance',
      perform: toggleTheme,
    },
    ...(pref !== 'system' ? [{
      id: 'act-theme-system',
      label: 'Theme: follow system (auto)',
      section: 'Actions',
      icon: ICONS.auto,
      keywords: 'theme system auto os appearance',
      perform: () => setTheme('system'),
    }] : []),
    {
      id: 'act-density',
      label: `Table density: switch to ${density === 'compact' ? 'cozy' : 'compact'}`,
      section: 'Actions',
      keywords: 'compact comfortable cozy rows density',
      perform: () => setStoreDensity(density === 'compact' ? 'comfortable' : 'compact'),
    },
    {
      id: 'act-sidebar',
      label: collapsed ? 'Expand sidebar' : 'Collapse sidebar',
      section: 'Actions',
      keywords: 'navigation sidebar collapse expand',
      perform: toggleSidebar,
    },
    {
      id: 'act-zen',
      label: zen ? 'Exit zen mode' : 'Zen mode (hide chrome for wall displays)',
      section: 'Actions',
      icon: zen ? ICONS.zenExit : ICONS.zen,
      keywords: 'zen fullscreen wall display presentation kiosk chrome',
      perform: zenToast,
    },
    {
      id: 'act-copy-link',
      label: 'Copy link to this view',
      section: 'Actions',
      icon: ICONS.link,
      keywords: 'share copy url link clipboard',
      perform: copyLink,
    },
    {
      id: 'act-refresh',
      label: 'Refresh all data',
      section: 'Actions',
      icon: ICONS.refresh,
      keywords: 'refresh reload invalidate data fetch',
      perform: () => {
        qc.invalidateQueries()
          .then(() => toast.success('Data refreshed.'))
          .catch(() => toast.error('Refresh failed — check the API connection.'));
      },
    },
    {
      id: 'act-motion',
      label: motionReduced ? 'Motion: re-enable animations' : 'Motion: reduce animations',
      section: 'Actions',
      icon: ICONS.motion,
      keywords: 'motion animation reduce accessibility vestibular',
      perform: () => setMotionReduced(!motionReduced),
    },
    {
      id: 'act-shortcuts',
      label: 'Keyboard shortcuts…',
      section: 'Actions',
      icon: ICONS.keyboard,
      keywords: 'keyboard shortcuts hotkeys help keys',
      perform: () => setShortcutsOpen(true),
    },
    ...(filtersActive ? [{
      id: 'act-clear-filters',
      label: 'Clear all filters',
      section: 'Filters',
      keywords: 'clear reset filters district crime head period',
      perform: () => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          for (const key of FILTER_KEYS) next.delete(key);
          return next;
        });
      },
    }] : []),
    // hidden until the user types — jump-filter to any district on the current view
    ...((lookups.data?.districts || []).map((d) => ({
      id: `filter-district-${d.districtId}`,
      label: `Filter: ${d.districtName}`,
      section: 'Filters',
      keywords: 'district filter jump focus',
      hidden: true,
      perform: () => {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('districtId', d.districtId);
          return next;
        });
      },
    }))),
  ], [navigate, search, theme, pref, setTheme, toggleTheme, collapsed, toggleSidebar,
    zen, density, setStoreDensity, motionReduced, setMotionReduced, filtersActive,
    lookups.data, qc, toast, setSearchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const moreActive = MORE_ROUTES.some((r) => location.pathname === r.to || (r.to !== '/' && location.pathname.startsWith(`${r.to}/`)));
  const viewName = viewNameFor(location.pathname);

  return (
    <div className="flex h-full min-h-screen bg-base">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          // HashRouter would parse '#main-content' as a route — handle in place
          e.preventDefault();
          document.getElementById('main-scroll')?.scrollTo({ top: 0 });
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      <OfflineBanner />

      {/* ---- desktop sidebar (hidden entirely in zen mode) ---- */}
      <aside
        aria-label="Primary"
        className={`no-print ${zen ? 'hidden' : 'hidden md:flex'} flex-col border-r border-grid bg-panel/60 transition-all duration-200 ${collapsed ? 'w-[68px]' : 'w-60 xl:w-64'}`}
      >
        <div className={`flex items-center gap-2.5 h-14 border-b border-grid shrink-0 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
          <Shield />
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold tracking-[0.08em] text-ink">DAPPA</div>
              <div className="text-[10px] text-muted truncate">Karnataka State Police</div>
            </div>
          )}
        </div>
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-3">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-3' : ''}>
              {!collapsed && <p className="eyebrow px-4.5 pb-1.5">{group.label}</p>}
              {collapsed && gi > 0 && <div className="mx-4 mb-2 border-t border-grid/70" aria-hidden="true" />}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={{ pathname: item.to, search }}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 mx-2 px-2.5 py-2 min-h-[38px] rounded-lg text-sm transition-colors border-l-2 ${
                        isActive
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-transparent text-muted hover:text-ink hover:bg-grid/25'
                      } ${collapsed ? 'justify-center px-0 mx-1.5' : ''}`
                    }
                  >
                    {ICONS[item.icon]}
                    {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                    {!collapsed && item.to === '/alerts' && <AlertCountBadge count={activeAlerts} />}
                    {collapsed && item.to === '/alerts' && activeAlerts > 0 && <PulseDot className="absolute top-1.5 right-1.5" />}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-grid p-2 shrink-0">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg px-2 py-2 min-h-[38px] text-xs text-muted hover:text-ink hover:bg-grid/25 transition-colors"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}>
              <path d="M15 5l-7 7 7 7" />
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
          {!collapsed && <p className="text-[10px] text-muted/70 text-center pt-1">KSP Datathon 2026 · v0.1</p>}
        </div>
      </aside>

      {/* ---- content column ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {!zen && (
          <div
            role="note"
            className="no-print flex items-center justify-center gap-2 h-6 shrink-0 bg-amber/10 border-b border-amber/30 text-[10px] md:text-[11px] text-amber tracking-wide px-2 truncate"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" {...stroke} aria-hidden="true" className="shrink-0">
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            <span className="truncate">Synthetic demonstration data — KSP Datathon 2026 prototype</span>
          </div>
        )}

        <div id="main-scroll" className="flex-1 overflow-y-auto">
          {/* translucent sticky topbar */}
          <header className="no-print sticky top-0 z-40 flex items-center gap-2 md:gap-3 h-14 px-3 md:px-5 border-b border-grid bg-base/75 backdrop-blur-md">
            <div className={`flex items-center gap-2 ${zen ? '' : 'md:hidden'} min-w-0`}>
              <Shield size={22} />
              <span className="text-sm font-bold tracking-[0.08em] text-ink">DAPPA</span>
            </div>

            {/* command palette trigger */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:flex flex-1 max-w-md items-center gap-2.5 rounded-lg border border-grid bg-panel/70 px-3 py-2 min-h-[38px] text-sm text-muted hover:border-primary/50 hover:text-ink transition-colors"
              aria-label="Open command palette"
            >
              {ICONS.search}
              <span className="flex-1 text-left truncate">Search or jump to…</span>
              <kbd className="rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[10px]">{kbdHint}</kbd>
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              className="sm:hidden flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-grid/30 transition-colors"
            >
              {ICONS.search}
            </button>

            <div className="flex-1 sm:hidden" />

            <SessionClock />
            <RefreshControl />
            <Tooltip label="Copy link to this view" position="bottom">
              <button
                type="button"
                onClick={copyLink}
                aria-label="Copy link to this view"
                className="hidden sm:flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-grid/30 transition-colors"
              >
                {ICONS.link}
              </button>
            </Tooltip>
            <HealthPill />
            <DensityToggle className="hidden md:inline-flex" />
            {zen && (
              <Tooltip label="Exit zen mode" position="bottom">
                <button
                  type="button"
                  onClick={zenToast}
                  aria-label="Exit zen mode"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-primary hover:bg-grid/30 transition-colors"
                >
                  {ICONS.zenExit}
                </button>
              </Tooltip>
            )}
            <Tooltip label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} position="bottom">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-grid/30 transition-colors"
              >
                {theme === 'dark' ? ICONS.sun : ICONS.moon}
              </button>
            </Tooltip>
          </header>

          <main id="main-content" tabIndex={-1} className="p-4 md:p-6 pb-24 md:pb-8 focus:outline-none">
            <PrintHeader viewName={viewName} />
            <Outlet />
          </main>
        </div>
      </div>

      {/* ---- mobile bottom tab bar ---- */}
      <nav
        aria-label="Primary tabs"
        className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-grid bg-base/90 backdrop-blur-md pb-safe"
      >
        <div className="grid grid-cols-5">
          {TABS.map((item) => (
            <NavLink
              key={item.to}
              to={{ pathname: item.to, search }}
              end={item.end}
              aria-label={item.label}
              className={({ isActive }) =>
                `relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden="true" />}
                  {ICONS[item.icon]}
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More views"
            aria-haspopup="dialog"
            className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              moreActive ? 'text-primary' : 'text-muted'
            }`}
          >
            {moreActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden="true" />}
            <span className="relative">
              {ICONS.more}
              {activeAlerts > 0 && <PulseDot className="absolute -top-0.5 -right-1.5" />}
            </span>
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* ---- More sheet (mobile) ---- */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More views">
        <nav aria-label="More views" className="space-y-0.5">
          {MORE_ROUTES.map((item) => (
            <NavLink
              key={item.to}
              to={{ pathname: item.to, search }}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'text-ink hover:bg-grid/30'
                }`
              }
            >
              {ICONS[item.icon]}
              <span className="flex-1">{item.label}</span>
              {item.to === '/alerts' && <AlertCountBadge count={activeAlerts} />}
              <span className="eyebrow">{item.section}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-3 border-t border-grid pt-3 space-y-3 px-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-muted">Theme</span>
            <SegmentedControl
              ariaLabel="Theme"
              size="md"
              value={pref}
              onChange={(v) => setTheme(v)}
              options={[
                { value: 'dark', label: 'Dark', icon: ICONS.moon },
                { value: 'light', label: 'Light', icon: ICONS.sun },
                { value: 'system', label: 'Auto', icon: ICONS.auto },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-muted">Table density</span>
            <DensityToggle size="md" />
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-muted">Reduce motion</span>
            <SegmentedControl
              ariaLabel="Reduce motion"
              size="md"
              value={motionReduced ? 'on' : 'off'}
              onChange={(v) => setMotionReduced(v === 'on')}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On', icon: ICONS.motion },
              ]}
            />
          </div>
        </div>
      </Sheet>

      <GlobalShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} isMac={isMac} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
      <ScrollTopButton targetId="main-scroll" />
    </div>
  );
}
