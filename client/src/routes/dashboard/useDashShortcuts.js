// Dashboard keyboard shortcuts (documented in ShortcutsSheet):
//   ?  shortcuts sheet · r  refresh all panels · a  toggle auto-refresh ·
//   /  focus the Ask-DAPPA omnibox · g then <letter>  jump to a route.
// Keystrokes inside inputs/selects/textareas are ignored; navigation carries
// the active URL filters along (same behaviour as the Layout nav links).
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { filterSearchString } from '../../lib/filters.js';

/** g-then-key jump table — also rendered verbatim by ShortcutsSheet. */
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

export default function useDashShortcuts({ onHelp, onRefresh, onToggleAuto, onFocusSearch }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stateRef = useRef({});
  stateRef.current = {
    onHelp, onRefresh, onToggleAuto, onFocusSearch,
    search: filterSearchString(searchParams),
  };

  useEffect(() => {
    let armedAt = 0; // timestamp of a pending 'g'
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = String(e.key);
      const s = stateRef.current;
      if (armedAt && Date.now() - armedAt < SEQUENCE_WINDOW_MS) {
        armedAt = 0;
        const hit = GO_ROUTES.find(([key]) => key === k.toLowerCase());
        if (hit) {
          e.preventDefault();
          navigate(hit[1] + s.search);
        }
        return;
      }
      if (k === 'g' || k === 'G') { armedAt = Date.now(); return; }
      if (k === '?') { e.preventDefault(); s.onHelp?.(); }
      else if (k === 'r' || k === 'R') { e.preventDefault(); s.onRefresh?.(); }
      else if (k === 'a' || k === 'A') { e.preventDefault(); s.onToggleAuto?.(); }
      else if (k === '/') { e.preventDefault(); s.onFocusSearch?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
