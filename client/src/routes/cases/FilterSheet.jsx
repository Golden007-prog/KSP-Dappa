// Advanced filter builder for the Case Explorer — bottom sheet on phones,
// corner card on desktop (shared Sheet). District → station and crime head →
// subhead selects are dependent; period offers presets plus explicit from/to
// date inputs (explicit dates win over the preset, mirroring lib/filters.js).
// All writes go through explorerState.setMany so dependent clears are atomic.
import { useLookups } from '../../lib/api.js';
import { DATE_RANGES } from '../../lib/filters.js';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import { useT, useNames } from '../../lib/i18n.jsx';
import { MIN_AGE_OPTIONS } from './explorerState.js';

/** DATE_RANGES is shared English config — map its values onto `common` keys. */
export const RANGE_KEYS = {
  all: 'common.filter.allTime',
  '30d': 'common.filter.last30',
  '90d': 'common.filter.last90',
  '12m': 'common.filter.last12m',
  ytd: 'common.filter.yearToDate',
};

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
        {hint && <span className="text-[10px] text-muted/80">{hint}</span>}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Select({ value, onChange, options, placeholder, disabled, ariaLabel, loadingLabel }) {
  return (
    <select
      className="input-dark w-full !py-2.5"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{disabled ? loadingLabel : placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export default function FilterSheet({ open, onClose, values, setMany, onClearAll, activeCount = 0 }) {
  const t = useT();
  const tName = useNames();
  const lookups = useLookups();
  const lk = lookups.data;
  const loading = lookups.isLoading;
  const loadingLabel = t('cases.filter.loading');

  const districts = (lk?.districts || []).map((d) => ({ value: d.districtId, label: tName('districts', d.districtId, d.districtName) }));
  // Police-station names have no translation table — they keep their API name.
  const units = (lk?.units || [])
    .filter((u) => !values.districtId || u.districtId === values.districtId)
    .map((u) => ({ value: u.unitId, label: u.unitName }));
  const heads = (lk?.crimeHeads || []).map((h) => ({ value: h.crimeHeadId, label: tName('crimeHeads', h.crimeHeadId, h.headName) }));
  // /meta/lookups returns subheads keyed `headId`, which normalizeLookups does
  // not map onto crimeHeadId — so `s.crimeHeadId` is '' for every row and this
  // select used to offer all 27 subheads whatever head was chosen. The id
  // convention (head × 100 + n, verified across all 27 rows) is the reliable
  // parent link until api.js reads `headId`.
  const subHeads = (lk?.crimeSubHeads || [])
    .filter((s) => !values.crimeHeadId
      || s.crimeHeadId === values.crimeHeadId
      || Math.floor(Number(s.crimeSubHeadId) / 100) === Number(values.crimeHeadId))
    .map((s) => ({ value: s.crimeSubHeadId, label: tName('crimeSubHeads', s.crimeSubHeadId, s.subHeadName) }));
  const statuses = (lk?.statuses || []).map((s) => ({ value: s.id, label: tName('statuses', s.id, s.name) }));
  const gravities = (lk?.gravities || []).map((g) => ({ value: g.id, label: tName('gravities', g.id, g.name) }));

  return (
    <Sheet open={open} onClose={onClose} title={t('cases.filter.title')}>
      <div className="space-y-3 px-1 pb-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('cases.filter.district')}>
            <Select
              ariaLabel={t('cases.filter.districtAria')}
              value={values.districtId}
              onChange={(v) => setMany({ districtId: v })}
              options={districts}
              placeholder={t('cases.filter.allDistricts')}
              disabled={loading}
              loadingLabel={loadingLabel}
            />
          </Field>
          <Field label={t('cases.filter.station')} hint={!values.districtId ? t('cases.filter.allUnitsHint') : undefined}>
            <Select
              ariaLabel={t('cases.filter.stationAria')}
              value={values.unitId}
              onChange={(v) => setMany({ unitId: v })}
              options={units}
              placeholder={t('cases.filter.allStations')}
              disabled={loading}
              loadingLabel={loadingLabel}
            />
          </Field>
          <Field label={t('cases.filter.head')}>
            <Select
              ariaLabel={t('cases.filter.headAria')}
              value={values.crimeHeadId}
              onChange={(v) => setMany({ crimeHeadId: v })}
              options={heads}
              placeholder={t('cases.filter.allHeads')}
              disabled={loading}
              loadingLabel={loadingLabel}
            />
          </Field>
          <Field label={t('cases.filter.subHead')} hint={!values.crimeHeadId ? t('cases.filter.allHeadsHint') : undefined}>
            <Select
              ariaLabel={t('cases.filter.subHeadAria')}
              value={values.crimeSubHeadId}
              onChange={(v) => setMany({ crimeSubHeadId: v })}
              options={subHeads}
              placeholder={t('cases.filter.allSubHeads')}
              disabled={loading}
              loadingLabel={loadingLabel}
            />
          </Field>
          <Field label={t('cases.filter.status')} hint={t('cases.filter.clientRefine')}>
            <Select
              ariaLabel={t('cases.filter.statusAria')}
              value={values.statusId}
              onChange={(v) => setMany({ status: v })}
              options={statuses}
              placeholder={t('cases.filter.anyStatus')}
              disabled={loading}
              loadingLabel={loadingLabel}
            />
          </Field>
          <Field label={t('cases.filter.gravity')}>
            <Select
              ariaLabel={t('cases.filter.gravityAria')}
              value={values.gravityId}
              onChange={(v) => setMany({ gravityId: v })}
              options={gravities}
              placeholder={t('cases.filter.anyGravity')}
              disabled={loading}
              loadingLabel={loadingLabel}
            />
          </Field>
          <Field label={t('cases.filter.pendingAge')} hint={t('cases.filter.clientRefine')}>
            <Select
              ariaLabel={t('cases.filter.pendingAgeAria')}
              value={values.minAgeDays ? String(values.minAgeDays) : ''}
              onChange={(v) => setMany({ minAge: v })}
              options={MIN_AGE_OPTIONS.map((d) => ({ value: String(d), label: t('cases.filter.olderThan', { d }) }))}
              placeholder={t('cases.filter.anyAge')}
              disabled={false}
              loadingLabel={loadingLabel}
            />
          </Field>
        </div>

        <div className="border-t border-grid/60 pt-3">
          <Field label={t('cases.filter.period')}>
            <Select
              ariaLabel={t('cases.filter.periodAria')}
              value={values.explicitDates ? '' : (values.range === 'all' ? '' : values.range)}
              onChange={(v) => setMany({ range: v || 'all' })}
              options={DATE_RANGES.filter((r) => r.value !== 'all')
                .map((r) => ({ value: r.value, label: RANGE_KEYS[r.value] ? t(RANGE_KEYS[r.value]) : r.label }))}
              placeholder={values.explicitDates ? t('cases.filter.customDates') : t('common.filter.allTime')}
              disabled={false}
              loadingLabel={loadingLabel}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label={t('cases.filter.from')}>
              <input
                type="date"
                className="input-dark w-full !py-2 num"
                value={values.from}
                aria-label={t('cases.filter.fromAria')}
                onChange={(e) => setMany({ from: e.target.value })}
              />
            </Field>
            <Field label={t('cases.filter.to')}>
              <input
                type="date"
                className="input-dark w-full !py-2 num"
                value={values.to}
                aria-label={t('cases.filter.toAria')}
                onChange={(e) => setMany({ to: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-[10px] text-muted/80 mt-1.5">
            {values.explicitDates
              ? t('cases.filter.dateHintCustom')
              : values.range && values.range !== 'all'
                ? t('cases.filter.dateHintPreset')
                : t('cases.filter.dateHintNone')}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3 border-t border-grid/60 pt-3 min-h-[44px] cursor-pointer">
          <span>
            <span className="text-sm text-ink">{t('cases.filter.anomaliesOnly')}</span>
            <span className="block text-[11px] text-muted">{t('cases.filter.anomaliesOnlyHint')}</span>
          </span>
          <input
            type="checkbox"
            className="h-4.5 w-4.5 accent-[var(--c-amber)]"
            checked={values.anomalyOnly}
            onChange={(e) => setMany({ anomaly: e.target.checked ? '1' : '' })}
          />
        </label>

        <div className="flex items-center justify-between gap-2 border-t border-grid/60 pt-3">
          <div className="flex items-center gap-2">
            {activeCount > 0
              ? <Badge tone="amber">{t('cases.filter.activeCount', { n: activeCount })}</Badge>
              : <span className="text-xs text-muted">{t('cases.filter.noneActive')}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={onClearAll} disabled={activeCount === 0}>{t('cases.chip.clearAll')}</button>
            <button type="button" className="btn-primary" onClick={onClose}>{t('cases.filter.done')}</button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
