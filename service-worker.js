const CACHE = 'xuming-mvp-v25';
const ASSETS = ['./', './index.html', './styles.css?v=2026-10-29-25', './engine.js?v=2026-10-29-25', './app.js?v=2026-10-29-25', './keepsake.js?v=2026-10-29-25', './manifest.webmanifest', './data/character-catalog.json', './data/classics.json', './data/product.json'];
const ASSET_PATHS = new Set(ASSETS.map((asset) => new URL(asset, self.registration.scope).pathname));
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('xuming-mvp-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !ASSET_PATHS.has(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return (await cache.match(request)) || (await cache.match('./index.html')) || Response.error();
      }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }));
});
