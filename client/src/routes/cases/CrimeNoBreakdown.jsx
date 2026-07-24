// CrimeNo anatomy — the 18-digit format the judges wrote (docs/CONTRACTS.md):
// [1 category][4 DistrictID][4 UnitID][4 year][5 serial]; CaseNo = last 9 digits.
// Category: FIR=1 · UDR=3 · PAR=4 · Zero FIR=8.
import Card from '../../components/Card.jsx';
import './crimeno-colors.css';

// `color` stays the raw dark-theme hex for backwards compatibility; rendering
// uses `cssColor` (a CSS variable) so light theme and print swap in AA-safe hues.
export const CRIME_NO_SEGMENTS = [
  { key: 'category', label: 'Category', len: 1, color: '#F5A623', cssColor: 'var(--seg-category)' },
  { key: 'district', label: 'District', len: 4, color: '#2DD4BF', cssColor: 'var(--seg-district)' },
  { key: 'station', label: 'Station', len: 4, color: '#7C9BFF', cssColor: 'var(--seg-station)' },
  { key: 'year', label: 'Year', len: 4, color: '#C084FC', cssColor: 'var(--seg-year)' },
  { key: 'serial', label: 'Serial', len: 5, color: '#F97316', cssColor: 'var(--seg-serial)' },
];

const CATEGORY_NAMES = { 1: 'FIR', 3: 'UDR', 4: 'PAR', 8: 'Zero FIR' };

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

export default function CrimeNoBreakdown({ crimeNo, caseNo, districtName, unitName }) {
  const parts = splitCrimeNo(crimeNo);

  const decoded = parts
    ? {
        category: CATEGORY_NAMES[Number(parts[0].text)] || `code ${parts[0].text}`,
        district: districtName || `unit ${parts[1].text}`,
        station: unitName || `unit ${parts[2].text}`,
        year: parts[3].text,
        serial: `no. ${Number(parts[4].text)}`,
      }
    : null;

  return (
    <Card
      title="CrimeNo anatomy"
      subtitle="18-digit registration number, segmented per the official KSP format"
      actions={caseNo ? <span className="text-xs text-muted num">CaseNo (last 9): <span className="text-ink">{caseNo}</span></span> : null}
    >
      {!parts ? (
        <div>
          <p className="num text-2xl text-ink tracking-widest break-all">{crimeNo ? String(crimeNo) : '—'}</p>
          <p className="text-xs text-muted mt-2">
            Unexpected format — expected 18 digits ([1 category][4 district][4 station][4 year][5 serial]).
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-stretch gap-2">
            {parts.map((p) => (
              <div
                key={p.key}
                className="flex-1 min-w-[5.5rem] rounded-lg border border-grid bg-base/60 px-3 py-2 text-center"
                style={{ borderTop: `2px solid ${p.cssColor}` }}
              >
                <div className="num text-xl sm:text-2xl font-semibold tracking-[0.2em]" style={{ color: p.cssColor }}>
                  {p.text}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-muted mt-1">{p.label}</div>
                <div className="text-xs text-ink mt-0.5 truncate" title={decoded[p.key]}>{decoded[p.key]}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3">
            Legend: 1-digit category (1 FIR · 3 UDR · 4 PAR · 8 Zero FIR) · 4-digit district unit ·
            4-digit station · 4-digit registration year · 5-digit serial per station+category+year.
            The 9-digit CaseNo is the year + serial tail.
          </p>
        </>
      )}
    </Card>
  );
}
