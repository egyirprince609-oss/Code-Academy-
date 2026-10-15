/* Code Academy Safe Browser: cache only its own offline shell, never third-party browsing content. */
const CACHE_NAME = 'ca-safe-browser-shell-v1';
const SHELL = [
  './safe-browsing.html',
  './safe-browsing.css',
  './safe-browsing.js',
  './safe-browser-icon-192.png',
  './safe-browser.webmanifest'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ca-safe-browser-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!SHELL.some(path => url.pathname.endsWith(path.replace('./', '/')))) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
