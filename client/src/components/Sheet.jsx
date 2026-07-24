// Bottom sheet — mobile-first modal surface (centered narrow card on md+).
// Props: open, onClose, title?, children, className?.
// Esc / overlay click close it; focus moves into the panel on open and returns
// on close; Tab is trapped inside (aria-modal enforced) and the page behind
// stops scrolling; safe-area padded. Dependency-free; portal to <body>.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap, useScrollLock } from '../lib/modal.js';

export default function Sheet({ open, onClose, title, children, className = '' }) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  useScrollLock(open);
  useFocusTrap(open, panelRef);

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (restoreRef.current?.focus) restoreRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-60" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Sheet'}
        className={`absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-grid
          bg-panel shadow-lift pb-safe animate-sheet-up focus:outline-none
          md:inset-x-auto md:right-8 md:bottom-8 md:w-[26rem] md:rounded-2xl md:border ${className}`}
      >
        <div className="sticky top-0 z-10 bg-panel/95 backdrop-blur-sm rounded-t-2xl">
          <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-grid md:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between px-4 pt-2 pb-2.5 border-b border-grid/60">
            {title ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : <span />}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-11 w-11 -mr-2 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-grid/40 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
