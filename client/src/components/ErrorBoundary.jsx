// Per-route error boundary — the app must never white-screen.
// Props: label? (route name for the message), children. App.jsx keys this by
// location.pathname so navigating away auto-resets it; the Retry button also
// resets. Extras: a stale-deploy detector (failed lazy-chunk imports get a
// "Reload app" action instead of a useless Retry), a Back-to-Dashboard escape
// hatch (plain <a href="#/"> — works even when the router itself crashed),
// a copy-diagnostics button and a collapsible technical-details block.
import { Component } from 'react';
import EmptyState from './EmptyState.jsx';

// A dynamic import() that fails usually means the deployed bundle changed under
// this session (chunk hashes rotated) — a reload fixes it, a re-render never will.
const isStaleChunkError = (error) =>
  /dynamically imported module|Loading chunk|Importing a module script failed|error loading .*chunk/i
    .test(String(error?.message || error || ''));

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
      const stale = isStaleChunkError(this.state.error);
      return (
        <div className="bg-panel border border-grid rounded-xl shadow-card m-2">
          <EmptyState
            title={stale
              ? 'A newer version of DAPPA was deployed.'
              : `Something broke while rendering ${this.props.label || 'this view'}.`}
            message={stale
              ? 'This session is holding stale app files — reload to pick up the new build. Nothing is lost; filters live in the URL.'
              : String(this.state.error?.message || this.state.error)}
            icon={(
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            action={(
              <div className="flex flex-wrap items-center justify-center gap-2">
                {stale ? (
                  <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
                    Reload app
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={this.reset}>Retry</button>
                )}
                <a href="#/" className="btn" onClick={this.reset}>← Dashboard</a>
                <button type="button" className="btn-ghost text-xs" onClick={this.copyDiagnostics}>
                  {this.state.copied ? 'Copied ✓' : 'Copy error details'}
                </button>
              </div>
            )}
          />
          {!stale && this.state.stack && (
            <details className="mx-4 mb-4 -mt-2 text-left">
              <summary className="cursor-pointer text-xs text-muted hover:text-ink transition-colors select-none">
                Technical details
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-grid bg-base/60 p-3 text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-words">
                {String(this.state.error?.message || this.state.error)}
                {'\n'}
                {this.state.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
