// /alerts — saved views row: name the current filter+severity+group+sort combo
// (the full URL search string), stored in localStorage via useAlertPrefs, and
// re-apply or delete it from quick chips.
import { useState } from 'react';
import Tooltip from '../../components/Tooltip.jsx';
import { useT } from '../../lib/i18n.jsx';

export default function SavedViews({ views, currentSearch, onApply, onSave, onDelete }) {
  const t = useT();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const commit = () => {
    const clean = name.trim();
    if (!clean) return;
    onSave(clean);
    setName('');
    setNaming(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('alerts.views.aria')}>
      <span className="text-xs text-muted mr-0.5">{t('alerts.views.label')}</span>
      {views.map((v) => (
        <span
          key={v.name}
          className={`inline-flex items-center rounded-full border bg-panel text-xs ${
            v.search === currentSearch ? 'border-primary/60 text-primary' : 'border-grid text-ink'
          }`}
        >
          <button
            type="button"
            className="pl-2.5 pr-1 py-1 min-h-[40px] sm:min-h-[26px] hover:text-primary transition-colors"
            onClick={() => onApply(v.search)}
            aria-label={t('alerts.views.applyAria', { name: v.name })}
          >
            {v.name}
          </button>
          <button
            type="button"
            className="px-1.5 py-1 min-h-[40px] sm:min-h-[26px] text-muted hover:text-signal transition-colors"
            onClick={() => onDelete(v.name)}
            aria-label={t('alerts.views.deleteAria', { name: v.name })}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </span>
      ))}
      {naming ? (
        <form
          className="inline-flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); commit(); }}
        >
          <input
            className="input-dark !py-1 !px-2 !text-xs w-36 min-h-[40px] sm:min-h-[28px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('alerts.views.namePlaceholder')}
            maxLength={40}
            aria-label={t('alerts.views.nameAria')}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <button type="submit" className="btn !px-2 !py-1 !text-xs min-h-[40px] sm:min-h-[28px]" disabled={!name.trim()}>{t('common.action.save')}</button>
          <button
            type="button"
            className="btn-ghost !px-2 !py-1 !text-xs min-h-[40px] sm:min-h-[28px]"
            onClick={() => { setNaming(false); setName(''); }}
          >
            {t('common.action.cancel')}
          </button>
        </form>
      ) : (
        <Tooltip label={t('alerts.views.saveTip')}>
          <button
            type="button"
            className="chip !py-1 min-h-[40px] sm:min-h-[26px] hover:border-primary/50 hover:text-primary transition-colors"
            onClick={() => setNaming(true)}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            {t('alerts.views.save')}
          </button>
        </Tooltip>
      )}
    </div>
  );
}
