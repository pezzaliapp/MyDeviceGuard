/* MyDeviceGuard – common.js
 * Funzioni condivise: tema, identità device locale, utility, toast.
 * Tutto locale: nessun dato lascia il device se non via P2P esplicitamente abilitato.
 */

// ---------- TEMA ----------
(function initTheme() {
  const html = document.documentElement;
  const saved = localStorage.getItem('mdg.theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'dark'); // default dark
  html.setAttribute('data-theme', theme);
})();

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('mdg.theme', next);
}

// ---------- IDENTITÀ DEVICE ----------
// Ogni device ha:
//  - mdg.deviceId: UUID generato localmente (mai inviato in automatico)
//  - mdg.deviceName: nome scelto dall'utente (es. "MacBook Personale")
//  - mdg.deviceKind: laptop | desktop | smartphone | tablet | other

function getOrCreateDeviceId() {
  let id = localStorage.getItem('mdg.deviceId');
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
         ('mdg-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem('mdg.deviceId', id);
  }
  return id;
}

function getDeviceName() {
  return localStorage.getItem('mdg.deviceName') || '';
}

function setDeviceName(name) {
  localStorage.setItem('mdg.deviceName', name.trim());
}

function getDeviceKind() {
  return localStorage.getItem('mdg.deviceKind') || guessDeviceKind();
}

function setDeviceKind(kind) {
  localStorage.setItem('mdg.deviceKind', kind);
}

function guessDeviceKind() {
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone/.test(ua)) return 'smartphone';
  if (/mac|win|linux/.test(ua)) return 'laptop';
  return 'other';
}

// ---------- UTILITY ----------
function fmtDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleString(navigator.language || 'it-IT');
}

function fmtRelative(d) {
  const diff = Date.now() - new Date(d).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return s + 's fa';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm fa';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h fa';
  const dd = Math.floor(h / 24);
  return dd + 'g fa';
}

function toast(msg, ms = 2200) {
  let el = document.getElementById('mdg-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mdg-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- SERVICE WORKER ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('SW fail', e));
  });
}

// Espone globalmente
window.MDG = Object.assign(window.MDG || {}, {
  toggleTheme,
  getOrCreateDeviceId,
  getDeviceName, setDeviceName,
  getDeviceKind, setDeviceKind, guessDeviceKind,
  fmtDate, fmtRelative, toast
});
