// Layer visibility chips — bound to the shared zustand store (useUiStore
// .mapLayers) so the selection survives navigating away from /map and back.
// GeoIntel additionally mirrors the selection to localStorage (prefs.js).
import { useUiStore } from '../../lib/store.js';

const LAYERS = [
  { key: 'choropleth', label: 'Choropleth' },
  { key: 'heat', label: 'Incident heat' },
  { key: 'incidents', label: 'Incident points', hint: 'Individual incidents with popup cards — visible from zoom 12' },
  { key: 'hotspots', label: 'Hotspots' },
  { key: 'stations', label: 'Stations' },
  { key: 'alertPulse', label: 'Alert pulse' },
];

export default function LayerToggles() {
  const mapLayers = useUiStore((s) => s.mapLayers);
  const setMapLayer = useUiStore((s) => s.setMapLayer);
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
            className={`chip shrink-0 transition-colors ${
              on ? '!border-amber/60 !text-amber !bg-amber/10' : 'text-muted hover:text-ink hover:border-grid'
            }`}
            onClick={() => setMapLayer(l.key, !on)}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-amber' : 'bg-grid'}`} aria-hidden="true" />
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
