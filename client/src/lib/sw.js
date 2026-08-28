// Service-worker registration for the Beat / Station PWA (public/sw.js).
// Registered with a RELATIVE url so the same bundle works at the Vite dev
// root ('/'), under Catalyst web hosting ('/app/') and on the GitHub Pages
// static demo ('/KSP-Dappa/') — import.meta.env.BASE_URL is each of those in
// turn. Production builds only: a worker caching a dev server's module graph
// makes hot reload lie. Failures are swallowed — the app never depends on it.
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const url = `${import.meta.env.BASE_URL}sw.js`;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).catch(() => { /* offline shell is optional */ });
  });
}
