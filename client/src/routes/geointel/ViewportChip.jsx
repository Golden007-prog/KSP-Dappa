// "What is on screen right now" readout. Every other count on this route is
// scoped to the filter window; this one is scoped to the camera, which is the
// number an officer actually means when they point at the map and ask how many.
// Updates on moveend only, and offers a one-click fit-to-data when the viewport
// has drifted off the loaded rows entirely.
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

export default function ViewportChip({
  incidents, stations, hotspots, totalIncidents, weekdayLabel, onFit, onClearWeekday,
}) {
  const t = useT();
  const empty = incidents === 0 && stations === 0 && hotspots === 0;
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1 bg-panel/95 border border-grid rounded-xl px-2.5 py-1 shadow-lg text-[10px] text-muted max-w-full">
      <span className="uppercase tracking-wider shrink-0">{t('geointel.view.label')}</span>
      <span className="num text-ink shrink-0">{t('geointel.view.incidents', { n: fmtInt(incidents) })}</span>
      <span className="num shrink-0">{t('geointel.view.stations', { n: fmtInt(stations) })}</span>
      <span className="num shrink-0">{t('geointel.view.clusters', { n: fmtInt(hotspots) })}</span>
      {Number.isFinite(totalIncidents) && totalIncidents > 0 && (
        <span className="num shrink-0">
          {t('geointel.view.share', { p: ((incidents / totalIncidents) * 100).toFixed(0) })}
        </span>
      )}
      {weekdayLabel && (
        <button
          type="button"
          onClick={onClearWeekday}
          title={t('geointel.view.clearDayHint')}
          className="chip gi-tap shrink-0 !border-primary/50 !text-primary text-[10px] hover:!border-primary transition-colors"
        >
          {weekdayLabel}
          <span aria-hidden="true">✕</span>
        </button>
      )}
      {empty && (
        <button
          type="button"
          onClick={onFit}
          className="chip gi-tap shrink-0 text-[10px] text-amber hover:text-ink transition-colors"
        >
          {t('geointel.view.fit')}
        </button>
      )}
    </div>
  );
}
