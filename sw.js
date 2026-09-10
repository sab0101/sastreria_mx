// Service Worker para Sastrería SaaS
const CACHE_NAME = 'sasteria-v13';
const urlsToCache = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cacheando recursos iniciales...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Instalación completa, activando...');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => {
              console.log('🗑️ Eliminando cache antiguo:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('✅ Service Worker activado');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', event => {
  // Ignorar extensiones de Chrome, Grammarly y servicios externos (Firebase, Google, CDN de xlsx)
  if (event.request.url.includes('chrome-extension') ||
      event.request.url.includes('grammarly') ||
      event.request.url.includes('firebase') ||
      event.request.url.includes('googleapis') ||
      event.request.url.includes('gstatic') ||
      event.request.url.includes('xlsx') ||
      event.request.url.includes('google.com') ||
      event.request.url.includes('cdnjs.cloudflare.com') ||
      event.request.url.includes('fonts.googleapis.com') ||
      event.request.url.includes('fonts.gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200) {
              return response;
            }

            const url = new URL(event.request.url);
            if (url.pathname.endsWith('.js') ||
                url.pathname.endsWith('.css') ||
                url.pathname.endsWith('.html') ||
                url.pathname.endsWith('.json') ||
                url.pathname.endsWith('.png') ||
                url.pathname.endsWith('.jpg') ||
                url.pathname.endsWith('.jpeg') ||
                url.pathname.endsWith('.ico')) {

              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }

            return response;
          })
          .catch(() => {
            return caches.match('./index.html');
          });
      })
  );
});