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
      if (window.MDG && MDG.notifications) {
        MDG.notifications.notify('⚠️ Digitazione anomala', {
          body: `${rate} tasti/sec su ${MDG.getDeviceName() || 'questo device'} – possibile attacco HID.`,
          severity: 'warn',
          tag: 'mdg-typing',
          data: { url: 'security.html' }
        });
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

  // ---------- SCHEDULER AUDIT ----------
  // Esegue audit periodici in background e rileva cambiamenti rispetto all'ultimo.
  const SCHED_LS_ENABLED = 'mdg.audit.autoEnabled';
  const SCHED_LS_INTERVAL = 'mdg.audit.intervalMinutes';
  const SCHED_LS_LAST = 'mdg.audit.lastSnapshot';
  const DEFAULT_INTERVAL_MIN = 60;
  const STARTUP_DELAY_MS = 5000;

  let schedTimer = null;

  function getAutoEnabled() {
    // Default: OFF. L'utente deve attivarlo esplicitamente (privacy: evitiamo attività
    // in background senza consenso).
    return localStorage.getItem(SCHED_LS_ENABLED) === 'true';
  }
  function setAutoEnabled(b) {
    localStorage.setItem(SCHED_LS_ENABLED, String(!!b));
    if (b) startAutoAudit();
    else stopAutoAudit();
  }
  function getIntervalMinutes() {
    const n = parseInt(localStorage.getItem(SCHED_LS_INTERVAL) || '', 10);
    return (n >= 5 && n <= 1440) ? n : DEFAULT_INTERVAL_MIN;
  }
  function setIntervalMinutes(n) {
    n = Math.max(5, Math.min(1440, parseInt(n, 10) || DEFAULT_INTERVAL_MIN));
    localStorage.setItem(SCHED_LS_INTERVAL, String(n));
    if (getAutoEnabled()) startAutoAudit(); // restart timer
  }
  function getLastSnapshot() {
    try { return JSON.parse(localStorage.getItem(SCHED_LS_LAST) || 'null'); }
    catch (_) { return null; }
  }
  function setLastSnapshot(snap) {
    localStorage.setItem(SCHED_LS_LAST, JSON.stringify(snap));
  }

  function summarize(results) {
    const out = { total: results.length, ok: 0, warn: 0, danger: 0, info: 0, byKey: {} };
    for (const r of results) {
      out[r.status] = (out[r.status] || 0) + 1;
      // Manteniamo solo key->status per confronto, senza valori sensibili tipo UA
      out.byKey[r.key] = { status: r.status, value: r.value };
    }
    return out;
  }

  function diffSnapshots(prev, curr) {
    // Restituisce un array di cambiamenti "interessanti" tra due snapshot.
    if (!prev || !prev.byKey) return [];
    const changes = [];
    const keys = new Set([...Object.keys(prev.byKey), ...Object.keys(curr.byKey)]);
    for (const k of keys) {
      const a = prev.byKey[k];
      const b = curr.byKey[k];
      if (!a && b) {
        changes.push({ key: k, type: 'added', to: b });
      } else if (a && !b) {
        changes.push({ key: k, type: 'removed', from: a });
      } else if (a && b && (a.status !== b.status || a.value !== b.value)) {
        changes.push({ key: k, type: 'changed', from: a, to: b });
      }
    }
    return changes;
  }

  function severityFromChange(ch) {
    // Cambi che consideriamo davvero seri → alert con severity 'warn'
    // (potrebbero diventare 'danger' con policy più aggressive)
    const sensitive = ['secure_context', 'perm_camera', 'perm_microphone',
                       'perm_geolocation', 'perm_clipboard-read', 'service_worker',
                       'webhid', 'webusb'];
    const isSensitive = sensitive.includes(ch.key);
    if (ch.type === 'changed' && ch.to && ch.to.status === 'danger') return 'danger';
    if (isSensitive) return 'warn';
    return 'info';
  }

  async function runScheduledAudit() {
    if (!window.MDG || !MDG.db) return;
    try {
      const results = await runAudit();
      const snap = summarize(results);
      snap.ts = Date.now();

      const prev = getLastSnapshot();
      const changes = diffSnapshots(prev, snap);

      // Salva evento compresso nei log
      await MDG.db.addEvent({
        type: 'audit_snapshot',
        deviceId: MDG.getOrCreateDeviceId(),
        deviceName: MDG.getDeviceName(),
        summary: {
          total: snap.total,
          ok: snap.ok || 0,
          warn: snap.warn || 0,
          danger: snap.danger || 0,
          info: snap.info || 0
        },
        changedCount: changes.length
      });

      // Se ci sono cambiamenti, generiamo alert + toast discreto
      if (changes.length && prev) {
        let worstSeverity = 'info';
        for (const ch of changes) {
          const sev = severityFromChange(ch);
          if (sev === 'danger') worstSeverity = 'danger';
          else if (sev === 'warn' && worstSeverity !== 'danger') worstSeverity = 'warn';
          const fromStr = ch.from ? `${ch.from.status}:${ch.from.value}` : '—';
          const toStr = ch.to ? `${ch.to.status}:${ch.to.value}` : '—';
          await MDG.db.addAlert({
            type: 'security_change',
            severity: sev,
            description: `${ch.key}: ${fromStr} → ${toStr}`,
            deviceId: MDG.getOrCreateDeviceId(),
            deviceName: MDG.getDeviceName()
          });
        }
        if (window.MDG && MDG.toast) {
          MDG.toast(`🔔 Audit: ${changes.length} cambiamenti di sicurezza rilevati`);
        }
        // Notifica di sistema – funziona anche in background (PWA installata)
        if (window.MDG && MDG.notifications) {
          const title = worstSeverity === 'danger'
            ? '🚨 Cambiamenti critici sicurezza'
            : '🔔 Cambiamenti sicurezza rilevati';
          const summary = changes.slice(0, 3).map(c => c.key).join(', ') +
            (changes.length > 3 ? ` e altri ${changes.length - 3}` : '');
          MDG.notifications.notify(title, {
            body: `${summary} su ${MDG.getDeviceName() || 'device'}. Tocca per dettagli.`,
            severity: worstSeverity,
            tag: 'mdg-security-change',
            data: { url: 'security.html' }
          });
        }
      }

      setLastSnapshot(snap);
      return { snap, changes };
    } catch (e) {
      console.warn('Scheduled audit error', e);
    }
  }

  function startAutoAudit() {
    stopAutoAudit();
    // Prima esecuzione dopo un piccolo delay per non pesare sull'avvio
    setTimeout(() => runScheduledAudit(), STARTUP_DELAY_MS);
    const interval = getIntervalMinutes() * 60 * 1000;
    schedTimer = setInterval(() => runScheduledAudit(), interval);
  }

  function stopAutoAudit() {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  }

  // Avvio automatico se abilitato dall'utente
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      if (getAutoEnabled()) startAutoAudit();
    });
    // Quando l'utente torna sulla PWA dopo un po', forza un check
    document.addEventListener && document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && getAutoEnabled()) {
        const prev = getLastSnapshot();
        const age = prev ? Date.now() - (prev.ts || 0) : Infinity;
        const threshold = getIntervalMinutes() * 60 * 1000;
        if (age > threshold) runScheduledAudit();
      }
    });
  }

  window.MDG = Object.assign(window.MDG || {}, {
    security: {
      runAudit,
      startTypingWatcher, stopTypingWatcher,
      listHidDevices, requestHidDevice,
      // Scheduler
      getAutoEnabled, setAutoEnabled,
      getIntervalMinutes, setIntervalMinutes,
      getLastSnapshot,
      runScheduledAudit
    }
  });
})();
