# 🛡️ MyDeviceGuard

**MyDeviceGuard** è una **Progressive Web App (PWA)** privacy-first che permette a ogni utente di:

- Tenere traccia di quando i propri device (laptop, smartphone, tablet) vengono aperti/usati
- Eseguire un **audit diagnostico di sicurezza** sul proprio browser e device
- Vedere da remoto lo stato dei propri device accoppiati, via **canale P2P cifrato**
- Rilevare comportamenti anomali (es. raffiche di tasti stile Rubber Ducky / BadUSB)

> **Zero server centrali. Zero account. Zero cloud.**
> I dati stanno nel browser (IndexedDB). La comunicazione tra device avviene in **WebRTC peer-to-peer**, cifrata anche a livello applicativo con AES-GCM.

---

## ✨ Funzionalità

| Pagina | Descrizione |
|---|---|
| `index.html` | Onboarding, impostazione nome device, navigazione |
| `tracker.html` | Registra sessioni del device + ricevitore P2P |
| `controller.html` | Connetti e interroga i device accoppiati |
| `security.html` | Audit diagnostico completo del browser/device |
| `logs.html` | Log locali filtrabili + export CSV/JSON |
| `pairing.html` | Accoppia i device via QR code + chiave AES condivisa |

### 🔍 Cosa verifica il security audit

- Contesto sicuro (HTTPS), service worker, storage persistente e quota
- Permessi critici concessi (camera, microfono, notifiche, clipboard, geolocation…)
- Stato rete (tipo connessione, data saver), batteria, CPU, RAM
- Timezone, lingua, schermo, DPR
- Disponibilità **WebHID** e **WebUSB** con elenco dispositivi autorizzati
- User-Agent Client Hints (piattaforma/architettura reali)
- Rilevazione **digitazione anomala** (soglia di tasti/sec — porta del tuo script Python)

---

## 🔐 Privacy by design

- **Nessuna telemetria.** Nessuna chiamata a server di analytics, tracking, logging.
- **Nessun account.** L'identità del device è un UUID generato localmente.
- **Storage locale.** Eventi e alert salvati in IndexedDB, visibili solo sul browser corrente.
- **P2P opzionale.** La comunicazione tra device usa PeerJS (WebRTC). Il signaling server di PeerJS serve solo a mettere in contatto i due peer — i dati non transitano da lì. In più, i messaggi applicativi sono cifrati AES-GCM con una chiave generata al pairing e scambiata tramite QR code.
- **Un tasto per cancellare tutto.** Dalla home trovi "Cancella tutto" che azzera IndexedDB e localStorage.

---

## 🚀 Come funziona il pairing

1. Sul device da monitorare (es. laptop) apri `pairing.html` e premi **Genera codice di pairing**. Viene mostrato un QR.
2. Sull'altro device (es. smartphone) apri `pairing.html`, incolla o scansiona il codice, dai un nome al pairing e premi **Accoppia**.
3. Da quel momento, dal telefono apri `controller.html`, vedi il laptop in elenco e puoi interrogarlo: stato, log, audit.
4. Il laptop deve avere `tracker.html` aperto (o il ricevitore P2P attivo) per rispondere.

---

## 💻 Esecuzione in locale

Nessun build step. È HTML + JS + CSS statici.

```bash
git clone https://github.com/<TUO_USER>/MyDeviceGuard.git
cd MyDeviceGuard

# Server statico con Python
python3 -m http.server 5500

# oppure con Node
npx serve -l 5500
```

Apri: http://localhost:5500

> ⚠️ **HTTPS richiesto per il P2P e per alcune API (WebHID, Clipboard, ecc.)**
> In locale `localhost` è considerato "secure context". Per il deploy usa un dominio con certificato valido (GitHub Pages, Netlify, Cloudflare Pages ecc. vanno benissimo).

---

## 🌐 Deploy

### GitHub Pages

1. Fai il push del repo su GitHub.
2. Settings → Pages → Deploy from branch → `main` / root.
3. La PWA sarà su `https://<tuo-user>.github.io/MyDeviceGuard/`.

### Netlify / Vercel / Cloudflare Pages

Drag & drop della cartella, oppure collega il repo. Non serve nessuna configurazione.

---

## 📦 Struttura

```
MyDeviceGuard/
├── index.html            # home + onboarding
├── tracker.html          # registra sessioni + host P2P
├── controller.html       # client P2P verso i device accoppiati
├── security.html         # audit diagnostico
├── logs.html             # cronologia + export
├── pairing.html          # QR pairing
├── manifest.json
├── service-worker.js
├── css/style.css
├── js/
│   ├── common.js         # tema, identità device, utility
│   ├── db.js             # wrapper IndexedDB
│   ├── security.js       # audit + monitor digitazione + WebHID
│   └── peer.js           # WebRTC/PeerJS + AES-GCM
└── icon/
    ├── mydeviceguard-192.png
    └── mydeviceguard-512.png
```

---

## 🧪 Test della rilevazione anomalie

Sulla pagina **Security Audit**:
1. Premi "Monitor digitazione: OFF" per attivarlo.
2. Tieni premuto un tasto o digita molto velocemente (soglia: ~15 tasti/sec in 1s).
3. Compare un toast di alert e viene scritto un record nella tabella "Alert recenti".

La soglia è in `js/security.js` (`TYPING_THRESHOLD`). Puoi abbassarla per testare, o alzarla se sei un touch typist molto veloce.

---

## 📊 Export dati

Dalla pagina **Log** puoi esportare tutti gli eventi in **CSV** (per Excel/Numbers) o **JSON** (per backup completo, inclusi gli alert). Nessun dato viene inviato online: il file viene generato nel browser e scaricato localmente.

---

## 🔄 Aggiornare la cache PWA

Quando modifichi i file, cambia `CACHE_VERSION` in `service-worker.js`:

```js
const CACHE_VERSION = 'v2';
```

Alla riapertura la PWA installerà la nuova versione e scarterà la vecchia.

---

## 🗺️ Roadmap (idee)

- [ ] Heartbeat automatico periodico in background (Web Background Sync / Periodic Sync dove supportati)
- [ ] Notifica push locale su alert di sicurezza
- [ ] Sync opzionale tra i propri device via WebDAV / IPFS
- [ ] Whitelist HID (segnala solo dispositivi non noti)
- [ ] Tema claro/scuro automatico in base all'orario

---

## 📄 Licenza

MIT. Fork liberamente, adatta, contribuisci.

---

## 🙏 Crediti

Questo progetto nasce come evoluzione multi-utente, senza Firebase, di [AccessTracker_Remote_Control](https://github.com/pezzaliapp/AccessTracker_Remote_Control). Grazie all'autore originale per l'idea di base.
