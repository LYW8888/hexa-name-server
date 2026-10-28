const CACHE = 'xuming-mvp-v7';
const ASSETS = ['./', './index.html', './styles.css?v=2026-10-27-7', './engine.js?v=2026-10-27-7', './app.js?v=2026-10-27-7', './manifest.webmanifest', './data/character-catalog.json', './data/classics.json', './data/product.json'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response;
  })));
});
