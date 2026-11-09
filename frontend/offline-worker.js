const SHELL_CACHE = '__AFRIMIND_CACHE__';
const ASSETS = __AFRIMIND_ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('afrimind-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(SHELL_CACHE).then(cache => cache.match('/index.html'))));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(SHELL_CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  }
});
