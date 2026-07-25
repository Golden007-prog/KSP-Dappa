// Hour-of-day lens for GeoIntel — a 0–23 scrubber that filters hotspot
// clusters to those whose HourBandStart/End covers the selected hour, with a
// play loop that sweeps the full day. The parent dims the basemap during
// night hours (19–06) and mirrors the hour to ?h= for shareable links.
import { hourLabel } from './utils.js';
import { useT } from '../../lib/i18n.jsx';

const PlayIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15l13-7.5-13-7.5Z" />
  </svg>
);
const PauseIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);
const SunIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" aria-hidden="true" className="text-amber">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
  </svg>
);
const MoonIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);

/** Bucket key for an hour: night 22–06, day 06–17, evening 17–22. */
export function hourBucketKey(hour) {
  const h = ((Math.round(Number(hour)) % 24) + 24) % 24;
  if (h >= 22 || h < 6) return 'night';
  if (h < 17) return 'day';
  return 'evening';
}

/** Translated bucket label; pass the `t` from useT() (falls back to the key). */
export function hourBucketLabel(hour, t) {
  const key = hourBucketKey(hour);
  return t ? t(`geointel.bucket.${key}`) : key;
}

export default function HourScrubber({
  hour, onHourChange, playing, onPlayToggle, onExit, activeCount, totalCount, compact = false,
}) {
  const t = useT();
  const night = hour >= 19 || hour < 6;
  const bucket = hourBucketLabel(hour, t);
  return (
    <div className={`flex items-center gap-2 max-w-full ${compact
      ? ''
      : 'bg-panel/95 border border-grid rounded-xl px-3 py-2 shadow-lg'}`}
    >
      <button
        type="button"
        className="btn gi-tap !px-2.5 !py-1.5 shrink-0"
        onClick={onPlayToggle}
        aria-label={playing ? t('geointel.hour.pauseAria') : t('geointel.hour.playAria')}
        title={playing ? t('geointel.hour.pause') : t('geointel.hour.play')}
      >
        {playing ? PauseIcon : PlayIcon}
      </button>
      <span className="shrink-0" title={night ? t('geointel.hour.night') : t('geointel.hour.day')} aria-hidden="true">
        {night ? MoonIcon : SunIcon}
      </span>
      <input
        type="range"
        min={0}
        max={23}
        step={1}
        value={hour}
        onChange={(e) => onHourChange(Number(e.target.value))}
        className="flex-1 min-w-[6rem] geointel-range cursor-pointer"
        aria-label={t('geointel.hour.sliderAria')}
        aria-valuetext={`${hourLabel(hour)} · ${bucket}`}
      />
      <div className="w-24 text-right shrink-0">
        <p className="num text-xs font-semibold text-ink leading-tight">
          {hourLabel(hour)}–{hourLabel((hour + 1) % 24)}
        </p>
        <p className="text-[9px] text-muted leading-tight">
          {bucket} · {t('geointel.hour.active', { active: activeCount, total: totalCount })}
        </p>
      </div>
      <button
        type="button"
        className="btn-ghost gi-tap gi-tap-w !px-1.5 !py-1.5 shrink-0"
        onClick={onExit}
        aria-label={t('geointel.hour.offAria')}
        title={t('geointel.hour.off')}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
