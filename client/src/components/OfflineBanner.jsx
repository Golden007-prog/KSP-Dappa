// Connectivity banner — appears when the browser goes offline, flashes a brief
// "back online" confirmation on reconnect. Driven by navigator.onLine + the
// online/offline window events, plus a manual "Check now" probe (fetches the
// app manifest with cache:no-store) for networks where the events are
// unreliable — e.g. captive Wi-Fi that drops packets without flipping onLine.
// Shows how long you have been offline. No props; mount once in Layout.
import { useEffect, useRef, useState } from 'react';

const fmtElapsed = (since) => {
  const mins = Math.floor((Date.now() - since) / 60000);
  if (mins < 1) return '';
  if (mins < 60) return ` for ${mins}m`;
  return ` for ${Math.floor(mins / 60)}h ${mins % 60}m`;
};

export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [showBack, setShowBack] = useState(false);
  const [checking, setChecking] = useState(false);
  const [, tick] = useState(0);
  const timerRef = useRef(null);
  const sinceRef = useRef(null);

  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      setShowBack(false);
      if (!sinceRef.current) sinceRef.current = Date.now();
    };
    const goOnline = () => {
      setOnline(true);
      setShowBack(true);
      sinceRef.current = null;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowBack(false), 2500);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      clearTimeout(timerRef.current);
    };
  }, []);

  // re-render every 30s while offline so the elapsed label stays honest
  useEffect(() => {
    if (online) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, [online]);

  const checkNow = async () => {
    setChecking(true);
    try {
      // tiny same-origin asset, cache bypassed — succeeds only with a real network
      const res = await fetch(`${import.meta.env.BASE_URL}manifest.webmanifest`, { cache: 'no-store' });
      if (res.ok) {
        setOnline(true);
        setShowBack(true);
        sinceRef.current = null;
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setShowBack(false), 2500);
      }
    } catch { /* still offline — the banner stays */ }
    setChecking(false);
  };

  if (online && !showBack) return null;

  return (
    <div
      role="alert"
      className={`no-print fixed top-0 inset-x-0 z-90 pt-safe text-center text-xs font-medium py-1.5 shadow-lift ${
        online ? 'bg-teal text-primary-on' : 'bg-signal text-white'
      }`}
    >
      {online ? (
        'Back online — data will refresh.'
      ) : (
        <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2">
          <span>You are offline{sinceRef.current ? fmtElapsed(sinceRef.current) : ''} — showing cached data.</span>
          <button
            type="button"
            onClick={checkNow}
            disabled={checking}
            className="rounded-full border border-white/50 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-white/15 transition-colors disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Check now'}
          </button>
        </span>
      )}
    </div>
  );
}
