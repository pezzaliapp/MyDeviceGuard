/* MyDeviceGuard – backup.js
 *
 * Export/import cifrato di tutti i dati locali della PWA.
 *
 * Formato file .mdg (JSON con 4 campi):
 *   {
 *     "format": "mdg-backup-v1",
 *     "salt": "<base64 16 bytes>",
 *     "iv":   "<base64 12 bytes>",
 *     "data": "<base64 ciphertext>"
 *   }
 *
 * Cifratura:
 *   - PBKDF2-SHA256, 250.000 iterazioni, salt casuale 16 byte → chiave AES-256
 *   - AES-GCM, IV casuale 12 byte → cifratura autenticata
 *
 * Contenuto payload decifrato:
 *   {
 *     "exportedAt": "<ISO date>",
 *     "localStorage": { "mdg.deviceId": "...", "mdg.deviceName": "...", ... },
 *     "events": [...],
 *     "alerts": [...],
 *     "peers":  [...]
 *   }
 */

(function () {
  const FORMAT_TAG = 'mdg-backup-v1';
  const PBKDF2_ITER = 250000;

  // ---------- Crypto helpers ----------
  function b64enc(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64dec(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  async function deriveKey(password, saltBuf) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(password),
      { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuf, iterations: PBKDF2_ITER, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']
    );
  }

  // ---------- Raccolta dati ----------
  async function collectAll() {
    const events = await MDG.db.getAllEvents({ limit: 100000 });
    const alerts = await MDG.db.getAllAlerts({ limit: 100000 });
    const peers  = await MDG.db.getAllPeers();

    // Solo le chiavi mdg.* — non tocchiamo nulla che non sia nostro
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mdg.')) ls[k] = localStorage.getItem(k);
    }

    return {
      exportedAt: new Date().toISOString(),
      deviceId: MDG.getOrCreateDeviceId(),
      deviceName: MDG.getDeviceName(),
      deviceKind: MDG.getDeviceKind(),
      localStorage: ls,
      events, alerts, peers
    };
  }

  // ---------- Export ----------
  async function exportEncrypted(password) {
    if (!password || password.length < 6) {
      throw new Error('Password troppo corta (minimo 6 caratteri)');
    }
    const payload = await collectAll();
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt.buffer);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    const file = {
      format: FORMAT_TAG,
      created: payload.exportedAt,
      deviceName: payload.deviceName,
      counts: {
        events: payload.events.length,
        alerts: payload.alerts.length,
        peers:  payload.peers.length
      },
      salt: b64enc(salt),
      iv:   b64enc(iv),
      data: b64enc(ct)
    };
    return file;
  }

  async function downloadBackup(password) {
    const file = await exportEncrypted(password);
    const json = JSON.stringify(file, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `mydeviceguard-backup-${stamp}.mdg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return file;
  }

  // ---------- Import (preview + apply) ----------
  async function decryptFile(fileObj, password) {
    if (!fileObj || fileObj.format !== FORMAT_TAG) {
      throw new Error('File non valido o formato non riconosciuto');
    }
    const salt = b64dec(fileObj.salt);
    const iv = new Uint8Array(b64dec(fileObj.iv));
    const ct = b64dec(fileObj.data);
    const key = await deriveKey(password, salt);
    let pt;
    try {
      pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    } catch (_) {
      throw new Error('Password errata o file corrotto');
    }
    return JSON.parse(new TextDecoder().decode(pt));
  }

  async function parseFile(fileText) {
    let fileObj;
    try { fileObj = JSON.parse(fileText); }
    catch (e) { throw new Error('Il file non è un JSON valido'); }
    if (fileObj.format !== FORMAT_TAG) {
      throw new Error('Formato sconosciuto: ' + (fileObj.format || 'n/d'));
    }
    return fileObj;
  }

  /**
   * Applica i dati decifrati al device corrente.
   * mode: 'merge' (aggiunge, evita duplicati per id) | 'replace' (svuota e riscrive)
   * applyLocalStorage: se true copia anche device name/id/kind (di fatto sostituisce identità)
   */
  async function applyRestore(decoded, { mode = 'merge', applyLocalStorage = false } = {}) {
    const out = { events: 0, alerts: 0, peers: 0 };

    if (mode === 'replace') {
      await MDG.db.clearEvents();
      await MDG.db.clearAlerts();
      const existing = await MDG.db.getAllPeers();
      for (const p of existing) await MDG.db.deletePeer(p.peerId);
    }

    // Eventi
    if (Array.isArray(decoded.events)) {
      for (const e of decoded.events) {
        const clone = Object.assign({}, e);
        delete clone.id; // autoIncrement
        await MDG.db.addEvent(clone);
        out.events++;
      }
    }
    // Alert
    if (Array.isArray(decoded.alerts)) {
      for (const a of decoded.alerts) {
        const clone = Object.assign({}, a);
        delete clone.id;
        await MDG.db.addAlert(clone);
        out.alerts++;
      }
    }
    // Peer (keyPath = peerId → put fa merge automatico)
    if (Array.isArray(decoded.peers)) {
      for (const p of decoded.peers) {
        await MDG.db.savePeer(p);
        out.peers++;
      }
    }
    // localStorage (identità)
    if (applyLocalStorage && decoded.localStorage) {
      for (const k of Object.keys(decoded.localStorage)) {
        if (k.startsWith('mdg.')) {
          localStorage.setItem(k, decoded.localStorage[k]);
        }
      }
    }
    return out;
  }

  window.MDG = Object.assign(window.MDG || {}, {
    backup: {
      downloadBackup,
      parseFile,
      decryptFile,
      applyRestore
    }
  });
})();
