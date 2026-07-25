// Non-modal swipeable bottom info sheet for GeoIntel on phones (<md).
// Unlike the shared <Sheet/> (modal + overlay) this stays docked inside the map
// container so the map keeps the rest of the viewport. Two snap states:
// collapsed (grab handle + peek row, e.g. the time scrubber) and expanded
// (scrollable info content). Swipe up/down on the header or tap the handle.
import { useRef, useState } from 'react';
import { useT } from '../../lib/i18n.jsx';

export default function MobileSheet({ open, onOpenChange, peek, title, children }) {
  const t = useT();
  const startY = useRef(null);
  const [dragDy, setDragDy] = useState(0);
  const label = title || t('geointel.sheet.title');

  const onTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    // only allow pulling toward the other snap state
    setDragDy(open ? Math.max(0, Math.min(dy, 160)) : Math.min(0, Math.max(dy, -160)));
  };
  const onTouchEnd = () => {
    if (dragDy < -36 && !open) onOpenChange(true);
    else if (dragDy > 36 && open) onOpenChange(false);
    startY.current = null;
    setDragDy(0);
  };

  return (
    <div
      className="gi-noprint md:hidden absolute inset-x-0 bottom-0 z-20 bg-panel/95 backdrop-blur-sm border-t border-grid rounded-t-2xl shadow-lift"
      style={{ transform: dragDy ? `translateY(${Math.max(0, dragDy)}px)` : undefined, transition: dragDy ? 'none' : 'transform 0.2s ease' }}
      aria-label={label}
    >
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="touch-none"
      >
        <button
          type="button"
          className="w-full flex flex-col items-center justify-center pt-1.5 pb-0.5 min-h-[40px] focus:outline-none"
          aria-expanded={open}
          aria-label={open ? t('geointel.sheet.collapse') : t('geointel.sheet.expand')}
          onClick={() => onOpenChange(!open)}
        >
          <span className="h-1 w-10 rounded-full bg-grid" aria-hidden="true" />
          <span className="text-[9px] uppercase tracking-wider text-muted mt-0.5">
            {open ? t('geointel.sheet.swipeDown') : t('geointel.sheet.swipeUp')}
          </span>
        </button>
        {peek && <div className="px-2.5 pb-2">{peek}</div>}
      </div>
      <div className={open ? 'block border-t border-grid/60' : 'hidden'}>
        {/* safe-area padding keeps content clear of the iOS home indicator */}
        <div
          className="max-h-[46vh] overflow-y-auto p-2.5 space-y-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
