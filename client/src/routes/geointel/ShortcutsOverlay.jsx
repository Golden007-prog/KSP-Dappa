// '?' keyboard-shortcut help overlay for GeoIntel. Small centered card over a
// dim backdrop; closes on backdrop click, the X button, or Esc (the route's
// layered Escape handler closes this first). Focus lands on the close button
// when it opens so keyboard users are not stranded on the map.
import { useEffect, useRef } from 'react';

const SHORTCUTS = [
  ['F', 'Toggle fullscreen map'],
  ['Esc', 'Close help / measure / popup / panel, then exit fullscreen'],
  ['␣ Space', 'Play or pause the month animation'],
  ['← →', 'Step the scrub month back / forward'],
  ['/', 'Focus the locate search'],
  ['?', 'Show this help'],
];

export default function ShortcutsOverlay({ onClose }) {
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-base/60 backdrop-blur-[2px] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-xs bg-panel border border-grid rounded-xl shadow-lift p-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Keyboard shortcuts</h2>
          <button
            ref={closeRef}
            type="button"
            className="btn gi-tap !px-2 !py-1"
            onClick={onClose}
            aria-label="Close shortcuts help"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <dl className="space-y-2">
          {SHORTCUTS.map(([key, desc]) => (
            <div key={key} className="flex items-start gap-3">
              <dt className="shrink-0 w-16">
                <kbd className="inline-block rounded-md border border-grid bg-base/60 px-1.5 py-0.5 text-[11px] num text-ink">
                  {key}
                </kbd>
              </dt>
              <dd className="text-xs text-muted leading-snug pt-0.5">{desc}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[10px] text-muted">
          Shortcuts pause while you are typing in an input.
        </p>
      </div>
    </div>
  );
}
