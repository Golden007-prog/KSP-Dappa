// Month time-scrubber for the incident heat layer. Slider value 0 = the whole
// current filter window; 1..N = individual months (ascending). Play loops
// month-by-month; each month's /geo/incidents fetch is cached by react-query,
// so the second loop replays instantly. The speed button cycles 0.5× → 1× → 2×;
// the loop button (desktop) picks wrap-around vs stop-at-last-month.
import { monthLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

export const SCRUB_SPEEDS = [0.5, 1, 2];

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

const LoopIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

export default function TimeScrubber({
  months, index, playing, loading, onIndexChange, onPlayToggle, speed = 1, onSpeedChange,
  loop = true, onLoopToggle, compact = false, totals = null,
}) {
  const t = useT();
  const disabled = !months.length;
  const label = index > 0 && months[index - 1] ? monthLabel(months[index - 1]) : t('geointel.scrub.allMonths');
  const cycleSpeed = () => {
    if (!onSpeedChange) return;
    const i = SCRUB_SPEEDS.indexOf(speed);
    onSpeedChange(SCRUB_SPEEDS[(i + 1) % SCRUB_SPEEDS.length]);
  };
  const showHisto = !compact && Array.isArray(totals) && totals.length === months.length && months.length > 0;
  const maxTotal = showHisto ? Math.max(1, ...totals) : 1;
  return (
    // wraps on a 360-px phone: the play/speed buttons, the slider and the
    // read-out cannot all fit on one line, and unwrapped they ran into each
    // other ("Sep 25 – Aug 26" over "All months").
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${compact
      ? ''
      : 'bg-panel/95 border border-grid rounded-xl px-3 py-2 shadow-lg'}`}
    >
      <button
        type="button"
        className="btn gi-tap !px-2.5 !py-1.5 shrink-0"
        onClick={onPlayToggle}
        disabled={disabled}
        aria-label={playing ? t('geointel.scrub.pauseAria') : t('geointel.scrub.playAria')}
        title={playing ? t('geointel.scrub.pause') : t('geointel.scrub.play')}
      >
        {playing ? PauseIcon : PlayIcon}
      </button>
      {onSpeedChange && (
        <button
          type="button"
          className="btn gi-tap !px-2 !py-1.5 shrink-0 num text-[11px]"
          onClick={cycleSpeed}
          disabled={disabled}
          aria-label={t('geointel.scrub.speedAria', { speed })}
          title={t('geointel.scrub.speed')}
        >
          {speed}×
        </button>
      )}
      {onLoopToggle && !compact && (
        <button
          type="button"
          className={`btn gi-tap !px-2 !py-1.5 shrink-0 ${loop ? '!text-primary !border-primary/60' : ''}`}
          onClick={onLoopToggle}
          disabled={disabled}
          aria-pressed={loop}
          aria-label={loop ? t('geointel.scrub.loopOnAria') : t('geointel.scrub.loopOffAria')}
          title={loop ? t('geointel.scrub.loopOn') : t('geointel.scrub.loopOff')}
        >
          {LoopIcon}
        </button>
      )}
      <div className="flex-1 basis-[9rem] min-w-[7rem]">
        {showHisto && (
          <div className="flex items-end gap-px h-3.5 mb-0.5" role="group" aria-label={t('geointel.scrub.histAria')}>
            {months.map((m, i) => (
              <button
                key={m}
                type="button"
                title={t('geointel.scrub.barTitle', { month: monthLabel(m), n: totals[i] })}
                aria-label={t('geointel.scrub.barAria', { month: monthLabel(m), n: totals[i] })}
                onClick={() => onIndexChange(i + 1)}
                // 2.5.8 Equivalent: the month slider below is the ≥24 px control
                data-a11y-equivalent="geointel-month-range"
                className={`flex-1 min-w-[2px] rounded-t-[1px] transition-colors ${
                  index === i + 1 ? 'bg-amber' : 'bg-grid hover:bg-amber/60'
                }`}
                style={{ height: `${Math.max(15, Math.round((totals[i] / maxTotal) * 100))}%` }}
              />
            ))}
          </div>
        )}
        <input
          id="geointel-month-range"
          type="range"
          min={0}
          max={months.length}
          step={1}
          value={Math.min(index, months.length)}
          disabled={disabled}
          onChange={(e) => onIndexChange(Number(e.target.value))}
          className="w-full h-6 geointel-range cursor-pointer disabled:cursor-not-allowed"
          aria-label={t('geointel.scrub.monthAria')}
          aria-valuetext={label}
        />
        {/* min-w-0 + truncate: at 360 px the date range grew past this column
            and ran under the read-out to its right ("Sep 25 – Aug 26" over
            "All months"). It now clips inside its own track instead. */}
        <div className="flex min-w-0 justify-between gap-1 text-[9px] text-muted leading-none">
          <span className="shrink-0">{t('geointel.scrub.all')}</span>
          {months.length > 0 && (
            <span className="num min-w-0 truncate">{monthLabel(months[0])} – {monthLabel(months[months.length - 1])}</span>
          )}
        </div>
      </div>
      <div className="w-20 shrink-0 text-right">
        <p className="num text-xs font-semibold text-ink leading-tight">{label}</p>
        <p className="text-[9px] text-muted leading-tight num">
          {disabled ? t('geointel.scrub.noData')
            : loading ? t('geointel.scrub.loading')
              : index > 0 ? t('geointel.scrub.monthOf', { i: index, n: months.length }) : t('geointel.scrub.incidentHeat')}
        </p>
      </div>
    </div>
  );
}
