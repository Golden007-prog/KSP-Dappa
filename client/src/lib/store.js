// KSP DAPPA — tiny shared UI store (zustand). Cross-route UI state only;
// server data belongs in react-query, filter state in the URL (lib/filters.js).
// sidebarCollapsed / mapLayers / zenMode persist to localStorage ('dappa-ui');
// density and motion persist under their own keys ('dappa-density',
// 'dappa-motion') because index.html's pre-paint script restores those two
// before React mounts.
import { create } from 'zustand';

const UI_KEY = 'dappa-ui';
const DENSITY_KEY = 'dappa-density';
const MOTION_KEY = 'dappa-motion';

function readPersisted() {
  try {
    const raw = localStorage.getItem(UI_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
const persisted = readPersisted();

const DEFAULT_LAYERS = { choropleth: true, heat: false, hotspots: true, stations: false, alertPulse: true, incidents: true };

function readDensity() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.density === 'compact') return 'compact';
  try { if (localStorage.getItem(DENSITY_KEY) === 'compact') return 'compact'; } catch { /* storage unavailable */ }
  return 'comfortable';
}

function applyDensity(v) {
  if (typeof document !== 'undefined') {
    if (v === 'compact') document.documentElement.dataset.density = 'compact';
    else delete document.documentElement.dataset.density;
  }
  try { localStorage.setItem(DENSITY_KEY, v); } catch { /* private mode */ }
}

function readMotion() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce') return true;
  try { return localStorage.getItem(MOTION_KEY) === 'reduce'; } catch { return false; }
}

function applyMotion(on) {
  if (typeof document !== 'undefined') {
    if (on) document.documentElement.dataset.motion = 'reduce';
    else delete document.documentElement.dataset.motion;
  }
  try { localStorage.setItem(MOTION_KEY, on ? 'reduce' : 'full'); } catch { /* private mode */ }
}

export const useUiStore = create((set) => ({
  sidebarCollapsed: !!persisted.sidebarCollapsed,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // GeoIntel layer toggles — persisted so leaving/returning to /map (or a
  // reload) keeps them. Persisted keys merge over defaults so new layers added
  // later still get their default.
  mapLayers: {
    ...DEFAULT_LAYERS,
    ...(persisted.mapLayers && typeof persisted.mapLayers === 'object' ? persisted.mapLayers : {}),
  },
  setMapLayer: (name, on) => set((s) => ({ mapLayers: { ...s.mapLayers, [name]: on } })),

  // Zen / wall-display mode — Layout hides the sidebar + disclaimer banner.
  zenMode: !!persisted.zenMode,
  toggleZen: () => set((s) => ({ zenMode: !s.zenMode })),

  // Table density — single source of truth for every DensityToggle instance
  // and the command-palette action. Applies html[data-density] + localStorage.
  density: readDensity(),
  setDensity: (value) => {
    const v = value === 'compact' ? 'compact' : 'comfortable';
    applyDensity(v);
    set({ density: v });
    return v;
  },

  // User-level reduced-motion override (html[data-motion='reduce'] — the CSS
  // animation collapse honors it alongside prefers-reduced-motion).
  motionReduced: readMotion(),
  setMotionReduced: (on) => {
    applyMotion(!!on);
    set({ motionReduced: !!on });
  },
}));

useUiStore.subscribe((s) => {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({
      sidebarCollapsed: s.sidebarCollapsed,
      mapLayers: s.mapLayers,
      zenMode: s.zenMode,
    }));
  } catch { /* private mode */ }
});
