// sw.js — Service-Worker für PWA-Installierbarkeit & Offline-App-Shell.
// Spieldaten laufen über Firestore (eigener Offline-Cache); dieser SW cacht
// nur die statischen App-Dateien, damit die Oberfläche offline lädt.
// Bei jeder Änderung an den Dateien die VERSION erhöhen → alter Cache wird verworfen.
const VERSION = 'v3';
const CACHE = `raufrunter-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/engine.js',
  './src/store.js',
  './src/store-firebase.js',
  './src/firebase-config.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Nur same-origin GET behandeln (Firebase/gstatic läuft direkt übers Netz).
// Strategie: stale-while-revalidate — schnell aus Cache, im Hintergrund aktualisieren.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
