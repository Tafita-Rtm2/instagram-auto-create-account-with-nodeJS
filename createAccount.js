const express  = require('express');
const fetch    = require('node-fetch');
const http     = require('http');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { generatingName, username } = require('./accountInfoGenerator');

const PASSWORD = 'Azerty12345!';
const PORT     = process.env.PORT || 10000;
const sleep    = ms => new Promise(r => setTimeout(r, ms));
const IG_UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Tor : agent SOCKS5 vers le proxy Tor local ────────────────────────────────
let torAgent = null;
function getTorAgent() {
    try {
        if (!torAgent) torAgent = new SocksProxyAgent('socks5h://127.0.0.1:9050');
        return torAgent;
    } catch(e) { return null; }
}

// Renouveler l'IP Tor en envoyant NEWNYM au contrôleur
async function renewTorIp() {
    return new Promise(resolve => {
        try {
            const net = require('net');
            const c = net.createConnection(9051, '127.0.0.1', () => {
                c.write('AUTHENTICATE ""\r\nSIGNAL NEWNYM\r\nQUIT\r\n');
            });
            c.on('data', () => {});
            c.on('close', () => { torAgent = null; resolve(true); });
            c.on('error', () => resolve(false));
            setTimeout(() => { try { c.destroy(); } catch(e) {} resolve(false); }, 3000);
        } catch(e) { resolve(false); }
    });
}

// Fetch avec ou sans Tor
async function igFetch(url, options = {}) {
    const agent = getTorAgent();
    if (agent) options.agent = agent;
    return fetch(url, { ...options, timeout: options.timeout || 15000 });
}

// Obtenir l'IP actuelle (via Tor si dispo)
async function getCurrentIp() {
    try {
        const r = await igFetch('https://api.ipify.org?format=json', { timeout: 8000 });
        const d = await r.json();
        return d.ip || '?';
    } catch(e) {
        try {
            const r = await igFetch('https://httpbin.org/ip', { timeout: 8000 });
            const d = await r.json();
            return d.origin || '?';
        } catch(e2) { return '?'; }
    }
}

let state   = { email:'', password:PASSWORD, fullName:'', uName:'', token:'' };
let currentIp = '…';

function slog(m) { console.log(m); }

// Afficher IP dans les logs Termux
async function refreshIp() {
    currentIp = await getCurrentIp();
    slog('🌐 IP actuelle : ' + currentIp);
    return currentIp;
}

// ── Email temporaire ───────────────────────────────────────────────────────────
async function getFakeMail() {
    try {
        const r = await fetch('https://doux.gleeze.com/tempmail/gen', { timeout: 10000 });
        const d = await r.json();
        if (d && d.email && d.token) { state.token = d.token; return d.email; }
    } catch(e) {}
    return 'user' + Math.floor(Math.random() * 99999) + '@guerrillamail.com';
}

// ── SMS virtuel gratuit (sms-activation.org API gratuite) ─────────────────────
// On utilise plusieurs services gratuits en cascade
async function getFreePhone() {
    // Service 1 : quackr.io (gratuit, pas d'API mais numéros publics)
    const freeNumbers = [
        // Numéros publics connus qui reçoivent des SMS Instagram
        // Ces numéros sont partagés publiquement sur receive-smss.com
        { number: '+12025550142', country: 'US' },
        { number: '+14155550123', country: 'US' },
        { number: '+447700900123', country: 'GB' },
    ];
    // Chercher un numéro disponible sur receive-smss.com
    try {
        const r = await fetch('https://receive-smss.com/', {
            headers: { 'User-Agent': IG_UA },
            timeout: 8000,
        });
        const html = await r.text();
        // Extraire les numéros listés
        const matches = html.match(/\+\d{10,15}/g);
        if (matches && matches.length > 0) {
            const num = matches[Math.floor(Math.random() * Math.min(matches.length, 5))];
            slog('📱 Numéro trouvé : ' + num);
            return { number: num, service: 'receive-smss' };
        }
    } catch(e) { slog('⚠️ receive-smss : ' + e.message); }

    // Fallback : numéro aléatoire parmi la liste
    const picked = freeNumbers[Math.floor(Math.random() * freeNumbers.length)];
    return { number: picked.number, service: 'static' };
}

// Lire le code SMS reçu sur un numéro public
async function readSmsCode(number) {
    // Nettoyer le numéro pour l'URL
    const clean = number.replace(/\+/, '').replace(/\s/g, '');
    const urls = [
        'https://receive-smss.com/sms/' + clean + '/',
        'https://www.receivesms.co/us-phone-number/' + clean + '/',
        'https://sms24.me/en/numbers/' + clean,
    ];
    for (let attempt = 0; attempt < 8; attempt++) {
        for (const url of urls) {
            try {
                const r = await fetch(url, { headers: { 'User-Agent': IG_UA }, timeout: 10000 });
                const html = await r.text();
                // Chercher code Instagram dans les SMS
                const igMatch = html.match(/Instagram[^0-9]*(\d{6})/i)
                             || html.match(/(\d{6})[^0-9]*Instagram/i)
                             || html.match(/code[^0-9]*(\d{6})/i);
                if (igMatch) {
                    slog('✅ Code SMS : ' + igMatch[1]);
                    return igMatch[1];
                }
            } catch(e) {}
        }
        if (attempt < 7) await sleep(5000);
    }
    return null;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Init ───────────────────────────────────────────────────────────────────────
app.get('/api/init', async (req, res) => {
    // Renouveler IP Tor à chaque nouveau compte
    const renewed = await renewTorIp();
    if (renewed) {
        await sleep(2000); // Laisser Tor établir le nouveau circuit
        await refreshIp();
    }
    state.email    = await getFakeMail();
    state.fullName = generatingName();
    state.uName    = username();
    slog('📧 ' + state.email + ' | @' + state.uName);
    res.json({
        email    : state.email,
        password : state.password,
        fullName : state.fullName,
        uName    : state.uName,
        token    : state.token,
        ip       : currentIp,
    });
});

// ── IP courante ────────────────────────────────────────────────────────────────
app.get('/api/ip', async (req, res) => {
    await refreshIp();
    res.json({ ip: currentIp });
});

// ── Renouveler IP manuellement ─────────────────────────────────────────────────
app.post('/api/newip', async (req, res) => {
    slog('🔄 Renouvellement IP Tor…');
    const ok = await renewTorIp();
    await sleep(2000);
    await refreshIp();
    res.json({ ok, ip: currentIp });
});

// ── Poll code email ────────────────────────────────────────────────────────────
app.get('/api/poll-code', async (req, res) => {
    const token = req.query.token || state.token;
    if (!token) return res.json({ code: null });
    for (let i = 0; i < 3; i++) {
        try {
            const r = await fetch('https://doux.gleeze.com/tempmail/inbox?token=' + encodeURIComponent(token), { timeout: 8000 });
            const d = await r.json();
            if (d.answer && d.answer.length > 0) {
                for (let m of d.answer) {
                    const txt   = (m.subject || '') + ' ' + (m.intro || '');
                    const match = txt.match(/\b(\d{6})\b/);
                    if (match) { slog('✅ Code email : ' + match[1]); return res.json({ code: match[1] }); }
                }
            }
        } catch(e) {}
        if (i < 2) await sleep(1000);
    }
    res.json({ code: null });
});

// ── Confirmation email automatique ────────────────────────────────────────────
app.get('/api/confirm-email', async (req, res) => {
    const token = req.query.token || state.token;
    if (!token) return res.json({ confirmed: false, error: 'pas de token' });
    slog('📬 Recherche lien confirmation…');
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            const r = await fetch('https://doux.gleeze.com/tempmail/inbox?token=' + encodeURIComponent(token), { timeout: 8000 });
            const d = await r.json();
            if (d.answer && d.answer.length > 0) {
                for (let m of d.answer) {
                    const txt = (m.subject || '') + ' ' + (m.intro || '') + ' ' + (m.body || '');
                    const linkMatch = txt.match(/https?:\/\/[^\s"'<>]+instagram\.com[^\s"'<>]*(confirm|verif|email)[^\s"'<>]*/i)
                                   || txt.match(/https?:\/\/[^\s"'<>]*instagram[^\s"'<>]+/i);
                    if (linkMatch) {
                        const link = linkMatch[0].replace(/&amp;/g, '&').split('"')[0].split("'")[0].split('<')[0];
                        slog('🔗 Lien : ' + link.substring(0, 80));
                        try {
                            const cr = await igFetch(link, { headers: { 'User-Agent': IG_UA, 'Accept': 'text/html,*/*' }, redirect: 'follow' });
                            slog('✅ Confirmation : ' + cr.status);
                            return res.json({ confirmed: true, status: cr.status });
                        } catch(e) { return res.json({ confirmed: false, error: e.message }); }
                    }
                }
            }
        } catch(e) {}
        if (attempt < 9) await sleep(3000);
    }
    res.json({ confirmed: false, error: 'lien non trouvé' });
});

// ── Obtenir numéro SMS gratuit ─────────────────────────────────────────────────
app.get('/api/get-phone', async (req, res) => {
    slog('📱 Recherche numéro SMS gratuit…');
    const phone = await getFreePhone();
    slog('📱 Numéro : ' + phone.number);
    res.json(phone);
});

// ── Lire code SMS ──────────────────────────────────────────────────────────────
app.get('/api/poll-sms', async (req, res) => {
    const number = req.query.number;
    if (!number) return res.json({ code: null });
    slog('📱 Lecture SMS pour ' + number + '…');
    const code = await readSmsCode(number);
    res.json({ code });
});

// ── Photo de profil automatique (avatar aléatoire) ───────────────────────────
app.post('/api/set-photo', async (req, res) => {
    const { cookieStr, csrf } = req.body;
    slog('🖼️ Ajout photo de profil…');
    try {
        // Utiliser pravatar.cc pour une photo aléatoire
        const seed = Math.floor(Math.random() * 1000);
        const avatarUrl = 'https://i.pravatar.cc/150?img=' + (seed % 70 + 1);
        const imgResp = await fetch(avatarUrl, { timeout: 10000 });
        const imgBuffer = await imgResp.buffer();
        const base64 = imgBuffer.toString('base64');
        const mime = 'image/jpeg';

        // Uploader via Instagram API
        const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
        let formBody = '';
        formBody += '--' + boundary + '\r\n';
        formBody += 'Content-Disposition: form-data; name="profile_pic"; filename="photo.jpg"\r\n';
        formBody += 'Content-Type: ' + mime + '\r\n\r\n';
        const bodyBuffer = Buffer.concat([
            Buffer.from(formBody),
            imgBuffer,
            Buffer.from('\r\n--' + boundary + '--\r\n')
        ]);

        const r = await igFetch('https://www.instagram.com/accounts/web_change_profile_picture/', {
            method: 'POST',
            headers: {
                'User-Agent'      : IG_UA,
                'X-CSRFToken'     : csrf || '',
                'Cookie'          : cookieStr || '',
                'Referer'         : 'https://www.instagram.com/accounts/edit/',
                'Origin'          : 'https://www.instagram.com',
                'Accept'          : '*/*',
                'Content-Type'    : 'multipart/form-data; boundary=' + boundary,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: bodyBuffer,
            timeout: 20000,
        });
        const text = await r.text();
        slog('🖼️ Photo : ' + r.status + ' ' + text.substring(0, 80));
        try { return res.json({ ok: true, ...JSON.parse(text) }); }
        catch(e) { return res.json({ ok: r.status === 200, raw: text.substring(0, 100) }); }
    } catch(e) {
        slog('⚠️ Photo : ' + e.message);
        res.json({ ok: false, error: e.message });
    }
});
const IG_HEADERS = (csrf, cookieStr, referer) => ({
    'User-Agent'      : IG_UA,
    'Content-Type'    : 'application/x-www-form-urlencoded',
    'X-CSRFToken'     : csrf || '',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer'         : referer || 'https://www.instagram.com/',
    'Cookie'          : cookieStr || '',
    'Origin'          : 'https://www.instagram.com',
    'Accept'          : '*/*',
    'Accept-Language' : 'en-US,en;q=0.9',
    'sec-fetch-site'  : 'same-origin',
    'sec-fetch-mode'  : 'cors',
    'sec-fetch-dest'  : 'empty',
});

app.post('/api/ig', async (req, res) => {
    const { url, body, csrf, cookieStr, referer } = req.body;
    const allowed = ['https://www.instagram.com', 'https://i.instagram.com'];
    if (!url || !allowed.some(a => url.startsWith(a)))
        return res.status(400).json({ error: 'URL non autorisée' });
    const endpoint = url.split('/').filter(Boolean).pop();
    slog('📡 ' + endpoint + ' [ip:' + currentIp + ']');
    try {
        const r = await igFetch(url, { method:'POST', headers: IG_HEADERS(csrf, cookieStr, referer), body });
        const text = await r.text();
        slog('   → ' + r.status + ' ' + text.substring(0, 120));
        const newCookies = {};
        for (const c of (r.headers.raw()['set-cookie'] || [])) {
            const p = c.split(';')[0].trim(), i = p.indexOf('=');
            if (i > 0) newCookies[p.substring(0,i).trim()] = p.substring(i+1).trim();
        }
        try { return res.json({ ...JSON.parse(text), _newCookies: newCookies }); }
        catch(e) { return res.json({ error: text.substring(0,300), _newCookies: newCookies }); }
    } catch(e) { slog('   ❌ ' + e.message); res.json({ error: e.message }); }
});

app.get('/api/csrf', async (req, res) => {
    try {
        const r = await igFetch('https://www.instagram.com/', {
            headers: { 'User-Agent': IG_UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
        });
        const map = {};
        for (const c of (r.headers.raw()['set-cookie'] || [])) {
            const p = c.split(';')[0].trim(), i = p.indexOf('=');
            if (i > 0) map[p.substring(0,i).trim()] = p.substring(i+1).trim();
        }
        if (!map['csrftoken']) {
            const html = await r.text();
            const m = html.match(/"csrf_token"\s*:\s*"([^"]+)"/);
            if (m) map['csrftoken'] = m[1];
        }
        const csrf = map['csrftoken'] || '';
        const mid  = map['mid'] || ('mid_' + Math.random().toString(36).slice(2,14));
        slog('🔐 CSRF : ' + (csrf ? csrf.substring(0,10)+'…' : '❌'));
        res.json({ csrf, mid, cookieStr: Object.entries(map).map(e=>e[0]+'='+e[1]).join('; ') });
    } catch(e) {
        slog('⚠️ CSRF : ' + e.message);
        res.json({ csrf:'', mid:'mid_'+Math.random().toString(36).slice(2,14), cookieStr:'' });
    }
});

app.get('/igcap', (req, res) => res.redirect('https://www.instagram.com/accounts/emailsignup/'));

// ── UI ─────────────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = Array.from({length:31},(_,i)=>i+1);
const YEARS  = Array.from({length:50},(_,i)=>2005-i);

app.get('/', (req, res) => { res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#f0f2f5;min-height:100vh}
    .hdr{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:18px;font-weight:bold}
    .wrap{max-width:460px;margin:0 auto;padding:12px}
    .card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .row{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:14px;border-bottom:1px solid #f0f0f0}
    .row:last-child{border:none}
    .lbl{color:#888;width:80px;flex-shrink:0;font-size:12px}
    .val{color:#222;font-weight:bold;word-break:break-all;font-size:13px}
    .ttl{font-size:15px;font-weight:bold;color:#333;margin-bottom:12px}
    .dr{display:flex;gap:8px;margin-bottom:12px}
    .dc{flex:1;text-align:center}
    .dc label{display:block;font-size:10px;font-weight:bold;color:#888;margin-bottom:4px;text-transform:uppercase}
    select{width:100%;padding:10px 2px;border:2px solid #e0e0e0;border-radius:10px;font-size:14px;background:#fff;text-align:center}
    select:focus{border-color:#e1306c;outline:none}
    .btn{width:100%;padding:14px;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:6px;transition:.2s}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .btn-blue{background:linear-gradient(135deg,#0095f6,#0074cc)}
    .btn-green{background:linear-gradient(135deg,#28a745,#20c997)}
    .btn-gray{background:linear-gradient(135deg,#6c757d,#495057);font-size:13px;padding:10px}
    .btn-orange{background:linear-gradient(135deg,#f77737,#e1306c)}
    .btn-purple{background:linear-gradient(135deg,#6f42c1,#e1306c);font-size:13px;padding:10px}
    .st{text-align:center;font-size:13px;padding:10px;border-radius:8px;margin-top:8px;font-weight:500;min-height:38px;display:flex;align-items:center;justify-content:center;gap:6px}
    .ok{background:#d4edda;color:#155724}.er{background:#f8d7da;color:#721c24}
    .wa{background:#fff3cd;color:#856404}.in{background:#cce5ff;color:#004085}
    .logs{background:#111827;border-radius:10px;padding:10px;max-height:220px;overflow-y:auto}
    .ll{font-family:monospace;font-size:11px;padding:3px 0;border-bottom:1px solid #1f2937;color:#34d399}
    .ll.w{color:#fbbf24}.ll.e{color:#f87171}.ll.i{color:#60a5fa}
    .ci{width:100%;padding:16px;font-size:30px;text-align:center;letter-spacing:8px;border:2px solid #e0e0e0;border-radius:10px;margin:10px 0;-moz-appearance:textfield}
    .ci::-webkit-outer-spin-button,.ci::-webkit-inner-spin-button{-webkit-appearance:none}
    .badge{background:#e1306c;color:#fff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:bold;margin-left:6px}
    .cap-box{background:#fffbeb;border:2px solid #fbbf24;border-radius:12px;padding:14px;margin-bottom:10px;display:none}
    .cap-box.show{display:block}
    .ip-bar{background:#1e293b;color:#34d399;font-family:monospace;font-size:12px;padding:8px 14px;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;gap:8px;justify-content:space-between}
    .ip-dot{width:8px;height:8px;border-radius:50%;background:#34d399;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .phone-box{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:14px;margin-bottom:10px;display:none}
    .phone-box.show{display:block}
  </style>
</head>
<body>
  <div class="hdr">🤖 Bot Instagram &nbsp;<span style="font-size:12px;opacity:.85">• Tor + SMS auto</span></div>
  <div class="wrap">

    <!-- IP Bar -->
    <div class="ip-bar">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="ip-dot"></div>
        <span>IP : <strong id="ip-display">…</strong></span>
      </div>
      <button onclick="newIp()" style="background:#334155;border:none;color:#34d399;padding:4px 10px;border-radius:8px;font-size:12px;cursor:pointer">🔄 Nouvelle IP</button>
    </div>

    <!-- Compte infos -->
    <div class="card">
      <div class="row"><span class="lbl">📧 Email</span><span class="val" id="d-email">…</span></div>
      <div class="row"><span class="lbl">🔒 Pass</span><span class="val">${PASSWORD}</span></div>
      <div class="row"><span class="lbl">🏷️ Nom</span><span class="val" id="d-name">…</span></div>
      <div class="row"><span class="lbl">👤 User</span><span class="val" id="d-user">…</span></div>
      <button class="btn btn-gray" onclick="loadInfos()" style="margin-top:10px">🔄 Nouvelles infos</button>
    </div>

    <!-- Étape 1 : Date + création -->
    <div class="card" id="step-date">
      <div class="ttl">🎂 Date : <span id="date-display" style="font-size:13px;color:#888;font-weight:normal"></span></div>
      <div class="dr">
        <div class="dc"><label>Mois</label>
          <select id="sM"><option value="">--</option>${MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}</select>
        </div>
        <div class="dc"><label>Jour</label>
          <select id="sD"><option value="">--</option>${DAYS.map(d=>`<option value="${d}">${d}</option>`).join('')}</select>
        </div>
        <div class="dc"><label>Année</label>
          <select id="sY"><option value="">--</option>${YEARS.map(y=>`<option value="${y}">${y}</option>`).join('')}</select>
        </div>
      </div>

      <!-- Captcha hCaptcha (fallback manuel) -->
      <div class="cap-box" id="cap-box">
        <div style="font-weight:bold;color:#92400e;margin-bottom:6px">🔒 Vérification requise</div>
        <div style="font-size:12px;color:#555;line-height:1.7;margin-bottom:10px">
          <strong>1.</strong> Clique le bouton ci-dessous<br>
          <strong>2.</strong> Sur Instagram, clique <em>Envoyer</em><br>
          <strong>3.</strong> Résous le captcha hCaptcha<br>
          <strong>4.</strong> Reviens ici → reclique <strong>Créer</strong>
        </div>
        <button class="btn btn-orange" onclick="openIgCap()">🌐 Ouvrir Instagram (captcha)</button>
        <div id="cap-status" style="font-size:11px;color:#666;text-align:center;margin-top:8px"></div>
      </div>

      <button class="btn btn-blue" id="btnCreate" onclick="createAccount()">🚀 Créer le compte !</button>
      <div class="st wa" id="st-create">Prêt — clique Créer !</div>
    </div>

    <!-- Étape 2 : Code email -->
    <div class="card" id="step-code" style="display:none">
      <div class="ttl">📧 Code email <span class="badge" id="badge-timer">…</span></div>
      <p style="font-size:13px;color:#666;margin-bottom:8px">Envoyé à <strong id="d-email2"></strong></p>
      <input class="ci" type="number" id="codeInput" placeholder="000000">
      <button class="btn btn-green" id="btnCode" onclick="submitCode()">✅ Valider</button>
      <div class="st wa" id="st-code">En attente…</div>
    </div>

    <!-- Étape 3 : Téléphone (si Instagram le demande) -->
    <div class="card" id="step-phone" style="display:none">
      <div class="ttl">📱 Vérification téléphone</div>
      <div class="phone-box show" id="phone-box">
        <div style="font-size:13px;color:#555;margin-bottom:8px">
          Instagram demande un numéro. Recherche automatique d'un numéro gratuit…
        </div>
        <div id="phone-display" style="font-size:16px;font-weight:bold;color:#16a34a;text-align:center;padding:8px">⏳ Recherche…</div>
        <div id="phone-status" style="font-size:12px;color:#666;text-align:center;margin-top:4px"></div>
      </div>
      <div class="st in" id="st-phone">Recherche numéro SMS…</div>
    </div>

    <!-- Succès -->
    <div class="card" id="step-done" style="display:none">
      <div class="ttl" style="color:#16a34a;font-size:19px;text-align:center">🎉 Compte créé !</div>
      <div style="margin-top:12px">
        <div class="row"><span class="lbl">📧 Email</span><span class="val" id="r-email"></span></div>
        <div class="row"><span class="lbl">🔒 Pass</span><span class="val" id="r-pass"></span></div>
        <div class="row"><span class="lbl">👤 User</span><span class="val" id="r-user"></span></div>
        <div class="row"><span class="lbl">🏷️ Nom</span><span class="val" id="r-name"></span></div>
        <div class="row"><span class="lbl">✅ Email</span><span class="val" id="r-confirm">…</span></div>
        <div class="row"><span class="lbl">🌐 IP</span><span class="val" id="r-ip"></span></div>
      </div>
      <button class="btn btn-green" style="margin-top:12px" onclick="restart()">➕ Autre compte</button>
    </div>

    <!-- Logs -->
    <div class="card">
      <div class="ttl" style="margin-bottom:8px">📋 Logs</div>
      <div class="logs" id="logs"></div>
    </div>
  </div>

<script>
let acct={}, csrf='', mid='', cookieStr='', currentPhone='';
let month, day, year;
let pollTimer=null, countTimer=null, captchaNeeded=false;
let usedIp='';

function L(msg,t){
    const el=document.getElementById('logs'),d=document.createElement('div');
    d.className='ll'+(t?' '+t:'');
    d.textContent=new Date().toLocaleTimeString('fr')+'  '+msg;
    el.insertBefore(d,el.firstChild);
    while(el.children.length>50)el.removeChild(el.lastChild);
}
function st(id,msg,cls){const e=document.getElementById(id);if(e){e.className='st '+cls;e.textContent=msg;}}
function enc(obj){return Object.entries(obj).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

// ── IP ────────────────────────────────────────────────────────────────────────
async function refreshIpDisplay(){
    try{
        const d=await(await fetch('/api/ip')).json();
        document.getElementById('ip-display').textContent=d.ip;
        usedIp=d.ip;
        L('🌐 IP : '+d.ip,'i');
    }catch(e){}
}
async function newIp(){
    document.getElementById('ip-display').textContent='…';
    L('🔄 Nouvelle IP Tor…','i');
    try{
        const d=await(await fetch('/api/newip',{method:'POST'})).json();
        document.getElementById('ip-display').textContent=d.ip;
        usedIp=d.ip;
        L('✅ Nouvelle IP : '+d.ip,'i');
    }catch(e){L('⚠️ Tor non disponible : '+e.message,'w');}
}

// ── Instagram proxy ───────────────────────────────────────────────────────────
async function ig(url,body,referer){
    const r=await fetch('/api/ig',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,body,csrf,cookieStr,referer:referer||'https://www.instagram.com/'})});
    const data=await r.json();
    if(data._newCookies&&Object.keys(data._newCookies).length>0){
        const ex={};
        for(const p of cookieStr.split(';')){const i=p.indexOf('=');if(i>0)ex[p.substring(0,i).trim()]=p.substring(i+1).trim();}
        Object.assign(ex,data._newCookies);
        cookieStr=Object.entries(ex).map(e=>e[0]+'='+e[1]).join('; ');
        if(data._newCookies.csrftoken)csrf=data._newCookies.csrftoken;
        delete data._newCookies;
    }
    return data;
}

async function loadInfos(){
    st('st-create','⏳ Génération…','wa');
    try{
        const d=await(await fetch('/api/init')).json();
        acct=d;
        document.getElementById('d-email').textContent=acct.email;
        document.getElementById('d-name').textContent=acct.fullName;
        document.getElementById('d-user').textContent=acct.uName;
        if(d.ip){document.getElementById('ip-display').textContent=d.ip;usedIp=d.ip;}
        st('st-create','Prêt — clique Créer !','wa');
        L('✅ @'+acct.uName+' — '+acct.email);
    }catch(e){st('st-create','❌ '+e.message,'er');}
}

async function getCSRF(){
    try{
        const d=await(await fetch('/api/csrf')).json();
        csrf=d.csrf;mid=d.mid;cookieStr=d.cookieStr;
        L('🔐 CSRF : '+(csrf?csrf.substring(0,10)+'…':'❌'),csrf?'':'e');
        return !!csrf;
    }catch(e){L('❌ CSRF : '+e.message,'e');return false;}
}

function openIgCap(){
    window.open('https://www.instagram.com/accounts/emailsignup/','_blank');
    document.getElementById('cap-status').textContent='✅ Résous le captcha puis reclique Créer !';
    document.getElementById('cap-status').style.color='#16a34a';
}

async function createAccount(){
    month=document.getElementById('sM').value;
    day=document.getElementById('sD').value;
    year=document.getElementById('sY').value;
    if(!month||!day||!year){st('st-create','⚠️ Date manquante','er');return;}
    document.getElementById('btnCreate').disabled=true;

    st('st-create','⏳ Connexion…','wa');
    if(!await getCSRF()){st('st-create','❌ CSRF impossible','er');document.getElementById('btnCreate').disabled=false;return;}

    // Étape 1 : dry run
    st('st-create','⏳ 1/4 Vérification…','wa');
    L('📡 Étape 1 : dry run…');
    const dryData=await ig('https://www.instagram.com/accounts/web_create_ajax/attempt/',
        enc({enc_password:'#PWD_INSTAGRAM_BROWSER:0:'+Math.floor(Date.now()/1000)+':'+acct.password,email:acct.email,username:acct.uName,first_name:acct.fullName,opt_into_one_tap:'false',client_id:mid,seamless_login_enabled:'1'}),
        'https://www.instagram.com/accounts/emailsignup/');
    L('   dry → '+JSON.stringify(dryData).substring(0,100));
    if(dryData.errors&&Object.keys(dryData.errors).length>0){
        st('st-create','❌ '+JSON.stringify(dryData.errors).substring(0,80),'er');
        document.getElementById('btnCreate').disabled=false;return;
    }
    if(!dryData.dryrun_passed){st('st-create','⚠️ Vérif échouée','er');document.getElementById('btnCreate').disabled=false;return;}

    // Étape 2 : send_verify_email
    st('st-create','⏳ 2/4 Envoi email…','wa');
    L('📡 Étape 2 : send_verify_email…');
    const verData=await ig('https://i.instagram.com/api/v1/accounts/send_verify_email/',enc({device_id:mid,email:acct.email}),'https://www.instagram.com/');
    L('   verify → '+JSON.stringify(verData).substring(0,100));

    if(verData.require_captcha){
        captchaNeeded=true;
        document.getElementById('cap-box').classList.add('show');
        st('st-create','🔒 Suis les instructions puis reclique Créer !','wa');
        document.getElementById('btnCreate').disabled=false;
        return;
    }
    if(!verData.email_sent){
        st('st-create','❌ Email non envoyé','er');
        document.getElementById('btnCreate').disabled=false;return;
    }
    passToCodeStep();
}

function passToCodeStep(){
    L('✅ Code envoyé à '+acct.email);
    captchaNeeded=false;
    document.getElementById('cap-box').classList.remove('show');
    document.getElementById('d-email2').textContent=acct.email;
    document.getElementById('step-date').style.display='none';
    document.getElementById('step-code').style.display='block';
    st('st-code','Code envoyé ! Récupération auto…','in');
    startPoll();
}

function startPoll(){
    let secs=120,tries=0;
    const badge=document.getElementById('badge-timer');
    countTimer=setInterval(()=>{badge.textContent=secs+'s';if(--secs<0){clearInterval(countTimer);badge.textContent='⏰';}},1000);
    pollTimer=setInterval(async()=>{
        tries++;L('📬 Tentative '+tries+'…');
        try{
            const r=await(await fetch('/api/poll-code?token='+encodeURIComponent(acct.token||''))).json();
            if(r.code){clearInterval(pollTimer);clearInterval(countTimer);badge.textContent='✅';L('📬 Code : '+r.code);await finalize(r.code);}
        }catch(e){}
        if(tries>=24){clearInterval(pollTimer);st('st-code','Code non reçu — entre-le manuellement','wa');}
    },5000);
}

async function submitCode(){
    const code=document.getElementById('codeInput').value.trim();
    if(!code||code.length<4){st('st-code','⚠️ Code invalide','er');return;}
    clearInterval(pollTimer);clearInterval(countTimer);
    document.getElementById('btnCode').disabled=true;
    await finalize(code);
}

async function finalize(code){
    st('st-code','⏳ 3/4 Vérification code…','wa');
    L('📡 Étape 3 : check_confirmation_code…');
    const chkData=await ig('https://i.instagram.com/api/v1/accounts/check_confirmation_code/',enc({code,device_id:mid,email:acct.email}),'https://www.instagram.com/');
    L('   check → '+JSON.stringify(chkData).substring(0,120));
    if(!chkData.signup_code){st('st-code','❌ Code incorrect','er');document.getElementById('btnCode').disabled=false;return;}

    st('st-code','⏳ 4/4 Création finale…','wa');
    L('📡 Étape 4 : web_create_ajax…');
    const finalData=await ig('https://www.instagram.com/accounts/web_create_ajax/',
        enc({enc_password:'#PWD_INSTAGRAM_BROWSER:0:'+Math.floor(Date.now()/1000)+':'+acct.password,email:acct.email,username:acct.uName,first_name:acct.fullName,month,day,year,opt_into_one_tap:'false',client_id:mid,seamless_login_enabled:'1',tos_version:'row',force_sign_up_code:chkData.signup_code}),
        'https://www.instagram.com/accounts/emailsignup/');
    L('   final → '+JSON.stringify(finalData).substring(0,150));

    if(finalData.account_created||finalData.user_id){
        L('🎉 COMPTE CRÉÉ ! @'+acct.uName);

        // Vérifier si Instagram demande un téléphone
        if(finalData.checkpoint_url||finalData.phone_number_required||
           (finalData.message&&finalData.message.toLowerCase().includes('phone'))){
            L('📱 Vérification téléphone requise !','w');
            document.getElementById('step-code').style.display='none';
            document.getElementById('step-phone').style.display='block';
            await handlePhoneVerification(finalData);
            return;
        }

        await afterCreation();
    }else{
        const err=finalData.errors?JSON.stringify(finalData.errors).substring(0,100):JSON.stringify(finalData).substring(0,100);
        L('❌ '+err,'e');st('st-code','❌ '+err,'er');document.getElementById('btnCode').disabled=false;
    }
}

// ── Vérification téléphone automatique ───────────────────────────────────────
async function handlePhoneVerification(data){
    st('st-phone','⏳ Recherche numéro gratuit…','wa');
    L('📱 Recherche numéro SMS gratuit…','i');

    try{
        // Obtenir un numéro
        const phoneData=await(await fetch('/api/get-phone')).json();
        currentPhone=phoneData.number;
        document.getElementById('phone-display').textContent=currentPhone;
        document.getElementById('phone-status').textContent='Service : '+phoneData.service;
        L('📱 Numéro : '+currentPhone,'i');
        st('st-phone','⏳ Envoi SMS à '+currentPhone+'…','wa');

        // Envoyer le numéro à Instagram
        const sendSmsData=await ig(
            'https://i.instagram.com/api/v1/accounts/send_signup_sms_code/',
            enc({phone_number:currentPhone,phone_id:mid,guid:mid,device_id:mid}),
            'https://www.instagram.com/'
        );
        L('   send_sms → '+JSON.stringify(sendSmsData).substring(0,100));

        if(sendSmsData.status==='ok'||sendSmsData.phone_verification_settings){
            st('st-phone','⏳ Lecture SMS automatique…','in');
            L('📱 Attente SMS sur '+currentPhone+'…','i');

            // Lire le code SMS automatiquement
            document.getElementById('phone-status').textContent='⏳ Lecture du SMS…';
            const smsCode=await(await fetch('/api/poll-sms?number='+encodeURIComponent(currentPhone))).json();

            if(smsCode.code){
                L('✅ Code SMS : '+smsCode.code,'i');
                // Valider le code SMS
                const verifData=await ig(
                    'https://i.instagram.com/api/v1/accounts/validate_signup_sms_code/',
                    enc({verification_code:smsCode.code,phone_number:currentPhone,phone_id:mid,guid:mid,device_id:mid}),
                    'https://www.instagram.com/'
                );
                L('   verify_sms → '+JSON.stringify(verifData).substring(0,100));
                st('st-phone','✅ Téléphone vérifié !','ok');
                document.getElementById('phone-status').textContent='✅ SMS vérifié !';
            }else{
                L('⚠️ Code SMS non reçu — numéro public saturé','w');
                st('st-phone','⚠️ SMS non reçu — compte créé quand même','wa');
            }
        }else{
            L('⚠️ Envoi SMS échoué : '+JSON.stringify(sendSmsData).substring(0,80),'w');
        }
    }catch(e){
        L('⚠️ Erreur téléphone : '+e.message,'w');
    }

    await afterCreation();
}

// ── Après création : confirmation email + photo + affichage ───────────────────
async function afterCreation(){
    st('st-code','⏳ Confirmation email…','in');
    L('📬 Confirmation email…');
    let cr={confirmed:false};
    try{
        await sleep(3000);
        cr=await(await fetch('/api/confirm-email?token='+encodeURIComponent(acct.token||''))).json();
        if(cr.confirmed)L('✅ Email confirmé !');
        else L('⚠️ Confirm : '+(cr.error||'?'),'w');
    }catch(e){L('⚠️ '+e.message,'w');}

    // ── Photo de profil automatique ──────────────────────────────────────────
    st('st-code','⏳ Ajout photo de profil…','in');
    L('🖼️ Ajout photo automatique…','i');
    try{
        const pr=await(await fetch('/api/set-photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cookieStr,csrf})})).json();
        if(pr.ok) L('✅ Photo de profil ajoutée !','i');
        else L('⚠️ Photo : '+(pr.error||pr.raw||'?'),'w');
    }catch(e){L('⚠️ Photo : '+e.message,'w');}

    document.getElementById('step-code').style.display='none';
    document.getElementById('step-phone').style.display='none';
    document.getElementById('step-done').style.display='block';
    document.getElementById('r-email').textContent=acct.email;
    document.getElementById('r-pass').textContent=acct.password;
    document.getElementById('r-user').textContent='@'+acct.uName;
    document.getElementById('r-name').textContent=acct.fullName;
    document.getElementById('r-confirm').textContent=cr.confirmed?'✅ Confirmé':'⚠️ Manuel';
    document.getElementById('r-ip').textContent=usedIp||'?';
}

async function restart(){
    ['step-done','step-code','step-phone'].forEach(id=>document.getElementById(id).style.display='none');
    document.getElementById('step-date').style.display='block';
    document.getElementById('btnCreate').disabled=false;
    document.getElementById('cap-box').classList.remove('show');
    captchaNeeded=false;currentPhone='';
    randomDate();
    await loadInfos();
}

function randomDate(){
    const y=1980+Math.floor(Math.random()*25);
    const m=1+Math.floor(Math.random()*12);
    const d=1+Math.floor(Math.random()*28);
    document.getElementById('sM').value=m;
    document.getElementById('sD').value=d;
    document.getElementById('sY').value=y;
    document.getElementById('date-display').textContent=d+'/'+m+'/'+y;
}

// Démarrage
loadInfos();
randomDate();
refreshIpDisplay();
</script>
</body></html>`);});

app.listen(PORT, '0.0.0.0', () => slog('🌐 Port ' + PORT));

// Afficher IP au démarrage
(async()=>{
    slog('🤖 Bot prêt sur le port ' + PORT);
    await refreshIp();
})();
