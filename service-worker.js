/* MyDeviceGuard – service-worker.js
 *
 * Strategia di aggiornamento automatico:
 *
 *  - NETWORK-FIRST per HTML e JS della PWA.
 *    A ogni apertura, se siamo online, scarichiamo SEMPRE la versione fresca
 *    dal server. Così quando spingi un fix su GitHub, al prossimo refresh
 *    l'utente lo vede automaticamente, senza dover svuotare la cache.
 *    Se siamo offline, usiamo l'ultima versione in cache come fallback.
 *
 *  - CACHE-FIRST per asset statici raramente modificati (icone, manifest, css).
 *
 *  - SKIPWAITING + CLIENTS.CLAIM: il nuovo service worker prende il controllo
 *    immediatamente, senza aspettare che l'utente chiuda tutte le schede.
 *
 *  - POSTMESSAGE ai client quando attiva una nuova versione: la pagina mostra
 *    un toast "Aggiornato alla versione X" e si ricarica.
 */

const CACHE_VERSION = 'v9';
const CACHE_NAME = `mydeviceguard-${CACHE_VERSION}`;

const LONG_LIVED_ASSETS = [
  'manifest.json',
  'css/style.css',
  'icon/mydeviceguard-192.png',
  'icon/mydeviceguard-512.png'
];

const DYNAMIC_EXTENSIONS = ['.html', '.js'];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(LONG_LIVED_ASSETS.map(u => cache.add(u).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('mydeviceguard-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) {
      c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
    }
  })());
});

self.addEventListener('message', evt => {
  if (evt.data && evt.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isDynamicRequest(url) {
  if (url.origin !== location.origin) return false;
  const path = url.pathname;
  if (path === '/' || path.endsWith('/')) return true;
  return DYNAMIC_EXTENSIONS.some(ext => path.endsWith(ext));
}

function isLongLivedAsset(url) {
  if (url.origin !== location.origin) return false;
  const rel = url.pathname.replace(/^\/+/, '').replace(/^MyDeviceGuard\//, '');
  return LONG_LIVED_ASSETS.includes(rel);
}

self.addEventListener('fetch', evt => {
  const req = evt.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname.includes('peerjs') || url.hostname.includes('turn.')) return;

  if (isDynamicRequest(url)) {
    evt.respondWith(networkFirst(req));
    return;
  }
  if (isLongLivedAsset(url)) {
    evt.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin === location.origin) {
    evt.respondWith(networkFirst(req));
    return;
  }
  evt.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const netPromise = fetch(req);
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000));
    const resp = await Promise.race([netPromise, timeout]);
    if (resp && resp.ok) {
      cache.put(req, resp.clone());
      return resp;
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    return resp;
  } catch (_) {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
      const index = await cache.match('index.html') || await cache.match('./');
      if (index) return index;
    }
    return new Response('Offline e risorsa non disponibile in cache.', {
      status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (_) {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  const netPromise = fetch(req).then(resp => {
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  }).catch(() => hit);
  return hit || netPromise;
}
