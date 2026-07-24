// Layer visibility chips — bound to the shared zustand store (useUiStore
// .mapLayers) so the selection survives navigating away from /map and back.
// GeoIntel additionally mirrors the selection to localStorage (prefs.js) and
// to the ?layers= URL param. One-click presets flip the whole composition:
// Command (choropleth + alerts + hotspots), Patrol (heat + incidents +
// stations), Analyst (everything).
import { useUiStore } from '../../lib/store.js';

const LAYERS = [
  { key: 'choropleth', label: 'Choropleth' },
  { key: 'heat', label: 'Incident heat' },
  { key: 'incidents', label: 'Incident points', hint: 'Individual incidents with popup cards — visible from zoom 12' },
  { key: 'hotspots', label: 'Hotspots' },
  { key: 'stations', label: 'Stations' },
  { key: 'alertPulse', label: 'Alert pulse' },
];

export const LAYER_PRESETS = [
  {
    key: 'command',
    label: 'Command',
    hint: 'Choropleth + alert pulse + hotspots — the situational overview',
    layers: { choropleth: true, heat: false, incidents: false, hotspots: true, stations: false, alertPulse: true },
  },
  {
    key: 'patrol',
    label: 'Patrol',
    hint: 'Incident heat + points + stations — where to be tonight',
    layers: { choropleth: false, heat: true, incidents: true, hotspots: false, stations: true, alertPulse: false },
  },
  {
    key: 'analyst',
    label: 'Analyst',
    hint: 'Every layer on',
    layers: { choropleth: true, heat: true, incidents: true, hotspots: true, stations: true, alertPulse: true },
  },
];

export default function LayerToggles() {
  const mapLayers = useUiStore((s) => s.mapLayers);
  const setMapLayer = useUiStore((s) => s.setMapLayer);
  const applyPreset = (p) => {
    for (const [k, v] of Object.entries(p.layers)) setMapLayer(k, v);
  };
  return (
    <div className="flex items-center gap-1.5">
      {LAYERS.map((l) => {
        const on = !!mapLayers[l.key];
        return (
          <button
            key={l.key}
            type="button"
            aria-pressed={on}
            title={l.hint}
            className={`chip gi-tap shrink-0 transition-colors ${
              on ? '!border-amber/60 !text-amber !bg-amber/10' : 'text-muted hover:text-ink hover:border-grid'
            }`}
            onClick={() => setMapLayer(l.key, !on)}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-amber' : 'bg-grid'}`} aria-hidden="true" />
            {l.label}
          </button>
        );
      })}
      <span className="h-4 w-px bg-grid shrink-0" aria-hidden="true" />
      {LAYER_PRESETS.map((p) => {
        const active = LAYERS.every((l) => !!mapLayers[l.key] === !!p.layers[l.key]);
        return (
          <button
            key={p.key}
            type="button"
            title={p.hint}
            aria-pressed={active}
            className={`chip gi-tap shrink-0 transition-colors ${
              active ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink hover:border-grid'
            }`}
            onClick={() => applyPreset(p)}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
