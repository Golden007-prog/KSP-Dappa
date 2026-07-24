// "Pin this view" — save the current Trends URL state (filters + compare
// selection) under a name in localStorage, and restore/delete pins from a
// Sheet (bottom sheet on mobile, corner card on desktop). Browser-local only.
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useToast } from '../../components/ToastProvider.jsx';

const STORAGE_KEY = 'dappa-trends-pins';

function readPins() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writePins(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

export default function PinnedViews() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pins, setPins] = useState(readPins);

  const save = () => {
    const label = name.trim() || `View ${pins.length + 1}`;
    const next = [...pins.filter((p) => p.name !== label), { name: label, search, savedAt: new Date().toISOString() }];
    setPins(next);
    writePins(next);
    setName('');
    toast.success(`Pinned “${label}”`);
  };

  const restore = (p) => {
    setOpen(false);
    navigate({ pathname: '/trends', search: p.search || '' });
  };

  const remove = (p) => {
    const next = pins.filter((x) => x.name !== p.name);
    setPins(next);
    writePins(next);
  };

  return (
    <>
      <button
        type="button"
        className="btn min-h-[40px]"
        onClick={() => { setPins(readPins()); setOpen(true); }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 17v5M9 3h6l1 7 3 2H5l3-2 1-7Z" />
        </svg>
        Pinned views
        {pins.length > 0 && <span className="num text-xs text-muted">({pins.length})</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Pinned views">
        <div className="flex items-center gap-2 mb-3">
          <input
            className="input-dark flex-1 min-w-0 min-h-[44px]"
            placeholder="Name this view…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            aria-label="Name for the pinned view"
          />
          <button type="button" className="btn-primary min-h-[44px] shrink-0" onClick={save}>Pin current</button>
        </div>
        {pins.length === 0 ? (
          <EmptyState
            compact
            title="Nothing pinned yet"
            message="Pin the current filters and compare selection to jump back later. Pins are stored in this browser only."
          />
        ) : (
          <ul className="space-y-1.5">
            {pins.map((p) => (
              <li key={p.name} className="flex items-center gap-2 rounded-lg border border-grid bg-base/40 px-3 py-1.5">
                <button
                  type="button"
                  className="flex-1 min-w-0 min-h-[44px] text-left text-sm text-ink hover:text-primary transition-colors"
                  onClick={() => restore(p)}
                  title={p.search || 'Default view'}
                >
                  <span className="block truncate">{p.name}</span>
                  <span className="block text-[11px] text-muted truncate">
                    {p.search ? p.search.replace(/^\?/, '').split('&').join(' · ') : 'default filters'}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-ghost min-h-[40px] !px-2.5 text-xs shrink-0"
                  onClick={() => remove(p)}
                  aria-label={`Delete pinned view ${p.name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
