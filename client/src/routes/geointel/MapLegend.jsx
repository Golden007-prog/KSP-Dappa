// GeoIntel legend + display controls. LegendItems renders the symbol key with
// a ramp that tracks the active choropleth metric and theme; MetricChips picks
// the metric (case density / per-lakh rate / MoM change / mean station risk);
// OpacityControls exposes choropleth + heat opacity sliders (persisted by the
// route). LegendBar composes all three into the collapsible desktop pill.
import PulseDot from '../../components/PulseDot.jsx';
import { legendGradient } from './utils.js';
import { useT } from '../../lib/i18n.jsx';

// label/legend are translation keys; the chip labels stay abbreviation-short
// in every script so the four chips fit one row at 360px.
export const CHORO_METRICS = [
  { key: 'cases', label: 'geointel.metric.cases', legend: 'geointel.metric.casesLegend' },
  { key: 'rate', label: 'geointel.metric.rate', legend: 'geointel.metric.rateLegend' },
  { key: 'mom', label: 'geointel.metric.mom', legend: 'geointel.metric.momLegend', diverging: true },
  { key: 'risk', label: 'geointel.metric.risk', legend: 'geointel.metric.riskLegend' },
];

export function metricDef(key) {
  return CHORO_METRICS.find((m) => m.key === key) || CHORO_METRICS[0];
}

export function LegendItems({ light = false, metricKey = 'cases' }) {
  const t = useT();
  const m = metricDef(metricKey);
  const legend = t(m.legend);
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-14 rounded-full"
          style={{ background: legendGradient(!!m.diverging, light) }}
          aria-hidden="true"
        />
        {m.diverging ? t('geointel.metric.diverging', { legend }) : legend}
      </span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-teal" aria-hidden="true" /> {t('geointel.legend.lowRiskStation')}</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-signal" aria-hidden="true" /> {t('geointel.legend.highRiskStation')}</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber" aria-hidden="true" /> {t('geointel.legend.commissionerate')}</span>
      <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal" aria-hidden="true" /> {t('geointel.legend.incidentPoint')}</span>
      <span className="flex items-center gap-1.5"><PulseDot /> {t('geointel.legend.anomalyDistrict')}</span>
      <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-amber" aria-hidden="true" /> {t('geointel.legend.patrolRoute')}</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-signal/70" aria-hidden="true" /> {t('geointel.legend.riskHalo')}</span>
    </>
  );
}

export function MetricChips({ value, onChange, className = '' }) {
  const t = useT();
  return (
    <div role="group" aria-label={t('geointel.metric.aria')} className={`flex items-center gap-1 ${className}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted mr-0.5 shrink-0">{t('geointel.metric.label')}</span>
      {CHORO_METRICS.map((m) => (
        <button
          key={m.key}
          type="button"
          aria-pressed={value === m.key}
          title={t(m.legend)}
          onClick={() => onChange(m.key)}
          className={`chip gi-tap shrink-0 text-[11px] transition-colors ${
            value === m.key ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
          }`}
        >
          {t(m.label)}
        </button>
      ))}
    </div>
  );
}

export function OpacityControls({ choroOpacity, heatOpacity, onChoroOpacity, onHeatOpacity, className = '' }) {
  const t = useT();
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <span className="shrink-0">{t('geointel.opacity.choro')}</span>
        <input
          type="range"
          min={10}
          max={90}
          step={5}
          value={Math.round(choroOpacity * 100)}
          onChange={(e) => onChoroOpacity(Number(e.target.value) / 100)}
          className="w-16 geointel-range cursor-pointer"
          aria-label={t('geointel.opacity.choroAria')}
          aria-valuetext={t('geointel.opacity.valueText', { n: Math.round(choroOpacity * 100) })}
        />
      </label>
      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <span className="shrink-0">{t('geointel.opacity.heat')}</span>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={Math.round(heatOpacity * 100)}
          onChange={(e) => onHeatOpacity(Number(e.target.value) / 100)}
          className="w-16 geointel-range cursor-pointer"
          aria-label={t('geointel.opacity.heatAria')}
          aria-valuetext={t('geointel.opacity.valueText', { n: Math.round(heatOpacity * 100) })}
        />
      </label>
    </div>
  );
}

export default function LegendBar({
  light, metricKey, onMetric, open, onToggle,
  choroOpacity, heatOpacity, onChoroOpacity, onHeatOpacity,
}) {
  const t = useT();
  return (
    <div className="pointer-events-auto flex items-center gap-3 bg-panel/95 border border-grid rounded-xl px-3 py-1.5 shadow-lg text-[10px] text-muted max-w-full">
      <button
        type="button"
        className="gi-noprint shrink-0 flex items-center gap-1 text-muted hover:text-ink transition-colors"
        aria-expanded={open}
        aria-label={open ? t('geointel.legend.collapse') : t('geointel.legend.expand')}
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
        {t('geointel.legend.label')}
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
