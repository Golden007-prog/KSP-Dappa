// '?' keyboard-shortcut help overlay for GeoIntel. Small centered card over a
// dim backdrop; closes on backdrop click, the X button, or Esc (the route's
// layered Escape handler closes this first). Focus lands on the close button
// when it opens so keyboard users are not stranded on the map.
import { useEffect, useRef } from 'react';
import { useT } from '../../lib/i18n.jsx';

// Key caps stay literal (they are what is printed on the keyboard); only the
// description is translated.
const SHORTCUTS = [
  ['F', 'geointel.shortcuts.fullscreen'],
  ['Esc', 'geointel.shortcuts.esc'],
  ['␣ Space', 'geointel.shortcuts.space'],
  ['← →', 'geointel.shortcuts.arrows'],
  ['H', 'geointel.shortcuts.hour'],
  ['C', 'geointel.shortcuts.compare'],
  ['P', 'geointel.shortcuts.patrol'],
  ['M', 'geointel.shortcuts.measure'],
  ['A', 'geointel.shortcuts.analysis'],
  ['G', 'geointel.shortcuts.grid'],
  ['W', 'geointel.shortcuts.weekday'],
  ['Z', 'geointel.shortcuts.fit'],
  ['/', 'geointel.shortcuts.locate'],
  ['?', 'geointel.shortcuts.help'],
];

export default function ShortcutsOverlay({ onClose }) {
  const closeRef = useRef(null);
  const t = useT();
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-canvas/60 backdrop-blur-[2px] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('geointel.shortcuts.title')}
        className="w-full max-w-xs max-h-[85vh] overflow-y-auto bg-panel border border-grid rounded-xl shadow-lift p-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">{t('geointel.shortcuts.title')}</h2>
          <button
            ref={closeRef}
            type="button"
            className="btn gi-tap !px-2 !py-1"
            onClick={onClose}
            aria-label={t('geointel.shortcuts.close')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <dl className="space-y-2">
          {SHORTCUTS.map(([key, desc]) => (
            <div key={key} className="flex items-start gap-3">
              <dt className="shrink-0 w-16">
                <kbd className="inline-block rounded-md border border-grid bg-canvas/60 px-1.5 py-0.5 text-[11px] num text-ink">
                  {key}
                </kbd>
              </dt>
              <dd className="text-xs text-muted leading-snug pt-0.5">{t(desc)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[10px] text-muted">
          {t('geointel.shortcuts.note')}
        </p>
      </div>
    </div>
  );
}
