const CACHE_NAME = "code-academy-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./menu.html",
  "./lesson.html",
  "./logo.png",
  "./manifest.json",
  "./authentication.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(()=> self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=> self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Cache lesson JSON files forever offline
  if(url.pathname.endsWith(".json")){
    e.respondWith(
      caches.match(e.request).then(cached => {
        return cached || fetch(e.request).then(res=>{
          const clone=res.clone();
          caches.open(CACHE_NAME).then(c=>c.put(e.request, clone));
          return res;
        }).catch(()=> cached);
      })
    );
    return;
  }
  // Network first for everything else, fallback to cache
  e.respondWith(
    fetch(e.request).catch(()=> caches.match(e.request).then(r=> r || caches.match("./index.html")))
  );
});
