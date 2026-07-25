// Shared filter bar — District / Crime Head / Date range, persisted in URL
// search params (lib/filters.js). Props:
//   show?     — subset of ['district','crimeHead','dateRange'] (default all three)
//   children? — route-specific extra controls appended on the right
//   className?
// Options come from useLookups(); while lookups load the selects render disabled
// with a 'Loading…' option — never a crash. On small screens the bar becomes a
// horizontally scrollable chip row instead of wrapping.
// Extras: removable active-filter chips (labels resolved via useLookups) and a
// "Views" sheet that saves/recalls named filter combos (localStorage
// 'dappa-saved-views').
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLookups } from '../lib/api.js';
import { useUrlFilters, DATE_RANGES, describeFilters } from '../lib/filters.js';
import Sheet from './Sheet.jsx';
import { useToast } from './ToastProvider.jsx';
import { useI18n } from '../lib/i18n.jsx';

const VIEWS_KEY = 'dappa-saved-views';

function readViews() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY));
    return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && x.name) : [];
  } catch {
    return [];
  }
}

function writeViews(views) {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch { /* private mode */ }
}

function Select({ label, value, onChange, options, placeholder, disabled, loadingText }) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">{label}</span>
      <select
        className="input-dark !py-2 sm:!py-1.5 pr-7 min-w-[9rem] max-w-[14rem]"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        <option value="">{disabled ? loadingText : placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function FilterChip({ label, onClear, removeLabel }) {
  return (
    <span className="chip shrink-0 !pr-1 bg-primary/10 border-primary/30 text-ink">
      <span className="truncate max-w-[11rem]">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={removeLabel}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-signal transition-colors"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </span>
  );
}

/** FilterChip + its translated remove-button label. */
function Chip({ label, onClear, t }) {
  return <FilterChip label={label} onClear={onClear} removeLabel={t('shell.filter.removeAria', { label })} />;
}

export default function FilterBar({ show = ['district', 'crimeHead', 'dateRange'], children, className = '' }) {
  const lookups = useLookups();
  const toast = useToast();
  const { t, tName } = useI18n();
  const { districtId, crimeHeadId, range, setFilter, setFilters, reset } = useUrlFilters();
  const [searchParams] = useSearchParams();
  const rawFrom = searchParams.get('from') || '';
  const rawTo = searchParams.get('to') || '';

  const [viewsOpen, setViewsOpen] = useState(false);
  const [views, setViews] = useState(readViews);
  const [viewName, setViewName] = useState('');

  // Option text is the API name translated by id (tName falls back to the API
  // string), so a Kannada session reads ಬೆಂಗಳೂರು ನಗರ without the ids moving.
  const districts = (lookups.data?.districts || [])
    .map((d) => ({ value: d.districtId, label: tName('districts', d.districtId, d.districtName) }));
  const heads = (lookups.data?.crimeHeads || [])
    .map((h) => ({ value: h.crimeHeadId, label: tName('crimeHeads', h.crimeHeadId, h.headName) }));
  const anyActive = districtId || crimeHeadId || (range && range !== 'all') || rawFrom || rawTo;

  const districtName = districts.find((d) => d.value === districtId)?.label || t('shell.filter.districtN', { id: districtId });
  const headName = heads.find((h) => h.value === crimeHeadId)?.label || t('shell.filter.headN', { id: crimeHeadId });
  const rangeEntry = DATE_RANGES.find((r) => r.value === range);
  const rangeLabel = rangeEntry ? t(rangeEntry.key) : range;

  const currentParams = { districtId, crimeHeadId, range: range === 'all' ? '' : range, from: rawFrom, to: rawTo };
  const currentSummary = describeFilters(currentParams, lookups.data, { t, tName });

  const applyView = (v) => {
    // key order matters: setFilters clears from/to whenever it processes
    // 'range', so range must come first for explicit dates to survive
    setFilters({
      range: v.range && v.range !== 'all' ? v.range : '',
      from: v.from || '',
      to: v.to || '',
      districtId: v.districtId || '',
      crimeHeadId: v.crimeHeadId || '',
    });
    setViewsOpen(false);
  };

  const saveView = () => {
    const name = viewName.trim() || currentSummary;
    const next = [
      { id: `${Date.now()}`, name, ...currentParams },
      ...views.filter((v) => v.name !== name),
    ].slice(0, 12);
    setViews(next);
    writeViews(next);
    setViewName('');
    toast.success(t('shell.filter.viewSaved', { name }));
  };

  const deleteView = (id) => {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    writeViews(next);
  };

  return (
    <>
      <div
        role="group"
        aria-label={t('shell.filter.groupAria')}
        className={`flex items-center gap-3 bg-panel border border-grid rounded-xl px-3 py-2 shadow-card
          flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible ${className}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0" aria-hidden="true">
          <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" strokeLinejoin="round" />
        </svg>
        {show.includes('district') && (
          <Select
            label={t('common.filter.district')}
            value={districtId}
            onChange={(v) => setFilter('districtId', v)}
            options={districts}
            placeholder={t('common.filter.allDistricts')}
            disabled={lookups.isLoading}
            loadingText={t('common.state.loading')}
          />
        )}
        {show.includes('crimeHead') && (
          <Select
            label={t('common.filter.crimeHead')}
            value={crimeHeadId}
            onChange={(v) => setFilter('crimeHeadId', v)}
            options={heads}
            placeholder={t('common.filter.allCrimeHeads')}
            disabled={lookups.isLoading}
            loadingText={t('common.state.loading')}
          />
        )}
        {show.includes('dateRange') && (
          <Select
            label={t('common.filter.period')}
            value={range === 'all' ? '' : range}
            onChange={(v) => setFilter('range', v)}
            options={DATE_RANGES.filter((r) => r.value !== 'all').map((r) => ({ value: r.value, label: t(r.key) }))}
            placeholder={t('common.filter.allTime')}
            disabled={false}
          />
        )}
        {anyActive && (
          <button
            type="button"
            className="shrink-0 rounded-lg px-2.5 py-1.5 min-h-[40px] text-xs text-muted hover:text-primary transition-colors"
            onClick={reset}
          >
            {t('common.action.clear')}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setViews(readViews()); setViewsOpen(true); }}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-h-[40px] text-xs text-muted hover:text-primary transition-colors"
          aria-haspopup="dialog"
          aria-label={t('shell.filter.savedViewsAria')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1Z" />
          </svg>
          {t('shell.filter.views')}
        </button>
        {districtId && show.includes('district') && (
          <Chip label={t('shell.filter.chipDistrict', { name: districtName })} onClear={() => setFilter('districtId', '')} t={t} />
        )}
        {crimeHeadId && show.includes('crimeHead') && (
          <Chip label={t('shell.filter.chipHead', { name: headName })} onClear={() => setFilter('crimeHeadId', '')} t={t} />
        )}
        {(rawFrom || rawTo) && (
          <Chip
            label={t('shell.filter.chipPeriodRange', { from: rawFrom || '…', to: rawTo || '…' })}
            onClear={() => setFilters({ from: '', to: '' })}
            t={t}
          />
        )}
        {!rawFrom && !rawTo && range !== 'all' && show.includes('dateRange') && (
          <Chip label={t('shell.filter.chipPeriod', { label: rangeLabel })} onClear={() => setFilter('range', '')} t={t} />
        )}
        {children && <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>}
      </div>

      <Sheet open={viewsOpen} onClose={() => setViewsOpen(false)} title={t('shell.filter.savedViewsTitle')}>
        <div className="space-y-3 px-1 pb-1">
          {anyActive ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); saveView(); }}
            >
              <input
                className="input-dark flex-1 min-w-0 !py-2 min-h-[44px]"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder={currentSummary}
                aria-label={t('shell.filter.nameAria')}
                maxLength={60}
              />
              <button type="submit" className="btn-primary shrink-0 min-h-[44px]">{t('common.action.save')}</button>
            </form>
          ) : (
            <p className="text-xs text-muted">
              {t('shell.filter.saveHint')}
            </p>
          )}
          {views.length === 0 ? (
            <p className="text-xs text-muted border-t border-grid/60 pt-3">
              {t('shell.filter.noViews')}
            </p>
          ) : (
            <ul className="border-t border-grid/60 pt-2 space-y-0.5" aria-label={t('shell.section.savedViews')}>
              {views.map((v) => (
                <li key={v.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyView(v)}
                    className="flex-1 min-w-0 rounded-xl px-3 py-2 min-h-[48px] text-left hover:bg-grid/30 transition-colors"
                  >
                    <span className="block text-sm text-ink truncate">{v.name}</span>
                    <span className="block text-[11px] text-muted truncate">{describeFilters(v, lookups.data, { t, tName })}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteView(v.id)}
                    aria-label={t('shell.filter.deleteAria', { name: v.name })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-signal hover:bg-grid/30 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5m4-5v5" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  );
}
