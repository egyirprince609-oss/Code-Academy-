const CACHE_NAME = "code-academy-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/login.html",
  "/signup.html",
  "/menu.html",
  "/manifest.json",
  "/logo.png"
];

self.addEventListener("install", event => {
  console.log("Code Academy Service Worker installing...");

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  console.log("Code Academy Service Worker activated.");

  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseClone = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });

        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cachedResponse => {
            return cachedResponse || caches.match("/index.html");
          });
      })
  );
});
