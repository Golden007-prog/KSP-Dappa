// Live intelligence ticker — cycles auto-generated insight sentences
// (buildInsights) every few seconds. Pauses on hover/focus, has an explicit
// pause/resume button for touch users (WCAG 2.2.2), manual ‹ › stepping, a
// per-insight deep link and a read-aloud control that speaks every insight in
// order (the dashboard's executive summary). The tone is shown as a glyph and
// a word as well as the dot's colour (WCAG 1.4.1). Renders nothing until
// insights exist.
// Props: items — [{id, tone:'up'|'down'|'alert'|'info', text, to?}], className?.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PulseDot from '../../components/PulseDot.jsx';
import ReadAloudButton from '../../components/ReadAloudButton.jsx';
import { useT } from '../../lib/i18n.jsx';

const TONE_DOT = { up: 'teal', down: 'red', alert: 'amber', info: 'amber' };
const TONE_GLYPH = { up: '▲', down: '▼', alert: '●', info: 'ℹ' };
const TONE_KEY = { up: 'a11y.ticker.toneUp', down: 'a11y.ticker.toneDown', alert: 'a11y.ticker.toneAlert', info: 'a11y.ticker.toneInfo' };
const TONE_TEXT = { up: 'text-teal', down: 'text-signal', alert: 'text-amber', info: 'text-amber' };

function StepBtn({ label, onClick, pressed, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
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
  const [hovering, setHovering] = useState(false);
  const [held, setHeld] = useState(false);
  const paused = hovering || held;

  // clamp when the insight list shrinks (e.g. filters change)
  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [items.length, index]);

  useEffect(() => {
    if (paused || items.length < 2) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(id);
  }, [paused, items.length, intervalMs]);

  if (!items.length) return null;
  const it = items[Math.min(index, items.length - 1)];
  const tone = TONE_DOT[it.tone] ? it.tone : 'info';
  const toneWord = t(TONE_KEY[tone]);
  const allText = items.map((x) => x.text).join(' ');

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-grid bg-panel px-3 py-2 shadow-card ${className}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
      role="group"
      aria-label={t('dashboard.ticker.label')}
    >
      <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0">
        <PulseDot color={TONE_DOT[tone]} />
        <span className="eyebrow">{t('dashboard.ticker.eyebrow')}</span>
      </span>
      <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold ${TONE_TEXT[tone]}`} title={toneWord}>
        <PulseDot color={TONE_DOT[tone]} className="sm:hidden" />
        <span aria-hidden="true">{TONE_GLYPH[tone]}</span>
        <span className="sr-only">{toneWord}</span>
      </span>
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
      <ReadAloudButton id="dashboard-insights" text={allText} />
      {items.length > 1 && (
        <StepBtn label={t(held ? 'a11y.ticker.resume' : 'a11y.ticker.pause')} pressed={held} onClick={() => setHeld((v) => !v)}>
          {held ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l11-7z" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          )}
        </StepBtn>
      )}
      <StepBtn label={t('dashboard.ticker.prev')} onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
      </StepBtn>
      <StepBtn label={t('dashboard.ticker.next')} onClick={() => setIndex((i) => (i + 1) % items.length)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </StepBtn>
    </div>
  );
}
