// Dashboard-specific keyboard shortcuts (documented in ShortcutsSheet):
//   r  refresh all panels · a  toggle auto-refresh · /  focus the Ask-DAPPA
//   omnibox · v  saved views · b  print the situation brief.
// '?' (global shortcuts sheet) and g-then-<letter> route jumps are owned by
// Layout.jsx's global shortcut layer — never re-bind them here or they
// double-fire. This hook still tracks a pending 'g' so a g-sequence key
// (e.g. g then r) isn't misread as a dashboard action.
// Keystrokes inside inputs/selects/textareas or open modals are ignored.
import { useEffect, useRef } from 'react';

/** g-then-key jump table — rendered verbatim by ShortcutsSheet; the actual
 * key handling lives in Layout.jsx's global shortcut layer. */
export const GO_ROUTES = [
  ['d', '/', 'Dashboard'],
  ['m', '/map', 'GeoIntel map'],
  ['t', '/trends', 'Trends'],
  ['a', '/alerts', 'Alerts'],
  ['c', '/cases', 'Case explorer'],
  ['n', '/network', 'Network'],
  ['o', '/offenders', 'Offenders'],
  ['p', '/predict', 'Predict'],
  ['r', '/reports', 'Reports'],
];

const SEQUENCE_WINDOW_MS = 1600;

function isTyping(el) {
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
}

export default function useDashShortcuts({ onRefresh, onToggleAuto, onFocusSearch, onOpenViews, onPrint }) {
  const stateRef = useRef({});
  stateRef.current = { onRefresh, onToggleAuto, onFocusSearch, onOpenViews, onPrint };

  useEffect(() => {
    let armedAt = 0; // pending 'g' (Layout will navigate; we must stay silent)
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const k = String(e.key);
      const s = stateRef.current;
      if (armedAt && Date.now() - armedAt < SEQUENCE_WINDOW_MS) { armedAt = 0; return; }
      if (k === 'g' || k === 'G') { armedAt = Date.now(); return; }
      if (k === 'r' || k === 'R') { e.preventDefault(); s.onRefresh?.(); }
      else if (k === 'a' || k === 'A') { e.preventDefault(); s.onToggleAuto?.(); }
      else if (k === 'v' || k === 'V') { e.preventDefault(); s.onOpenViews?.(); }
      else if (k === 'b' || k === 'B') { e.preventDefault(); s.onPrint?.(); }
      else if (k === '/') { e.preventDefault(); s.onFocusSearch?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
