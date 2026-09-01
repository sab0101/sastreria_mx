// Service worker mínimo — solo existe para que el navegador permita
// "Instalar app" / "Agregar a pantalla de inicio". No cachea nada de
// forma agresiva, así que siempre carga la versión más reciente
// (los datos igual siempre vienen de Firebase, en vivo).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Passthrough simple: deja que todas las peticiones vayan normal a la red.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
