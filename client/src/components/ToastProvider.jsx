// Toast notifications — ToastProvider mounts once in App.jsx; routes call:
//   const toast = useToast();
//   toast.success('Alert acknowledged');  toast.error('Save failed');  toast.info('…');
// Each takes (message, {duration?}) — errors default to a longer 6.5s stay.
// The viewport is aria-live (polite; errors are role="alert") and sits above
// the mobile tab bar. Dependency-free; portal to <body>.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);
let toastSeq = 0;

const TONE = {
  success: { bar: 'bg-teal', text: 'text-teal', label: 'Success' },
  error: { bar: 'bg-signal', text: 'text-signal', label: 'Error' },
  info: { bar: 'bg-primary', text: 'text-primary', label: 'Info' },
};

function ToneIcon({ tone }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (tone === 'success') {
    return <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg>;
  }
  if (tone === 'error') {
    return <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V13m0 3.5h.01" /></svg>;
  }
  return <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5m0-9h.01" /></svg>;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((tone, message, { duration } = {}) => {
    const id = ++toastSeq;
    const stay = duration ?? (tone === 'error' ? 6500 : 4000);
    setToasts((list) => [...list.slice(-3), { id, tone, message }]);
    timersRef.current.set(id, setTimeout(() => dismiss(id), stay));
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (msg, opts) => push('success', msg, opts),
    error: (msg, opts) => push('error', msg, opts),
    info: (msg, opts) => push('info', msg, opts),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-label="Notifications"
          className="no-print fixed z-80 bottom-20 md:bottom-6 right-3 left-3 md:left-auto md:right-6 md:w-96 flex flex-col gap-2 pointer-events-none mb-safe"
        >
          {toasts.map((t) => {
            const tone = TONE[t.tone] || TONE.info;
            return (
              <div
                key={t.id}
                role={t.tone === 'error' ? 'alert' : 'status'}
                className="pointer-events-auto flex items-stretch overflow-hidden rounded-xl border border-grid bg-panel shadow-lift animate-fade-up"
              >
                <div className={`w-1 shrink-0 ${tone.bar}`} aria-hidden="true" />
                <div className={`flex items-center pl-3 ${tone.text}`}><ToneIcon tone={t.tone} /></div>
                <p className="flex-1 px-3 py-3 text-sm text-ink leading-snug">{t.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label={`Dismiss ${tone.label.toLowerCase()} notification`}
                  className="px-3 text-muted hover:text-ink transition-colors min-w-[44px]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** Toast API — safe no-op console fallback outside the provider. */
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx || {
    success: (m) => console.info('[toast]', m),
    error: (m) => console.error('[toast]', m),
    info: (m) => console.info('[toast]', m),
    dismiss: () => {},
  };
}
