// Month time-scrubber for the incident heat layer. Slider value 0 = the whole
// current filter window; 1..N = individual months (ascending). Play loops
// month-by-month; each month's /geo/incidents fetch is cached by react-query,
// so the second loop replays instantly. The speed button cycles 0.5× → 1× → 2×;
// the loop button (desktop) picks wrap-around vs stop-at-last-month.
import { monthLabel } from '../../lib/format.js';

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
  loop = true, onLoopToggle, compact = false,
}) {
  const disabled = !months.length;
  const label = index > 0 && months[index - 1] ? monthLabel(months[index - 1]) : 'All months';
  const cycleSpeed = () => {
    if (!onSpeedChange) return;
    const i = SCRUB_SPEEDS.indexOf(speed);
    onSpeedChange(SCRUB_SPEEDS[(i + 1) % SCRUB_SPEEDS.length]);
  };
  return (
    <div className={`flex items-center gap-2.5 ${compact
      ? ''
      : 'bg-panel/95 border border-grid rounded-xl px-3 py-2 shadow-lg'}`}
    >
      <button
        type="button"
        className="btn gi-tap !px-2.5 !py-1.5 shrink-0"
        onClick={onPlayToggle}
        disabled={disabled}
        aria-label={playing ? 'Pause month animation' : 'Animate heat layer month by month'}
        title={playing ? 'Pause' : 'Animate months'}
      >
        {playing ? PauseIcon : PlayIcon}
      </button>
      {onSpeedChange && (
        <button
          type="button"
          className="btn gi-tap !px-2 !py-1.5 shrink-0 num text-[11px]"
          onClick={cycleSpeed}
          disabled={disabled}
          aria-label={`Playback speed ${speed}x — click to change`}
          title="Playback speed"
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
          aria-label={loop ? 'Looping on — animation wraps to the first month' : 'Looping off — animation stops at the last month'}
          title={loop ? 'Loop: on' : 'Loop: off (stops at last month)'}
        >
          {LoopIcon}
        </button>
      )}
      <div className="flex-1 min-w-[7rem]">
        <input
          type="range"
          min={0}
          max={months.length}
          step={1}
          value={Math.min(index, months.length)}
          disabled={disabled}
          onChange={(e) => onIndexChange(Number(e.target.value))}
          className="w-full geointel-range cursor-pointer disabled:cursor-not-allowed"
          aria-label="Heat-layer month"
          aria-valuetext={label}
        />
        <div className="flex justify-between text-[9px] text-muted leading-none">
          <span>All</span>
          {months.length > 0 && (
            <span className="num">{monthLabel(months[0])} – {monthLabel(months[months.length - 1])}</span>
          )}
        </div>
      </div>
      <div className="w-20 text-right shrink-0">
        <p className="num text-xs font-semibold text-ink leading-tight">{label}</p>
        <p className="text-[9px] text-muted leading-tight num">
          {disabled ? 'no monthly data'
            : loading ? 'loading…'
              : index > 0 ? `month ${index}/${months.length}` : 'incident heat'}
        </p>
      </div>
    </div>
  );
}
