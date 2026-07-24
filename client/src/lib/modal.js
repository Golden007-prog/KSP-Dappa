// Shared modal behaviour — focus trap + scroll lock. Used by Sheet.jsx,
// CommandPalette.jsx and ChartPanel's expanded overlay so every dialog in the
// app actually enforces the aria-modal contract (Tab stays inside) and the
// page behind stops scrolling (both <body> and the #main-scroll inner scroller).
import { useEffect } from 'react';

let lockCount = 0;

function setLocked(on) {
  document.body.style.overflow = on ? 'hidden' : '';
  const scroller = document.getElementById('main-scroll');
  if (scroller) scroller.style.overflow = on ? 'hidden' : '';
}

/** Lock background scrolling while `active`. Ref-counted — nested dialogs are safe. */
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    lockCount += 1;
    if (lockCount === 1) setLocked(true);
    return () => {
      lockCount -= 1;
      if (lockCount <= 0) { lockCount = 0; setLocked(false); }
    };
  }, [active]);
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Keep Tab / Shift-Tab cycling inside containerRef.current while `active`.
 * Capture-phase listener so it wins over page-level handlers.
 */
export function useFocusTrap(active, containerRef) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;
      const els = Array.from(root.querySelectorAll(FOCUSABLE))
        // visible AND tabbable — roving-tabindex widgets (SegmentedControl,
        // Tabs) set tabindex="-1" on inactive options; those must not anchor
        // the wrap points or Tab could escape the dialog
        .filter((el) => el.getClientRects().length > 0 && el.getAttribute('tabindex') !== '-1');
      if (!els.length) { e.preventDefault(); root.focus?.(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      const current = document.activeElement;
      const inside = root.contains(current);
      if (e.shiftKey) {
        if (!inside || current === first || current === root) { e.preventDefault(); last.focus(); }
      } else if (!inside || current === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [active, containerRef]);
}
