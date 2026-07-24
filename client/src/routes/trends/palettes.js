// Trends deep-dive — chart palettes + persisted palette preference.
// Two categorical themes ("standard" = the DAPPA house order, "cb" = an
// Okabe-Ito-derived color-blind-safe order), each with a light-theme sibling
// set. Every set was run through the dataviz palette validator against its
// surface: worst adjacent-pair CVD ΔE — standard/dark 14.5 (deutan),
// standard/light 14.0 (protan), cb/dark 9.6 (protan), cb/light 9.0 (protan);
// all clear the ≥8 target, chroma, normal-vision floor, and 3:1 contrast.
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'dappa-trends-palette';

export const PALETTES = {
  standard: {
    label: 'Standard',
    dark: ['#F5A623', '#2DD4BF', '#C084FC', '#A3E635', '#7C9BFF', '#F97316'],
    light: ['#D97706', '#0F766E', '#9333EA', '#65A30D', '#2563EB', '#EA580C'],
  },
  cb: {
    label: 'CB safe',
    dark: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#CC79A7', '#0072B2'],
    light: ['#007A5E', '#B45309', '#0072B2', '#C2410C', '#4F46E5', '#A0327E'],
  },
};

/** Neutral gray reserved for the "Other" fold — never a categorical hue. */
export const OTHER_COLOR = { dark: '#5B6478', light: '#64748B' };

/** Status color for anomaly annotations (shape + label carry it too). */
export const ANOMALY_COLOR = { dark: '#E5484D', light: '#B42318' };

/** Single-hue sequential ramp for magnitude heatmaps (near-surface → amber).
 * Lightness-monotonic, so it stays readable under every CVD type. */
export const HEAT_RAMP = {
  dark: ['#1A2440', '#4E3F1F', '#8A6420', '#C08221', '#F5A623'],
  light: ['#FDF4E1', '#F3DCA4', '#E4AE4C', '#C07C0C', '#7C4A03'],
};

/** Chart-surface + muted-ink tokens per app theme (for hand-built options). */
export const SURFACE = {
  dark: { panel: '#111A2C', muted: '#8A94A8', ink: '#E6EAF2', grid: '#1E2A44' },
  light: { panel: '#FFFFFF', muted: '#5C6B84', ink: '#131B2E', grid: '#DCE3F0' },
};

export function readPalettePref() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'cb' || v === 'standard') return v;
  } catch { /* private mode */ }
  return 'standard';
}

/** [paletteKey, setPaletteKey] — persisted to localStorage. */
export function usePalettePref() {
  const [key, setKey] = useState(readPalettePref);
  const set = useCallback((v) => {
    const next = v === 'cb' ? 'cb' : 'standard';
    setKey(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  }, []);
  return [key, set];
}

/** Resolve the active series colors for (paletteKey, theme). */
export function seriesColors(paletteKey, theme) {
  const p = PALETTES[paletteKey] || PALETTES.standard;
  return theme === 'light' ? p.light : p.dark;
}
