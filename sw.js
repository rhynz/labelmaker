// Offline support. The app's own files are fetched from the network first (so an
// update shows up on the next launch) and served from the cache when offline or
// when the network is too slow. Fonts and libraries from CDNs never change at a
// given URL, so they come from the cache first.
// Bump VERSION when files are added or removed from SHELL.

const VERSION = 'v5';
const CACHE = `labelmaker-${VERSION}`;
const SHELL = [
  './', 'index.html', 'test.html', 'manifest.webmanifest', 'version.json', 'css/app.css',
  'js/app.js', 'js/batch.js', 'js/capture.js', 'js/editor.js', 'js/fonts.js', 'js/iconlib.js', 'icons/catalog.json', 'js/icons.js', 'js/model.js',
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
    const own = url.origin === location.origin;
    const cached = await cache.match(e.request, { ignoreSearch: own });
    // 'no-cache' revalidates with the server instead of trusting the browser's 10-minute HTTP cache.
    const fresh = fetch(e.request, own ? { cache: 'no-cache' } : {}).then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    });
    // An opaque (no-cors) cached copy can't answer a cors request such as fetch(), so refetch then.
    if (!own) return cached && (cached.type !== 'opaque' || e.request.mode === 'no-cors') ? cached : fresh;
    if (!cached) return fresh;
    // Network first, but don't keep a slow connection waiting: fall back to the cache after 3 s.
    const slow = new Promise((resolve) => setTimeout(() => resolve(cached), 3000));
    return Promise.race([fresh.catch(() => cached), slow]);
  }));
});
