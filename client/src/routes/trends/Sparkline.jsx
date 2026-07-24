// Dependency-free SVG sparkline for the compare grid — a stroked path that
// stretches with its container plus absolutely-positioned anomaly dots (kept
// outside the stretched SVG so they stay perfectly round on resize).
import { useMemo } from 'react';

export default function Sparkline({
  values = [], anomalies = [], color = '#F5A623', anomalyColor = '#E5484D', height = 40, className = '',
}) {
  const view = useMemo(() => {
    const nums = values.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min || 1;
    // 4% vertical padding so the stroke never clips at the extremes
    const y = (v) => 96 - ((v - min) / span) * 92;
    const x = (i) => (i / (nums.length - 1)) * 100;
    const path = nums.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    const dots = (anomalies || [])
      .filter((a) => a.index >= 0 && a.index < nums.length)
      .map((a) => ({ left: x(a.index), top: y(nums[a.index]), dir: a.dir }));
    return { path, dots, last: { left: 100, top: y(nums[nums.length - 1]) } };
  }, [values, anomalies]);

  if (!view) return <div style={{ height }} className={className} aria-hidden="true" />;

  return (
    <div className={`relative ${className}`} style={{ height }} aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <path d={view.path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {view.dots.map((d, i) => (
        <span
          key={i}
          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${d.left}%`, top: `${d.top}%`, background: anomalyColor, boxShadow: `0 0 0 2px color-mix(in srgb, ${anomalyColor} 25%, transparent)` }}
        />
      ))}
      <span
        className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${view.last.left}%`, top: `${view.last.top}%`, background: color }}
      />
    </div>
  );
}
