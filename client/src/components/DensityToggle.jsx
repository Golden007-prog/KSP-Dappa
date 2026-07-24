// Table density switch — comfortable / compact. State lives in the shared
// zustand UI store (single source of truth) so every mounted instance and the
// command-palette action stay in sync; the store applies html[data-density]
// (which drives the --density-y CSS var consumed by DataTable's .td-pad) and
// persists to localStorage ('dappa-density'; index.html pre-paint restores it).
// Props: className?, size? (forwarded to SegmentedControl).
import SegmentedControl from './SegmentedControl.jsx';
import { useUiStore } from '../lib/store.js';

/** Imperative setter (command palette etc.) — applies + persists + returns the new value. */
export function setDensity(value) {
  return useUiStore.getState().setDensity(value);
}

const rows = (n) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    {Array.from({ length: n }).map((_, i) => (
      <path key={i} d={`M4 ${5 + (i * 15) / (n - 1)}h16`} />
    ))}
  </svg>
);

export default function DensityToggle({ className = '', size = 'sm' }) {
  const density = useUiStore((s) => s.density);
  const setStoreDensity = useUiStore((s) => s.setDensity);
  return (
    <SegmentedControl
      ariaLabel="Table density"
      className={className}
      size={size}
      value={density}
      onChange={(v) => setStoreDensity(v)}
      options={[
        { value: 'comfortable', label: 'Cozy', icon: rows(3) },
        { value: 'compact', label: 'Compact', icon: rows(4) },
      ]}
    />
  );
}
