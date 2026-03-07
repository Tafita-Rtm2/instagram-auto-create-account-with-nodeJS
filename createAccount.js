const express = require('express');
const fetch   = require('node-fetch');
const { generatingName, username } = require('./accountInfoGenerator');

const PASSWORD = 'Azerty12345!';
const PORT     = process.env.PORT || 10000;
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// ─── État serveur (minimal — juste les infos compte et email) ────────────────
let state = { email:'', password:PASSWORD, fullName:'', uName:'', token:'' };
const serverLogs = [];
function slog(m) { console.log(m); serverLogs.push(m); if(serverLogs.length>30) serverLogs.shift(); }

// ─── Temp mail ────────────────────────────────────────────────────────────────
async function getFakeMail() {
    try {
        const r = await fetch('https://doux.gleeze.com/tempmail/gen', {timeout:10000});
        const d = await r.json();
        if (d && d.email && d.token) { state.token = d.token; return d.email; }
    } catch(e) {}
    return 'user' + Math.floor(Math.random()*99999) + '@guerrillamail.com';
}

// ─── Serveur Express ──────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── /api/init — génère de nouvelles infos compte ─────────────────────────────
app.get('/api/init', async (req, res) => {
    state.email    = await getFakeMail();
    state.fullName = generatingName();
    state.uName    = username();
    slog('📧 ' + state.email + ' | @' + state.uName);
    res.json({ email:state.email, password:state.password, fullName:state.fullName, uName:state.uName, token:state.token });
});

// ── /api/poll-code — poll email pour le code ──────────────────────────────────
app.get('/api/poll-code', async (req, res) => {
    const token = req.query.token || state.token;
    if (!token) return res.json({ code: null });
    for (let i = 0; i < 3; i++) {
        try {
            const r = await fetch('https://doux.gleeze.com/tempmail/inbox?token=' + encodeURIComponent(token), {timeout:8000});
            const d = await r.json();
            if (d.answer && d.answer.length > 0) {
                for (let m of d.answer) {
                    const txt = (m.subject||'') + ' ' + (m.intro||'');
                    const match = txt.match(/\b(\d{6})\b/);
                    if (match) { slog('✅ Code : ' + match[1]); return res.json({ code: match[1] }); }
                }
            }
        } catch(e) {}
        if (i < 2) await sleep(1000);
    }
    res.json({ code: null });
});

// ── /api/logs ─────────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => res.json({ logs: serverLogs.slice(-10) }));

// ── Page principale ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#f0f2f5;min-height:100vh}
    .hdr{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:17px;font-weight:bold}
    .sub{background:#333;color:#aaa;text-align:center;padding:6px;font-size:12px}
    .wrap{max-width:460px;margin:0 auto;padding:12px}
    .card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .row{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:14px;border-bottom:1px solid #f0f0f0}
    .row:last-child{border:none}
    .lbl{color:#888;width:70px;flex-shrink:0;font-size:12px}
    .val{color:#222;font-weight:bold;word-break:break-all;font-size:13px}
    .ttl{font-size:15px;font-weight:bold;color:#333;margin-bottom:12px}
    .dr{display:flex;gap:8px;margin-bottom:12px}
    .dc{flex:1;text-align:center}
    .dc label{display:block;font-size:10px;font-weight:bold;color:#888;margin-bottom:4px;text-transform:uppercase}
    select{width:100%;padding:10px 2px;border:2px solid #e0e0e0;border-radius:10px;font-size:14px;background:#fff;text-align:center}
    select:focus{border-color:#e1306c;outline:none}
    .btn{width:100%;padding:15px;background:linear-gradient(135deg,#0095f6,#0074cc);color:#fff;border:none;border-radius:12px;font-size:17px;font-weight:bold;cursor:pointer;margin-top:4px}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .btn-g{background:linear-gradient(135deg,#28a745,#20c997)}
    .btn-gr{background:linear-gradient(135deg,#6c757d,#495057);font-size:13px;padding:10px}
    .btn-or{background:linear-gradient(135deg,#fd7e14,#e55a00)}
    .st{text-align:center;font-size:13px;padding:10px;min-height:24px;border-radius:8px;margin-top:8px;font-weight:500}
    .ok{background:#d4edda;color:#155724}
    .er{background:#f8d7da;color:#721c24}
    .wa{background:#fff3cd;color:#856404}
    .in{background:#cce5ff;color:#004085}
    .logs{background:#1a1a2e;border-radius:10px;padding:10px;max-height:170px;overflow-y:auto}
    .ll{color:#00ff88;font-family:monospace;font-size:11px;padding:2px 0;border-bottom:1px solid #1a2e1a}
    .ll.err{color:#ff6b6b}
    .ll.warn{color:#ffd93d}
    .ci{width:100%;padding:16px;font-size:32px;text-align:center;letter-spacing:10px;border:2px solid #e0e0e0;border-radius:10px;margin:10px 0;-moz-appearance:textfield}
    .ci::-webkit-outer-spin-button,.ci::-webkit-inner-spin-button{-webkit-appearance:none}
    .ci:focus{border-color:#e1306c;outline:none}
    .badge{display:inline-block;background:#e1306c;color:#fff;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:bold;margin-left:6px}
    .ip-info{background:#e8f4fd;border:1px solid #bee3f8;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;color:#2c5282}
    .counter{text-align:center;font-size:13px;color:#888;margin-top:4px}
  </style>
</head>
<body>
  <div class="hdr">🤖 Bot Instagram — IP Utilisateur</div>
  <div class="sub" id="ip-display">📡 Détection IP...</div>

  <div class="wrap">

    <!-- Info IP -->
    <div class="card" id="card-ip">
      <div class="ip-info" id="ip-box">
        🔍 Détection de votre IP en cours...
      </div>
      <div class="counter" id="counter-display"></div>
    </div>

    <!-- Infos compte -->
    <div class="card">
      <div class="row"><span class="lbl">📧 Email</span><span class="val" id="d-email">chargement...</span></div>
      <div class="row"><span class="lbl">🔒 Pass</span><span class="val" id="d-pass">${PASSWORD}</span></div>
      <div class="row"><span class="lbl">🏷️ Nom</span><span class="val" id="d-name">...</span></div>
      <div class="row"><span class="lbl">👤 User</span><span class="val" id="d-user">...</span></div>
      <button class="btn btn-gr" onclick="regenInfos()" style="margin-top:10px">🔄 Nouvelles infos</button>
    </div>

    <!-- Étape 1 : date + création -->
    <div class="card" id="step-date">
      <div class="ttl">🎂 Date de naissance</div>
      <div class="dr">
        <div class="dc">
          <label>Mois</label>
          <select id="sM">
            <option value="">--</option>
            ${['January','February','March','April','May','June','July','August','September','October','November','December'].map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="dc">
          <label>Jour</label>
          <select id="sD">
            <option value="">--</option>
            ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
          </select>
        </div>
        <div class="dc">
          <label>Année</label>
          <select id="sY">
            <option value="">--</option>
            ${Array.from({length:50},(_,i)=>`<option value="${2005-i}">${2005-i}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn" id="btnCreate" onclick="createAccount()">🚀 Créer le compte !</button>
      <div class="st wa" id="st-create">Choisis la date de naissance</div>
    </div>

    <!-- Étape 2 : code de confirmation -->
    <div class="card" id="step-code" style="display:none">
      <div class="ttl">📧 Code de confirmation <span class="badge" id="code-timer">...</span></div>
      <p style="font-size:13px;color:#666;margin-bottom:8px">Code envoyé à <strong id="d-email2"></strong></p>
      <input class="ci" type="number" id="codeInput" placeholder="000000" maxlength="6">
      <button class="btn btn-g" id="btnCode" onclick="submitCode()">✅ Valider le code</button>
      <div class="st wa" id="st-code">En attente du code...</div>
    </div>

    <!-- Étape 3 : succès -->
    <div class="card" id="step-done" style="display:none">
      <div class="ttl" style="color:#28a745;font-size:18px">🎉 Compte créé !</div>
      <div style="margin-top:12px">
        <div class="row"><span class="lbl">📧 Email</span><span class="val" id="r-email"></span></div>
        <div class="row"><span class="lbl">🔒 Pass</span><span class="val" id="r-pass"></span></div>
        <div class="row"><span class="lbl">👤 User</span><span class="val" id="r-user"></span></div>
        <div class="row"><span class="lbl">🏷️ Nom</span><span class="val" id="r-name"></span></div>
      </div>
      <button class="btn btn-g" style="margin-top:12px" onclick="nextAccount()">➕ Compte suivant</button>
    </div>

    <!-- Logs -->
    <div class="card">
      <div class="ttl" style="margin-bottom:8px">📋 Logs <span style="font-size:11px;color:#aaa;font-weight:normal" id="ip-log"></span></div>
      <div class="logs" id="logs"></div>
    </div>

  </div>

<script>
// ─── État ─────────────────────────────────────────────────────────────────────
let acct = {};
let csrf = '', mid = '', cookieStr = '';
let savedMonth, savedDay, savedYear;
let codeTimer = null, codePoll = null;
let accountsOnThisIP = parseInt(localStorage.getItem('acct_count') || '0');
const MAX_PER_IP = 3;

// ─── Logs ─────────────────────────────────────────────────────────────────────
function L(msg, type) {
    const logs = document.getElementById('logs');
    const d = document.createElement('div');
    d.className = 'll' + (type ? ' ' + type : '');
    d.textContent = new Date().toLocaleTimeString() + ' ' + msg;
    logs.insertBefore(d, logs.firstChild);
    if (logs.children.length > 25) logs.removeChild(logs.lastChild);
}
function encode(obj) {
    return Object.entries(obj).map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
}
function setSt(id, msg, cls) {
    const e = document.getElementById(id);
    if (e) { e.className = 'st ' + cls; e.textContent = msg; }
}

// ─── Détection IP ─────────────────────────────────────────────────────────────
async function detectIP() {
    try {
        const r = await fetch('https://api.ipify.org?format=json');
        const d = await r.json();
        const ip = d.ip;
        document.getElementById('ip-display').textContent = '📡 Votre IP : ' + ip;
        document.getElementById('ip-box').innerHTML =
            '🌐 <b>Votre IP :</b> ' + ip +
            '<br>📊 <b>Comptes créés sur cette IP :</b> ' + accountsOnThisIP + '/' + MAX_PER_IP +
            (accountsOnThisIP >= MAX_PER_IP ? '<br>⚠️ <b style="color:#e53e3e">Limite atteinte — change de réseau !</b>' : '');
        document.getElementById('ip-log').textContent = '(' + ip + ')';

        if (accountsOnThisIP >= MAX_PER_IP) {
            document.getElementById('btnCreate').disabled = true;
            setSt('st-create', '⚠️ ' + MAX_PER_IP + ' comptes créés sur cette IP. Change de réseau (WiFi↔4G) puis recharge.', 'er');
        }
    } catch(e) {
        document.getElementById('ip-box').textContent = '⚠️ IP non détectée';
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    setSt('st-create', '⏳ Génération...', 'wa');
    const d = await (await fetch('/api/init')).json();
    acct = d;
    document.getElementById('d-email').textContent = acct.email;
    document.getElementById('d-name').textContent  = acct.fullName;
    document.getElementById('d-user').textContent  = acct.uName;
    setSt('st-create', 'Choisis la date de naissance', 'wa');
    L('✅ ' + acct.uName + ' | ' + acct.email);
}

async function regenInfos() { await init(); }

// ─── Compte suivant ───────────────────────────────────────────────────────────
async function nextAccount() {
    document.getElementById('step-done').style.display  = 'none';
    document.getElementById('step-date').style.display  = 'block';
    document.getElementById('step-code').style.display  = 'none';
    document.getElementById('btnCreate').disabled = false;

    // Si on a atteint la limite → forcer changement IP
    if (accountsOnThisIP >= MAX_PER_IP) {
        setSt('st-create', '⚠️ Change de réseau (WiFi↔4G) puis recharge la page !', 'er');
        document.getElementById('btnCreate').disabled = true;
    }
    await detectIP();
    await init();
}

// ─── Étape 0 : CSRF via navigateur de l'utilisateur ──────────────────────────
async function getCSRF() {
    L('🔐 Récupération CSRF depuis votre IP...');
    // On utilise un proxy CORS pour faire la requête depuis notre domaine
    // mais les cookies Instagram seront ceux de l'IP de l'utilisateur
    const CORS = 'https://corsproxy.io/?url=';
    try {
        const r = await fetch(CORS + encodeURIComponent('https://www.instagram.com/'), { credentials: 'omit' });
        const html = await r.text();

        // Extraire CSRF du HTML
        let csrfVal = '';
        const m1 = html.match(/"csrf_token"\\s*:\\s*"([^"]+)"/);
        if (m1) csrfVal = m1[1];
        if (!csrfVal) {
            const m2 = html.match(/csrftoken[="]([a-zA-Z0-9_-]{20,})/);
            if (m2) csrfVal = m2[1];
        }

        // Essayer les headers x-cors-headers
        const xch = r.headers.get('x-cors-headers');
        if (xch && !csrfVal) {
            try {
                const parsed = JSON.parse(xch);
                const sc = (parsed['set-cookie'] || []).find(c => c.includes('csrftoken'));
                if (sc) { const m = sc.match(/csrftoken=([^;]+)/); if (m) csrfVal = m[1]; }
            } catch(e) {}
        }

        if (csrfVal) {
            csrf = csrfVal;
            // mid = random si pas dispo
            mid = mid || Math.random().toString(36).replace(/[^a-z0-9]/g,'').substring(0,12);
            L('   ✅ CSRF (proxy) : ' + csrf.substring(0,10) + '...');
            return true;
        }
    } catch(e) { L('   ⚠️ corsproxy : ' + e.message, 'warn'); }

    // Fallback : CSRF depuis le serveur (IP Render) mais ça peut bloquer
    L('   ⚠️ Fallback CSRF serveur (IP Render)...', 'warn');
    try {
        const s = await (await fetch('/api/get-csrf')).json();
        csrf = s.csrf; mid = s.mid; cookieStr = s.cookieStr;
        if (csrf) { L('   ✅ CSRF serveur : ' + csrf.substring(0,10) + '...'); return true; }
    } catch(e) {}

    L('❌ Impossible d\\'obtenir le CSRF', 'err');
    return false;
}

// ─── Création du compte ───────────────────────────────────────────────────────
async function createAccount() {
    if (accountsOnThisIP >= MAX_PER_IP) {
        setSt('st-create', '⚠️ Change de réseau !', 'er');
        return;
    }
    const m = document.getElementById('sM').value;
    const d = document.getElementById('sD').value;
    const y = document.getElementById('sY').value;
    if (!m || !d || !y) { setSt('st-create', '⚠️ Choisis la date !', 'er'); return; }
    savedMonth = m; savedDay = d; savedYear = y;

    document.getElementById('btnCreate').disabled = true;
    setSt('st-create', '⏳ Connexion Instagram...', 'wa');

    // ── CSRF ─────────────────────────────────────────────────────────────────
    const ok = await getCSRF();
    if (!ok) { setSt('st-create', '❌ CSRF impossible', 'er'); document.getElementById('btnCreate').disabled=false; return; }

    // ── Étape 1 : dry run ────────────────────────────────────────────────────
    setSt('st-create', '⏳ 1/4 Vérification...', 'wa');
    L('📡 Étape 1 : dry run...');

    const dryBody = encode({
        enc_password          : '#PWD_INSTAGRAM_BROWSER:0:' + Math.floor(Date.now()/1000) + ':' + acct.password,
        email                 : acct.email,
        username              : acct.uName,
        first_name            : acct.fullName,
        opt_into_one_tap      : 'false',
        client_id             : mid,
        seamless_login_enabled: '1',
    });

    let dryData;
    try {
        const r = await fetch('https://www.instagram.com/accounts/web_create_ajax/attempt/', {
            method:'POST',
            headers:{ 'Content-Type':'application/x-www-form-urlencoded','X-CSRFToken':csrf,'X-Requested-With':'XMLHttpRequest','Referer':'https://www.instagram.com/accounts/emailsignup/' },
            body: dryBody, credentials:'include'
        });
        dryData = await r.json();
        L('   Dry run : ' + JSON.stringify(dryData).substring(0,100));
    } catch(e) {
        L('   ⚠️ CORS dry run — proxy serveur...', 'warn');
        const pr = await fetch('/api/proxy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url:'https://www.instagram.com/accounts/web_create_ajax/attempt/', body:dryBody, csrf, cookieStr }) });
        dryData = await pr.json();
        L('   Dry run proxy : ' + JSON.stringify(dryData).substring(0,100));
    }

    if (dryData.errors && Object.keys(dryData.errors).length > 0) {
        const e = JSON.stringify(dryData.errors).substring(0,80);
        L('❌ ' + e, 'err');
        setSt('st-create', '❌ ' + e, 'er');
        document.getElementById('btnCreate').disabled = false;
        return;
    }
    if (!dryData.dryrun_passed) {
        L('⚠️ Dry run échoué', 'warn');
        setSt('st-create', '⚠️ Vérification échouée — réessaie', 'er');
        document.getElementById('btnCreate').disabled = false;
        return;
    }

    // ── Étape 2 : envoyer code email ──────────────────────────────────────────
    setSt('st-create', '⏳ 2/4 Envoi code email...', 'wa');
    L('📡 Étape 2 : send_verify_email...');

    let verData;
    try {
        const r = await fetch('https://i.instagram.com/api/v1/accounts/send_verify_email/', {
            method:'POST',
            headers:{ 'Content-Type':'application/x-www-form-urlencoded','X-CSRFToken':csrf,'X-Requested-With':'XMLHttpRequest','Referer':'https://www.instagram.com/' },
            body: encode({ device_id: mid, email: acct.email }),
            credentials: 'include'
        });
        verData = await r.json();
        L('   Verify : ' + JSON.stringify(verData).substring(0,100));
    } catch(e) {
        L('   ⚠️ CORS verify — proxy serveur...', 'warn');
        const pr = await fetch('/api/proxy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url:'https://i.instagram.com/api/v1/accounts/send_verify_email/', body: encode({ device_id:mid, email:acct.email }), csrf, cookieStr, referer:'https://www.instagram.com/' }) });
        verData = await pr.json();
        L('   Verify proxy : ' + JSON.stringify(verData).substring(0,100));
    }

    if (verData.require_captcha) {
        L('⚠️ CAPTCHA sur cette IP !', 'warn');
        setSt('st-create', '⚠️ Instagram bloque cette IP. Passe en 4G ou change de WiFi !', 'er');
        document.getElementById('btnCreate').disabled = false;
        // Forcer un changement IP au prochain essai
        accountsOnThisIP = MAX_PER_IP;
        localStorage.setItem('acct_count', MAX_PER_IP);
        return;
    }
    if (!verData.email_sent) {
        L('⚠️ Email non envoyé : ' + JSON.stringify(verData).substring(0,80), 'warn');
        setSt('st-create', '⚠️ ' + JSON.stringify(verData).substring(0,60), 'er');
        document.getElementById('btnCreate').disabled = false;
        return;
    }

    L('✅ Code envoyé à ' + acct.email);
    document.getElementById('d-email2').textContent = acct.email;
    document.getElementById('step-date').style.display = 'none';
    document.getElementById('step-code').style.display = 'block';
    setSt('st-code', 'Code envoyé ! Récupération auto...', 'in');
    startCodePolling();
}

// ─── Polling code email ───────────────────────────────────────────────────────
function startCodePolling() {
    let secs = 120, tries = 0;
    const timer = document.getElementById('code-timer');
    codeTimer = setInterval(() => {
        timer.textContent = secs + 's';
        if (--secs < 0) { clearInterval(codeTimer); timer.textContent = 'timeout'; }
    }, 1000);
    codePoll = setInterval(async () => {
        tries++;
        L('   📬 Tentative ' + tries + '...');
        try {
            const r = await (await fetch('/api/poll-code?token=' + encodeURIComponent(acct.token))).json();
            if (r.code) {
                clearInterval(codePoll); clearInterval(codeTimer);
                timer.textContent = '✅';
                L('   ✅ Code auto : ' + r.code);
                await finalizeAccount(r.code);
            }
        } catch(e) {}
        if (tries >= 24) { clearInterval(codePoll); setSt('st-code', 'Code non reçu — entre-le manuellement', 'wa'); }
    }, 5000);
}

async function submitCode() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code || code.length < 4) { setSt('st-code', '⚠️ Code invalide', 'er'); return; }
    if (codePoll) clearInterval(codePoll);
    if (codeTimer) clearInterval(codeTimer);
    document.getElementById('btnCode').disabled = true;
    await finalizeAccount(code);
}

// ─── Étapes 3+4 ───────────────────────────────────────────────────────────────
async function finalizeAccount(code) {
    setSt('st-code', '⏳ 3/4 Vérification code...', 'wa');
    L('📡 Étape 3 : check_confirmation_code...');

    // Étape 3 : vérifier le code
    let checkData;
    try {
        const r = await fetch('https://i.instagram.com/api/v1/accounts/check_confirmation_code/', {
            method:'POST',
            headers:{ 'Content-Type':'application/x-www-form-urlencoded','X-CSRFToken':csrf,'X-Requested-With':'XMLHttpRequest','Referer':'https://www.instagram.com/' },
            body: encode({ code, device_id:mid, email:acct.email }),
            credentials:'include'
        });
        checkData = await r.json();
        L('   Check : ' + JSON.stringify(checkData).substring(0,120));
    } catch(e) {
        L('   ⚠️ CORS check — proxy...', 'warn');
        const pr = await fetch('/api/proxy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url:'https://i.instagram.com/api/v1/accounts/check_confirmation_code/', body: encode({ code, device_id:mid, email:acct.email }), csrf, cookieStr, referer:'https://www.instagram.com/' }) });
        checkData = await pr.json();
        L('   Check proxy : ' + JSON.stringify(checkData).substring(0,120));
    }

    if (!checkData.signup_code) {
        L('❌ signup_code manquant', 'err');
        setSt('st-code', '❌ Code incorrect — réessaie', 'er');
        document.getElementById('btnCode').disabled = false;
        return;
    }
    L('   ✅ signup_code obtenu');

    // Étape 4 : création finale
    setSt('st-code', '⏳ 4/4 Création finale...', 'wa');
    L('📡 Étape 4 : web_create_ajax...');

    const finalBody = encode({
        enc_password          : '#PWD_INSTAGRAM_BROWSER:0:' + Math.floor(Date.now()/1000) + ':' + acct.password,
        email                 : acct.email,
        username              : acct.uName,
        first_name            : acct.fullName,
        month                 : String(savedMonth), day: String(savedDay), year: String(savedYear),
        opt_into_one_tap      : 'false',
        client_id             : mid,
        seamless_login_enabled: '1',
        tos_version           : 'row',
        force_sign_up_code    : checkData.signup_code,
    });

    let finalData;
    try {
        const r = await fetch('https://www.instagram.com/accounts/web_create_ajax/', {
            method:'POST',
            headers:{ 'Content-Type':'application/x-www-form-urlencoded','X-CSRFToken':csrf,'X-Requested-With':'XMLHttpRequest','Referer':'https://www.instagram.com/accounts/emailsignup/' },
            body: finalBody, credentials:'include'
        });
        finalData = await r.json();
        L('   Final : ' + JSON.stringify(finalData).substring(0,150));
    } catch(e) {
        L('   ⚠️ CORS final — proxy...', 'warn');
        const pr = await fetch('/api/proxy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url:'https://www.instagram.com/accounts/web_create_ajax/', body:finalBody, csrf, cookieStr }) });
        finalData = await pr.json();
        L('   Final proxy : ' + JSON.stringify(finalData).substring(0,150));
    }

    if (finalData.account_created || finalData.user_id) {
        // Incrémenter le compteur IP
        accountsOnThisIP++;
        localStorage.setItem('acct_count', accountsOnThisIP);
        L('🎉 COMPTE CRÉÉ ! @' + acct.uName);
        document.getElementById('step-code').style.display = 'none';
        document.getElementById('step-done').style.display = 'block';
        document.getElementById('r-email').textContent = acct.email;
        document.getElementById('r-pass').textContent  = acct.password;
        document.getElementById('r-user').textContent  = '@' + acct.uName;
        document.getElementById('r-name').textContent  = acct.fullName;
        // Vérifier si on doit changer d'IP
        if (accountsOnThisIP >= MAX_PER_IP) {
            setSt('st-create', '⚠️ ' + MAX_PER_IP + ' comptes créés ! Change de réseau pour continuer.', 'wa');
        }
    } else {
        const err = finalData.errors ? JSON.stringify(finalData.errors).substring(0,100) : JSON.stringify(finalData).substring(0,100);
        L('❌ ' + err, 'err');
        setSt('st-code', '❌ ' + err, 'er');
        document.getElementById('btnCode').disabled = false;
    }
}

// ─── Démarrage ────────────────────────────────────────────────────────────────
detectIP();
init();
</script>
</body></html>`);
});

// ── /api/get-csrf (fallback serveur) ─────────────────────────────────────────
app.get('/api/get-csrf', async (req, res) => {
    try {
        const r = await fetch('https://www.instagram.com/', {
            headers: { 'User-Agent':'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36' }
        });
        const raw = r.headers.raw()['set-cookie'] || [];
        const map = {};
        for (const c of raw) {
            const p = c.split(';')[0].trim();
            const i = p.indexOf('=');
            if (i > 0) map[p.substring(0,i).trim()] = p.substring(i+1).trim();
        }
        res.json({ csrf: map.csrftoken||'', mid: map.mid||'', cookieStr: Object.entries(map).map(e=>e[0]+'='+e[1]).join('; ') });
    } catch(e) { res.json({ csrf:'', mid:'', cookieStr:'' }); }
});

// ── /api/proxy (fallback CORS) ────────────────────────────────────────────────
app.post('/api/proxy', async (req, res) => {
    const { url, body, csrf, cookieStr, referer } = req.body;
    if (!url || (!url.startsWith('https://www.instagram.com') && !url.startsWith('https://i.instagram.com')))
        return res.status(400).json({ error: 'URL non autorisée' });
    try {
        slog('🔀 Proxy : ' + url.split('/').pop());
        const r = await fetch(url, {
            method:'POST',
            headers: { 'User-Agent':'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36','Content-Type':'application/x-www-form-urlencoded','X-CSRFToken':csrf||'','X-Requested-With':'XMLHttpRequest','Referer':referer||'https://www.instagram.com/','Cookie':cookieStr||'' },
            body
        });
        const text = await r.text();
        slog('   → ' + r.status + ' : ' + text.substring(0,100));
        try { res.json(JSON.parse(text)); } catch(e) { res.json({ error: text.substring(0,200) }); }
    } catch(e) { res.json({ error: e.message }); }
});

app.listen(PORT, '0.0.0.0', () => slog('🌐 Port ' + PORT));

(async function() {
    slog('🤖 Bot Instagram — IP Utilisateur');
    slog('✅ Prêt sur le port ' + PORT);
})();
