/* Code Academy PWA service worker. Bump CACHE_VERSION when releasing a new static bundle. */
'use strict';
const CACHE_VERSION='code-academy-shell-v5-live-map';
const BASE=new URL('./',self.registration.scope);
const CORE=[
 'index.html','home.html','menu.html','live-map.html','security-center.html','security-engine.js','games_dash.html','manifest.json','security-preview.jpg','logo.png','web-app-manifest-192x192.png','web-app-manifest-512x512.png',
 'authentication.js','game-platform.js','notification-engine.js','pwa.js','lesson.html','signup.html','login.html','verify-email.html','privacy.html','terms.html','aboutus.html','contactus.html',
 'digital_vault.html','detective_man.html','mind_palace.html','civilization.html','truth_protocol.html','code_breaker.html','cybermission.html','code_racer.html','algorithm_defender.html','code_quest.html',
 'digital_vault_questions.json','detective_man_questions.json','mind_palace_questions.json','civilization_questions.json','truth_protocol_questions.json','code_breaker_questions.json','cybermission_questions.json','code_racer_challenges.json','algorithm_defender_questions.json','code_quest_questions.json',
 'share-preview.jpg','share-preview.png','share-preview-login.jpg','share-preview-signup.jpg','share-preview-verify.jpg'
];
const absolute=path=>new URL(path,BASE).toString();
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE_VERSION);await Promise.allSettled(CORE.map(async path=>{try{const request=new Request(absolute(path),{cache:'reload'});const response=await fetch(request);if(response.ok)await cache.put(request,response);}catch(_){}}));await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('code-academy-')&&key!==CACHE_VERSION).map(key=>caches.delete(key)));await self.clients.claim();})());});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='CLEAR_APP_CACHE')event.waitUntil(caches.delete(CACHE_VERSION));});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin||!url.href.startsWith(BASE.href))return;
 if(req.mode==='navigate'){event.respondWith((async()=>{try{const fresh=await fetch(req);if(fresh.ok){const cache=await caches.open(CACHE_VERSION);cache.put(req,fresh.clone()).catch(()=>{});}return fresh;}catch(_){const cache=await caches.open(CACHE_VERSION);return await cache.match(req)||await cache.match(absolute('index.html'))||new Response('Code Academy is offline. Reconnect to try again.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}})());return;}
 const isData=/\.json(?:$|\?)/i.test(url.pathname),isStatic=/\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?|json)$/i.test(url.pathname);
 if(isData||isStatic){event.respondWith((async()=>{const cache=await caches.open(CACHE_VERSION);const cached=await cache.match(req);const update=fetch(req).then(res=>{if(res.ok)cache.put(req,res.clone()).catch(()=>{});return res;}).catch(()=>null);if(cached){event.waitUntil(update);return cached;}return await update||new Response('{}',{status:503,headers:{'Content-Type':'application/json'}});})());}
});
self.addEventListener('push',event=>{let data={title:'Code Academy',body:'You have a new learning update.',url:'./menu.html',icon:'./web-app-manifest-192x192.png',tag:'code-academy-update'};try{const payload=event.data?.json();if(payload)data={...data,...payload};}catch(_){const text=event.data?.text();if(text)data.body=text;}
 const options={body:String(data.body||'You have a new learning update.'),icon:absolute(data.icon||'web-app-manifest-192x192.png'),badge:absolute('web-app-manifest-192x192.png'),tag:String(data.tag||'code-academy-update'),data:{url:String(data.url||'./menu.html')},renotify:false,requireInteraction:false};event.waitUntil(self.registration.showNotification(String(data.title||'Code Academy'),options));
});
self.addEventListener('notificationclick',event=>{event.notification.close();const target=new URL(event.notification.data?.url||'./menu.html',BASE);if(target.origin!==self.location.origin||!target.href.startsWith(BASE.href))return;event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(client.url.startsWith(BASE.href)&&'focus'in client){await client.navigate(target.href).catch(()=>{});return client.focus();}}if(self.clients.openWindow)return self.clients.openWindow(target.href);})());});
