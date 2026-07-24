// Per-route error boundary — the app must never white-screen.
// Props: label? (route name for the message), children. App.jsx keys this by
// location.pathname so navigating away auto-resets it; the Retry button also resets.
import { Component } from 'react';
import EmptyState from './EmptyState.jsx';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[DAPPA] route render error', this.props.label || '', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="bg-panel border border-grid rounded-xl shadow-card m-2">
          <EmptyState
            title={`Something broke while rendering ${this.props.label || 'this view'}.`}
            message={String(this.state.error?.message || this.state.error)}
            icon={(
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            action={<button type="button" className="btn" onClick={this.reset}>Retry</button>}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
