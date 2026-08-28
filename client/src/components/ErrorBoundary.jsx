// Per-route error boundary — the app must never white-screen.
// Props: label? (route name for the message), children. App.jsx keys this by
// location.pathname so navigating away auto-resets it; the Retry button also
// resets. Extras: a stale-deploy detector (failed lazy-chunk imports get a
// "Reload app" action instead of a useless Retry), a Back-to-Dashboard escape
// hatch (plain <a href="#/"> — works even when the router itself crashed),
// a copy-diagnostics button and a collapsible technical-details block.
import { Component } from 'react';
import EmptyState from './EmptyState.jsx';
import { announce } from '../lib/a11y.js';
import { useT } from '../lib/i18n.jsx';

// A dynamic import() that fails usually means the deployed bundle changed under
// this session (chunk hashes rotated) — a reload fixes it, a re-render never will.
const isStaleChunkError = (error) =>
  /dynamically imported module|Loading chunk|Importing a module script failed|error loading .*chunk/i
    .test(String(error?.message || error || ''));

// The fallback is a function component so the copy can be translated — a class
// boundary cannot call useT() itself. The diagnostics payload stays English on
// purpose: it is pasted into a bug report, not read by the officer.
function ErrorFallback({ label, error, stack, stale, copied, onReset, onCopy }) {
  const t = useT();
  return (
    <div className="bg-panel border border-grid rounded-xl shadow-card m-2">
      <EmptyState
        title={stale
          ? t('shell.error.staleTitle')
          : t('shell.error.title', { view: label || t('shell.error.thisView') })}
        message={stale ? t('shell.error.staleMessage') : String(error?.message || error)}
        icon={(
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        action={(
          <div className="flex flex-wrap items-center justify-center gap-2">
            {stale ? (
              <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
                {t('shell.error.reload')}
              </button>
            ) : (
              <button type="button" className="btn" onClick={onReset}>{t('common.action.retry')}</button>
            )}
            <a href="#/" className="btn" onClick={onReset}>{t('shell.error.backToDashboard')}</a>
            <button type="button" className="btn-ghost text-xs" onClick={onCopy}>
              {copied ? t('shell.error.copied') : t('shell.error.copyDetails')}
            </button>
          </div>
        )}
      />
      {!stale && stack && (
        <details className="mx-4 mb-4 -mt-2 text-left">
          <summary className="cursor-pointer text-xs text-muted hover:text-ink transition-colors select-none">
            {t('shell.error.technical')}
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-grid bg-base/60 p-3 text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-words">
            {String(error?.message || error)}
            {'\n'}
            {stack}
          </pre>
        </details>
      )}
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, stack: '', copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[DAPPA] route render error', this.props.label || '', error, info);
    this.setState({ stack: String(info?.componentStack || error?.stack || '') });
    // the fallback replaces the view without a focus move — say so (WCAG 4.1.3)
    announce(`Error: ${String(error?.message || error)}`, { assertive: true });
  }

  componentWillUnmount() {
    clearTimeout(this.copyTimer);
  }

  reset = () => this.setState({ error: null, stack: '', copied: false });

  copyDiagnostics = async () => {
    const { error, stack } = this.state;
    const text = [
      `KSP DAPPA error report — ${new Date().toISOString()}`,
      `View: ${this.props.label || 'unknown'} (${window.location.hash || '#/'})`,
      `Message: ${String(error?.message || error)}`,
      stack ? `Component stack:${stack}` : '',
      `UA: ${navigator.userAgent}`,
    ].filter(Boolean).join('\n');
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    if (ok) {
      this.setState({ copied: true });
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.setState({ copied: false }), 2000);
    }
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          label={this.props.label}
          error={this.state.error}
          stack={this.state.stack}
          stale={isStaleChunkError(this.state.error)}
          copied={this.state.copied}
          onReset={this.reset}
          onCopy={this.copyDiagnostics}
        />
      );
    }
    return this.props.children;
  }
}
