// Saved map views — pure client-side bookmarks (localStorage via prefs.js).
// A view captures camera + layer toggles + choropleth metric + shared filters
// + scrub month; applying one restores all of it. The parent supplies
// getCurrent() (assembles the snapshot) and onApply(view) (restores it).
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/ToastProvider.jsx';
import { loadPrefs, savePrefs } from './prefs.js';

const MAX_VIEWS = 8;

function readViews() {
  const v = loadPrefs().savedViews;
  return Array.isArray(v) ? v : [];
}

export default function SavedViews({ getCurrent, onApply }) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState(readViews);
  const [name, setName] = useState('');
  const rootRef = useRef(null);
  const toast = useToast();

  // click-away close (the popover floats over the map, no backdrop)
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const persist = (next) => {
    setViews(next);
    savePrefs({ savedViews: next });
  };

  const saveCurrent = () => {
    const label = name.trim() || `View ${views.length + 1}`;
    const snap = getCurrent();
    if (!snap) return;
    const next = [{ id: Date.now(), name: label, ...snap }, ...views].slice(0, MAX_VIEWS);
    persist(next);
    setName('');
    toast.success(`Saved view “${label}”`);
  };

  const remove = (id) => {
    persist(views.filter((v) => v.id !== id));
  };

  return (
    // static on <md: the popover then anchors to the (viewport-wide) top
    // overlay instead of the button, so it can never clip off-screen at 360px
    <div ref={rootRef} className="static md:relative">
      <button
        type="button"
        className="btn gi-tap !px-2.5 !py-1.5 text-xs"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        title="Saved map views"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </svg>
        Views
      </button>
      {open && (
        <div className="pointer-events-auto absolute left-0 right-0 md:left-auto md:right-0 md:w-64 top-full mt-1 z-30 bg-panel border border-grid rounded-xl shadow-lift p-2.5 space-y-2 animate-scale-in">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={name}
              maxLength={40}
              placeholder="Name this view…"
              aria-label="Saved view name"
              className="input-dark !py-1.5 !px-2 text-xs flex-1 min-w-0"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveCurrent(); }}
            />
            <button type="button" className="btn-primary gi-tap !px-2.5 !py-1.5 text-xs shrink-0" onClick={saveCurrent}>
              Save
            </button>
          </div>
          {views.length === 0 ? (
            <p className="text-[11px] text-muted px-0.5 pb-0.5">
              No saved views yet — frame the map, pick layers and filters, then save.
            </p>
          ) : (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {views.map((v) => (
                <li key={v.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left rounded-lg border border-grid bg-base/40 hover:border-primary/50 px-2 py-1.5 transition-colors gi-tap"
                    onClick={() => { onApply(v); setOpen(false); toast.info(`Applied view “${v.name}”`); }}
                    title="Apply this view"
                  >
                    <span className="block text-xs text-ink truncate">{v.name}</span>
                    <span className="block text-[10px] text-muted truncate">
                      {[
                        v.m ? `month ${v.m}` : null,
                        v.filters?.districtId ? `district ${v.filters.districtId}` : null,
                        v.metric && v.metric !== 'cases' ? `metric ${v.metric}` : null,
                      ].filter(Boolean).join(' · ') || 'full window'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost gi-tap gi-tap-w !px-1.5 !py-1.5 shrink-0"
                    aria-label={`Delete saved view ${v.name}`}
                    onClick={() => remove(v.id)}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
