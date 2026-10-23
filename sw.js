// Offline support: the app shell is cached on install, and every request is
// answered from the cache first while a fresh copy is fetched in the background
// (stale-while-revalidate), so updates show up on the next launch.
// Bump VERSION when files are added or removed from SHELL.

const VERSION = 'v1';
const CACHE = `labelmaker-${VERSION}`;
const SHELL = [
  './', 'index.html', 'test.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/batch.js', 'js/capture.js', 'js/editor.js', 'js/icons.js', 'js/model.js',
  'js/printer.js', 'js/raster.js', 'js/render.js', 'js/test.js',
  'vendor/JsBarcode.all.min.js', 'vendor/qrcode.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png',
];
// Other sites whose files are worth keeping offline (web fonts, the Excel and OCR libraries).
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('labelmaker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin && !CDN_HOSTS.includes(url.hostname)) return;

  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: url.origin === location.origin });
    const fresh = fetch(e.request)
      .then((res) => {
        if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
        return res;
      })
      .catch(() => cached);
    if (cached) {
      e.waitUntil(fresh);
      return cached;
    }
    return fresh;
  }));
});
