/* Code Academy app-shell worker. Deploy over sw.js; version bumps refresh the shell cache. */
'use strict';
const CACHE_VERSION = 'code-academy-shell-v5';
const BASE = new URL('./', self.registration.scope);
const CORE_ASSETS = [
  'index.html', 'home.html', 'menu.html', 'settings.html', 'manifest.json', 'sw.js', 'pwa.js',
  'login.html', 'signup.html', 'forgot.html', 'verify-email.html', 'profile.html', 'course.html',
  'lesson.html', 'project.html', 'progress.html', 'certificate.html', 'community.html',
  'contactus.html', 'aboutus.html', 'privacy.html', 'terms.html', 'share.html',
  'games_dash.html', 'App_quiz.html', 'live-map.html', 'gps-map.html', 'editor-dashboard.html',
  'CODEEDITOR.html', 'html_element.html', 'HTML.html', 'HTMLS.html', 'CSS.html', 'html_project.html',
  'ready-projects.html', 'plan.html', 'time.html', 'note.html', 'security-center.html',
  'authentication.js', 'notification-engine.js', 'logo.png', 'web-app-manifest-192x192.png',
  'web-app-manifest-512x512.png', 'share-preview.jpg', 'share-preview.png'
];
const toURL = path => new URL(path, BASE).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(CORE_ASSETS.map(async path => {
      try {
        const req = new Request(toURL(path), { cache: 'reload' });
        const res = await fetch(req);
        if (res.ok && (res.type === 'basic' || res.type === 'default')) await cache.put(req, res);
      } catch (_) { /* A missing optional page must not cancel installation. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('code-academy-shell-') && key !== CACHE_VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_APP_CACHE') event.waitUntil(caches.delete(CACHE_VERSION));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(BASE.href)) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (_) {
        const cache = await caches.open(CACHE_VERSION);
        return await cache.match(req)
          || await cache.match(toURL('home.html'))
          || await cache.match(toURL('index.html'))
          || new Response('Code Academy is offline. Reconnect to continue.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  const cacheable = /\.(?:js|css|png|jpe?g|webp|svg|woff2?|json)$/i.test(url.pathname);
  if (!cacheable) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    if (cached) {
      fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()).catch(() => {}); }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (_) {
      return new Response('This resource is not available offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});

self.addEventListener('push', event => {
  let data = { title: 'Code Academy', body: 'You have a new learning update.', url: './menu.html', icon: './web-app-manifest-192x192.png', tag: 'code-academy-update' };
  try { const payload = event.data?.json(); if (payload && typeof payload === 'object') data = { ...data, ...payload }; }
  catch (_) { const text = event.data?.text(); if (text) data.body = text; }
  const options = {
    body: String(data.body || 'You have a new learning update.'),
    icon: toURL(data.icon || 'web-app-manifest-192x192.png'),
    badge: toURL('web-app-manifest-192x192.png'),
    tag: String(data.tag || 'code-academy-update'),
    renotify: false,
    requireInteraction: false,
    data: { url: String(data.url || './menu.html') }
  };
  event.waitUntil(self.registration.showNotification(String(data.title || 'Code Academy'), options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './menu.html', BASE);
  if (target.origin !== self.location.origin || !target.href.startsWith(BASE.href)) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(BASE.href) && 'focus' in client) {
        await client.navigate(target.href).catch(() => {});
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target.href);
  })());
});
