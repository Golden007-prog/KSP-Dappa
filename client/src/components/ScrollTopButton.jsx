// Floating "back to top" button for the app's inner scroll container.
// Props: targetId? (default 'main-scroll' — Layout's scroller), threshold? px.
// Hidden until the container scrolls past threshold; smooth scroll unless the
// user prefers reduced motion. Sits above the mobile tab bar.
import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n.jsx';

export default function ScrollTopButton({ targetId = 'main-scroll', threshold = 480 }) {
  const [visible, setVisible] = useState(false);
  const t = useT();

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return undefined;
    const onScroll = () => setVisible(el.scrollTop > threshold);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [targetId, threshold]);

  if (!visible) return null;

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
