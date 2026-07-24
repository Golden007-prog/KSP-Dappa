// Table density switch — comfortable / compact. Writes html[data-density]
// (which drives the --density-y CSS var consumed by DataTable's .td-pad) and
// persists to localStorage ('dappa-density'; index.html pre-paint restores it).
// Props: className?, size? (forwarded to SegmentedControl).
import { useState } from 'react';
import SegmentedControl from './SegmentedControl.jsx';

const STORAGE_KEY = 'dappa-density';

function readDensity() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.density === 'compact') return 'compact';
  return 'comfortable';
}

/** Also used by the command palette action — applies + persists + returns the new value. */
export function setDensity(value) {
  const v = value === 'compact' ? 'compact' : 'comfortable';
  if (v === 'compact') document.documentElement.dataset.density = 'compact';
  else delete document.documentElement.dataset.density;
  try { localStorage.setItem(STORAGE_KEY, v); } catch { /* private mode */ }
  return v;
}

const rows = (n) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    {Array.from({ length: n }).map((_, i) => (
      <path key={i} d={`M4 ${5 + (i * 15) / (n - 1)}h16`} />
    ))}
  </svg>
);

export default function DensityToggle({ className = '', size = 'sm' }) {
  const [density, setLocal] = useState(readDensity);
  return (
    <SegmentedControl
      ariaLabel="Table density"
      className={className}
      size={size}
      value={density}
      onChange={(v) => setLocal(setDensity(v))}
      options={[
        { value: 'comfortable', label: 'Cozy', icon: rows(3) },
        { value: 'compact', label: 'Compact', icon: rows(4) },
      ]}
    />
  );
}
