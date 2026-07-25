// Patrol-route suggestion pill: ordered stop chips for the nearest-neighbour
// route over the top visible hotspots, total length, drive-time estimate and
// a copy-as-text action for the shift briefing. The map polyline + numbered
// stop markers render in MapCanvas.
import { useT } from '../../lib/i18n.jsx';

export default function PatrolRoutePill({ route, bandLabel, onCopy, onExit }) {
  const t = useT();
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 bg-panel/95 border border-grid rounded-xl px-2.5 py-1.5 shadow-lg text-[11px] max-w-full">
      <span className="text-[10px] uppercase tracking-wider text-amber shrink-0">
        {bandLabel ? t('geointel.patrol.labelBand', { band: bandLabel }) : t('geointel.patrol.label')}
      </span>
      {!route || !route.stops.length ? (
        <span className="text-muted">{t('geointel.patrol.none')}</span>
      ) : (
        <>
          {route.stops.map((s, i) => (
            <span key={`${s.lat}-${s.lng}-${i}`} className="chip !border-amber/40">
              <span className="num text-[10px] text-amber">{i + 1}</span>
              <span className="truncate max-w-[8rem]">{s.label}</span>
              {i > 0 && <span className="num text-[10px] text-muted">{t('geointel.patrol.km', { km: s.legKm.toFixed(1) })}</span>}
            </span>
          ))}
          <span className="shrink-0 text-ink">
            <span className="num font-semibold">{t('geointel.patrol.km', { km: route.totalKm.toFixed(1) })}</span>
            <span className="text-muted"> {t('geointel.patrol.eta', { n: route.etaMin })}</span>
          </span>
          <button
            type="button"
            className="chip gi-tap shrink-0 text-muted hover:text-ink transition-colors"
            onClick={onCopy}
            title={t('geointel.patrol.copyHint')}
          >
            {t('geointel.patrol.copy')}
          </button>
        </>
      )}
      <button
        type="button"
        className="btn-ghost gi-tap gi-tap-w !px-1.5 !py-1 shrink-0"
        onClick={onExit}
        aria-label={t('geointel.patrol.hideAria')}
        title={t('geointel.patrol.hide')}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
