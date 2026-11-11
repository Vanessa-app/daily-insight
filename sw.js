const CACHE='daily-insight-v1.8-loadfix-1';const ASSETS=['./','./index.html','./style.css?v=growth2','./app.js?v=loadfix1','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./data/news.json','./data/taiwan.json','./data/catalog.json','./art/preventive-checkup.webp'];
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
 const dataPath = ['/data/news.json','/data/taiwan.json','/data/catalog.json']
   .some(path => u.pathname.endsWith(path));
 if (dataPath) {
   const key = u.origin + u.pathname;
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 8000);
   const network = fetch(e.request, {cache:'no-store', signal:controller.signal})
     .then(response => {
       if (!response.ok) throw new Error('Article data unavailable');
       return response;
     })
     .finally(() => clearTimeout(timeout));
   e.waitUntil(network.then(response => {
     const copy = response.clone();
     return caches.open(CACHE).then(cache => cache.put(key, copy));
   }).catch(() => {}));
   e.respondWith(network.catch(async () => {
     const cache = await caches.open(CACHE);
     return (await cache.match(key)) || Response.error();
   }));
   return;
 }
 e.respondWith(caches.match(e.request).then(response => response || fetch(e.request)));
});
