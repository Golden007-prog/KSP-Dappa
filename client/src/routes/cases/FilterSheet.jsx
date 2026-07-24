// Advanced filter builder for the Case Explorer — bottom sheet on phones,
// corner card on desktop (shared Sheet). District → station and crime head →
// subhead selects are dependent; period offers presets plus explicit from/to
// date inputs (explicit dates win over the preset, mirroring lib/filters.js).
// All writes go through explorerState.setMany so dependent clears are atomic.
import { useLookups } from '../../lib/api.js';
import { DATE_RANGES } from '../../lib/filters.js';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import { MIN_AGE_OPTIONS } from './explorerState.js';

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

function Select({ value, onChange, options, placeholder, disabled, ariaLabel }) {
  return (
    <select
      className="input-dark w-full !py-2.5"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{disabled ? 'Loading…' : placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export default function FilterSheet({ open, onClose, values, setMany, onClearAll, activeCount = 0 }) {
  const lookups = useLookups();
  const lk = lookups.data;
  const loading = lookups.isLoading;

  const districts = (lk?.districts || []).map((d) => ({ value: d.districtId, label: d.districtName }));
  const units = (lk?.units || [])
    .filter((u) => !values.districtId || u.districtId === values.districtId)
    .map((u) => ({ value: u.unitId, label: u.unitName }));
  const heads = (lk?.crimeHeads || []).map((h) => ({ value: h.crimeHeadId, label: h.headName }));
  const subHeads = (lk?.crimeSubHeads || [])
    .filter((s) => !values.crimeHeadId || s.crimeHeadId === values.crimeHeadId)
    .map((s) => ({ value: s.crimeSubHeadId, label: s.subHeadName }));
  const statuses = (lk?.statuses || []).map((s) => ({ value: s.id, label: s.name }));
  const gravities = (lk?.gravities || []).map((g) => ({ value: g.id, label: g.name }));

  return (
    <Sheet open={open} onClose={onClose} title="Filter cases">
      <div className="space-y-3 px-1 pb-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="District">
            <Select
              ariaLabel="District"
              value={values.districtId}
              onChange={(v) => setMany({ districtId: v })}
              options={districts}
              placeholder="All districts"
              disabled={loading}
            />
          </Field>
          <Field label="Station" hint={!values.districtId ? 'all units' : undefined}>
            <Select
              ariaLabel="Police station"
              value={values.unitId}
              onChange={(v) => setMany({ unitId: v })}
              options={units}
              placeholder="All stations"
              disabled={loading}
            />
          </Field>
          <Field label="Crime head">
            <Select
              ariaLabel="Crime head"
              value={values.crimeHeadId}
              onChange={(v) => setMany({ crimeHeadId: v })}
              options={heads}
              placeholder="All crime heads"
              disabled={loading}
            />
          </Field>
          <Field label="Subhead" hint={!values.crimeHeadId ? 'all heads' : undefined}>
            <Select
              ariaLabel="Crime subhead"
              value={values.crimeSubHeadId}
              onChange={(v) => setMany({ crimeSubHeadId: v })}
              options={subHeads}
              placeholder="All subheads"
              disabled={loading}
            />
          </Field>
          <Field label="Status" hint="client-side refine">
            <Select
              ariaLabel="Case status"
              value={values.statusId}
              onChange={(v) => setMany({ status: v })}
              options={statuses}
              placeholder="Any status"
              disabled={loading}
            />
          </Field>
          <Field label="Gravity">
            <Select
              ariaLabel="Gravity of offence"
              value={values.gravityId}
              onChange={(v) => setMany({ gravityId: v })}
              options={gravities}
              placeholder="Any gravity"
              disabled={loading}
            />
          </Field>
          <Field label="Pending age" hint="client-side refine">
            <Select
              ariaLabel="Minimum case age in days"
              value={values.minAgeDays ? String(values.minAgeDays) : ''}
              onChange={(v) => setMany({ minAge: v })}
              options={MIN_AGE_OPTIONS.map((d) => ({ value: String(d), label: `Older than ${d} days` }))}
              placeholder="Any age"
              disabled={false}
            />
          </Field>
        </div>

        <div className="border-t border-grid/60 pt-3">
          <Field label="Period">
            <Select
              ariaLabel="Date range preset"
              value={values.explicitDates ? '' : (values.range === 'all' ? '' : values.range)}
              onChange={(v) => setMany({ range: v || 'all' })}
              options={DATE_RANGES.filter((r) => r.value !== 'all').map((r) => ({ value: r.value, label: r.label }))}
              placeholder={values.explicitDates ? 'Custom dates below' : 'All time'}
              disabled={false}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="From">
              <input
                type="date"
                className="input-dark w-full !py-2 num"
                value={values.from}
                aria-label="Registered from date"
                onChange={(e) => setMany({ from: e.target.value })}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className="input-dark w-full !py-2 num"
                value={values.to}
                aria-label="Registered to date"
                onChange={(e) => setMany({ to: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-[10px] text-muted/80 mt-1.5">
            {values.explicitDates
              ? 'Custom dates active — picking a Period preset replaces them.'
              : values.range && values.range !== 'all'
                ? 'These dates come from the preset — editing either switches to custom dates.'
                : 'Pick a preset above or type explicit dates.'}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3 border-t border-grid/60 pt-3 min-h-[44px] cursor-pointer">
          <span>
            <span className="text-sm text-ink">Anomalies only</span>
            <span className="block text-[11px] text-muted">Cases flagged by the nightly z-score pass</span>
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
            {activeCount > 0 ? <Badge tone="amber">{activeCount} active</Badge> : <span className="text-xs text-muted">No filters active</span>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={onClearAll} disabled={activeCount === 0}>Clear all</button>
            <button type="button" className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
