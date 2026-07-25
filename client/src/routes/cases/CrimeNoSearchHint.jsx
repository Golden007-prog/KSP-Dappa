// CrimeNo intelligence for the explorer search box. When the typed query looks
// like a registration number, this strip decodes it live against the official
// 18-digit format ([1 cat][4 district][4 station][4 year][5 serial]), resolves
// the district/station segments through /meta/lookups, and offers one-tap
// pivots: filter that district/station/year, or open the case when a scanned
// row matches the number exactly. Shorter digit runs get an honest explainer
// (9 = CaseNo tail) instead of silent nothing.
import { splitCrimeNo, CATEGORY_NAMES } from './CrimeNoBreakdown.jsx';
import { useT, useNames } from '../../lib/i18n.jsx';

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
  const t = useT();
  const tName = useNames();
  const raw = String(q || '').trim();
  if (!raw) return null;

  // '#123' — direct CaseMasterID jump.
  if (raw.startsWith('#')) {
    const id = raw.slice(1);
    if (!/^\d+$/.test(id)) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted animate-fade-in" aria-label={t('cases.hint.caseIdLabel')}>
        <span className="eyebrow">{t('cases.hint.caseIdLabel')}</span>
        <ActionChip onClick={() => onOpenCase(id)}>{t('cases.hint.openCaseId', { id })}</ActionChip>
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
    const categoryId = Number(parts[0].text);
    const category = CATEGORY_NAMES[categoryId]
      ? tName('categories', categoryId, CATEGORY_NAMES[categoryId])
      : t('cases.crimeNo.code', { v: parts[0].text });
    // Station names have no translation table — units keep their API name.
    const districtLabel = district ? tName('districts', districtId, district.districtName) : '';
    const exact = rows.find((r) => String(r.crimeNo ?? '').replace(/\D/g, '') === digits);
    const yearOk = /^\d{4}$/.test(year) && Number(year) >= 2000 && Number(year) <= 2100;

    return (
      <div className="space-y-1.5 animate-fade-in" aria-label={t('cases.hint.decodedAria')}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="eyebrow">{t('cases.hint.decoded')}</span>
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
            {districtLabel || t('cases.hint.district', { id: districtId })}
            {' · '}
            {unit ? unit.unitName : t('cases.hint.station', { id: unitId })}
            {' · '}
            {year} · {t('cases.hint.serial', { n: Number(parts[4].text) })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {exact && (
            <ActionChip onClick={() => onOpenCase(String(exact.caseMasterId))}>{t('cases.hint.openThis')}</ActionChip>
          )}
          {district && (
            <ActionChip onClick={() => onApply({ districtId, q: '' })}>
              {t('cases.hint.filterDistrict', { name: districtLabel || district.districtName })}
            </ActionChip>
          )}
          {district && unit && (
            <ActionChip onClick={() => onApply({ districtId, unitId, q: '' })}>
              {t('cases.hint.filterStation', { name: unit.unitName })}
            </ActionChip>
          )}
          {yearOk && (
            <ActionChip onClick={() => onApply({ from: `${year}-01-01`, to: `${year}-12-31`, q: '' })}>
              {t('cases.hint.filterYear', { year })}
            </ActionChip>
          )}
          {!exact && (
            <span className="text-[11px] text-muted">{t('cases.hint.noExactMatch')}</span>
          )}
        </div>
      </div>
    );
  }

  if (digits.length === 9) {
    return (
      <p className="text-[11px] text-muted animate-fade-in">
        <span className="text-ink font-medium">{t('cases.hint.nineDigits')}</span>{t('cases.hint.nineDigitsBody')}
      </p>
    );
  }

  return (
    <p className="text-[11px] text-muted animate-fade-in">
      <span className="num text-ink font-medium">{t('cases.hint.nDigits', { n: digits.length })}</span>
      {t('cases.hint.nDigitsBody', { structure: t('cases.crimeNo.structure') })}
    </p>
  );
}
