// /reports — preset chips above the builder. Save the current configuration
// under a name, restore it in one tap, delete it when the tasking changes.
import { useState } from 'react';
import Tooltip from '../../components/Tooltip.jsx';
import { useT } from '../../lib/i18n.jsx';
import { describePreset } from './presets.js';

const SMALL_BTN = 'btn !px-2.5 !text-xs min-h-[44px] sm:min-h-[30px]';

export default function PresetsCard({ presets, onApply, onSave, onDelete }) {
  const t = useT();
  const [name, setName] = useState('');

  const save = () => {
    const clean = name.trim();
    if (!clean) return;
    onSave(clean);
    setName('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('alerts.presets.aria')}>
      <span className="text-xs text-muted mr-0.5">{t('alerts.presets.label')}</span>

      {presets.map((p) => (
        <span key={p.name} className="inline-flex items-center rounded-full border border-grid bg-panel text-xs">
          <Tooltip label={describePreset(p, t)}>
            <button
              type="button"
              onClick={() => onApply(p)}
              className="min-h-[44px] rounded-l-full pl-2.5 pr-1.5 py-1 text-ink transition-colors hover:text-primary sm:min-h-[26px]"
            >
              {p.name}
            </button>
          </Tooltip>
          <button
            type="button"
            aria-label={t('alerts.presets.deleteAria', { name: p.name })}
            onClick={() => onDelete(p.name)}
            className="min-h-[44px] rounded-r-full pl-1 pr-2 py-1 text-muted transition-colors hover:text-signal sm:min-h-[26px]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
      ))}

      {presets.length === 0 && (
        <span className="text-[11px] text-muted">{t('alerts.presets.empty')}</span>
      )}

      <input
        className="input-dark !py-1.5 !text-xs w-36"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        placeholder={t('alerts.presets.namePlaceholder')}
        aria-label={t('alerts.presets.nameAria')}
      />
      <Tooltip label={t('alerts.presets.saveTip')}>
        <button type="button" className={SMALL_BTN} disabled={!name.trim()} onClick={save}>
          {t('alerts.presets.save')}
        </button>
      </Tooltip>
    </div>
  );
}
