/* MyDeviceGuard – security.js
 * Audit diagnostico del device usando solo API web standard.
 * Nessuna invasività: non scarica nulla, non comunica con server esterni,
 * non raccoglie dati biometrici. Tutto è ispettivo e locale.
 */

(function () {

  async function runAudit() {
    const results = [];

    // 1. Secure context / HTTPS
    results.push({
      key: 'secure_context',
      label: 'Contesto sicuro (HTTPS)',
      status: window.isSecureContext ? 'ok' : 'danger',
      value: window.isSecureContext ? 'Sì' : 'No – pagina non in HTTPS',
      hint: window.isSecureContext
        ? 'La pagina è servita su HTTPS o localhost.'
        : 'Senza HTTPS molte API di sicurezza sono disabilitate. Usa sempre un dominio con certificato.'
    });

    // 2. Service Worker
    const swReg = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration().catch(() => null)
      : null;
    results.push({
      key: 'service_worker',
      label: 'Service Worker attivo',
      status: swReg ? 'ok' : 'warn',
      value: swReg ? 'Registrato' : 'Non registrato',
      hint: swReg ? 'La PWA funziona offline.' : 'Senza service worker la PWA non è offline-ready.'
    });

    // 3. Storage persistence
    let persistent = false;
    if (navigator.storage && navigator.storage.persisted) {
      try { persistent = await navigator.storage.persisted(); } catch (_) {}
    }
    results.push({
      key: 'storage_persisted',
      label: 'Storage persistente',
      status: persistent ? 'ok' : 'info',
      value: persistent ? 'Sì' : 'Volatile',
      hint: persistent
        ? 'Il browser non cancellerà i dati locali sotto pressione spazio.'
        : 'I dati locali potrebbero essere eliminati dal browser. Chiedi persistenza se critico.'
    });

    // 4. Storage quota
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usedMB = (est.usage / 1024 / 1024).toFixed(1);
        const quotaMB = (est.quota / 1024 / 1024).toFixed(0);
        results.push({
          key: 'storage_quota',
          label: 'Spazio storage',
          status: 'info',
          value: `${usedMB} MB / ${quotaMB} MB`,
          hint: 'Spazio occupato dalla PWA sul device.'
        });
      } catch (_) {}
    }

    // 5. Permessi critici
    const perms = ['geolocation', 'notifications', 'camera', 'microphone', 'clipboard-read', 'clipboard-write'];
    if (navigator.permissions && navigator.permissions.query) {
      for (const name of perms) {
        try {
          const p = await navigator.permissions.query({ name });
          results.push({
            key: 'perm_' + name,
            label: 'Permesso: ' + name,
            status: p.state === 'granted' ? 'warn' : (p.state === 'denied' ? 'ok' : 'info'),
            value: p.state,
            hint: p.state === 'granted'
              ? 'Permesso attivo: verifica che sia intenzionale.'
              : 'Permesso non concesso a questa origine.'
          });
        } catch (_) { /* alcuni nomi non supportati */ }
      }
    }

    // 6. Cookie policy
    results.push({
      key: 'third_party_cookies',
      label: 'Cookie di terze parti bloccati',
      status: (navigator.cookieEnabled === false) ? 'info' : 'info',
      value: navigator.cookieEnabled ? 'Cookie abilitati' : 'Cookie disabilitati',
      hint: 'Questa PWA non usa cookie; il flag indica solo lo stato del browser.'
    });

    // 7. Rete
    if (navigator.connection) {
      const c = navigator.connection;
      results.push({
        key: 'network',
        label: 'Rete',
        status: 'info',
        value: `${c.effectiveType || 'n/d'} · ${c.downlink || '?'} Mbps${c.saveData ? ' · Data Saver' : ''}`,
        hint: 'Informazioni sulla connessione corrente.'
      });
    }

    // 8. Batteria
    if (navigator.getBattery) {
      try {
        const b = await navigator.getBattery();
        results.push({
          key: 'battery',
          label: 'Batteria',
          status: 'info',
          value: `${Math.round(b.level * 100)}%${b.charging ? ' · in carica' : ''}`,
          hint: 'Stato energetico del device.'
        });
      } catch (_) {}
    }

    // 9. Schermo e DPI
    results.push({
      key: 'screen',
      label: 'Schermo',
      status: 'info',
      value: `${screen.width}×${screen.height} · DPR ${window.devicePixelRatio}`,
      hint: 'Risoluzione logica dello schermo.'
    });

    // 10. Timezone / lingua
    results.push({
      key: 'locale',
      label: 'Locale',
      status: 'info',
      value: `${Intl.DateTimeFormat().resolvedOptions().timeZone} · ${navigator.language}`,
      hint: 'Timezone e lingua configurate.'
    });

    // 11. CPU / memoria
    if (navigator.hardwareConcurrency) {
      results.push({
        key: 'cpu',
        label: 'CPU',
        status: 'info',
        value: navigator.hardwareConcurrency + ' core logici',
        hint: 'Thread disponibili al browser.'
      });
    }
    if (navigator.deviceMemory) {
      results.push({
        key: 'ram',
        label: 'Memoria',
        status: 'info',
        value: navigator.deviceMemory + ' GB',
        hint: 'RAM stimata esposta dal browser (arrotondata).'
      });
    }

    // 12. WebHID supporto
    results.push({
      key: 'webhid',
      label: 'WebHID disponibile',
      status: ('hid' in navigator) ? 'ok' : 'warn',
      value: ('hid' in navigator) ? 'Sì' : 'Non supportato',
      hint: ('hid' in navigator)
        ? 'Puoi ispezionare tastiere/dispositivi HID collegati (richiede permesso).'
        : 'Il browser non supporta WebHID. Usa Chrome/Edge desktop per la scansione HID.'
    });

    // 13. WebUSB supporto
    results.push({
      key: 'webusb',
      label: 'WebUSB disponibile',
      status: ('usb' in navigator) ? 'ok' : 'info',
      value: ('usb' in navigator) ? 'Sì' : 'No',
      hint: 'Necessario per ispezionare alcuni dispositivi USB via browser.'
    });

    // 14. User-Agent Client Hints (più affidabili dello UA legacy)
    if (navigator.userAgentData) {
      try {
        const ua = await navigator.userAgentData.getHighEntropyValues([
          'platform', 'platformVersion', 'architecture', 'model', 'mobile'
        ]);
        results.push({
          key: 'uach',
          label: 'Piattaforma',
          status: 'info',
          value: `${ua.platform} ${ua.platformVersion || ''} ${ua.architecture || ''}`.trim(),
          hint: 'User-Agent Client Hints – più precisi dello UA classico.'
        });
      } catch (_) {}
    }

    // 15. UA classico
    results.push({
      key: 'useragent',
      label: 'User Agent',
      status: 'info',
      value: navigator.userAgent,
      hint: 'Identificativo del browser. Può essere falsificato, è un dato informativo.'
    });

    return results;
  }

  // ---------- RILEVAZIONE TASTIERA ANOMALA ----------
  // Porta del tuo script Python: misura quanti tasti premuti al secondo.
  // Sopra soglia registra un alert (probabile Rubber Ducky / attacco HID).
  let typingBuffer = [];
  let typingEnabled = false;
  const TYPING_WINDOW_MS = 1000;
  const TYPING_THRESHOLD = 15; // tasti/sec. Un umano veloce sta sotto.

  function startTypingWatcher() {
    if (typingEnabled) return;
    typingEnabled = true;
    window.addEventListener('keydown', onKeyDown, true);
  }

  function stopTypingWatcher() {
    typingEnabled = false;
    window.removeEventListener('keydown', onKeyDown, true);
    typingBuffer = [];
  }

  function onKeyDown() {
    const now = performance.now();
    typingBuffer.push(now);
    while (typingBuffer.length && now - typingBuffer[0] > TYPING_WINDOW_MS) {
      typingBuffer.shift();
    }
    if (typingBuffer.length > TYPING_THRESHOLD) {
      const rate = typingBuffer.length;
      typingBuffer = [];
      if (window.MDG && MDG.db) {
        MDG.db.addAlert({
          type: 'typing_anomaly',
          severity: 'warn',
          description: `Digitazione sospetta: ${rate} tasti/sec`,
          deviceId: MDG.getOrCreateDeviceId(),
          deviceName: MDG.getDeviceName() || 'Device'
        });
      }
      if (window.MDG && MDG.toast) {
        MDG.toast('⚠️ Digitazione anomala rilevata: ' + rate + ' tasti/sec');
      }
    }
  }

  // ---------- WEBHID SCAN ----------
  async function listHidDevices() {
    if (!('hid' in navigator)) return [];
    try {
      // già autorizzati:
      const granted = await navigator.hid.getDevices();
      return granted.map(d => ({
        productName: d.productName,
        vendorId: d.vendorId,
        productId: d.productId,
        collections: d.collections.length
      }));
    } catch (e) {
      return [];
    }
  }

  async function requestHidDevice() {
    if (!('hid' in navigator)) throw new Error('WebHID non supportato');
    const devices = await navigator.hid.requestDevice({ filters: [] });
    return devices.map(d => ({
      productName: d.productName,
      vendorId: d.vendorId,
      productId: d.productId
    }));
  }

  window.MDG = Object.assign(window.MDG || {}, {
    security: {
      runAudit,
      startTypingWatcher, stopTypingWatcher,
      listHidDevices, requestHidDevice
    }
  });
})();
