const CACHE = 'garden-ai-v9';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
  './garden-enhancements.js',
  './garden-enhancements-v2.js',
  './garden-enhancements-v3.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

async function page(req) {
  let r = await caches.match(req, { ignoreSearch: true });
  if (!r) {
    try {
      r = await fetch(req);
      if (r && r.ok) {
        const c = await caches.open(CACHE);
        c.put(req, r.clone());
      }
    } catch {}
  }
  if (!r) return caches.match('./index.html');
  // Cache-first HTML is fine offline, but never serve a stale
  // no-JS shell: re-inject the toolkit loader if it is missing.
  let text = await r.text();
  if (!text.includes('garden-enhancements-v3.js')) {
    text = text.replace('</body>', '<script src="./garden-enhancements-v3.js"></script></body>');
  }
  return new Response(text, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.hostname === 'api.open-meteo.com') {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request)));
    return;
  }
  if (e.request.mode === 'navigate' || u.pathname.endsWith('/index.html')) {
    e.respondWith(page(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(
      cached =>
        cached ||
        fetch(e.request).then(r => {
          if (r && r.ok && u.origin === self.location.origin) {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return r;
        }).catch(() => caches.match('./index.html'))
    )
  );
});
