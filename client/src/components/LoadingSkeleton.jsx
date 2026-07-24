// Loading placeholder. Props: lines (default 3), height? (px number or CSS string
// — when given renders ONE block of that height instead of lines), className?.
export default function LoadingSkeleton({ lines = 3, height, className = '' }) {
  if (height !== undefined) {
    const h = typeof height === 'number' ? `${height}px` : height;
    return <div className={`skeleton w-full ${className}`} style={{ height: h }} aria-busy="true" />;
  }
  return (
    <div className={`space-y-2.5 ${className}`} aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${100 - (i % 3) * 18}%` }} />
      ))}
    </div>
  );
}
