// Screen-reader announcements (WCAG 4.1.3 Status Messages), route focus
// management (WCAG 2.4.3) and per-route document titles (WCAG 2.4.2).
//
// One visually-hidden live region is mounted by components/LiveAnnouncer.jsx
// inside Layout (via ShellA11y); any code can call announce(text) — after a
// filter changes the result count, when a table finishes loading, when an
// async action completes. The region is 'polite' by default so it never
// interrupts what the reader is saying; pass { assertive: true } only for
// errors that block the task.
//
// Repeated identical text would be ignored by most screen readers, so the
// region is cleared first and the text written on the next frame.
import { useEffect } from 'react';

const REGION_ID = 'dappa-live-region';
const ASSERTIVE_ID = 'dappa-live-region-assertive';

export const LIVE_REGION_IDS = { polite: REGION_ID, assertive: ASSERTIVE_ID };

let pending = null;

export function announce(text, { assertive = false } = {}) {
  if (typeof document === 'undefined') return;
  const msg = String(text || '').trim();
  if (!msg) return;
  const el = document.getElementById(assertive ? ASSERTIVE_ID : REGION_ID);
  if (!el) return;
  el.textContent = '';
  if (pending) cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    pending = null;
    el.textContent = msg;
  });
}

/** Pure-format helper for "N results" style messages so every route
 * announces the same shape: announceCount(t, 'a11y.live.results', n). */
export function announceCount(t, key, n, extra = {}) {
  announce(t(key, { n, ...extra }));
}

// ---------------------------------------------------------------------------
// Route focus: move keyboard / screen-reader focus to the view's <h1> after a
// navigation so the reader hears the new page name instead of staying on the
// nav link it activated. Routes are lazy(), so the heading may arrive a few
// frames after the pathname changes — poll for up to ~1.5 s, and never steal
// focus the user has already placed somewhere else meanwhile.
// ---------------------------------------------------------------------------

const APP_SUFFIX = ' — KSP DAPPA';

function isIdleFocus() {
  const a = document.activeElement;
  if (!a || a === document.body || a.id === 'main-content') return true;
  if (a.classList && a.classList.contains('skip-link')) return true;
  return !!(a.closest && a.closest('nav, aside'));
}

export function focusMainHeading({ maxFrames = 90 } = {}) {
  if (typeof document === 'undefined') return () => {};
  let frames = 0;
  let raf = 0;
  const tick = () => {
    const h = document.querySelector('#main-content h1');
    if (h) {
      if (isIdleFocus()) {
        if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
        try { h.focus({ preventScroll: true }); } catch { /* not focusable */ }
      }
      return;
    }
    frames += 1;
    if (frames < maxFrames) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// ---------------------------------------------------------------------------
// Document titles. Layout derives a title from its nav table; a route that is
// not in that table (the tier homes, /identify, /ingest, …) or that knows a
// better name (an FIR number, an offender) registers its own with
// useDocumentTitle('…'). ShellA11y reads getRouteTitle(pathname) first and
// only then falls back to the nav-derived name, and the pending alert count
// is prefixed in one place either way.
// ---------------------------------------------------------------------------

const routeTitles = new Map();
const titleListeners = new Set();

export function getRouteTitle(pathname) {
  return routeTitles.get(pathname) || null;
}

export function onRouteTitleChange(fn) {
  titleListeners.add(fn);
  return () => titleListeners.delete(fn);
}

export function setRouteTitle(pathname, title) {
  if (title) routeTitles.set(pathname, String(title));
  else routeTitles.delete(pathname);
  for (const fn of titleListeners) fn(pathname);
}

/** Compose the tab title the same way everywhere: "(3) View — KSP DAPPA". */
export function formatDocumentTitle(view, pendingCount = 0) {
  const base = `${view}${APP_SUFFIX}`;
  const n = Number(pendingCount) || 0;
  return n > 0 ? `(${n > 99 ? '99+' : n}) ${base}` : base;
}

function currentPathname() {
  if (typeof window === 'undefined') return '/';
  const hash = window.location.hash.replace(/^#/, '');
  return hash.split('?')[0] || '/';
}

/**
 * Register a per-route document title while the component is mounted:
 *   useDocumentTitle(t('tier.beat.title'))
 * ShellA11y applies it (with the alert-count prefix) and clears it on unmount.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return undefined;
    const pathname = currentPathname();
    setRouteTitle(pathname, title);
    return () => setRouteTitle(pathname, null);
  }, [title]);
}
