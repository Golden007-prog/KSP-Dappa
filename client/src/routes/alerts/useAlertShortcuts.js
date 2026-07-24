// /alerts — keyboard shortcuts (mirrors the dashboard's useDashShortcuts
// pattern: window keydown, ignored while typing, handlers read through a ref):
//   j / k        move the focus ring down / up the open feed
//   a            acknowledge the focused alert
//   m            mark the focused alert read
//   c            copy the focused alert as text
//   s            snooze the focused alert for 24 h
//   e            export the filtered alerts as CSV
//   u            toggle the unread-only filter
//   /            focus the search box
//   1–4          set the severity filter (critical…low) · 0 clears it
import { useEffect, useRef } from 'react';

function isTyping(el) {
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
}

const SEV_BY_DIGIT = { 0: '', 1: 'critical', 2: 'high', 3: 'medium', 4: 'low' };

export default function useAlertShortcuts(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const h = ref.current;
      const k = String(e.key).toLowerCase();
      const simple = {
        j: h.next, k: h.prev, a: h.ack, m: h.read, c: h.copy, s: h.snooze,
        e: h.export, u: h.unread, '/': h.search,
      }[k];
      if (simple) { e.preventDefault(); simple(); return; }
      if (k in SEV_BY_DIGIT && h.sev) { e.preventDefault(); h.sev(SEV_BY_DIGIT[k]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
