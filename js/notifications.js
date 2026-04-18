/* MyDeviceGuard – notifications.js
 *
 * Notifiche locali di sistema (non push server-side).
 *
 * Usa l'API Web Notifications + Service Worker per generare notifiche che
 * appaiono nel centro notifiche del sistema operativo (macOS, iOS 16.4+,
 * Android, Windows, Linux). Non serve alcun server: la PWA stessa decide
 * quando notificare.
 *
 * Livelli:
 *  - off:    nessuna notifica
 *  - danger: solo alert critici
 *  - warn:   avvisi e critici (default)
 *  - all:    tutte le severity
 *
 * NOTA iOS: le notifiche funzionano solo se la PWA è installata come app
 * sulla schermata Home (iOS 16.4+). Non funzionano in Safari/Chrome web.
 */

(function () {
  const LS_LEVEL = 'mdg.notif.level';
  const LEVELS = ['off', 'danger', 'warn', 'all'];

  function isSupported() {
    return typeof Notification !== 'undefined';
  }

  function getPermission() {
    if (!isSupported()) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }

  async function requestPermission() {
    if (!isSupported()) throw new Error('Notifiche non supportate');
    const result = await Notification.requestPermission();
    return result;
  }

  function getLevel() {
    const v = localStorage.getItem(LS_LEVEL);
    return LEVELS.includes(v) ? v : 'warn';
  }

  function setLevel(v) {
    if (!LEVELS.includes(v)) return;
    localStorage.setItem(LS_LEVEL, v);
  }

  function shouldNotify(severity) {
    const level = getLevel();
    if (level === 'off') return false;
    if (level === 'all') return true;
    if (level === 'warn') return severity === 'warn' || severity === 'danger';
    if (level === 'danger') return severity === 'danger';
    return false;
  }

  /**
   * Genera una notifica locale di sistema.
   * Usa il service worker registration se presente (così la notifica appare
   * anche quando la PWA è in background). Fallback a Notification costruttore.
   */
  async function notify(title, { body = '', severity = 'info', tag, data = {}, silent = false } = {}) {
    if (!isSupported()) return false;
    if (getPermission() !== 'granted') return false;
    if (!shouldNotify(severity)) return false;

    const options = {
      body,
      icon: 'icon/mydeviceguard-192.png',
      badge: 'icon/mydeviceguard-192.png',
      tag: tag || ('mdg-' + Date.now()),
      data,
      silent,
      requireInteraction: severity === 'danger'
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          await reg.showNotification(title, options);
          return true;
        }
      }
      new Notification(title, options);
      return true;
    } catch (e) {
      console.warn('Notification failed', e);
      return false;
    }
  }

  window.MDG = Object.assign(window.MDG || {}, {
    notifications: {
      isSupported,
      getPermission,
      requestPermission,
      getLevel, setLevel,
      shouldNotify,
      notify
    }
  });
})();
