const CACHE_NAME = 'Golf Orbit localStorage mirror v1';
const urlsToCache = [
    './',
    './index.html',
    './idbfs-localstorage-mirror.js',
    './Build/c435997b2cc2b4e5ff1d329762ee774d.data.unityweb',
    './Build/41e18e97d75251175935126c5d24b998.wasm.unityweb',
    './Build/04a051262f8f16406986e06b8539c371.framework.js.unityweb',
    './Build/9853637125e801e9aae48e78dbbdcfca.loader.js',
    './TemplateData/style.css',
    './icon-1920x1080.png',
    './icon-512x512.png'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(keys.map(function(key) {
                if (key !== CACHE_NAME) return caches.delete(key);
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request).then(function(response) {
            return response || fetch(event.request);
        })
    );
});
