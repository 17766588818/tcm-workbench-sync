const CACHE='tcm-pwa-v4';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);
  const isHtml = e.request.mode==='navigate' || url.pathname.endsWith('.html') || url.pathname==='/';
  if(isHtml){
    // 页面走网络优先：服务端一更新，刷新即可见，不再被旧缓存卡住
    e.respondWith(
      fetch(e.request).then(r=>{ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r; })
      .catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
    );
    return;
  }
  // 其它静态资源走缓存优先，支持离线
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request).then(resp=>{ const cp=resp.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return resp; }).catch(()=>caches.match('./index.html'))) );
});
