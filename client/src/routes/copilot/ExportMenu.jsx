// /copilot — small export dropdown for the chat header: transcript as .txt,
// .md or .json. Closes on outside click and Escape; menu-button ARIA pattern.
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n.jsx';

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

const FORMATS = ['txt', 'md', 'json'];

export default function ExportMenu({ onExport, disabled = false }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (fmt) => {
    setOpen(false);
    onExport(fmt);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="btn-ghost !px-2 !text-xs min-h-[40px]"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('copilot.export.aria')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
          <path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5" />
          <path d="M4 19h16" />
        </svg>
        <span className="hidden sm:inline">{t('common.action.export')}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('copilot.export.menuAria')}
          className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-grid bg-panel shadow-lift p-1"
        >
          {FORMATS.map((fmt) => (
            <button
              key={fmt}
              type="button"
              role="menuitem"
              className="w-full text-left rounded-lg px-2.5 min-h-[40px] text-xs text-ink hover:bg-grid/40 transition-colors"
              onClick={() => pick(fmt)}
            >
              {t(`copilot.export.${fmt}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
