self.addEventListener("install", e => {
  e.waitUntil(caches.open("v1").then(c => c.addAll(["index.html", "logo.png", "manifest.json"])).then(()=>self.skipWaiting()));
});
self.addEventListener("fetch", e => {
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
