// Service Worker para Sastrería SaaS
const CACHE_NAME = 'sasteria-v1';
const urlsToCache = [
  '/sastreria_mx/',
  '/sastreria_mx/index.html',
  '/sastreria_mx/icon-192.png',
  '/sastreria_mx/icon-512.png'
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
  // Ignorar peticiones a Firebase, Google APIs y XLSX (siempre en vivo)
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis') ||
      event.request.url.includes('gstatic') ||
      event.request.url.includes('xlsx') ||
      event.request.url.includes('google.com')) {
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
            // Cachear recursos estáticos por extensión
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
            // Fallback: mostrar la página de inicio
            return caches.match('/sastreria_mx/index.html');
          });
      })
  );
});