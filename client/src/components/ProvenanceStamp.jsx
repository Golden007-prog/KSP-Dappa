// Provenance line under a tier figure — "As on 22 Aug 2026 · provisional ·
// window … · method …" — the Monthly Crime Review's own footer idiom
// (docs/DOMAIN_RESEARCH.md §3.1: "provisional" and "as on <date>" stamps are
// normal and expected). Reads the `provenance` block the /tiers/* endpoints
// put on both data and meta. Prints with the page.
// Props: provenance {asOn, window, method, provisional, tables?}, className?,
// size? ('sm' default; 'lg' gives the method button a 44-px touch target for
// the Beat / Station tiers)
import { useId, useState } from 'react';
import { dateLabel } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';

export default function ProvenanceStamp({ provenance, className = '', size = 'sm' }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!provenance) return null;
  const asOn = /^\d{4}-\d{2}-\d{2}/.test(String(provenance.asOn || '')) ? dateLabel(provenance.asOn) : (provenance.asOn || '—');
  // A 44-px touch target inside an 11-px paragraph must not be pulled back out
  // with a negative margin: on a phone the stamp wraps to two or three lines
  // and the tall button then sits across the line above it. Keep the target
  // size and let it own its line box.
  const btn = size === 'lg' ? 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 align-middle' : '';
  return (
    <p className={`text-[11px] leading-snug text-muted ${className}`}>
      <span className="font-semibold uppercase tracking-wide text-[10px]">{t('tier.prov.asOn', { date: asOn })}</span>
      {provenance.provisional && <span> · {t('tier.prov.provisional')}</span>}
      {provenance.window && <span> · {t('tier.prov.window')}: <span className="num">{provenance.window}</span></span>}
      {provenance.method && (
        <>
          {' · '}
          {/* an inline disclosure, not a hover tooltip: the method text is a
              long sentence and must read on a phone and on paper */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((v) => !v)}
            className={`underline decoration-dotted underline-offset-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${btn}`}
          >
            {t('tier.prov.method')}
          </button>
          <span id={id} className={open ? 'block mt-1 text-muted' : 'hidden print:block print:mt-1'}>{provenance.method}</span>
        </>
      )}
      {Array.isArray(provenance.tables) && provenance.tables.length > 0 && (
        <span className="hidden print:inline"> · {t('tier.prov.tables')}: {provenance.tables.join(', ')}</span>
      )}
    </p>
  );
}
