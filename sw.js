const CACHE='daily-insight-v1.8-sticky-1';const ASSETS=['./','./index.html','./style.css?v=sticky1','./app.js?v=sticky1','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./data/news.json','./data/taiwan.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("daily-insight-")&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
 if(e.request.mode==='navigate'){
   e.respondWith(fetch(e.request,{cache:'no-store'}).then(response=>{
     if(!response.ok) throw new Error('Navigation unavailable');
     return response;
   }).catch(()=>caches.open(CACHE).then(cache=>cache.match('./index.html'))));
   return;
 }
 if(u.pathname.endsWith('/data/news.json')||u.pathname.endsWith('/data/taiwan.json')){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)));return}e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request)))});
