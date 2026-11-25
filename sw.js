/* Service worker: deixa o app abrir sem internet (a "casca" do app).
 * Os dados da planilha NÃO passam por aqui — vão direto ao Apps Script. */
const CACHE = 'encontro-v2.1.0';
const CASCA = [
  './', './index.html', './style.css?v=2.1.0', './app.js?v=2.1.0', './manifest.webmanifest',
  './icones/icone-192.png', './icones/icone-512.png', './icones/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rede primeiro (sempre a versão mais nova); sem rede, usa o cache.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((r) => r || caches.match('./index.html')))
  );
});
