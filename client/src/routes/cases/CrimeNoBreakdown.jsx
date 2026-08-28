// CrimeNo anatomy — the 18-digit format the judges wrote (docs/CONTRACTS.md):
// [1 category][4 DistrictID][4 UnitID][4 year][5 serial]; CaseNo = last 9 digits.
// Category: FIR=1 · UDR=3 · PAR=4 · Zero FIR=8.
import Card from '../../components/Card.jsx';
import { useT, useNames } from '../../lib/i18n.jsx';
import './crimeno-colors.css';

// `color` stays the raw dark-theme hex for backwards compatibility; rendering
// uses `cssColor` (a CSS variable) so light theme and print swap in AA-safe hues.
// `label` likewise stays English — `labelKey` is what the UI renders.
export const CRIME_NO_SEGMENTS = [
  { key: 'category', label: 'Category', labelKey: 'cases.crimeNo.seg.category', len: 1, color: '#F5A623', cssColor: 'var(--seg-category)' },
  { key: 'district', label: 'District', labelKey: 'cases.crimeNo.seg.district', len: 4, color: '#2DD4BF', cssColor: 'var(--seg-district)' },
  { key: 'station', label: 'Station', labelKey: 'cases.crimeNo.seg.station', len: 4, color: '#7C9BFF', cssColor: 'var(--seg-station)' },
  { key: 'year', label: 'Year', labelKey: 'cases.crimeNo.seg.year', len: 4, color: '#C084FC', cssColor: 'var(--seg-year)' },
  { key: 'serial', label: 'Serial', labelKey: 'cases.crimeNo.seg.serial', len: 5, color: '#F97316', cssColor: 'var(--seg-serial)' },
];

// Ids match locales/*/data.js `categories` — tName() translates them per language.
export const CATEGORY_NAMES = { 1: 'FIR', 3: 'UDR', 4: 'PAR', 8: 'Zero FIR' };

export function splitCrimeNo(crimeNo) {
  const digits = String(crimeNo ?? '').replace(/\D/g, '');
  if (digits.length !== 18) return null;
  let offset = 0;
  return CRIME_NO_SEGMENTS.map((seg) => {
    const text = digits.slice(offset, offset + seg.len);
    offset += seg.len;
    return { ...seg, text };
  });
}

/** Compact color-coded CrimeNo for table cells — falls back to the raw string. */
export function CrimeNoInline({ crimeNo }) {
  const parts = splitCrimeNo(crimeNo);
  if (!parts) return <span className="num">{crimeNo ? String(crimeNo) : '—'}</span>;
  return (
    <span className="num whitespace-nowrap">
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && <span className="text-muted opacity-60">·</span>}
          <span style={{ color: p.cssColor }}>{p.text}</span>
        </span>
      ))}
    </span>
  );
}

export default function CrimeNoBreakdown({ crimeNo, caseNo, districtName, unitName, districtLabel, stationLabel }) {
  const t = useT();
  const tName = useNames();
  const parts = splitCrimeNo(crimeNo);

  const categoryId = parts ? Number(parts[0].text) : null;
  const decoded = parts
    ? {
        category: CATEGORY_NAMES[categoryId]
          ? tName('categories', categoryId, CATEGORY_NAMES[categoryId])
          : t('cases.crimeNo.code', { v: parts[0].text }),
        district: districtLabel || districtName || t('cases.crimeNo.unit', { v: parts[1].text }),
        station: stationLabel || unitName || t('cases.crimeNo.unit', { v: parts[2].text }),
        year: parts[3].text,
        serial: t('cases.crimeNo.serialNo', { n: Number(parts[4].text) }),
      }
    : null;

  return (
    <Card
      title={t('cases.crimeNo.title')}
      subtitle={t('cases.crimeNo.subtitle')}
      actions={caseNo ? <span className="text-xs text-muted num">{t('cases.crimeNo.caseNoTail')} <span className="text-ink">{caseNo}</span></span> : null}
    >
      {!parts ? (
        <div>
          <p className="num text-2xl text-ink tracking-widest break-all">{crimeNo ? String(crimeNo) : '—'}</p>
          <p className="text-xs text-muted mt-2">
            {t('cases.crimeNo.badFormat', { structure: t('cases.crimeNo.structure') })}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-stretch gap-2">
            {parts.map((p) => (
              <div
                key={p.key}
                className="flex-1 min-w-[5.5rem] rounded-lg border border-grid bg-canvas/60 px-3 py-2 text-center"
                style={{ borderTop: `2px solid ${p.cssColor}` }}
              >
                <div className="num text-xl sm:text-2xl font-semibold tracking-[0.2em]" style={{ color: p.cssColor }}>
                  {p.text}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-muted mt-1">{t(p.labelKey)}</div>
                <div className="text-xs text-ink mt-0.5 truncate" title={decoded[p.key]}>{decoded[p.key]}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3">{t('cases.crimeNo.legend')}</p>
        </>
      )}
    </Card>
  );
}
