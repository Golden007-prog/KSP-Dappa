// Saved views for the Network Explorer — names + the URL query string, kept in
// localStorage (client-side only). Chips apply a view; ✕ deletes it. The whole
// strip hides until there is at least one view or the user starts saving.
import { useState } from 'react';
import { useToast } from '../../components/ToastProvider.jsx';
import { readPref, writePref } from './hooks.js';

const VIEWS_PREF = 'dappa-net-views';
const MAX_VIEWS = 8;

function readViews() {
  try {
    const v = JSON.parse(readPref(VIEWS_PREF, '[]'));
    return Array.isArray(v) ? v.filter((x) => x && x.name).slice(0, MAX_VIEWS) : [];
  } catch {
    return [];
  }
}

export default function SavedViews({ currentQuery = '', onApply }) {
  const toast = useToast();
  const [views, setViews] = useState(readViews);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const persist = (next) => { setViews(next); writePref(VIEWS_PREF, JSON.stringify(next)); };

  const save = () => {
    const n = (name.trim() || `View ${views.length + 1}`).slice(0, 40);
    const next = [...views.filter((v) => v.name !== n), { name: n, qs: currentQuery }].slice(-MAX_VIEWS);
    persist(next);
    setNaming(false);
    setName('');
    toast.success(`Saved “${n}” — filters, ego focus and layout state included.`);
  };

  const remove = (n) => persist(views.filter((v) => v.name !== n));

  if (!views.length && !naming) {
    return (
      <div className="flex items-center">
        <button
          type="button"
          className="btn-ghost !px-2.5 !py-1.5 text-[11px] min-h-[40px]"
          onClick={() => setNaming(true)}
        >
          ☆ Save this view
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible py-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">Views</span>
      {views.map((v) => {
        const active = v.qs === currentQuery;
        return (
          <span key={v.name} className={`chip !py-0.5 shrink-0 ${active ? '!border-amber text-amber' : ''}`}>
            <button
              type="button"
              className="min-h-[36px] px-0.5 hover:text-amber transition-colors"
              onClick={() => onApply?.(v.qs)}
              aria-pressed={active}
              title="Apply this saved view"
            >
              {v.name}
            </button>
            <button
              type="button"
              className="flex h-9 w-7 -my-2 -mr-1.5 items-center justify-center text-muted hover:text-signal transition-colors"
              onClick={() => remove(v.name)}
              aria-label={`Delete saved view ${v.name}`}
            >
              ✕
            </button>
          </span>
        );
      })}
      {naming ? (
        <form
          className="flex items-center gap-1.5 shrink-0"
          onSubmit={(e) => { e.preventDefault(); save(); }}
        >
          <input
            className="input-dark !py-1.5 w-32 text-xs"
            placeholder="View name…"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') { setNaming(false); setName(''); } }}
            aria-label="Name for the saved view"
          />
          <button type="submit" className="btn !py-1.5 !px-2.5 text-xs min-h-[36px]">Save</button>
          <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs min-h-[36px]" onClick={() => { setNaming(false); setName(''); }}>
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn-ghost !px-2 !py-1.5 text-[11px] min-h-[36px] shrink-0"
          onClick={() => setNaming(true)}
        >
          ☆ Save
        </button>
      )}
    </div>
  );
}
