// Floating "back to top" button for the app's inner scroll container.
// Props: targetId? (default 'main-scroll' — Layout's scroller), threshold? px.
// Hidden until the container scrolls past threshold; smooth scroll unless the
// user prefers reduced motion. Sits above the mobile tab bar — and steps out
// of the way entirely while an alert's decision form is open, because at
// 360 px it sits over the right-hand column of that 44-px action grid.
import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n.jsx';

export default function ScrollTopButton({ targetId = 'main-scroll', threshold = 480 }) {
  const [visible, setVisible] = useState(false);
  const t = useT();

  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return undefined;
    const onScroll = () => setVisible(el.scrollTop > threshold);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [targetId, threshold]);

  // An expanded decision form owns the bottom-right of the screen while it is
  // open; a fixed FAB there would cover part of two 44-px action buttons.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    const check = () => setBlocked(Boolean(document.querySelector('[data-action-controls][data-open="true"]')));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-open'] });
    return () => obs.disconnect();
  }, []);

  if (!visible || blocked) return null;

  const scrollTop = () => {
    const el = document.getElementById(targetId);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={scrollTop}
      aria-label={t('shell.action.backToTop')}
      className="no-print fixed z-40 bottom-24 md:bottom-8 right-4 md:right-6 flex h-11 w-11 items-center
        justify-center rounded-full border border-grid bg-panel text-muted shadow-lift
        hover:text-primary hover:border-primary/60 transition-colors animate-fade-up mb-safe"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5m-6 6 6-6 6 6" />
      </svg>
    </button>
  );
}
