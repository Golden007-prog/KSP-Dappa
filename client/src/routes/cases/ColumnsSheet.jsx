// Column chooser + table density for the Case Explorer. Visibility persists in
// localStorage ('dappa-cases-columns'); CrimeNo and the quick-actions column
// are locked so a row always keeps its identity and its affordances.
import Sheet from '../../components/Sheet.jsx';
import DensityToggle from '../../components/DensityToggle.jsx';
import { useT } from '../../lib/i18n.jsx';

export default function ColumnsSheet({ open, onClose, defs, visible, onChange, onReset }) {
  const t = useT();
  const toggle = (key, on) => {
    onChange(on ? [...visible, key] : visible.filter((k) => k !== key));
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('cases.columns.title')}>
      <div className="space-y-3 px-1 pb-1">
        <ul className="space-y-0.5">
          {defs.map((c) => {
            const on = c.locked || visible.includes(c.key);
            return (
              <li key={c.key}>
                <label className={`flex min-h-[44px] items-center justify-between gap-3 rounded-lg px-2.5 ${c.locked ? 'opacity-60' : 'cursor-pointer hover:bg-grid/25'}`}>
                  <span className="text-sm text-ink">
                    {c.chooserLabel || c.label}
                    {c.locked && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">{t('cases.columns.alwaysOn')}</span>}
                  </span>
                  <input
                    type="checkbox"
                    className="h-4.5 w-4.5 accent-[var(--c-amber)]"
                    checked={on}
                    disabled={c.locked}
                    onChange={(e) => toggle(c.key, e.target.checked)}
                  />
                </label>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-grid/60 pt-3">
          <span className="text-xs text-muted">{t('cases.columns.density')}</span>
          <DensityToggle />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-grid/60 pt-3">
          <button type="button" className="btn-ghost" onClick={onReset}>{t('cases.columns.reset')}</button>
          <button type="button" className="btn-primary" onClick={onClose}>{t('cases.columns.done')}</button>
        </div>
      </div>
    </Sheet>
  );
}
