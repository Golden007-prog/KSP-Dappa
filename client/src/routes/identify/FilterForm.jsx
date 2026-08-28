// Structured pre-filter + purpose binding. The search button lives in the
// parent; this form reports validity so the button only enables with an
// image, at least one filter, a case number and a legal basis (rules R3, R6).
import { useLookups } from '../../lib/api.js';
import { useI18n } from '../../lib/i18n.jsx';

const RISK_BANDS = ['high', 'elevated', 'moderate', 'low'];
const AGE_BANDS = ['18-25', '26-35', '36-50', '51+'];
const MO_SUGGESTIONS = ['two-wheeler', 'gold-chain', 'night', 'lock-breaking', 'gas-cutter', 'otp-fraud', 'vehicle-theft', 'country-made-pistol'];

export function anyFilter(f) {
  return Boolean(f.districtId || f.moTag || f.riskBand || f.ageBand || f.gender || f.yearFrom || f.yearTo);
}

export default function FilterForm({ filters, onFilters, purpose, onPurpose, legalBases = [], disabled = false }) {
  const { t, tName } = useI18n();
  const lookups = useLookups();
  const districts = (lookups.data && lookups.data.districts) || [];
  const set = (k, v) => onFilters({ ...filters, [k]: v });
  const setP = (k, v) => onPurpose({ ...purpose, [k]: v });
  const field = 'input-dark w-full min-h-[44px]';
  const label = 'block text-[11px] uppercase tracking-wide text-muted mb-1';

  return (
    <div className="space-y-4">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-semibold text-ink">{t('identify.purpose.title')}</legend>
        <p className="text-xs text-muted -mt-1">{t('identify.purpose.subtitle')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>{t('identify.purpose.caseNo')}</span>
            <input className={field} value={purpose.caseNo} onChange={(e) => setP('caseNo', e.target.value)} placeholder={t('identify.purpose.caseNoPh')} inputMode="text" autoComplete="off" required aria-required="true" />
          </label>
          <label className="block">
            <span className={label}>{t('identify.purpose.legalBasis')}</span>
            <select className={field} value={purpose.legalBasis} onChange={(e) => setP('legalBasis', e.target.value)} required aria-required="true">
              <option value="">{t('identify.purpose.choose')}</option>
              {legalBases.map((b) => <option key={b.id} value={b.id}>{t(`identify.basis.${b.id}`)}</option>)}
            </select>
          </label>
        </div>
        {purpose.legalBasis && (
          <p className="text-[11px] text-muted">{(legalBases.find((b) => b.id === purpose.legalBasis) || {}).cite}</p>
        )}
        {(!purpose.caseNo || !purpose.legalBasis) && <p className="text-[11px] text-amber">{t('identify.purpose.required')}</p>}
      </fieldset>

      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-semibold text-ink">{t('identify.filters.title')}</legend>
        <p className="text-xs text-muted -mt-1">{t('identify.filters.subtitle')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>{t('identify.filters.district')}</span>
            <select className={field} value={filters.districtId} onChange={(e) => set('districtId', e.target.value)}>
              <option value="">{t('identify.filters.anyDistrict')}</option>
              {districts.map((d) => <option key={d.districtId} value={d.districtId}>{tName('districts', d.districtId, d.districtName)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>{t('identify.filters.moTag')}</span>
            <input className={field} list="identify-mo-tags" value={filters.moTag} onChange={(e) => set('moTag', e.target.value)} placeholder={t('identify.filters.moTagPh')} autoComplete="off" />
            <datalist id="identify-mo-tags">{MO_SUGGESTIONS.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="block">
            <span className={label}>{t('identify.filters.riskBand')}</span>
            <select className={field} value={filters.riskBand} onChange={(e) => set('riskBand', e.target.value)}>
              <option value="">{t('identify.filters.any')}</option>
              {RISK_BANDS.map((b) => <option key={b} value={b}>{t(`identify.filters.risk.${b}`)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>{t('identify.filters.ageBand')}</span>
            <select className={field} value={filters.ageBand} onChange={(e) => set('ageBand', e.target.value)}>
              <option value="">{t('identify.filters.any')}</option>
              {AGE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>{t('identify.filters.gender')}</span>
            <select className={field} value={filters.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">{t('identify.filters.any')}</option>
              <option value="male">{t('identify.filters.genderMale')}</option>
              <option value="female">{t('identify.filters.genderFemale')}</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={label}>{t('identify.filters.yearFrom')}</span>
              <input className={`${field} num`} type="number" min="2000" max="2035" value={filters.yearFrom} onChange={(e) => set('yearFrom', e.target.value)} inputMode="numeric" />
            </label>
            <label className="block">
              <span className={label}>{t('identify.filters.yearTo')}</span>
              <input className={`${field} num`} type="number" min="2000" max="2035" value={filters.yearTo} onChange={(e) => set('yearTo', e.target.value)} inputMode="numeric" />
            </label>
          </div>
          <label className="block">
            <span className={label}>{t('identify.filters.limit')}</span>
            <input className={`${field} num`} type="number" min="1" max="25" value={filters.limit} onChange={(e) => set('limit', e.target.value)} inputMode="numeric" />
          </label>
        </div>
        {!anyFilter(filters) && <p className="text-[11px] text-amber">{t('identify.filters.needOne')}</p>}
      </fieldset>
    </div>
  );
}
