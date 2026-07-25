// Live intelligence ticker — cycles auto-generated insight sentences
// (buildInsights) every few seconds. Pauses on hover/focus, manual ‹ ›
// stepping, per-insight deep link. Renders nothing until insights exist.
// Props: items — [{id, tone:'up'|'down'|'alert'|'info', text, to?}], className?.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PulseDot from '../../components/PulseDot.jsx';
import { useT } from '../../lib/i18n.jsx';

const TONE_DOT = { up: 'teal', down: 'red', alert: 'amber', info: 'amber' };

function StepBtn({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-10 w-8 sm:h-8 sm:w-7 shrink-0 items-center justify-center rounded-lg text-muted
        hover:text-ink hover:bg-grid/40 transition-colors"
    >
      {children}
    </button>
  );
}

export default function IntelTicker({ items = [], intervalMs = 7000, className = '' }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // clamp when the insight list shrinks (e.g. filters change)
  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [items.length, index]);

  useEffect(() => {
    if (paused || items.length < 2) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [paused, items.length, intervalMs]);

  if (!items.length) return null;
  const it = items[Math.min(index, items.length - 1)];

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-grid bg-panel px-3 py-2 shadow-card ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="group"
      aria-label={t('dashboard.ticker.label')}
    >
      <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0">
        <PulseDot color={TONE_DOT[it.tone] || 'amber'} />
        <span className="eyebrow">{t('dashboard.ticker.eyebrow')}</span>
      </span>
      <PulseDot color={TONE_DOT[it.tone] || 'amber'} className="sm:hidden shrink-0" />
      <p
        className="min-w-0 flex-1 text-xs text-ink"
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        title={it.text}
      >
        {it.text}
      </p>
      {it.to && (
        <Link to={it.to} className="hidden sm:inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline shrink-0">
          {t('dashboard.link.open')}
        </Link>
      )}
      <span className="num shrink-0 text-[10px] text-muted" aria-live="off">{Math.min(index, items.length - 1) + 1}/{items.length}</span>
      <StepBtn label={t('dashboard.ticker.prev')} onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
      </StepBtn>
      <StepBtn label={t('dashboard.ticker.next')} onClick={() => setIndex((i) => (i + 1) % items.length)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </StepBtn>
    </div>
  );
}
