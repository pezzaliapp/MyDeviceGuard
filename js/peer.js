/* MyDeviceGuard – peer.js
 * Wrapper su PeerJS (WebRTC) per il remote control P2P senza server centrale.
 * Il signaling usa il PeerServer pubblico di PeerJS. I dati transitano
 * direttamente tra i due peer (WebRTC DataChannel, cifrato DTLS/SRTP
 * a livello di trasporto).
 *
 * Inoltre aggiungiamo una chiave condivisa AES-GCM generata al pairing:
 * anche se qualcuno intercettasse il signaling, non potrebbe leggere i
 * messaggi di applicazione.
 *
 * Schema di pairing:
 *   1. Il device "tracker" genera un peerId random e una chiave AES.
 *   2. Mostra un QR con { peerId, key }.
 *   3. Il controller scansiona il QR e si connette.
 *   4. Entrambi salvano il peer in IndexedDB (store "peers").
 */

(function () {
  const PEERJS_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  let peerJsLoaded = null;

  function loadPeerJs() {
    if (peerJsLoaded) return peerJsLoaded;
    peerJsLoaded = new Promise((resolve, reject) => {
      if (window.Peer) return resolve();
      const s = document.createElement('script');
      s.src = PEERJS_SRC;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Impossibile caricare PeerJS (serve connessione al primo uso).'));
      document.head.appendChild(s);
    });
    return peerJsLoaded;
  }

  // ---------- CRYPTO HELPERS ----------
  async function generateSharedKey() {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, ['encrypt', 'decrypt']
    );
    const raw = await crypto.subtle.exportKey('raw', key);
    return bufToB64(raw);
  }

  async function importKey(b64) {
    const raw = b64ToBuf(b64);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  async function encrypt(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { iv: bufToB64(iv), ct: bufToB64(ct) };
  }

  async function decrypt(key, payload) {
    const iv = b64ToBuf(payload.iv);
    const ct = b64ToBuf(payload.ct);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64ToBuf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // ---------- SESSION ----------
  // wraps a PeerJS DataConnection con encrypt/decrypt automatici
  function wrapConn(conn, cryptoKey) {
    const out = {
      conn,
      peer: conn.peer,
      onMessage: null,
      onOpen: null,
      onClose: null,
      onError: null,
      send: async (obj) => {
        const payload = await encrypt(cryptoKey, obj);
        conn.send(payload);
      },
      close: () => conn.close()
    };
    conn.on('open', () => out.onOpen && out.onOpen());
    conn.on('data', async (payload) => {
      try {
        const obj = await decrypt(cryptoKey, payload);
        out.onMessage && out.onMessage(obj);
      } catch (e) {
        out.onError && out.onError(new Error('Messaggio non decifrabile – chiave diversa?'));
      }
    });
    conn.on('close', () => out.onClose && out.onClose());
    conn.on('error', (e) => out.onError && out.onError(e));
    return out;
  }

  // Il "tracker" (device da controllare): pubblica il proprio peerId e attende.
  async function hostAsTracker({ onIncoming, onStatus } = {}) {
    await loadPeerJs();
    const peer = new Peer();
    const sharedKeyB64 = await generateSharedKey();
    const cryptoKey = await importKey(sharedKeyB64);

    peer.on('open', id => {
      onStatus && onStatus({ state: 'ready', peerId: id, key: sharedKeyB64 });
    });
    peer.on('connection', conn => {
      const wrapped = wrapConn(conn, cryptoKey);
      onIncoming && onIncoming(wrapped);
    });
    peer.on('error', err => {
      onStatus && onStatus({ state: 'error', error: err.type || err.message });
    });
    peer.on('disconnected', () => {
      onStatus && onStatus({ state: 'disconnected' });
    });

    return {
      peer,
      close: () => peer.destroy()
    };
  }

  // Il "controller" si connette a un peerId usando la chiave condivisa.
  async function connectAsController({ peerId, keyB64, onOpen, onMessage, onClose, onError } = {}) {
    await loadPeerJs();
    const peer = new Peer();
    const cryptoKey = await importKey(keyB64);

    return new Promise((resolve, reject) => {
      peer.on('open', () => {
        const conn = peer.connect(peerId, { reliable: true });
        const wrapped = wrapConn(conn, cryptoKey);
        wrapped.onOpen = () => { onOpen && onOpen(); resolve(wrapped); };
        wrapped.onMessage = onMessage;
        wrapped.onClose = onClose;
        wrapped.onError = onError;
      });
      peer.on('error', err => reject(err));
    });
  }

  window.MDG = Object.assign(window.MDG || {}, {
    peer: {
      hostAsTracker,
      connectAsController,
      generateSharedKey,
      importKey
    }
  });
})();
