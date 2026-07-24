// CrimeNo intelligence for the explorer search box. When the typed query looks
// like a registration number, this strip decodes it live against the official
// 18-digit format ([1 cat][4 district][4 station][4 year][5 serial]), resolves
// the district/station segments through /meta/lookups, and offers one-tap
// pivots: filter that district/station/year, or open the case when a scanned
// row matches the number exactly. Shorter digit runs get an honest explainer
// (9 = CaseNo tail) instead of silent nothing.
import { splitCrimeNo } from './CrimeNoBreakdown.jsx';

const CATEGORY_NAMES = { 1: 'FIR', 3: 'UDR', 4: 'PAR', 8: 'Zero FIR' };

function ActionChip({ onClick, children }) {
  return (
    <button
      type="button"
      className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function CrimeNoSearchHint({ q, rows = [], lookups, onApply, onOpenCase }) {
  const raw = String(q || '').trim();
  if (!raw) return null;

  // '#123' — direct CaseMasterID jump.
  if (raw.startsWith('#')) {
    const id = raw.slice(1);
    if (!/^\d+$/.test(id)) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted animate-fade-in" aria-label="Case id jump">
        <span className="eyebrow">Case id</span>
        <ActionChip onClick={() => onOpenCase(id)}>Open case #{id} →</ActionChip>
      </div>
    );
  }

  const digits = raw.replace(/[\s·.\-–]/g, '');
  if (!/^\d{6,}$/.test(digits)) return null;

  if (digits.length === 18) {
    const parts = splitCrimeNo(digits);
    if (!parts) return null;
    const districtId = parts[1].text;
    const unitId = parts[2].text;
    const year = parts[3].text;
    const district = (lookups?.districts || []).find((d) => d.districtId === districtId);
    const unit = (lookups?.units || []).find((u) => u.unitId === unitId);
    const category = CATEGORY_NAMES[Number(parts[0].text)] || `code ${parts[0].text}`;
    const exact = rows.find((r) => String(r.crimeNo ?? '').replace(/\D/g, '') === digits);
    const yearOk = /^\d{4}$/.test(year) && Number(year) >= 2000 && Number(year) <= 2100;

    return (
      <div className="space-y-1.5 animate-fade-in" aria-label="CrimeNo decoded">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="eyebrow">CrimeNo decoded</span>
          <span className="num">
            {parts.map((p, i) => (
              <span key={p.key}>
                {i > 0 && <span className="opacity-50">·</span>}
                <span style={{ color: p.cssColor }}>{p.text}</span>
              </span>
            ))}
          </span>
          <span>
            {category}
            {' · '}
            {district ? district.districtName : `district ${districtId}`}
            {' · '}
            {unit ? unit.unitName : `station ${unitId}`}
            {' · '}
            {year} · serial {Number(parts[4].text)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {exact && (
            <ActionChip onClick={() => onOpenCase(String(exact.caseMasterId))}>Open this case →</ActionChip>
          )}
          {district && (
            <ActionChip onClick={() => onApply({ districtId, q: '' })}>
              Filter district: {district.districtName}
            </ActionChip>
          )}
          {district && unit && (
            <ActionChip onClick={() => onApply({ districtId, unitId, q: '' })}>
              Filter station: {unit.unitName}
            </ActionChip>
          )}
          {yearOk && (
            <ActionChip onClick={() => onApply({ from: `${year}-01-01`, to: `${year}-12-31`, q: '' })}>
              Filter year {year}
            </ActionChip>
          )}
          {!exact && (
            <span className="text-[11px] text-muted">no exact match in the scanned rows — widen the filters if expected</span>
          )}
        </div>
      </div>
    );
  }

  if (digits.length === 9) {
    return (
      <p className="text-[11px] text-muted animate-fade-in">
        <span className="text-ink font-medium">9 digits</span> — looks like a CaseNo tail (year + serial); it is matched against the CaseNo column. The full CrimeNo has 18 digits.
      </p>
    );
  }

  return (
    <p className="text-[11px] text-muted animate-fade-in">
      <span className="num text-ink font-medium">{digits.length} digits</span> — a full CrimeNo has 18: [1 category][4 district][4 station][4 year][5 serial]. Partial numbers still match by substring.
    </p>
  );
}
