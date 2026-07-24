// Connectivity banner — appears when the browser goes offline, flashes a brief
// "back online" confirmation on reconnect. Driven by navigator.onLine + the
// online/offline window events. No props; mount once in Layout.
import { useEffect, useRef, useState } from 'react';

export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [showBack, setShowBack] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const goOffline = () => { setOnline(false); setShowBack(false); };
    const goOnline = () => {
      setOnline(true);
      setShowBack(true);
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

  if (online && !showBack) return null;

  return (
    <div
      role="alert"
      className={`no-print fixed top-0 inset-x-0 z-90 pt-safe text-center text-xs font-medium py-1.5 shadow-lift ${
        online ? 'bg-teal text-primary-on' : 'bg-signal text-white'
      }`}
    >
      {online ? 'Back online — data will refresh.' : 'You are offline — showing cached data.'}
    </div>
  );
}
