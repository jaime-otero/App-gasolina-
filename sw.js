// Cachea la app para que funcione sin conexión.
// Al cambiar algún archivo, sube VERSION aquí y en index.html (?v=) para que
// el móvil descargue todo nuevo a la vez y nunca mezcle archivos de versiones distintas.
const VERSION = '11';
const CACHE = `gasolina-v${VERSION}`;
const FILES = [
  './',
  'index.html',
  `styles.css?v=${VERSION}`,
  `app.js?v=${VERSION}`,
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero y saltándose la caché HTTP del navegador (GitHub Pages cachea 10 min),
// así con conexión siempre se usa la última versión. Sin conexión, lo guardado en caché.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
