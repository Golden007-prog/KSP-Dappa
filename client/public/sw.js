/* KSP DAPPA — hand-written service worker for the Beat / Station tiers
   (Round 2, Phase 4). No build step, no dependency.

   - install: precache the app shell (index.html, manifest, favicon) relative
     to the worker's own scope, so it works at '/', '/app/' and '/KSP-Dappa/'.
   - fetch, navigations: network first, fall back to the cached shell so
     '#/beat' opens offline.
   - fetch, same-origin static assets (/assets/*.js|css, fonts, icons):
     cache first, refreshed in the background.
   - fetch, API GETs (/server/dappa_api/… or the static demo's /demo/api/…):
     network first with a 4 s timeout; the last good answer is kept in
     'dappa-api-v1' and served when the network fails or stalls, with an
     'X-Dappa-Cache: saved <iso>' header so a screen can say "saved copy from
     <time> · offline". The last /tiers/beat answer is therefore always the
     most recent one that reached the phone.
   Bump VERSION to invalidate every cache. */
const VERSION = 'v1-2026-08-28';
const SHELL = `dappa-shell-${VERSION}`;
const ASSETS = `dappa-assets-${VERSION}`;
const API = 'dappa-api-v1';
const API_TIMEOUT_MS = 4000;
const API_MAX_ENTRIES = 120;

const scopeUrl = new URL(self.registration.scope);
const shellUrls = ['./', './index.html', './manifest.webmanifest', './favicon.svg'].map((p) => new URL(p, scopeUrl).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => Promise.allSettled(shellUrls.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS && k !== API).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isApi(url) {
  return url.pathname.includes('/server/dappa_api/') || url.pathname.includes('/demo/api/');
}

function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|png|svg|webp|jpg|json)$/i.test(url.pathname) && !isApi(url);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

async function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Dappa-Cache', `saved ${new Date().toISOString()}`);
  const body = await response.clone().arrayBuffer();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function trimApiCache() {
  const cache = await caches.open(API);
  const keys = await cache.keys();
  if (keys.length <= API_MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - API_MAX_ENTRIES).map((k) => cache.delete(k)));
}

async function apiNetworkFirst(request) {
  const cache = await caches.open(API);
  try {
    const res = await withTimeout(fetch(request), API_TIMEOUT_MS);
    if (res && res.ok) {
      cache.put(request, await stamp(res)).then(trimApiCache).catch(() => {});
    }
    return res;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    return new Response(JSON.stringify({ ok: false, error: { code: 'OFFLINE', message: 'Offline and no saved copy of this answer.' } }), {
      status: 503, headers: { 'Content-Type': 'application/json', 'X-Dappa-Cache': 'miss' },
    });
  }
}

async function assetCacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

async function navigationNetworkFirst(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(SHELL);
      cache.put(new URL('./index.html', scopeUrl).href, res.clone()).catch(() => {});
    }
    return res;
  } catch (e) {
    const cache = await caches.open(SHELL);
    return (await cache.match(new URL('./index.html', scopeUrl).href)) || (await cache.match(new URL('./', scopeUrl).href)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') { event.respondWith(navigationNetworkFirst(request)); return; }
  if (isApi(url)) { event.respondWith(apiNetworkFirst(request)); return; }
  if (isStaticAsset(url)) event.respondWith(assetCacheFirst(request));
});
