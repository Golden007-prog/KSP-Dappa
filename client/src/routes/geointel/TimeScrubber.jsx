// Month time-scrubber for the incident heat layer. Slider value 0 = the whole
// current filter window; 1..N = individual months (ascending). Play loops
// month-by-month; each month's /geo/incidents fetch is cached by react-query,
// so the second loop replays instantly.
import { monthLabel } from '../../lib/format.js';

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

export default function TimeScrubber({ months, index, playing, loading, onIndexChange, onPlayToggle }) {
  const disabled = !months.length;
  const label = index > 0 && months[index - 1] ? monthLabel(months[index - 1]) : 'All months';
  return (
    <div className="flex items-center gap-3 bg-panel/95 border border-grid rounded-xl px-3 py-2 shadow-lg">
      <button
        type="button"
        className="btn !px-2.5 !py-1.5 shrink-0"
        onClick={onPlayToggle}
        disabled={disabled}
        aria-label={playing ? 'Pause month animation' : 'Animate heat layer month by month'}
        title={playing ? 'Pause' : 'Animate months'}
      >
        {playing ? PauseIcon : PlayIcon}
      </button>
      <div className="flex-1 min-w-[8rem]">
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
        <p className="text-[9px] text-muted leading-tight">
          {disabled ? 'no monthly data' : loading ? 'loading…' : 'incident heat'}
        </p>
      </div>
    </div>
  );
}
