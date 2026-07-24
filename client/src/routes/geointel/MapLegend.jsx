// GeoIntel legend + display controls. LegendItems renders the symbol key with
// a ramp that tracks the active choropleth metric and theme; MetricChips picks
// the metric (case density / per-lakh rate / MoM change / mean station risk);
// OpacityControls exposes choropleth + heat opacity sliders (persisted by the
// route). LegendBar composes all three into the collapsible desktop pill.
import PulseDot from '../../components/PulseDot.jsx';
import { legendGradient } from './utils.js';

export const CHORO_METRICS = [
  { key: 'cases', label: 'Cases', legend: 'case density' },
  { key: 'rate', label: '/lakh', legend: 'cases per lakh' },
  { key: 'mom', label: 'MoM', legend: 'MoM change', diverging: true },
  { key: 'risk', label: 'Risk', legend: 'mean station risk' },
];

export function metricDef(key) {
  return CHORO_METRICS.find((m) => m.key === key) || CHORO_METRICS[0];
}

export function LegendItems({ light = false, metricKey = 'cases' }) {
  const m = metricDef(metricKey);
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-14 rounded-full"
          style={{ background: legendGradient(!!m.diverging, light) }}
          aria-hidden="true"
        />
        {m.diverging ? `${m.legend} (down → up)` : m.legend}
      </span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-teal" aria-hidden="true" /> low-risk station</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-signal" aria-hidden="true" /> high-risk station</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber" aria-hidden="true" /> commissionerate</span>
      <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal" aria-hidden="true" /> incident point (zoom 12+)</span>
      <span className="flex items-center gap-1.5"><PulseDot /> anomaly district</span>
      <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-amber" aria-hidden="true" /> patrol route</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-signal/70" aria-hidden="true" /> high-risk halo (≥70)</span>
    </>
  );
}

export function MetricChips({ value, onChange, className = '' }) {
  return (
    <div role="group" aria-label="Choropleth metric" className={`flex items-center gap-1 ${className}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted mr-0.5 shrink-0">Metric</span>
      {CHORO_METRICS.map((m) => (
        <button
          key={m.key}
          type="button"
          aria-pressed={value === m.key}
          title={m.legend}
          onClick={() => onChange(m.key)}
          className={`chip gi-tap shrink-0 text-[11px] transition-colors ${
            value === m.key ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function OpacityControls({ choroOpacity, heatOpacity, onChoroOpacity, onHeatOpacity, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <span className="shrink-0">Choro</span>
        <input
          type="range"
          min={10}
          max={90}
          step={5}
          value={Math.round(choroOpacity * 100)}
          onChange={(e) => onChoroOpacity(Number(e.target.value) / 100)}
          className="w-16 geointel-range cursor-pointer"
          aria-label="Choropleth opacity"
          aria-valuetext={`${Math.round(choroOpacity * 100)} percent`}
        />
      </label>
      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <span className="shrink-0">Heat</span>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={Math.round(heatOpacity * 100)}
          onChange={(e) => onHeatOpacity(Number(e.target.value) / 100)}
          className="w-16 geointel-range cursor-pointer"
          aria-label="Heat layer opacity"
          aria-valuetext={`${Math.round(heatOpacity * 100)} percent`}
        />
      </label>
    </div>
  );
}

export default function LegendBar({
  light, metricKey, onMetric, open, onToggle,
  choroOpacity, heatOpacity, onChoroOpacity, onHeatOpacity,
}) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 bg-panel/95 border border-grid rounded-xl px-3 py-1.5 shadow-lg text-[10px] text-muted max-w-full">
      <button
        type="button"
        className="gi-noprint shrink-0 flex items-center gap-1 text-muted hover:text-ink transition-colors"
        aria-expanded={open}
        aria-label={open ? 'Collapse legend' : 'Expand legend'}
        onClick={onToggle}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        Legend
      </button>
      {open && (
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
          <LegendItems light={light} metricKey={metricKey} />
          <span className="h-4 w-px bg-grid shrink-0 gi-noprint" aria-hidden="true" />
          <MetricChips value={metricKey} onChange={onMetric} className="gi-noprint shrink-0" />
          <OpacityControls
            className="gi-noprint shrink-0"
            choroOpacity={choroOpacity}
            heatOpacity={heatOpacity}
            onChoroOpacity={onChoroOpacity}
            onHeatOpacity={onHeatOpacity}
          />
        </div>
      )}
    </div>
  );
}
