// KSP DAPPA — tiny shared UI store (zustand). Cross-route UI state only;
// server data belongs in react-query, filter state in the URL (lib/filters.js).
import { create } from 'zustand';

export const useUiStore = create((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // GeoIntel layer toggles — persisted here so leaving/returning to /map keeps them.
  mapLayers: { choropleth: true, heat: false, hotspots: true, stations: false, alertPulse: true },
  setMapLayer: (name, on) => set((s) => ({ mapLayers: { ...s.mapLayers, [name]: on } })),
}));
