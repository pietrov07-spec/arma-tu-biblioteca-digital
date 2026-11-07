// Guarda solo la app (HTML, JS, CSS e iconos) para que abra rápido como app
// instalada. Nunca guarda portadas ni el catálogo: eso viene de Drive con el
// token de quien lee y no pasa por aquí. Las copias de libros abiertos las
// administra la app (src/copias.js) en su propia caja, y se borran al salir.
const VERSION = 'biblioteca-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION && c !== 'biblioteca-libros').map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // La página: siempre la versión nueva; la guardada solo sin conexión
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSION).then((c) => c.put('/', copia));
          return r;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Archivos con huella en el nombre (no cambian) e iconos
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/iconos/')) {
    e.respondWith(
      caches.match(e.request).then((guardado) => guardado || fetch(e.request).then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copia));
        }
        return r;
      })),
    );
  }
});
