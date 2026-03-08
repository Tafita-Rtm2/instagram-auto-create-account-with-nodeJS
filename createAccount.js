const express = require('express');
const fetch   = require('node-fetch');
const { generatingName, username } = require('./accountInfoGenerator');

const PASSWORD = 'Azerty12345!';
const PORT     = process.env.PORT || 10000;
const sleep    = ms => new Promise(r => setTimeout(r, ms));

let state = { email:'', password:PASSWORD, fullName:'', uName:'', token:'' };

function slog(m) { console.log(m); }

async function getFakeMail() {
    try {
        const r = await fetch('https://doux.gleeze.com/tempmail/gen', { timeout: 10000 });
        const d = await r.json();
        if (d && d.email && d.token) { state.token = d.token; return d.email; }
    } catch(e) {}
    return 'user' + Math.floor(Math.random() * 99999) + '@guerrillamail.com';
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/init', async (req, res) => {
    state.email    = await getFakeMail();
    state.fullName = generatingName();
    state.uName    = username();
    slog('📧 ' + state.email + ' | @' + state.uName);
    res.json({ email: state.email, password: state.password, fullName: state.fullName, uName: state.uName, token: state.token });
});

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
                    if (match) { slog('✅ Code : ' + match[1]); return res.json({ code: match[1] }); }
                }
            }
        } catch(e) {}
        if (i < 2) await sleep(1000);
    }
    res.json({ code: null });
});

// Proxy toutes les requêtes Instagram (CORS bypass)
app.post('/api/ig', async (req, res) => {
    const { url, body, csrf, cookieStr, referer } = req.body;
    const allowed = ['https://www.instagram.com', 'https://i.instagram.com'];
    if (!url || !allowed.some(a => url.startsWith(a)))
        return res.status(400).json({ error: 'URL non autorisée' });
    try {
        slog('📡 ' + url.split('/').filter(Boolean).pop());
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'User-Agent'      : 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36',
                'Content-Type'    : 'application/x-www-form-urlencoded',
                'X-CSRFToken'     : csrf || '',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer'         : referer || 'https://www.instagram.com/',
                'Cookie'          : cookieStr || '',
                'Origin'          : 'https://www.instagram.com',
            },
            body
        });
        const text = await r.text();
        slog('   → ' + r.status + ' ' + text.substring(0, 120));
        try { res.json(JSON.parse(text)); }
        catch(e) { res.json({ error: text.substring(0, 300) }); }
    } catch(e) {
        slog('   ❌ ' + e.message);
        res.json({ error: e.message });
    }
});

// CSRF depuis le serveur
app.get('/api/csrf', async (req, res) => {
    try {
        const r = await fetch('https://www.instagram.com/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.120 Safari/537.36' }
        });
        const raw = r.headers.raw()['set-cookie'] || [];
        const map = {};
        for (const c of raw) {
            const p = c.split(';')[0].trim(), i = p.indexOf('=');
            if (i > 0) map[p.substring(0, i).trim()] = p.substring(i + 1).trim();
        }
        const csrf      = map['csrftoken'] || '';
        const mid       = map['mid'] || '';
        const cookieStr = Object.entries(map).map(e => e[0] + '=' + e[1]).join('; ');
        slog('🔐 CSRF : ' + csrf.substring(0, 10));
        res.json({ csrf, mid, cookieStr });
    } catch(e) {
        res.json({ csrf: '', mid: '', cookieStr: '' });
    }
});

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = Array.from({ length: 31 }, (_, i) => i + 1);
const YEARS  = Array.from({ length: 50 }, (_, i) => 2005 - i);

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram</title>
  <script src="https://js.hcaptcha.com/1/api.js" async defer></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#f0f2f5;min-height:100vh}
    .hdr{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:18px;font-weight:bold}
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
    .btn{width:100%;padding:14px;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:6px}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .btn-blue{background:linear-gradient(135deg,#0095f6,#0074cc)}
    .btn-green{background:linear-gradient(135deg,#28a745,#20c997)}
    .btn-gray{background:linear-gradient(135deg,#6c757d,#495057);font-size:13px;padding:10px}
    .btn-orange{background:linear-gradient(135deg,#f77737,#e1306c)}
    .st{text-align:center;font-size:13px;padding:10px;border-radius:8px;margin-top:8px;font-weight:500;min-height:38px;display:flex;align-items:center;justify-content:center}
    .ok{background:#d4edda;color:#155724}
    .er{background:#f8d7da;color:#721c24}
    .wa{background:#fff3cd;color:#856404}
    .in{background:#cce5ff;color:#004085}
    .logs{background:#111827;border-radius:10px;padding:10px;max-height:180px;overflow-y:auto}
    .ll{font-family:monospace;font-size:11px;padding:3px 0;border-bottom:1px solid #1f2937;color:#34d399}
    .ll.w{color:#fbbf24}.ll.e{color:#f87171}
    .ci{width:100%;padding:16px;font-size:30px;text-align:center;letter-spacing:8px;border:2px solid #e0e0e0;border-radius:10px;margin:10px 0;-moz-appearance:textfield}
    .ci::-webkit-outer-spin-button,.ci::-webkit-inner-spin-button{-webkit-appearance:none}
    .ci:focus{border-color:#e1306c;outline:none}
    .badge{background:#e1306c;color:#fff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:bold;margin-left:6px}
    .cap-box{background:#fffbeb;border:2px solid #fbbf24;border-radius:12px;padding:14px;margin-bottom:10px;display:none}
    .cap-box.show{display:block}
    .hcap-wrap{display:flex;justify-content:center;margin:12px 0}
  </style>
</head>
<body>
  <div class="hdr">🤖 Bot Instagram</div>
  <div class="wrap">

    <!-- Compte infos -->
    <div class="card">
      <div class="row"><span class="lbl">📧 Email</span><span class="val" id="d-email">…</span></div>
      <div class="row"><span class="lbl">🔒 Pass</span><span class="val">${PASSWORD}</span></div>
      <div class="row"><span class="lbl">🏷️ Nom</span><span class="val" id="d-name">…</span></div>
      <div class="row"><span class="lbl">👤 User</span><span class="val" id="d-user">…</span></div>
      <button class="btn btn-gray" onclick="loadInfos()" style="margin-top:10px">🔄 Nouvelles infos</button>
    </div>

    <!-- Date + création -->
    <div class="card" id="step-date">
      <div class="ttl">🎂 Date de naissance</div>
      <div class="dr">
        <div class="dc">
          <label>Mois</label>
          <select id="sM">
            <option value="">--</option>
            ${MONTHS.map((m,i) => `<option value="${i+1}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="dc">
          <label>Jour</label>
          <select id="sD">
            <option value="">--</option>
            ${DAYS.map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
        </div>
        <div class="dc">
          <label>Année</label>
          <select id="sY">
            <option value="">--</option>
            ${YEARS.map(y => `<option value="${y}">${y}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- hCaptcha (caché par défaut, visible si Instagram le demande) -->
      <div class="cap-box" id="cap-box">
        <div style="font-weight:bold;color:#92400e;margin-bottom:6px">🔒 Vérification requise</div>
        <div style="font-size:12px;color:#666;margin-bottom:8px">Instagram demande une vérification. Résous le captcha puis clique sur Créer.</div>
        <div class="hcap-wrap">
          <div class="h-captcha" data-sitekey="4c672d35-0701-42b2-88c3-78380b0db560" id="hcap"></div>
        </div>
      </div>

      <button class="btn btn-blue" id="btnCreate" onclick="createAccount()">🚀 Créer le compte !</button>
      <div class="st wa" id="st-create">Choisis la date de naissance</div>
    </div>

    <!-- Code email -->
    <div class="card" id="step-code" style="display:none">
      <div class="ttl">📧 Code email <span class="badge" id="badge-timer">…</span></div>
      <p style="font-size:13px;color:#666;margin-bottom:8px">Envoyé à <strong id="d-email2"></strong></p>
      <input class="ci" type="number" id="codeInput" placeholder="000000">
      <button class="btn btn-green" id="btnCode" onclick="submitCode()">✅ Valider</button>
      <div class="st wa" id="st-code">En attente…</div>
    </div>

    <!-- Succès -->
    <div class="card" id="step-done" style="display:none">
      <div class="ttl" style="color:#16a34a;font-size:19px;text-align:center">🎉 Compte créé !</div>
      <div style="margin-top:12px">
        <div class="row"><span class="lbl">📧 Email</span><span class="val" id="r-email"></span></div>
        <div class="row"><span class="lbl">🔒 Pass</span><span class="val" id="r-pass"></span></div>
        <div class="row"><span class="lbl">👤 User</span><span class="val" id="r-user"></span></div>
        <div class="row"><span class="lbl">🏷️ Nom</span><span class="val" id="r-name"></span></div>
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
// ── État ──────────────────────────────────────────────────────────────────────
let acct = {}, csrf = '', mid = '', cookieStr = '';
let month, day, year;
let pollTimer = null, countTimer = null;
let captchaNeeded = false;

// ── Logs ──────────────────────────────────────────────────────────────────────
function L(msg, t) {
    const el = document.getElementById('logs');
    const d  = document.createElement('div');
    d.className = 'll' + (t ? ' ' + t : '');
    d.textContent = new Date().toLocaleTimeString('fr') + '  ' + msg;
    el.insertBefore(d, el.firstChild);
    while (el.children.length > 30) el.removeChild(el.lastChild);
}
function st(id, msg, cls) {
    const e = document.getElementById(id);
    if (e) { e.className = 'st ' + cls; e.textContent = msg; }
}
function enc(obj) {
    return Object.entries(obj).map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

// ── Appel proxy serveur pour Instagram (CORS) ─────────────────────────────────
async function ig(url, body, referer) {
    const r = await fetch('/api/ig', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ url, body, csrf, cookieStr, referer: referer || 'https://www.instagram.com/' })
    });
    return r.json();
}

// ── Init infos compte ──────────────────────────────────────────────────────────
async function loadInfos() {
    st('st-create', '⏳ Génération…', 'wa');
    try {
        const d = await (await fetch('/api/init')).json();
        acct = d;
        document.getElementById('d-email').textContent = acct.email;
        document.getElementById('d-name').textContent  = acct.fullName;
        document.getElementById('d-user').textContent  = acct.uName;
        st('st-create', 'Choisis la date puis clique Créer', 'wa');
        L('✅ ' + acct.uName + ' — ' + acct.email);
    } catch(e) {
        st('st-create', '❌ Erreur init : ' + e.message, 'er');
        L('❌ init : ' + e.message, 'e');
    }
}

// ── CSRF ───────────────────────────────────────────────────────────────────────
async function getCSRF() {
    try {
        const d = await (await fetch('/api/csrf')).json();
        csrf      = d.csrf;
        mid       = d.mid;
        cookieStr = d.cookieStr;
        L('🔐 CSRF : ' + (csrf ? csrf.substring(0,10)+'…' : '❌ vide'), csrf ? '' : 'e');
        return !!csrf;
    } catch(e) {
        L('❌ CSRF : ' + e.message, 'e');
        return false;
    }
}

// ── Créer le compte ────────────────────────────────────────────────────────────
async function createAccount() {
    month = document.getElementById('sM').value;
    day   = document.getElementById('sD').value;
    year  = document.getElementById('sY').value;
    if (!month || !day || !year) { st('st-create', '⚠️ Choisis le mois, jour ET année !', 'er'); return; }

    document.getElementById('btnCreate').disabled = true;
    st('st-create', '⏳ Connexion…', 'wa');

    // CSRF
    const ok = await getCSRF();
    if (!ok) {
        st('st-create', '❌ CSRF impossible — réessaie', 'er');
        document.getElementById('btnCreate').disabled = false;
        return;
    }

    // ── Étape 1 : dry run ────────────────────────────────────────────────────
    st('st-create', '⏳ 1/4 Vérification username…', 'wa');
    L('📡 Étape 1 : dry run…');

    const dryBody = enc({
        enc_password          : '#PWD_INSTAGRAM_BROWSER:0:' + Math.floor(Date.now()/1000) + ':' + acct.password,
        email                 : acct.email,
        username              : acct.uName,
        first_name            : acct.fullName,
        opt_into_one_tap      : 'false',
        client_id             : mid,
        seamless_login_enabled: '1',
    });

    const dryData = await ig(
        'https://www.instagram.com/accounts/web_create_ajax/attempt/',
        dryBody,
        'https://www.instagram.com/accounts/emailsignup/'
    );
    L('   dry run → ' + JSON.stringify(dryData).substring(0, 100));

    if (dryData.errors && Object.keys(dryData.errors).length > 0) {
        const e = JSON.stringify(dryData.errors).substring(0, 80);
        st('st-create', '❌ ' + e, 'er');
        L('❌ ' + e, 'e');
        document.getElementById('btnCreate').disabled = false;
        return;
    }
    if (!dryData.dryrun_passed) {
        st('st-create', '⚠️ Vérif échouée — change de username', 'er');
        document.getElementById('btnCreate').disabled = false;
        return;
    }

    // ── Étape 2 : send_verify_email ─────────────────────────────────────────
    st('st-create', '⏳ 2/4 Envoi code email…', 'wa');
    L('📡 Étape 2 : send_verify_email…');

    // Récupérer le token captcha si résolu
    let captchaToken = '';
    if (captchaNeeded) {
        try {
            const ta = document.querySelector('textarea[name="h-captcha-response"]');
            captchaToken = ta ? ta.value : '';
        } catch(e) {}
        if (!captchaToken) {
            st('st-create', '⚠️ Résous le captcha d\\'abord !', 'wa');
            document.getElementById('btnCreate').disabled = false;
            return;
        }
        L('🔒 Captcha token : ' + captchaToken.substring(0, 20) + '…');
    }

    const verBody = enc(Object.assign(
        { device_id: mid, email: acct.email },
        captchaToken ? { captcha_token: captchaToken } : {}
    ));

    const verData = await ig(
        'https://i.instagram.com/api/v1/accounts/send_verify_email/',
        verBody,
        'https://www.instagram.com/'
    );
    L('   verify → ' + JSON.stringify(verData).substring(0, 100));

    if (verData.require_captcha) {
        L('🔒 Captcha requis !', 'w');
        st('st-create', '🔒 Résous le captcha ci-dessus puis reclique Créer !', 'wa');
        // Afficher le widget hCaptcha
        captchaNeeded = true;
        const capBox = document.getElementById('cap-box');
        capBox.classList.add('show');
        // Render le widget si pas encore chargé
        if (typeof hcaptcha !== 'undefined') {
            try { hcaptcha.render('hcap', { sitekey: '4c672d35-0701-42b2-88c3-78380b0db560' }); } catch(e) {}
        }
        document.getElementById('btnCreate').disabled = false;
        return;
    }

    if (!verData.email_sent) {
        st('st-create', '❌ Email non envoyé : ' + JSON.stringify(verData).substring(0, 60), 'er');
        document.getElementById('btnCreate').disabled = false;
        captchaNeeded = false;
        return;
    }

    // ── Passer à l'étape code ────────────────────────────────────────────────
    L('✅ Code envoyé à ' + acct.email);
    captchaNeeded = false;
    document.getElementById('cap-box').classList.remove('show');
    document.getElementById('d-email2').textContent = acct.email;
    document.getElementById('step-date').style.display = 'none';
    document.getElementById('step-code').style.display = 'block';
    st('st-code', 'Code envoyé ! Récupération auto…', 'in');
    startPoll();
}

// ── Poll code email ────────────────────────────────────────────────────────────
function startPoll() {
    let secs = 120, tries = 0;
    const badge = document.getElementById('badge-timer');

    countTimer = setInterval(() => {
        badge.textContent = secs + 's';
        if (--secs < 0) { clearInterval(countTimer); badge.textContent = '⏰'; }
    }, 1000);

    pollTimer = setInterval(async () => {
        tries++;
        L('📬 Tentative ' + tries + '…');
        try {
            const r = await (await fetch('/api/poll-code?token=' + encodeURIComponent(acct.token || ''))).json();
            if (r.code) {
                clearInterval(pollTimer);
                clearInterval(countTimer);
                badge.textContent = '✅';
                L('📬 Code auto : ' + r.code);
                await finalize(r.code);
            }
        } catch(e) {}
        if (tries >= 24) {
            clearInterval(pollTimer);
            st('st-code', 'Code non reçu auto — entre-le manuellement', 'wa');
        }
    }, 5000);
}

async function submitCode() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code || code.length < 4) { st('st-code', '⚠️ Code invalide', 'er'); return; }
    clearInterval(pollTimer);
    clearInterval(countTimer);
    document.getElementById('btnCode').disabled = true;
    await finalize(code);
}

// ── Étapes 3+4 ────────────────────────────────────────────────────────────────
async function finalize(code) {
    st('st-code', '⏳ 3/4 Vérification code…', 'wa');
    L('📡 Étape 3 : check_confirmation_code…');

    const chkData = await ig(
        'https://i.instagram.com/api/v1/accounts/check_confirmation_code/',
        enc({ code, device_id: mid, email: acct.email }),
        'https://www.instagram.com/'
    );
    L('   check → ' + JSON.stringify(chkData).substring(0, 120));

    if (!chkData.signup_code) {
        st('st-code', '❌ Code incorrect — réessaie', 'er');
        L('❌ pas de signup_code', 'e');
        document.getElementById('btnCode').disabled = false;
        return;
    }

    st('st-code', '⏳ 4/4 Création finale…', 'wa');
    L('📡 Étape 4 : web_create_ajax…');

    const finalData = await ig(
        'https://www.instagram.com/accounts/web_create_ajax/',
        enc({
            enc_password          : '#PWD_INSTAGRAM_BROWSER:0:' + Math.floor(Date.now()/1000) + ':' + acct.password,
            email                 : acct.email,
            username              : acct.uName,
            first_name            : acct.fullName,
            month, day, year,
            opt_into_one_tap      : 'false',
            client_id             : mid,
            seamless_login_enabled: '1',
            tos_version           : 'row',
            force_sign_up_code    : chkData.signup_code,
        }),
        'https://www.instagram.com/accounts/emailsignup/'
    );
    L('   final → ' + JSON.stringify(finalData).substring(0, 150));

    if (finalData.account_created || finalData.user_id) {
        L('🎉 COMPTE CRÉÉ ! @' + acct.uName);
        document.getElementById('step-code').style.display = 'none';
        document.getElementById('step-done').style.display = 'block';
        document.getElementById('r-email').textContent = acct.email;
        document.getElementById('r-pass').textContent  = acct.password;
        document.getElementById('r-user').textContent  = '@' + acct.uName;
        document.getElementById('r-name').textContent  = acct.fullName;
    } else {
        const err = finalData.errors
            ? JSON.stringify(finalData.errors).substring(0, 100)
            : JSON.stringify(finalData).substring(0, 100);
        L('❌ ' + err, 'e');
        st('st-code', '❌ ' + err, 'er');
        document.getElementById('btnCode').disabled = false;
    }
}

// ── Redémarrer ────────────────────────────────────────────────────────────────
async function restart() {
    document.getElementById('step-done').style.display = 'none';
    document.getElementById('step-code').style.display = 'none';
    document.getElementById('step-date').style.display = 'block';
    document.getElementById('btnCreate').disabled = false;
    document.getElementById('cap-box').classList.remove('show');
    captchaNeeded = false;
    if (typeof hcaptcha !== 'undefined') { try { hcaptcha.reset(); } catch(e) {} }
    await loadInfos();
}

// ── Démarrage ──────────────────────────────────────────────────────────────────
loadInfos();
</script>
</body></html>`);
});

app.listen(PORT, '0.0.0.0', () => slog('🌐 Port ' + PORT));

(async function() {
    slog('🤖 Bot prêt sur le port ' + PORT);
    state.email    = await getFakeMail();
    state.fullName = generatingName();
    state.uName    = username();
})();
