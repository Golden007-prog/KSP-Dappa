// Catalyst Authentication embedded sign-in (backlog row 171).
//
// The Catalyst Web SDK renders its own sign-in form into an element id:
//   <script src="/__catalyst/sdk/init.js">   (served by the Catalyst app host)
//   <script src="https://static.zohocdn.com/catalyst/sdk/js/4.0.0/catalystWebSDK.js">
//   catalyst.auth.signIn('dappa-catalyst-signin')
// Both scripts are Zoho's own; the second lives on Zoho's CDN, which is why
// this component is gated twice — FEATURE_AUTH_EMBED (server flag, off by
// default and off in the tracked config) AND a Catalyst hostname — so the
// tracked deployment loads no third-party script at all. PUBLIC_DEMO stays
// read-only whether or not anyone signs in.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';

const ELEMENT_ID = 'dappa-catalyst-signin';
const INIT_SRC = '/__catalyst/sdk/init.js';
const SDK_SRC = 'https://static.zohocdn.com/catalyst/sdk/js/4.0.0/catalystWebSDK.js';

function onCatalystHost() {
  try { return /\.catalystserverless\.(in|com)$/i.test(window.location.hostname); } catch { return false; }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

export default function EmbeddedSignIn({ className = '' }) {
  const t = useT();
  const roles = useQuery({
    queryKey: ['auth-roles'],
    queryFn: ({ signal }) => apiGet('/auth/roles', {}, { signal }).then((r) => r.data || {}),
    retry: 0,
    staleTime: 10 * 60 * 1000,
  });
  const enabled = Boolean(roles.data && roles.data.embedEnabled);
  const hosted = onCatalystHost();
  const [state, setState] = useState('idle');
  const mounted = useRef(false);

  useEffect(() => {
    if (!enabled || !hosted || mounted.current) return;
    mounted.current = true;
    setState('loading');
    (async () => {
      try {
        await loadScript(INIT_SRC);
        await loadScript(SDK_SRC);
        if (window.catalyst && window.catalyst.auth && typeof window.catalyst.auth.signIn === 'function') {
          window.catalyst.auth.signIn(ELEMENT_ID);
          setState('ready');
        } else {
          setState('error');
        }
      } catch {
        setState('error');
      }
    })();
  }, [enabled, hosted]);

  return (
    <section className={`rounded-xl border border-grid bg-canvas/40 p-3 ${className}`} aria-labelledby="dappa-signin-title">
      <h3 id="dappa-signin-title" className="text-sm font-semibold text-ink">{t('surfaces.signin.title')}</h3>
      <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{t('surfaces.signin.sub')}</p>
      {!enabled && <p className="mt-2 text-xs text-muted">{t('surfaces.signin.disabled')}</p>}
      {enabled && !hosted && <p className="mt-2 text-xs text-muted">{t('surfaces.signin.notCatalyst')}</p>}
      {enabled && hosted && state === 'loading' && <p className="mt-2 text-xs text-muted" aria-live="polite">{t('surfaces.signin.loading')}</p>}
      {enabled && hosted && state === 'error' && <p className="mt-2 text-xs text-signal" role="alert">{t('surfaces.signin.disabled')}</p>}
      <div id={ELEMENT_ID} className="mt-2 min-h-[1px]" />
      <p className="mt-2 text-[11px] text-muted">{t('surfaces.signin.roleNote')}</p>
    </section>
  );
}
