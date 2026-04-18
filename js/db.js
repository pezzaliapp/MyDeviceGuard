/* MyDeviceGuard – db.js
 * Wrapper minimale su IndexedDB.
 * Tre store:
 *   - events:   log di accessi/sessioni del device corrente
 *   - alerts:   eventi di sicurezza (HID sospetto, typing anomalo, ecc.)
 *   - peers:    device remoti accoppiati via P2P (id, nome, chiave condivisa)
 */

(function () {
  const DB_NAME = 'mydeviceguard';
  const DB_VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('events')) {
          const s = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
          s.createIndex('ts', 'ts');
          s.createIndex('deviceId', 'deviceId');
          s.createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('alerts')) {
          const s = db.createObjectStore('alerts', { keyPath: 'id', autoIncrement: true });
          s.createIndex('ts', 'ts');
          s.createIndex('severity', 'severity');
          s.createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('peers')) {
          db.createObjectStore('peers', { keyPath: 'peerId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(storeName, mode = 'readonly') {
    return open().then(db => db.transaction(storeName, mode).objectStore(storeName));
  }

  // ---------- EVENTS ----------
  async function addEvent(evt) {
    const store = await tx('events', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.add(Object.assign({ ts: Date.now() }, evt));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllEvents({ limit = 500, order = 'desc' } = {}) {
    const store = await tx('events');
    return new Promise((resolve, reject) => {
      const out = [];
      const idx = store.index('ts');
      const dir = order === 'desc' ? 'prev' : 'next';
      const req = idx.openCursor(null, dir);
      req.onsuccess = e => {
        const cur = e.target.result;
        if (cur && out.length < limit) { out.push(cur.value); cur.continue(); }
        else resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function clearEvents() {
    const store = await tx('events', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------- ALERTS ----------
  async function addAlert(alert) {
    const store = await tx('alerts', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.add(Object.assign({ ts: Date.now(), severity: 'info' }, alert));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllAlerts({ limit = 200 } = {}) {
    const store = await tx('alerts');
    return new Promise((resolve, reject) => {
      const out = [];
      const idx = store.index('ts');
      const req = idx.openCursor(null, 'prev');
      req.onsuccess = e => {
        const cur = e.target.result;
        if (cur && out.length < limit) { out.push(cur.value); cur.continue(); }
        else resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function clearAlerts() {
    const store = await tx('alerts', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------- PEERS ----------
  async function savePeer(peer) {
    const store = await tx('peers', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(peer);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllPeers() {
    const store = await tx('peers');
    return new Promise((resolve, reject) => {
      const out = [];
      const req = store.openCursor();
      req.onsuccess = e => {
        const cur = e.target.result;
        if (cur) { out.push(cur.value); cur.continue(); }
        else resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function deletePeer(peerId) {
    const store = await tx('peers', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(peerId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  window.MDG = Object.assign(window.MDG || {}, {
    db: {
      addEvent, getAllEvents, clearEvents,
      addAlert, getAllAlerts, clearAlerts,
      savePeer, getAllPeers, deletePeer
    }
  });
})();
