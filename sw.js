/* MyBookshelf offline app shell. Updated by changing BUILD for each release. */
const BUILD='mybookshelf-v2-2026-11-15-1';
const APP_CACHE='mybookshelf-app-'+BUILD;
const STATIC_ASSETS=[
'./','./index.html','./app.css','./app.mjs','./catalog.mjs',
'./manifest.webmanifest','./icon.svg',
'./themes/enchanted.svg','./themes/academia.svg','./themes/cottage.svg',
'./themes/celestial.svg','./themes/ocean.svg','./themes/forest.svg'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(APP_CACHE).then(cache=>cache.addAll(STATIC_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mybookshelf-app-')&&key!==APP_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const u=new URL(req.url);
  if(u.origin!==location.origin)return; // never intercept external catalog lookups
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(APP_CACHE).then(cache=>cache.put('./index.html',copy))}
      return response;
    }).catch(async()=>await caches.match('./index.html')||Response.error()));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(APP_CACHE).then(cache=>cache.put(req,copy))}
    return response;
  })));
});
