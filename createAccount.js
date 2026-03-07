const express = require('express');
const fetch   = require('node-fetch');
const { generatingName, username } = require('./accountInfoGenerator');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const PASSWORD = 'Azerty12345!';
const PORT     = process.env.PORT || 10000;
const sleep    = ms => new Promise(r => setTimeout(r, ms));

// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────────
let state = {
    status: 'starting',  // starting | ready | creating | waiting_code | done | error
    email: '', password: PASSWORD, fullName: '', uName: '',
    token: '', confirmCode: '', errorMsg: '',
    log: []
};

function log(msg) {
    console.log(msg);
    state.log.push(msg);
    if (state.log.length > 40) state.log.shift();
}

// ─── TEMP MAIL ────────────────────────────────────────────────────────────────
async function getFakeMail() {
    try {
        const res  = await fetch('https://doux.gleeze.com/tempmail/gen', { timeout: 10000 });
        const data = await res.json();
        if (data && data.email && data.token) {
            state.token = data.token;
            log('📧 Email  : ' + data.email);
            log('🔑 Token  : ' + data.token);
            return data.email;
        }
    } catch(e) { log('⚠️ Mail API : ' + e.message); }
    const fb = 'user' + Math.floor(Math.random()*99999) + '@guerrillamail.com';
    log('📧 Fallback : ' + fb);
    return fb;
}

async function getCodeFromMail() {
    if (!state.token) return '';
    for (let i = 1; i <= 15; i++) {
        try {
            const res  = await fetch('https://doux.gleeze.com/tempmail/inbox?token=' + encodeURIComponent(state.token), { timeout: 10000 });
            const data = await res.json();
            log('   📬 Tentative ' + i + ' : ' + (data.answer ? data.answer.length : 0) + ' email(s)');
            if (data.answer && data.answer.length > 0) {
                for (let m of data.answer) {
                    const txt   = (m.subject || '') + ' ' + (m.intro || '');
                    const match = txt.match(/\b(\d{6})\b/);
                    if (match) { log('   ✅ Code : ' + match[1]); return match[1]; }
                }
            }
        } catch(e) {}
        await sleep(5000);
    }
    return '';
}

// ─── INSTAGRAM API ────────────────────────────────────────────────────────────
function igHeaders(extra) {
    const base = {
        'User-Agent'      : 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept'          : '*/*',
        'Accept-Language' : 'en-US,en;q=0.9',
        'Origin'          : 'https://www.instagram.com',
        'Referer'         : 'https://www.instagram.com/accounts/emailsignup/',
        'X-IG-App-ID'     : '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type'    : 'application/x-www-form-urlencoded',
    };
    return Object.assign(base, extra || {});
}

function encode(obj) {
    return Object.entries(obj)
        .map(function(e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); })
        .join('&');
}

// Récupérer CSRF + cookies — frappe la page d'accueil comme le script Python
async function getCsrfAndCookie() {
    try {
        const UA = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36';

        // Étape 1 : page d'accueil pour obtenir mid + csrftoken (comme s.get(link) en Python)
        const homeRes = await fetch('https://www.instagram.com/', {
            headers: {
                'User-Agent'     : UA,
                'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection'     : 'keep-alive',
            }
        });

        const rawCookies = homeRes.headers.raw()['set-cookie'] || [];
        const cookieMap  = {};
        for (const c of rawCookies) {
            const part = c.split(';')[0].trim();
            const idx  = part.indexOf('=');
            if (idx > 0) {
                cookieMap[part.substring(0, idx).trim()] = part.substring(idx + 1).trim();
            }
        }

        const csrf      = cookieMap['csrftoken'] || '';
        const mid       = cookieMap['mid']       || '';
        const cookieStr = Object.entries(cookieMap).map(function(e){ return e[0]+'='+e[1]; }).join('; ');

        log('   🔐 CSRF : ' + (csrf ? csrf.substring(0, 10) + '...' : 'NON TROUVÉ'));
        log('   📱 mid  : ' + (mid  ? mid.substring(0, 10)  + '...' : 'NON TROUVÉ'));
        log('   🍪 Cookies : ' + Object.keys(cookieMap).join(', '));
        return { csrf, mid, cookieStr, cookieMap };
    } catch(e) {
        log('⚠️ getCsrf : ' + e.message);
        return { csrf: '', mid: '', cookieStr: '', cookieMap: {} };
    }
}

// Créer le compte — flow complet en 4 étapes (basé sur le vrai flow Instagram)
async function createIgAccount(csrf, cookieStr, mid, month, day, year) {
    const timestamp = Math.floor(Date.now() / 1000);
    const enc_password = '#PWD_INSTAGRAM_BROWSER:0:' + timestamp + ':' + state.password;

    const headers = {
        'User-Agent'      : 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36',
        'Accept'          : '*/*',
        'Accept-Language' : 'en-US,en;q=0.9',
        'Content-Type'    : 'application/x-www-form-urlencoded',
        'X-CSRFToken'     : csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'Origin'          : 'https://www.instagram.com',
        'Referer'         : 'https://www.instagram.com/accounts/emailsignup/',
        'Cookie'          : cookieStr,
    };

    // ── Étape 1 : dry run ────────────────────────────────────────────────────
    log('   📡 Étape 1 : dry run...');
    const dryBody = encode({
        enc_password,
        email             : state.email,
        username          : state.uName,
        first_name        : state.fullName,
        opt_into_one_tap  : 'false',
        client_id         : mid,
        seamless_login_enabled: '1',
    });

    const dryRes  = await fetch('https://www.instagram.com/accounts/web_create_ajax/attempt/', {
        method: 'POST', headers, body: dryBody
    });
    const dryText = await dryRes.text();
    log('   Dry run ' + dryRes.status + ' : ' + dryText.substring(0, 120));

    let dryData = {};
    try { dryData = JSON.parse(dryText); } catch(e) { return { error: dryText.substring(0, 200) }; }

    if (dryData.errors && Object.keys(dryData.errors).length > 0) {
        return dryData; // Erreurs de validation (email pris, etc.)
    }
    if (!dryData.dryrun_passed) {
        log('   ⚠️ Dry run échoué');
        return dryData;
    }

    // ── Étape 2 : demander l'envoi du code email ─────────────────────────────
    await sleep(1200);
    log('   📡 Étape 2 : envoi code email...');
    const verifyRes  = await fetch('https://i.instagram.com/api/v1/accounts/send_verify_email/', {
        method : 'POST',
        headers: Object.assign({}, headers, { 'Referer': 'https://www.instagram.com/' }),
        body   : encode({ device_id: mid, email: state.email })
    });
    const verifyText = await verifyRes.text();
    log('   Verify email ' + verifyRes.status + ' : ' + verifyText.substring(0, 120));

    // ── Attendre le code ─────────────────────────────────────────────────────
    log('   📬 Attente code email...');
    let code = await getCodeFromMail();

    if (!code) {
        log('   ⏳ Code auto non reçu — attente manuelle (5 min)...');
        const start = Date.now();
        while (!state.confirmCode && (Date.now() - start) < 300000) {
            await sleep(2000);
        }
        code = state.confirmCode;
        state.confirmCode = '';
    }

    if (!code) {
        return { error: 'Code non reçu' };
    }

    log('   🔑 Code reçu : ' + code);

    // ── Étape 3 : vérifier le code → obtenir signup_code ────────────────────
    await sleep(800);
    log('   📡 Étape 3 : vérification code...');
    const checkRes  = await fetch('https://i.instagram.com/api/v1/accounts/check_confirmation_code/', {
        method : 'POST',
        headers: Object.assign({}, headers, { 'Referer': 'https://www.instagram.com/' }),
        body   : encode({ code, device_id: mid, email: state.email })
    });
    const checkText = await checkRes.text();
    log('   Check code ' + checkRes.status + ' : ' + checkText.substring(0, 150));

    let checkData = {};
    try { checkData = JSON.parse(checkText); } catch(e) { return { error: checkText.substring(0, 200) }; }

    const signup_code = checkData.signup_code;
    if (!signup_code) {
        log('   ❌ signup_code introuvable : ' + JSON.stringify(checkData).substring(0, 150));
        return { error: 'signup_code introuvable — code incorrect ?' };
    }
    log('   ✅ signup_code : ' + signup_code);

    // ── Étape 4 : création finale ─────────────────────────────────────────────
    await sleep(800);
    log('   📡 Étape 4 : création finale...');
    const finalBody = encode({
        enc_password,
        email                 : state.email,
        username              : state.uName,
        first_name            : state.fullName,
        month                 : String(month),
        day                   : String(day),
        year                  : String(year),
        opt_into_one_tap      : 'false',
        client_id             : mid,
        seamless_login_enabled: '1',
        tos_version           : 'row',
        force_sign_up_code    : signup_code,
    });

    const finalRes  = await fetch('https://www.instagram.com/accounts/web_create_ajax/', {
        method: 'POST', headers, body: finalBody
    });
    const finalText = await finalRes.text();
    log('   Création finale ' + finalRes.status + ' : ' + finalText.substring(0, 300));

    try { return JSON.parse(finalText); }
    catch(e) { return { error: finalText.substring(0, 200) }; }
}

// ─── SERVEUR EXPRESS ──────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Page principale ───────────────────────────────────────────────────────────
app.get('/', function(req, res) {
    const logHtml = state.log.slice(-15).reverse().map(function(l) {
        return '<div class="ll">' + l.replace(/</g, '&lt;') + '</div>';
    }).join('');

    if (state.status === 'ready') {
        return res.send(`<!DOCTYPE html><html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#f0f2f5}
    .hdr{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:17px;font-weight:bold}
    .wrap{max-width:460px;margin:0 auto;padding:12px}
    .card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .row{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:14px;border-bottom:1px solid #f0f0f0}
    .row:last-child{border:none}
    .lbl{color:#888;width:75px;flex-shrink:0;font-size:12px}
    .val{color:#222;font-weight:bold;word-break:break-all}
    .ttl{font-size:15px;font-weight:bold;color:#333;margin-bottom:12px}
    .dr{display:flex;gap:8px;margin-bottom:12px}
    .dc{flex:1;text-align:center}
    .dc label{display:block;font-size:10px;font-weight:bold;color:#888;margin-bottom:4px;text-transform:uppercase}
    select{width:100%;padding:11px 2px;border:2px solid #e0e0e0;border-radius:10px;font-size:14px;background:#fff;text-align:center}
    select:focus{border-color:#e1306c;outline:none}
    .btn{width:100%;padding:16px;background:linear-gradient(135deg,#0095f6,#0074cc);color:#fff;border:none;border-radius:12px;font-size:18px;font-weight:bold;cursor:pointer}
    .btn:disabled{opacity:.5}
    .st{text-align:center;font-size:14px;padding:8px;min-height:22px;border-radius:8px;margin-top:8px}
    .ok{background:#d4edda;color:#155724}
    .er{background:#f8d7da;color:#721c24}
    .wa{background:#fff3cd;color:#856404}
    .logs{background:#1a1a2e;border-radius:10px;padding:10px;max-height:150px;overflow-y:auto}
    .ll{color:#00ff88;font-family:monospace;font-size:11px;padding:1px 0;border-bottom:1px solid #1e2a1e}
  </style>
</head>
<body>
  <div class="hdr">🤖 Bot Instagram — Sans Captcha</div>
  <div class="wrap">
    <div class="card">
      <div class="row"><span class="lbl">📧 Email</span><span class="val">${state.email}</span></div>
      <div class="row"><span class="lbl">🔒 Pass</span><span class="val">${state.password}</span></div>
      <div class="row"><span class="lbl">🏷️ Nom</span><span class="val">${state.fullName}</span></div>
      <div class="row"><span class="lbl">👤 User</span><span class="val">${state.uName}</span></div>
    </div>
    <div class="card">
      <div class="ttl">🎂 Date de naissance</div>
      <div class="dr">
        <div class="dc">
          <label>Mois</label>
          <select id="sM">
            <option value="">--</option>
            ${['January','February','March','April','May','June','July','August','September','October','November','December'].map(function(m,i){return '<option value="'+(i+1)+'">'+m+'</option>';}).join('')}
          </select>
        </div>
        <div class="dc">
          <label>Jour</label>
          <select id="sD">
            <option value="">--</option>
            ${Array.from({length:31},function(_,i){return '<option value="'+(i+1)+'">'+(i+1)+'</option>';}).join('')}
          </select>
        </div>
        <div class="dc">
          <label>Année</label>
          <select id="sY">
            <option value="">--</option>
            ${Array.from({length:50},function(_,i){return '<option value="'+(2005-i)+'">'+(2005-i)+'</option>';}).join('')}
          </select>
        </div>
      </div>
      <button class="btn" id="btn" onclick="go()">🚀 Créer le compte !</button>
      <div class="st wa" id="st">Choisis la date de naissance</div>
    </div>
    <div class="card">
      <div class="ttl" style="margin-bottom:8px">📋 Logs</div>
      <div class="logs" id="logs">${logHtml}</div>
    </div>
  </div>
  <script>
    async function go() {
      const m = document.getElementById('sM').value;
      const d = document.getElementById('sD').value;
      const y = document.getElementById('sY').value;
      const st = document.getElementById('st');
      if (!m||!d||!y) { st.className='st er'; st.textContent='⚠️ Choisis le mois, jour ET année !'; return; }
      document.getElementById('btn').disabled = true;
      st.className='st wa'; st.textContent='⏳ Création en cours...';
      try {
        const r = await fetch('/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month:m,day:d,year:y})});
        const data = await r.json();
        st.className = data.ok ? 'st ok' : 'st er';
        st.textContent = data.msg;
        if (data.ok) { setTimeout(()=>location.href='/',2000); }
        else { document.getElementById('btn').disabled=false; }
      } catch(e) { st.className='st er'; st.textContent='❌ Erreur réseau'; document.getElementById('btn').disabled=false; }
    }
    // Refresh logs auto seulement si en cours de création
    setInterval(function(){
      if(document.getElementById('btn').disabled) location.reload();
    }, 3000);
  </script>
</body></html>`);
    }

    if (state.status === 'creating') {
        return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="2"></head>
<body style="font-family:Arial;text-align:center;padding:40px;background:#f0f2f5">
  <h2 style="color:#0095f6">⏳ Création en cours...</h2>
  <div style="background:#1a1a2e;border-radius:10px;padding:12px;margin-top:20px;max-width:400px;margin-left:auto;margin-right:auto;text-align:left">
    ${logHtml}
  </div>
</body></html>`);
    }

    if (state.status === 'waiting_code') {
        return res.send(`<!DOCTYPE html><html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Code Instagram</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial;background:#f0f2f5}
    .hdr{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:17px;font-weight:bold}
    .wrap{max-width:460px;margin:0 auto;padding:12px}
    .card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .tok{background:#1a1a2e;color:#00ff88;border-radius:8px;padding:10px;font-family:monospace;font-size:11px;word-break:break-all;margin:8px 0}
    input[type=number]{width:100%;padding:16px;font-size:28px;text-align:center;letter-spacing:8px;border:2px solid #e0e0e0;border-radius:10px;margin:10px 0;-moz-appearance:textfield}
    input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none}
    input:focus{border-color:#e1306c;outline:none}
    .btn{width:100%;padding:14px;background:linear-gradient(135deg,#0095f6,#0074cc);color:#fff;border:none;border-radius:12px;font-size:17px;font-weight:bold;cursor:pointer}
    p{margin:6px 0;font-size:14px;color:#444}
    .logs{background:#1a1a2e;border-radius:10px;padding:10px;max-height:120px;overflow-y:auto}
    .ll{color:#00ff88;font-family:monospace;font-size:11px;padding:1px 0}
  </style>
</head>
<body>
  <div class="hdr">📧 Code de confirmation</div>
  <div class="wrap">
    <div class="card">
      <p>📧 Email : <strong>${state.email}</strong></p>
      <p style="margin-top:8px;color:#666;font-size:13px">Le bot récupère le code automatiquement.<br>Si rien dans 1 min, entre-le ici :</p>
      <p style="margin-top:10px;font-size:12px;color:#888">🔑 Token :</p>
      <div class="tok">${state.token}</div>
    </div>
    <div class="card">
      <p style="margin-bottom:6px;font-weight:bold">Code manuel :</p>
      <input type="number" id="ci" placeholder="000000" autofocus>
      <button class="btn" onclick="sendCode()">✅ Valider</button>
    </div>
    <div class="card"><div class="logs">${logHtml}</div></div>
  </div>
  <script>
    async function sendCode() {
      const code = document.getElementById('ci').value;
      await fetch('/submit-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
      location.href='/';
    }
    setInterval(()=>location.reload(), 4000);
  </script>
</body></html>`);
    }

    if (state.status === 'done') {
        return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial;background:#f0f2f5">
  <div style="background:linear-gradient(135deg,#28a745,#20c997);color:#fff;padding:20px;text-align:center;font-size:20px;font-weight:bold">🎉 Compte créé !</div>
  <div style="max-width:460px;margin:20px auto;padding:0 12px">
    <div style="background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
      <p style="margin:10px 0;font-size:16px">📧 <b>Email :</b> <span style="color:#0095f6">${state.email}</span></p>
      <p style="margin:10px 0;font-size:16px">🔒 <b>Pass :</b> ${state.password}</p>
      <p style="margin:10px 0;font-size:16px">👤 <b>@${state.uName}</b></p>
      <p style="margin:10px 0;font-size:16px">🏷️ <b>${state.fullName}</b></p>
    </div>
    <div style="background:#1a1a2e;border-radius:10px;padding:12px;margin-top:12px">
      ${state.log.slice(-8).map(function(l){return '<div style="color:#00ff88;font-family:monospace;font-size:11px">'+l.replace(/</g,'&lt;')+'</div>';}).join('')}
    </div>
    <p style="text-align:center;color:#666;margin-top:15px;font-size:14px">💾 Sauvegarde ces infos !</p>
  </div>
</body></html>`);
    }

    if (state.status === 'error') {
        return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="8;url=/"></head>
<body style="font-family:Arial;background:#f0f2f5;padding:20px">
  <h2 style="color:red">❌ ${state.errorMsg}</h2>
  <div style="background:#1a1a2e;border-radius:10px;padding:12px;margin-top:12px">${logHtml}</div>
  <p style="color:#666;margin-top:10px;font-size:13px">Redirection dans 8s...</p>
</body></html>`);
    }

    // Chargement
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="2"></head>
<body style="font-family:Arial;text-align:center;padding:60px;background:#f0f2f5">
  <h2 style="color:#0095f6">⏳ Démarrage...</h2>
  <div style="background:#1a1a2e;border-radius:10px;padding:12px;margin-top:20px;max-width:400px;margin-left:auto;margin-right:auto;text-align:left">${logHtml}</div>
</body></html>`);
});

// ── POST /create ──────────────────────────────────────────────────────────────
app.post('/create', async function(req, res) {
    const month = parseInt(req.body.month);
    const day   = parseInt(req.body.day);
    const year  = parseInt(req.body.year);

    state.status = 'creating';
    log('🎂 Date : ' + month + '/' + day + '/' + year);

    try {
        // 1. Obtenir CSRF + cookies
        log('🔐 Récupération CSRF...');
        const { csrf, mid, cookieStr, cookieMap } = await getCsrfAndCookie();
        if (!csrf) {
            state.status = 'ready';
            return res.json({ ok: false, msg: '❌ CSRF introuvable — réessaie' });
        }

        // 2. Vérifier username disponible
        log('👤 Vérif username : ' + state.uName);
        try {
            const chkRes  = await fetch('https://www.instagram.com/api/v1/users/check_username/', {
                method : 'POST',
                headers: {
                    'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Content-Type'    : 'application/x-www-form-urlencoded',
                    'X-CSRFToken'     : csrf,
                    'X-Instagram-AJAX': '1',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Origin'          : 'https://www.instagram.com',
                    'Referer'         : 'https://www.instagram.com/accounts/emailsignup/',
                    'Cookie'          : cookieStr,
                },
                body   : encode({ username: state.uName })
            });
            const chkData = await chkRes.json();
            if (chkData.available === false) {
                state.uName = username();
                log('🔄 Username pris → ' + state.uName);
            }
        } catch(e) { log('⚠️ checkUsername : ' + e.message); }

        // 3. Créer le compte (flow complet)
        log('📡 Envoi requête création...');
        state.status = 'waiting_code';
        const result = await createIgAccount(csrf, cookieStr, mid, month, day, year);

        // Succès
        if (result.account_created || result.status === 'ok' || result.user_id || result.userId) {
            log('✅ Compte créé avec succès !');
            state.status = 'done';
            return res.json({ ok: true, msg: '✅ Compte créé !' });
        }

        // Erreur interne (code non reçu, etc.)
        if (result.error) {
            log('❌ ' + result.error);
            state.status = 'ready';
            return res.json({ ok: false, msg: '❌ ' + result.error });
        }

        // Erreurs de champs
        if (result.errors) {
            const errStr = JSON.stringify(result.errors);
            log('⚠️ Erreurs : ' + errStr.substring(0, 150));
            if (errStr.includes('email') || errStr.includes('taken')) {
                state.email  = await getFakeMail();
                state.status = 'ready';
                return res.json({ ok: false, msg: '⚠️ Email/username pris → nouvelles infos générées, réessaie !' });
            }
            state.status = 'ready';
            return res.json({ ok: false, msg: '❌ ' + errStr.substring(0, 120) });
        }

        // Autre message d'erreur
        const msg = result.message || result.error || JSON.stringify(result).substring(0, 120);
        log('⚠️ Réponse : ' + msg);
        state.status = 'ready';
        return res.json({ ok: false, msg: '⚠️ ' + msg });

    } catch(e) {
        log('❌ Erreur create : ' + e.message);
        state.status = 'ready';
        return res.json({ ok: false, msg: '❌ ' + e.message });
    }
});

// ── POST /submit-code ─────────────────────────────────────────────────────────
app.post('/submit-code', function(req, res) {
    state.confirmCode = req.body.code;
    log('🔑 Code reçu : ' + state.confirmCode);
    res.json({ ok: true });
});

// ── GET /status ───────────────────────────────────────────────────────────────
app.get('/status', function(req, res) {
    res.json({ status: state.status, log: state.log.slice(-10) });
});

app.listen(PORT, '0.0.0.0', function() { log('🌐 Serveur port ' + PORT); });

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async function main() {
    log('════════════════════════════');
    log('🤖 Bot Instagram — API v2');
    log('════════════════════════════');

    state.fullName = generatingName();
    state.uName    = username();
    state.email    = await getFakeMail();
    log('👤 Nom  : ' + state.fullName);
    log('👤 User : ' + state.uName);
    state.status = 'ready';
    log('✅ Prêt — choisis la date !');

    // Attendre la création
    while (state.status !== 'waiting_code' && state.status !== 'done' && state.status !== 'error') {
        await sleep(2000);
    }
    if (state.status !== 'waiting_code') return;

    // Le flow complet (dry run → send_verify → attendre code → check_code → création finale)
    // est géré dans createIgAccount() — ici on attend juste que /create finisse
    while (state.status === 'waiting_code') {
        await sleep(2000);
    }

    state.status = 'done';
    log('════════════════════════════');
    log('🎉 TERMINÉ !');
    log('📧 ' + state.email);
    log('🔒 ' + state.password);
    log('👤 @' + state.uName);
    log('════════════════════════════');
})();
