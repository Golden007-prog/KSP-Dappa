// Notification centre — a bell in the topbar (variant="icon") and a row in
// the mobile More sheet (variant="row"), both opening the same bottom sheet:
// new alerts, escalations to this tier and recorded outcomes/dismissals,
// polled from the alerts feed and the action record (lib/notifications.js).
// The unread count is text + glyph, never a colour alone.
//
// Push registration (FEATURE_PUSH) lives at the foot of the sheet: Catalyst
// web push addresses a signed-in user by email and needs the project's own
// web SDK (`/__catalyst/sdk/init.js`, served by Catalyst hosting — not a
// third-party CDN) to call catalyst.notification.enableNotification(). Off
// the flag, or without a session, the sheet says so and the in-app list
// carries the same events (docs/CATALYST_SERVICE_RESEARCH.md §4.12).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Sheet from './Sheet.jsx';
import StatusPill from './StatusPill.jsx';
import { useToast } from './ToastProvider.jsx';
import { apiPost } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useNotifications } from '../lib/notifications.js';
import { statusFromZ } from '../lib/status.js';
import { useAuthMe, useServiceFlags } from '../routes/alerts/actionsApi.js';
import { stamp } from '../routes/alerts/ActionTimeline.jsx';

const KIND_STATUS = { alert: null, escalation: 'rising', assignment: 'watch', outcome: 'stable', dismissal: 'nodata' };

function loadCatalystSdk() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    if (window.catalyst && window.catalyst.notification) return resolve(window.catalyst);
    const s = document.createElement('script');
    s.src = '/__catalyst/sdk/init.js';
    s.async = true;
    s.onload = () => resolve(window.catalyst && window.catalyst.notification ? window.catalyst : null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    setTimeout(() => resolve(window.catalyst && window.catalyst.notification ? window.catalyst : null), 6000);
  });
}

function PushBlock({ t, toast }) {
  const flags = useServiceFlags();
  const me = useAuthMe();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const pushOn = !!(flags.data && flags.data.push);
  const signedIn = !!(me.data && me.data.authenticated && me.data.source === 'catalyst-auth');
  const email = signedIn ? (me.data.user?.email || '') : '';

  const enable = async () => {
    setBusy(true);
    try {
      const sdk = await loadCatalystSdk();
      if (!sdk) { toast.info(t('actions.push.noSdk')); return; }
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') { toast.error(t('actions.push.denied')); return; }
      await sdk.notification.enableNotification();
      await apiPost('/notify/register', { recipient: email, label: email, channel: 'web' });
      setDone(email);
      toast.success(t('actions.push.enabled', { email }));
    } catch (err) {
      toast.error(t('actions.toast.failed', { msg: err?.message || '' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-1.5 border-t border-grid pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('actions.push.title')}</p>
      {!pushOn ? (
        <p className="text-xs text-muted">{t('actions.push.off')}</p>
      ) : !signedIn ? (
        <p className="text-xs text-muted">{t('actions.push.needSignIn')}</p>
      ) : done ? (
        <p className="text-xs text-teal">{t('actions.push.enabled', { email: done })}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t('actions.push.emailLabel')}: <span className="text-ink">{email}</span></span>
          <button type="button" className="btn-primary !text-xs min-h-[44px]" disabled={busy} onClick={enable}>
            {busy ? t('actions.push.enabling') : t('actions.push.enable')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function NotificationBell({ variant = 'icon', className = '' }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const n = useNotifications();
  const count = n.unreadCount;
  const aria = t('actions.notif.aria', { n: count });

  const Bell = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M10.5 19a2 2 0 0 0 3 0" />
    </svg>
  );

  const kindLabel = (e) => {
    if (e.kind === 'alert') return t('actions.notif.kind.alert');
    if (e.kind === 'escalation') return t('actions.notif.kind.escalation', { tier: e.toTier ? t(`actions.tier.${e.toTier}`) : '—' });
    if (e.kind === 'assignment') return t('actions.notif.kind.assignment', { who: e.assignTo || '—' });
    if (e.kind === 'outcome') return `${t('actions.notif.kind.outcome')}${e.outcomeLabel ? ` · ${t(`actions.outcome.${e.outcomeLabel}`)}` : ''}`;
    return `${t('actions.notif.kind.dismissal')}${e.reason ? ` · ${t(`actions.reason.short.${e.reason}`)}` : ''}`;
  };

  return (
    <>
      {variant === 'row' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={aria}
          className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-sm text-ink transition-colors hover:bg-grid/30 ${className}`}
        >
          {Bell}
          <span className="flex-1 truncate text-left">{t('actions.notif.title')}</span>
          {count > 0 && <span className="num rounded-full border border-signal/40 bg-signal/15 px-1.5 py-0.5 text-[10px] font-semibold text-signal">▲ {count > 99 ? '99+' : count}</span>}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={aria}
          aria-haspopup="dialog"
          className={`relative flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-grid/30 hover:text-primary ${className}`}
        >
          {Bell}
          {count > 0 && (
            <span className="num absolute -right-0.5 top-0.5 rounded-full border border-signal/40 bg-signal/15 px-1 text-[10px] font-semibold leading-4 text-signal" aria-hidden="true">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={t('actions.notif.title')}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="num text-xs text-muted">{t('actions.notif.unread', { n: count })}</span>
            <button type="button" className="btn !text-xs min-h-[36px]" disabled={!count} onClick={n.markAllRead}>{t('actions.notif.markAll')}</button>
          </div>
          <p className="text-[11px] italic leading-snug text-muted">{t('actions.framing')}</p>
          {n.error && <p className="text-xs text-signal" role="alert">{t('actions.notif.error')}</p>}
          {n.isLoading ? (
            <p className="text-xs text-muted" aria-busy="true">{t('common.state.loading')}</p>
          ) : n.events.length === 0 ? (
            <p className="text-xs text-muted">{t('actions.notif.none')}</p>
          ) : (
            <ul className="space-y-1">
              {n.events.map((e) => {
                const unread = !n.isSeen(e.id);
                const status = e.kind === 'alert' ? statusFromZ(e.zScore) : KIND_STATUS[e.kind] || 'nodata';
                return (
                  <li key={e.id}>
                    <Link
                      to={`/alerts?q=${encodeURIComponent(e.alertKey || '')}`}
                      onClick={() => { n.markRead(e.id); setOpen(false); }}
                      aria-label={t('actions.notif.open', { id: e.alertKey || '' })}
                      className={`flex min-h-[48px] items-start gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors hover:border-primary/50 ${unread ? 'border-primary/40 bg-primary/5' : 'border-grid/60'}`}
                    >
                      <StatusPill status={status} label={kindLabel(e)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{e.alertKey ? `${e.alertKey} · ` : ''}{e.title}</span>
                        {e.subtitle && <span className="block truncate text-muted">{e.subtitle}</span>}
                        <span className="num block text-[10px] text-muted">
                          {stamp(e.ts, lang)}{e.actor ? ` · ${e.actor}` : ''}{e.forMe ? ` · ${t('actions.notif.forMe')}` : ''}
                          {unread && <span className="ml-1 font-semibold uppercase tracking-wide text-primary">● {t('actions.notif.new')}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[10px] text-muted/80">{t('actions.notif.source')}</p>
          <PushBlock t={t} toast={toast} />
        </div>
      </Sheet>
    </>
  );
}
