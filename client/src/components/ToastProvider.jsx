// Toast notifications — ToastProvider mounts once in App.jsx; routes call:
//   const toast = useToast();
//   toast.success('Alert acknowledged');  toast.error('Save failed');  toast.info('…');
// Each takes (message, {duration?, action?}) — errors default to a longer 6.5s
// stay; action is {label, onClick} and renders as an inline button (onClick
// runs, then the toast dismisses itself). Auto-dismiss pauses while the
// pointer or keyboard focus is on a toast so actions can't vanish mid-reach.
// The viewport is aria-live (polite; errors are role="alert") and sits above
// the mobile tab bar; a Dismiss-all control appears once 3+ toasts stack.
// Dependency-free; portal to <body>.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.jsx';

const ToastContext = createContext(null);
let toastSeq = 0;

const TONE = {
  success: { bar: 'bg-teal', text: 'text-teal', key: 'shell.toast.toneSuccess' },
  error: { bar: 'bg-signal', text: 'text-signal', key: 'shell.toast.toneError' },
  info: { bar: 'bg-primary', text: 'text-primary', key: 'shell.toast.toneInfo' },
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
  const t = useT();
  const [toasts, setToasts] = useState([]);
  // per-toast {timer, expiresAt, remaining} so hover-pause can resume with the
  // time that was actually left rather than restarting the full duration
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t.timer); timersRef.current.delete(id); }
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    for (const t of timersRef.current.values()) clearTimeout(t.timer);
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const arm = useCallback((id, ms) => {
    timersRef.current.set(id, {
      timer: setTimeout(() => dismiss(id), ms),
      expiresAt: Date.now() + ms,
      remaining: 0,
    });
  }, [dismiss]);

  const pause = useCallback((id) => {
    const t = timersRef.current.get(id);
    if (!t || t.remaining) return;
    clearTimeout(t.timer);
    t.remaining = Math.max(1200, t.expiresAt - Date.now());
  }, []);

  const resume = useCallback((id) => {
    const t = timersRef.current.get(id);
    if (!t || !t.remaining) return;
    const ms = t.remaining;
    timersRef.current.set(id, {
      timer: setTimeout(() => dismiss(id), ms),
      expiresAt: Date.now() + ms,
      remaining: 0,
    });
  }, [dismiss]);

  const push = useCallback((tone, message, { duration, action } = {}) => {
    const id = ++toastSeq;
    const stay = duration ?? (tone === 'error' ? 6500 : 4000);
    const safeAction = action && typeof action.onClick === 'function' && action.label
      ? { label: String(action.label), onClick: action.onClick }
      : null;
    setToasts((list) => {
      const next = [...list, { id, tone, message, action: safeAction }];
      // max 4 on screen — clear the timers of anything we evict so a busy
      // screen doesn't leak orphaned timeouts
      for (const evicted of next.slice(0, Math.max(0, next.length - 4))) {
        const timer = timersRef.current.get(evicted.id);
        if (timer) { clearTimeout(timer.timer); timersRef.current.delete(evicted.id); }
      }
      return next.slice(-4);
    });
    arm(id, stay);
    return id;
  }, [arm]);

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
          aria-label={t('shell.toast.region')}
          className="no-print fixed z-80 bottom-20 md:bottom-6 right-3 left-3 md:left-auto md:right-6 md:w-96 flex flex-col gap-2 pointer-events-none mb-safe"
        >
          {toasts.length >= 3 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={dismissAll}
                className="pointer-events-auto rounded-full border border-grid bg-panel px-3 py-1 text-[11px] text-muted hover:text-ink shadow-card transition-colors"
              >
                {t('shell.toast.dismissAll', { n: toasts.length })}
              </button>
            </div>
          )}
          {/* the item is `item`, never `t` — `t` is the translator from useT() */}
          {toasts.map((item) => {
            const tone = TONE[item.tone] || TONE.info;
            return (
              <div
                key={item.id}
                role={item.tone === 'error' ? 'alert' : 'status'}
                onMouseEnter={() => pause(item.id)}
                onMouseLeave={() => resume(item.id)}
                onFocus={() => pause(item.id)}
                onBlur={() => resume(item.id)}
                className="pointer-events-auto flex items-stretch overflow-hidden rounded-xl border border-grid bg-panel shadow-lift animate-fade-up"
              >
                <div className={`w-1 shrink-0 ${tone.bar}`} aria-hidden="true" />
                <div className={`flex items-center pl-3 ${tone.text}`}><ToneIcon tone={item.tone} /></div>
                <div className="flex-1 min-w-0 px-3 py-3">
                  <p className="text-sm text-ink leading-snug">{item.message}</p>
                  {item.action && (
                    <button
                      type="button"
                      onClick={() => {
                        try { item.action.onClick(); } finally { dismiss(item.id); }
                      }}
                      className="mt-1.5 inline-flex min-h-[32px] items-center rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      {item.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label={t('shell.toast.dismissAria', { tone: t(tone.key) })}
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
