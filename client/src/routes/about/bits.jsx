// /about — small presentational pieces shared by the introspection panels.
// Nothing here fetches; every piece takes already-normalized props so the
// panels stay readable and the empty/error behaviour is identical across them.
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useT } from '../../lib/i18n.jsx';
import { copyText } from '../copilot/clipboard.js';

// live is the ONLY tone that reads as "serving traffic now". flag-gated is
// deliberately amber and console-pending deliberately muted — a judge must be
// able to tell the three apart at a glance without reading the legend.
export const STATUS_TONE = {
  live: 'teal',
  platform: 'neutral',
  'flag-gated': 'amber',
  'console-pending': 'slate',
};

export const STATUS_DOT = {
  live: 'bg-teal',
  platform: 'bg-primary',
  'flag-gated': 'bg-amber',
  'console-pending': 'bg-muted/60',
};

/** Status pill whose label comes from about.status.<status>. */
export function StatusPill({ status, className = '' }) {
  const t = useT();
  return (
    <Badge tone={STATUS_TONE[status] || 'slate'} className={className}>
      {t(`about.status.${status === 'flag-gated' ? 'flagGated' : status === 'console-pending' ? 'consolePending' : status}`)}
    </Badge>
  );
}

/** Loading skeleton / error EmptyState / children. One shape for every panel. */
export function PanelState({ isLoading, error, retry, skeletonHeight = 180, children }) {
  const t = useT();
  if (isLoading) return <LoadingSkeleton height={skeletonHeight} />;
  if (error) {
    return (
      <EmptyState
        compact
        title={t('about.state.errorTitle')}
        message={`${t('about.state.errorBody')}${error.message ? ` — ${error.message}` : ''}`}
        action={retry ? (
          <button type="button" onClick={retry} className="min-h-[40px] rounded-lg border border-grid bg-canvas/50 px-3.5 text-xs text-ink hover:border-primary/60 transition-colors">
            {t('about.state.retry')}
          </button>
        ) : null}
      />
    );
  }
  return children;
}

/** Labelled key/value line used inside expanded service and model detail. */
export function Field({ label, children, mono = false }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] gap-0.5 sm:gap-3 py-1">
      <dt className="text-[10px] uppercase tracking-wider text-muted sm:pt-0.5">{label}</dt>
      <dd className={`text-[11px] leading-relaxed text-ink/90 break-words ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

/** Endpoint / env-var / service token. */
export function CodeChip({ children, tone = 'grid' }) {
  const border = tone === 'amber' ? 'border-amber/40 text-amber' : tone === 'teal' ? 'border-teal/40 text-teal' : 'border-grid text-muted';
  return (
    <span className={`inline-block rounded border ${border} bg-canvas/50 px-1.5 py-0.5 font-mono text-[10px] leading-relaxed break-all`}>
      {children}
    </span>
  );
}

/** Horizontal completeness bar. pct null renders an unknown (striped) track. */
export function PctBar({ pct, tone = 'teal', className = '' }) {
  const t = useT();
  const known = Number.isFinite(pct);
  const width = known ? Math.max(1.5, Math.min(100, pct)) : 100;
  const fill = tone === 'amber' ? 'bg-amber' : tone === 'red' ? 'bg-signal' : 'bg-teal';
  return (
    <div
      className={`h-1.5 w-full rounded-full bg-grid/50 overflow-hidden ${className}`}
      role="img"
      aria-label={known ? t('about.prov.barAria', { pct: pct.toFixed(1) }) : t('about.prov.barUnknown')}
    >
      <div className={`h-full rounded-full ${known ? fill : 'bg-muted/40'}`} style={{ width: `${width}%` }} />
    </div>
  );
}

/** Feature-flag lamp: on / off, with the flag's env name as the tooltip. */
export function FlagLamp({ name, on, envName }) {
  const t = useT();
  return (
    <Tooltip label={envName ? t('about.flags.tip', { env: envName, state: t(on ? 'about.flags.on' : 'about.flags.off') }) : ''}>
      <span className="inline-flex min-h-[32px] w-full items-center gap-1.5 rounded-lg border border-grid bg-canvas/40 px-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-teal' : 'bg-muted/50'}`} aria-hidden="true" />
        <span className="font-mono text-[10px] text-ink/90 truncate">{name}</span>
        <span className={`ml-auto text-[10px] shrink-0 ${on ? 'text-teal' : 'text-muted'}`}>
          {t(on ? 'about.flags.on' : 'about.flags.off')}
        </span>
      </span>
    </Tooltip>
  );
}

/** Copy-to-clipboard button with a toast; used for the diagnostics snapshot. */
export function CopyButton({ text, label, okMessage, className = '' }) {
  const t = useT();
  const toast = useToast();
  const onClick = async () => {
    const ok = await copyText(typeof text === 'function' ? text() : text);
    if (ok) toast.success(okMessage || t('about.copy.done'));
    else toast.error(t('about.copy.failed'));
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 min-h-[36px] rounded-lg border border-grid bg-canvas/50 px-2.5 text-[11px] text-muted hover:text-ink hover:border-primary/60 transition-colors ${className}`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {label || t('about.copy.label')}
    </button>
  );
}

/** Chevron that rotates when its disclosure is open. */
export function Chevron({ open }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Case-insensitively highlight every occurrence of `term` inside `text`.
 * <mark> is styled explicitly — the browser default yellow is unreadable in
 * dark mode.
 */
export function Highlight({ text, term }) {
  const s = String(text || '');
  const q = String(term || '').trim();
  if (!q || !s) return s;
  const parts = [];
  const lower = s.toLowerCase();
  const needle = q.toLowerCase();
  let at = 0;
  let found = lower.indexOf(needle, at);
  while (found >= 0) {
    if (found > at) parts.push({ text: s.slice(at, found), hit: false });
    parts.push({ text: s.slice(found, found + q.length), hit: true });
    at = found + q.length;
    found = lower.indexOf(needle, at);
  }
  if (at < s.length) parts.push({ text: s.slice(at), hit: false });
  return parts.map((p, i) => (p.hit
    // eslint-disable-next-line react/no-array-index-key
    ? <mark key={i} className="rounded-sm bg-amber/25 px-0.5 text-ink">{p.text}</mark>
    // eslint-disable-next-line react/no-array-index-key
    : <span key={i}>{p.text}</span>));
}
