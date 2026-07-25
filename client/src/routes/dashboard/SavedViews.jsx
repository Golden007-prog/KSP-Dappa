// Saved views — name and store the current URL filter set (district / crime
// head / period) in localStorage; re-apply or delete from a Sheet. Everything
// stays in the browser — nothing is sent to the server.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useLookups } from '../../lib/api.js';
import { useUrlFilters, DATE_RANGES } from '../../lib/filters.js';
import { dateLabel } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';

const KEY = 'dappa-dash-saved-views';
const MAX_VIEWS = 12;

function readViews() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && x.id && x.filters) : [];
  } catch {
    return [];
  }
}

function writeViews(views) {
  try { localStorage.setItem(KEY, JSON.stringify(views)); } catch { /* private mode */ }
}

export default function SavedViews({ open, onClose }) {
  const toast = useToast();
  const t = useT();
  const tName = useNames();
  const lookups = useLookups();
  const { setFilters } = useUrlFilters();
  const [searchParams] = useSearchParams();
  const [views, setViews] = useState(readViews);
  const [name, setName] = useState('');

  // Raw params (not the derived from/to): saving a '90d' preset must stay a
  // rolling preset, not freeze today's resolved dates.
  const current = {
    districtId: searchParams.get('districtId') || '',
    crimeHeadId: searchParams.get('crimeHeadId') || '',
    range: searchParams.get('range') || '',
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  };

  const describe = (f) => {
    const bits = [];
    if (f.districtId) {
      const raw = (lookups.data?.districts || []).find((d) => String(d.districtId) === String(f.districtId))?.districtName
        || t('dashboard.filters.district', { id: f.districtId });
      bits.push(tName('districts', f.districtId, raw) || raw);
    }
    if (f.crimeHeadId) {
      const raw = (lookups.data?.crimeHeads || []).find((h) => String(h.crimeHeadId) === String(f.crimeHeadId))?.headName
        || t('dashboard.filters.head', { id: f.crimeHeadId });
      bits.push(tName('crimeHeads', f.crimeHeadId, raw) || raw);
    }
    if (f.from || f.to) bits.push(`${f.from ? dateLabel(f.from) : '…'} → ${f.to ? dateLabel(f.to) : '…'}`);
    else if (f.range && f.range !== 'all') {
      const r = DATE_RANGES.find((x) => x.value === f.range);
      bits.push(r ? t(r.key) : f.range);
    }
    return bits.length ? bits.join(' · ') : t('dashboard.views.describeNone');
  };

  const save = () => {
    const label = name.trim() || describe(current);
    const view = { id: String(Date.now()), name: label, filters: current, savedAt: new Date().toISOString() };
    const next = [view, ...views].slice(0, MAX_VIEWS);
    setViews(next);
    writeViews(next);
    setName('');
    toast.success(t('dashboard.views.saved', { name: label }));
  };

  const apply = (view) => {
    const f = view.filters || {};
    setFilters({
      districtId: f.districtId || '',
      crimeHeadId: f.crimeHeadId || '',
      range: f.range || 'all',
      from: f.from || '',
      to: f.to || '',
    });
    toast.info(t('dashboard.views.applied', { name: view.name }));
    onClose();
  };

  const remove = (view) => {
    const next = views.filter((v) => v.id !== view.id);
    setViews(next);
    writeViews(next);
    toast.info(t('dashboard.views.deleted', { name: view.name }));
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('dashboard.views.title')}>
      <div className="space-y-4 px-1">
        <section className="space-y-2">
          <p className="eyebrow">{t('dashboard.views.saveCurrent')}</p>
          <p className="text-xs text-muted">{describe(current)}</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); save(); }}
          >
            <input
              className="input-dark flex-1 min-h-[44px]"
              placeholder={t('dashboard.views.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={t('dashboard.views.nameAria')}
            />
            <button type="submit" className="btn-primary min-h-[44px] shrink-0">{t('common.action.save')}</button>
          </form>
        </section>
        <section>
          <p className="eyebrow mb-1.5">{t('dashboard.views.savedHeading')}</p>
          {views.length === 0 ? (
            <EmptyState compact title={t('dashboard.views.empty')} message={t('dashboard.views.emptyHint')} />
          ) : (
            <ul className="divide-y divide-grid/50">
              {views.map((v) => (
                <li key={v.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{v.name}</p>
                    <p className="truncate text-[11px] text-muted">{describe(v.filters || {})}</p>
                  </div>
                  <button type="button" className="btn min-h-[44px] shrink-0" onClick={() => apply(v)}>
                    {t('common.action.apply')}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    aria-label={t('dashboard.views.deleteAria', { name: v.name })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-signal hover:bg-grid/40 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-[11px] text-muted">{t('dashboard.views.footnote')}</p>
      </div>
    </Sheet>
  );
}
