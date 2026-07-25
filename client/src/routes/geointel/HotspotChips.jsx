// Hotspot chips row — top clusters ranked by intensity, each with a rank
// number and a relative score bar. Clicking a chip flies the map to the
// cluster and opens its hour-band annotation popup. Proper ul>li>button
// structure (a role on the button itself would hide it from AT as a button).
// Optional hour-band filter chips (Night / Day / Evening) filter both this row
// and the map circles via the parent.
import { unitInfo } from '../../lib/districtGeoMap.js';
import { fmtInt } from '../../lib/format.js';
import { hotspotName, hourBand } from './utils.js';
import { useI18n } from '../../lib/i18n.jsx';

// `label` is a translation key — resolve with t() at the render site.
export const HOUR_BANDS = [
  { key: 'all', label: 'geointel.band.all' },
  { key: 'night', label: 'geointel.band.night' },
  { key: 'day', label: 'geointel.band.day' },
  { key: 'evening', label: 'geointel.band.evening' },
];

export function BandFilterChips({ value, onChange, className = '' }) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t('geointel.band.aria')} className={`flex gap-1 ${className}`}>
      {HOUR_BANDS.map((b) => (
        <button
          key={b.key}
          type="button"
          aria-pressed={value === b.key}
          onClick={() => onChange(b.key)}
          className={`chip gi-tap shrink-0 bg-panel/95 shadow-lg transition-colors text-[11px] ${
            value === b.key ? '!border-primary/60 !text-primary' : 'text-muted hover:text-ink'
          }`}
        >
          {t(b.label)}
        </button>
      ))}
    </div>
  );
}

export default function HotspotChips({ hotspots, loading, error, onRetry, onSelect, selectedId }) {
  const { t, tName } = useI18n();
  if (error) {
    return (
      <div className="pointer-events-auto chip self-start !border-signal/50 bg-panel/95 text-signal shadow-lg">
        {t('geointel.error.hotspots')}
        <button type="button" className="underline ml-1 hover:text-ink transition-colors" onClick={onRetry}>
          {t('common.action.retry')}
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex gap-1.5 self-start" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton h-7 w-36 rounded-full" />
        ))}
      </div>
    );
  }
  if (!hotspots.length) return null;
  const maxIntensity = Math.max(1e-9, ...hotspots.map((h) => Number(h.intensity) || 0));
  return (
    <ul className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 max-w-full list-none m-0 p-0" aria-label={t('geointel.hotspot.listAria')}>
      {hotspots.map((h, i) => {
        const band = hourBand(h.hourBandStart, h.hourBandEnd);
        const district = tName('districts', h.districtId, unitInfo(h.districtId)?.name);
        const selected = selectedId != null && String(h.clusterId) === String(selectedId);
        const score = Math.max(0.08, (Number(h.intensity) || 0) / maxIntensity);
        const name = hotspotName(h, tName, t('geointel.hotspot.cluster', { id: h.clusterId }));
        return (
          <li key={h.clusterId} className="shrink-0">
            <button
              type="button"
              onClick={() => onSelect(h)}
              title={band
                ? t('geointel.hotspot.chipTitleBand', { n: h.intensity, band })
                : t('geointel.hotspot.chipTitle', { n: h.intensity })}
              className={`chip gi-tap bg-panel/95 shadow-lg transition-colors ${
                selected ? '!border-amber/70 !text-amber' : 'hover:border-amber/50'
              }`}
            >
              <span className="num text-[10px] text-muted">#{i + 1}</span>
              <span className="truncate max-w-[9rem]">{name}</span>
              {district && <span className="text-muted hidden sm:inline">· {district}</span>}
              <span className="num text-muted">{fmtInt(h.caseCount)}</span>
              <span className="h-1 w-9 rounded-full bg-grid overflow-hidden shrink-0" aria-hidden="true">
                <span
                  className={`block h-full rounded-full ${score >= 0.66 ? 'bg-signal' : 'bg-amber'}`}
                  style={{ width: `${Math.round(score * 100)}%` }}
                />
              </span>
              {band && <span className="num text-amber/80 hidden sm:inline">{band}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
