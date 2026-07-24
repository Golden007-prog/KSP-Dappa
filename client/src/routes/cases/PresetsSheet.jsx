// Saved filter presets — named snapshots of the explorer URL params, persisted
// in localStorage ('dappa-cases-presets'). Save the current combination, apply
// one tap later (also from a fresh session), delete stale ones. Saving under an
// existing name overwrites it. v2: a preset can optionally capture the table
// view (visible columns + sort) alongside the filters — old entries without
// `view` keep working, and appliers ignore keys they don't know.
import { useEffect, useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { dateLabel } from '../../lib/format.js';
import { readJson, writeJson } from './explorerState.js';

const STORAGE_KEY = 'dappa-cases-presets';

const readPresets = () => {
  const list = readJson(STORAGE_KEY, []);
  return Array.isArray(list) ? list.filter((p) => p && p.name && p.params) : [];
};

export default function PresetsSheet({ open, onClose, currentParams, activeCount = 0, onApply, currentView, onApplyView }) {
  const toast = useToast();
  const [presets, setPresets] = useState(readPresets);
  const [name, setName] = useState('');
  const [includeView, setIncludeView] = useState(false);

  // Re-read on every open so presets written by another tab (or another
  // session between opens) show up without a full reload.
  useEffect(() => {
    if (open) setPresets(readPresets());
  }, [open]);

  const persist = (next) => {
    setPresets(next);
    writeJson(STORAGE_KEY, next);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || activeCount === 0) return;
    const entry = {
      name: trimmed,
      params: currentParams,
      savedAt: new Date().toISOString().slice(0, 10),
      ...(includeView && currentView ? { view: currentView } : {}),
    };
    const existing = presets.some((p) => p.name === trimmed);
    persist([entry, ...presets.filter((p) => p.name !== trimmed)]);
    setName('');
    toast.success(existing ? `Preset “${trimmed}” updated` : `Preset “${trimmed}” saved`);
  };

  const apply = (p) => {
    onApply(p.params);
    if (p.view && typeof onApplyView === 'function') onApplyView(p.view);
    onClose();
    toast.info(`Preset “${p.name}” applied`);
  };

  const remove = (p) => {
    persist(presets.filter((x) => x.name !== p.name));
    toast.success(`Preset “${p.name}” deleted`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Filter presets">
      <div className="space-y-3 px-1 pb-1">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); save(); }}
        >
          <input
            className="input-dark flex-1 min-w-0 !py-2.5"
            placeholder={activeCount ? 'Name this filter set…' : 'Set some filters first'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={activeCount === 0}
            aria-label="Preset name"
            maxLength={40}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!name.trim() || activeCount === 0}>
            Save
          </button>
        </form>
        <label className="flex min-h-[36px] items-center gap-2 text-xs text-muted cursor-pointer select-none -mt-1">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--c-amber)]"
            checked={includeView}
            disabled={activeCount === 0}
            onChange={(e) => setIncludeView(e.target.checked)}
          />
          Also capture visible columns &amp; sort
        </label>
        {activeCount > 0 && (
          <p className="text-[11px] text-muted -mt-2">
            Saves the current {activeCount}-filter combination for one-tap reuse.
          </p>
        )}

        {presets.length === 0 ? (
          <EmptyState
            compact
            title="No saved presets"
            message="Build a filter combination you use often, name it above, and it will live here."
          />
        ) : (
          <ul className="space-y-1.5">
            {presets.map((p) => (
              <li key={p.name} className="flex items-center gap-2 rounded-lg border border-grid px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">{p.name}</p>
                  <p className="text-[11px] text-muted num">
                    {Object.keys(p.params).length} params · saved {dateLabel(p.savedAt)}
                  </p>
                </div>
                {p.view ? <Badge tone="teal">+view</Badge> : null}
                <Badge tone="slate">{Object.keys(p.params).length}</Badge>
                <button type="button" className="btn !py-1 !px-2.5 text-xs" onClick={() => apply(p)}>Apply</button>
                <button
                  type="button"
                  className="btn-ghost !p-0 flex h-9 w-9 items-center justify-center text-signal"
                  aria-label={`Delete preset ${p.name}`}
                  onClick={() => remove(p)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
