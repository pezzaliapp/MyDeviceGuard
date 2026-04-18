/* MyDeviceGuard – service-worker.js
 * Strategia:
 *  - Cache-first per asset statici (HTML, CSS, JS, icone, manifest)
 *  - Stale-while-revalidate per CDN (PeerJS, QR library)
 *  - Bypass per tutto il resto (inclusi WebRTC, che non passa comunque da fetch)
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `mydeviceguard-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  './',
  'index.html',
  'tracker.html',
  'controller.html',
  'security.html',
  'logs.html',
  'pairing.html',
  'manifest.json',
  'css/style.css',
  'js/common.js',
  'js/db.js',
  'js/security.js',
  'js/peer.js',
  'icon/mydeviceguard-192.png',
  'icon/mydeviceguard-512.png'
];

// CDN che vale la pena cachare (sono tag <script src=...> presenti nelle pagine)
const CDN_CACHE_HOSTS = [
  'unpkg.com',
  'cdn.jsdelivr.net'
];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // addAll fallisce se uno qualsiasi fallisce; usiamo add singolo per essere robusti
      Promise.all(STATIC_ASSETS.map(u => cache.add(u).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('mydeviceguard-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', evt => {
  const req = evt.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Stale-while-revalidate per CDN noti
  if (CDN_CACHE_HOSTS.some(h => url.hostname.endsWith(h))) {
    evt.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(hit => {
          const net = fetch(req).then(resp => {
            if (resp.ok) cache.put(req, resp.clone());
            return resp;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // Per le nostre risorse statiche: cache-first con fallback rete
  if (url.origin === location.origin) {
    evt.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match('index.html')))
    );
    return;
  }

  // Tutto il resto: rete, con fallback cache se offline
  evt.respondWith(fetch(req).catch(() => caches.match(req)));
});
