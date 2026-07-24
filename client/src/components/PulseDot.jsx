// Animated pulse dot (alert indicator). Props: color ('red'|'amber'|'teal'),
// className?. Pure CSS (see .pulse-dot in index.css).
export default function PulseDot({ color = 'red', className = '' }) {
  const mod = color === 'red' ? '' : ` pulse-dot--${color}`;
  return <span className={`pulse-dot${mod} ${className}`} aria-hidden="true" />;
}
