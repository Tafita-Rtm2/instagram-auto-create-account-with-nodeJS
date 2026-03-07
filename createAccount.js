const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');
const fetch = require('node-fetch');
const { generatingName, username } = require('./accountInfoGenerator');

// ─── FAKE MAIL API ────────────────────────────────────────────────────────────
async function getFakeMail() {
    try {
        const res  = await fetch('https://doux.gleeze.com/tempmail/gen', { timeout: 10000 });
        const data = await res.json();
        if (data && data.email && data.token) {
            global._mailToken = data.token;
            global._mailEmail = data.email;
            console.log("════════════════════════════════════════");
            console.log("📧 EMAIL : " + data.email);
            console.log("🔑 TOKEN : " + data.token);
            console.log("════════════════════════════════════════");
            return data.email;
        }
    } catch(e) { console.log("⚠️ API mail : " + e.message); }
    const fb = "user" + Math.floor(Math.random()*99999) + "@guerrillamail.com";
    console.log("📧 Fallback : " + fb);
    return fb;
}

async function getCodeFromMail() {
    if (!global._mailToken) return "";
    for (let i = 1; i <= 12; i++) {
        try {
            const res  = await fetch(`https://doux.gleeze.com/tempmail/inbox?token=${encodeURIComponent(global._mailToken)}`, { timeout: 10000 });
            const data = await res.json();
            console.log(`   📬 Tentative ${i} : ${data.answer ? data.answer.length : 0} email(s)`);
            if (data.answer && data.answer.length > 0) {
                for (let m of data.answer) {
                    const txt = (m.subject||"") + " " + (m.intro||"");
                    const match = txt.match(/\b(\d{6})\b/);
                    if (match) { console.log("   ✅ Code : " + match[1]); return match[1]; }
                }
            }
        } catch(e) {}
        await sleep(5000);
    }
    return "";
}

// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────────
let state = {
    status: 'starting',
    email: '', password: 'Azerty12345!', fullName: '', uName: '', token: '',
    screenshot: '',
    confirmCode: ''
};
let browserRef = null;

// ─── SERVEUR EXPRESS ──────────────────────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {

    // ── Saisie de la date ─────────────────────────────────────────────────────
    if (state.status === 'ready_for_date') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#f0f2f5;min-height:100vh}
    .header{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:17px;font-weight:bold}
    .container{max-width:460px;margin:0 auto;padding:12px}
    .card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .info-row{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:14px;border-bottom:1px solid #f0f0f0}
    .info-row:last-child{border:none}
    .info-label{color:#888;width:90px;flex-shrink:0}
    .info-val{color:#222;font-weight:bold;word-break:break-all}
    .date-title{font-size:15px;font-weight:bold;color:#333;margin-bottom:12px}
    .date-row{display:flex;gap:8px}
    .date-col{flex:1;text-align:center}
    .date-col label{display:block;font-size:11px;font-weight:bold;color:#888;margin-bottom:4px;text-transform:uppercase}
    select{width:100%;padding:12px 4px;border:2px solid #e0e0e0;border-radius:10px;font-size:16px;background:#fff;text-align:center;cursor:pointer;transition:border-color .2s}
    select:focus{border-color:#e1306c;outline:none}
    .btn{width:100%;padding:16px;background:linear-gradient(135deg,#0095f6,#0074cc);color:#fff;border:none;border-radius:12px;font-size:18px;font-weight:bold;cursor:pointer;margin-top:4px;transition:opacity .2s}
    .btn:disabled{opacity:.5}
    .status{text-align:center;font-size:14px;padding:8px;min-height:22px;border-radius:8px;margin-top:8px}
    .status.ok{background:#d4edda;color:#155724}
    .status.err{background:#f8d7da;color:#721c24}
    .status.wait{background:#fff3cd;color:#856404}
    .screenshot{width:100%;border-radius:10px;border:1px solid #eee;display:block}
    .screen-label{font-size:12px;color:#888;text-align:center;margin:6px 0 4px}
  </style>
</head>
<body>
  <div class="header">🤖 Bot Instagram — Choisis la date</div>
  <div class="container">

    <div class="card">
      <div class="info-row"><span class="info-label">📧 Email</span><span class="info-val">${state.email}</span></div>
      <div class="info-row"><span class="info-label">🔒 Password</span><span class="info-val">${state.password}</span></div>
      <div class="info-row"><span class="info-label">🏷️ Nom</span><span class="info-val">${state.fullName}</span></div>
      <div class="info-row"><span class="info-label">👤 Username</span><span class="info-val">${state.uName}</span></div>
    </div>

    <div class="card">
      <div class="date-title">🎂 Date de naissance</div>
      <div class="date-row">
        <div class="date-col">
          <label>Mois</label>
          <select id="selMonth">
            <option value="">--</option>
            <option value="1">Janvier</option><option value="2">Février</option>
            <option value="3">Mars</option><option value="4">Avril</option>
            <option value="5">Mai</option><option value="6">Juin</option>
            <option value="7">Juillet</option><option value="8">Août</option>
            <option value="9">Septembre</option><option value="10">Octobre</option>
            <option value="11">Novembre</option><option value="12">Décembre</option>
          </select>
        </div>
        <div class="date-col">
          <label>Jour</label>
          <select id="selDay">
            <option value="">--</option>
            ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
          </select>
        </div>
        <div class="date-col">
          <label>Année</label>
          <select id="selYear">
            <option value="">--</option>
            ${Array.from({length:80},(_,i)=>`<option value="${2006-i}">${2006-i}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn" id="btnCreate" onclick="go()">🚀 Créer le compte !</button>
      <div class="status wait" id="statusMsg">Choisis le mois, le jour et l'année</div>
    </div>

    <div class="card">
      <div class="screen-label">📸 Vue en direct (rafraîchissement auto)</div>
      <img id="liveImg" class="screenshot" src="/screenshot?t=0" alt="Instagram">
    </div>
  </div>

  <script>
    // Rafraîchir screenshot toutes les 2s
    setInterval(() => {
      const img = document.getElementById('liveImg');
      img.src = '/screenshot?t=' + Date.now();
    }, 2000);

    async function go() {
      const m = document.getElementById('selMonth').value;
      const d = document.getElementById('selDay').value;
      const y = document.getElementById('selYear').value;
      const st = document.getElementById('statusMsg');
      if (!m || !d || !y) {
        st.className = 'status err';
        st.textContent = '⚠️ Choisis le mois, le jour ET l\\'année !';
        return;
      }
      document.getElementById('btnCreate').disabled = true;
      st.className = 'status wait';
      st.textContent = '⏳ Injection en cours...';
      try {
        const r = await fetch('/inject-date-and-submit', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({month:m, day:d, year:y})
        });
        const data = await r.json();
        if (data.ok) {
          st.className = 'status ok';
          st.textContent = data.msg;
          setTimeout(() => location.href = '/', 2000);
        } else {
          st.className = 'status err';
          st.textContent = data.msg;
          document.getElementById('btnCreate').disabled = false;
        }
      } catch(e) {
        st.className = 'status err';
        st.textContent = '⚠️ Erreur réseau';
        document.getElementById('btnCreate').disabled = false;
      }
    }
  </script>
</body></html>`);

    // ── Code de confirmation ──────────────────────────────────────────────────
    } else if (state.status === 'waiting_code') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code Instagram</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial;background:#f0f2f5;min-height:100vh}
  .header{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:17px;font-weight:bold}
  .container{max-width:460px;margin:0 auto;padding:12px}
  .card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .token{background:#1a1a2e;color:#00ff88;border-radius:8px;padding:10px;font-family:monospace;font-size:10px;word-break:break-all;margin:10px 0}
  input[type=number]{width:100%;padding:16px;font-size:28px;text-align:center;letter-spacing:10px;border:2px solid #e0e0e0;border-radius:10px;margin:10px 0;-moz-appearance:textfield}
  input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none}
  input:focus{border-color:#e1306c;outline:none}
  .btn{width:100%;padding:14px;background:linear-gradient(135deg,#0095f6,#0074cc);color:#fff;border:none;border-radius:12px;font-size:17px;font-weight:bold;cursor:pointer}
  .screenshot{width:100%;border-radius:10px;border:1px solid #eee}
  p{margin:6px 0;font-size:14px;color:#444}
</style></head>
<body>
  <div class="header">📧 Code de confirmation</div>
  <div class="container">
    <div class="card">
      <p>📧 Email : <strong>${state.email}</strong></p>
      <p>Le bot récupère le code automatiquement.<br>Si rien dans 1 min, entre-le ici :</p>
      <p style="margin-top:10px;font-size:13px;color:#888">🔑 Token pour accéder aux emails :</p>
      <div class="token">${state.token}</div>
      <code style="font-size:11px;color:#666;word-break:break-all">curl "https://doux.gleeze.com/tempmail/inbox?token=TOKEN_CI_DESSUS"</code>
    </div>
    <div class="card">
      <form action="/submit-code" method="POST">
        <input type="number" name="code" placeholder="000000" autofocus>
        <button class="btn">✅ Valider le code</button>
      </form>
    </div>
    <div class="card">
      <img class="screenshot" src="/screenshot?t=${Date.now()}" alt="Instagram">
    </div>
  </div>
</body></html>`);

    // ── Succès ────────────────────────────────────────────────────────────────
    } else if (state.status === 'done') {
        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial;background:#f0f2f5;min-height:100vh">
  <div style="background:linear-gradient(135deg,#28a745,#20c997);color:#fff;padding:20px;text-align:center;font-size:20px;font-weight:bold">
    🎉 Compte Instagram créé !
  </div>
  <div style="max-width:460px;margin:20px auto;padding:0 12px">
    <div style="background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
      <p style="margin:8px 0;font-size:16px">📧 <b>Email :</b> <span style="color:#0095f6">${state.email}</span></p>
      <p style="margin:8px 0;font-size:16px">🔒 <b>Mot de passe :</b> ${state.password}</p>
      <p style="margin:8px 0;font-size:16px">👤 <b>Username :</b> @${state.uName}</p>
      <p style="margin:8px 0;font-size:16px">🏷️ <b>Nom :</b> ${state.fullName}</p>
    </div>
    <p style="text-align:center;color:#666;margin-top:15px;font-size:14px">💾 Sauvegarde ces informations !</p>
  </div>
</body></html>`);

    // ── Erreur ────────────────────────────────────────────────────────────────
    } else if (state.status === 'error') {
        res.send(`<body style="font-family:Arial;padding:20px"><h2 style="color:red">❌ ${state.errorMsg}</h2><img src="/screenshot" style="width:100%;border-radius:8px"></body>`);

    // ── Chargement ────────────────────────────────────────────────────────────
    } else {
        res.send(`<body style="font-family:Arial;text-align:center;padding:60px;background:#f0f2f5">
  <h2 style="color:#0095f6">⏳ ${state.status}...</h2>
  <p style="color:#666;margin-top:10px">Le bot initialise le formulaire Instagram</p>
  <meta http-equiv="refresh" content="2">
</body>`);
    }
});

// Screenshot live
app.get('/screenshot', (req, res) => {
    if (state.screenshot) {
        res.set('Content-Type','image/png');
        res.set('Cache-Control','no-cache,no-store');
        res.send(Buffer.from(state.screenshot, 'base64'));
    } else { res.status(404).send(''); }
});

// ✅ Injection date + submit (avec scroll pour trouver le bouton)
// ✅ Injection date via querySelector direct + React native setter
// ✅ Injection date — essaie toutes les formes possibles
app.post('/inject-date-and-submit', async (req, res) => {
    const { month, day, year } = req.body;
    const monthNum = parseInt(month);
    // Toutes les formes possibles pour le mois
    const monthForms = [
        String(monthNum),
        ['January','February','March','April','May','June','July','August','September','October','November','December'][monthNum-1],
        ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][monthNum-1],
        ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][monthNum-1],
    ];
    console.log(`📅 Injection : jour=${day} mois=${month}(${monthForms[1]}) année=${year}`);

    try {
        if (!browserRef) return res.json({ ok:false, msg:'❌ Browser non dispo' });

        // Tout faire en JS pur dans le navigateur
        const result = await browserRef.executeScript(`
            var monthForms = arguments[0]; // tableau de formes possibles
            var day        = String(arguments[1]);
            var year       = String(arguments[2]);
            var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;

            function trySet(sel, candidates) {
                var opts = Array.from(sel.options);
                for (var ci = 0; ci < candidates.length; ci++) {
                    var v = String(candidates[ci]);
                    for (var oi = 0; oi < opts.length; oi++) {
                        if (opts[oi].value === v || opts[oi].text.trim() === v || opts[oi].text.trim().toLowerCase() === v.toLowerCase()) {
                            nativeSetter.call(sel, opts[oi].value);
                            ['input','change','blur'].forEach(function(n){ sel.dispatchEvent(new Event(n,{bubbles:true})); });
                            return opts[oi].text.trim();
                        }
                    }
                }
                // Log des options disponibles pour debug
                return 'FAILED(opts:' + opts.slice(1,4).map(function(o){return o.text.trim();}).join(',') + ')';
            }

            function dayForms(d)  { return [d, String(parseInt(d))]; }
            function yearForms(y) { return [y, String(parseInt(y))]; }

            var selects = Array.from(document.querySelectorAll('select'));
            var log = ['total='+selects.length];

            if (selects.length === 0) return {ok:false, msg:'Aucun select dans le DOM'};

            var mResult, dResult, yResult;

            if (selects.length >= 3) {
                // Détecter l'ordre : regarder les options du 1er select
                var first3 = Array.from(selects[0].options).slice(1,3).map(function(o){return o.text.trim();}).join(',');
                log.push('order_hint='+first3);
                var monthFirst = /jan|fév|mar/i.test(first3);
                var mI = monthFirst ? 0 : 1;
                var dI = monthFirst ? 1 : 0;
                var yI = 2;
                mResult = trySet(selects[mI], monthForms);
                dResult = trySet(selects[dI], dayForms(day));
                yResult = trySet(selects[yI], yearForms(year));
            } else {
                // 1 seul select — c'est probablement le Month
                mResult = trySet(selects[0], monthForms);
                log.push('after_month='+mResult);
                // Attendre React
                var waitStart = Date.now();
                while(Date.now()-waitStart < 2000) {
                    selects = Array.from(document.querySelectorAll('select'));
                    if(selects.length >= 3) break;
                }
                log.push('after_wait='+selects.length);
                dResult = selects.length >= 2 ? trySet(selects[1], dayForms(day))  : 'NO_SELECT';
                yResult = selects.length >= 3 ? trySet(selects[2], yearForms(year)): 'NO_SELECT';
            }

            log.push('month='+mResult, 'day='+dResult, 'year='+yResult);
            var allOk = !mResult.startsWith('FAILED') && !dResult.startsWith('FAILED') && !yResult.startsWith('FAILED')
                        && mResult !== 'NO_SELECT' && dResult !== 'NO_SELECT' && yResult !== 'NO_SELECT';
            return {ok: allOk, log: log, m:mResult, d:dResult, y:yResult};
        `, monthForms, day, year);

        console.log(`   Résultat : m="${result.m}" d="${result.d}" y="${result.y}"`);
        console.log(`   Log : ${result.log.join(' | ')}`);
        await sleep(800);
        state.screenshot = await browserRef.takeScreenshot();

        if (!result.ok) {
            return res.json({ ok:false, msg:`❌ Injection échouée — m=${result.m} d=${result.d} y=${result.y}` });
        }

        // Submit via JS pur avec scrollIntoView
        const submitResult = await browserRef.executeScript(`
            var btns = Array.from(document.querySelectorAll('button'));
            var btn = null;
            for (var i = 0; i < btns.length; i++) {
                var t = (btns[i].getAttribute('type')||'').toLowerCase();
                var txt = btns[i].textContent.trim().toLowerCase();
                if (t === 'submit' || txt === 'submit' || txt === 'next' || txt === 'sign up') { btn = btns[i]; break; }
            }
            if (!btn && btns.length > 0) btn = btns[btns.length-1];
            if (btn) {
                btn.removeAttribute('disabled');
                btn.scrollIntoView({block:'center',behavior:'instant'});
                btn.click();
                return {ok:true, txt: btn.textContent.trim()};
            }
            return {ok:false, count: btns.length};
        `);

        console.log(`   Submit : ${JSON.stringify(submitResult)}`);
        await sleep(3000);
        state.screenshot = await browserRef.takeScreenshot();
        state.status = 'waiting_code';

        res.json({ ok:true, msg:`✅ Date: ${result.m}/${result.d}/${result.y} — Submit cliqué !` });

    } catch(e) {
        console.error("❌ inject : " + e.message);
        res.json({ ok:false, msg:'❌ ' + e.message });
    }
});

// Code manuel
app.post('/submit-code', (req, res) => {
    state.confirmCode = req.body.code;
    console.log("🔑 Code manuel : " + state.confirmCode);
    res.send(`<body style="font-family:Arial;text-align:center;padding:40px"><h2 style="color:green">✅ Code reçu !</h2><meta http-equiv="refresh" content="2;url=/"></body>`);
});

app.get('/debug-image', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) res.sendFile(path.join(process.cwd(), 'error_screenshot.png'));
    else res.send('Pas de screenshot');
});

app.listen(port, '0.0.0.0', () => console.log(`🌐 Port ${port}`));

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function humanType(el, text) {
    for (let c of text) { await el.sendKeys(c); await sleep(Math.random()*30+15); }
}
async function fillReact(browser, el, val) {
    await browser.executeScript(`
        var e=arguments[0],v=arguments[1];
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(e,v);
        ['input','change','blur'].forEach(function(n){ e.dispatchEvent(new Event(n,{bubbles:true})); });
    `, el, val);
    await sleep(200);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async function main() {
    const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
    const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');
    const service = new chrome.ServiceBuilder(driverPath);
    const opts = new chrome.Options();
    opts.setChromeBinaryPath(chromePath);
    opts.addArguments('--headless=new','--no-sandbox','--disable-dev-shm-usage',
        '--window-size=1280,900','--disable-blink-features=AutomationControlled','--lang=en-US,en');
    opts.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    opts.setUserPreferences({'intl.accept_languages':'en-US,en'});

    let browser = await new Builder().forBrowser('chrome').setChromeOptions(opts).setChromeService(service).build();
    browserRef = browser;

    // Screenshot en continu toutes les 2s
    const liveLoop = setInterval(async () => {
        try { state.screenshot = await browser.takeScreenshot(); }
        catch(e) { clearInterval(liveLoop); }
    }, 2000);

    try {
        // ── 1. SETUP ──────────────────────────────────────────────────────────
        let mail = await getFakeMail();
        state.email    = mail;
        state.token    = global._mailToken || '';
        state.fullName = generatingName();
        state.uName    = username();
        state.status   = 'loading';
        console.log(`👤 Nom: "${state.fullName}" | Username: "${state.uName}"`);

        // ── 2. OUVRIR INSTAGRAM ───────────────────────────────────────────────
        console.log("🌍 Ouverture Instagram...");
        await browser.get("https://www.instagram.com/accounts/emailsignup/");
        await sleep(6000);

        // Cookie popup
        try {
            let btn = await browser.findElement(By.xpath("//button[contains(.,'Allow') or contains(.,'Accept') or contains(.,'Accepter') or contains(.,'Tout autoriser')]"));
            await btn.click(); await sleep(1500);
        } catch(e) {}

        // ── 3. EMAIL ──────────────────────────────────────────────────────────
        console.log("✍️ Email...");
        let inputs = await browser.findElements(By.tagName("input"));
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "email" || t === "tel") {
                await browser.executeScript("arguments[0].click();arguments[0].focus();", inp);
                await sleep(300);
                await humanType(inp, mail);
                await fillReact(browser, inp, mail);
                console.log("✅ Email : " + mail);
                break;
            }
        }
        await sleep(500);

        // ── 4. PASSWORD ───────────────────────────────────────────────────────
        console.log("🔒 Password...");
        inputs = await browser.findElements(By.tagName("input"));
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "password") {
                await browser.executeScript("arguments[0].click();arguments[0].focus();", inp);
                await sleep(200);
                await humanType(inp, state.password);
                await fillReact(browser, inp, state.password);
                // Blur fort pour déclencher l'apparition des selects
                await browser.executeScript(`
                    arguments[0].blur();
                    document.body.click();
                    document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));
                `, inp);
                await sleep(3000); // Attendre que les selects apparaissent
                console.log("✅ Password saisi");
                break;
            }
        }

        // ── 5. VÉRIFIER QUE LES SELECTS SONT LÀ ──────────────────────────────
        let selects = await browser.findElements(By.tagName("select"));
        console.log(`   ${selects.length} select(s) après password blur`);
        if (selects.length < 3) {
            // Attendre encore
            for (let i = 0; i < 5; i++) {
                await sleep(2000);
                selects = await browser.findElements(By.tagName("select"));
                console.log(`   Attente selects ${i+1}/5 : ${selects.length}`);
                if (selects.length >= 3) break;
            }
        }

        // ── 6. NOM & USERNAME ─────────────────────────────────────────────────
        console.log("👤 Nom & Username...");
        let allInputs = await browser.findElements(By.tagName("input"));
        let textInputs = [];
        for (let inp of allInputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "search") textInputs.push(inp);
        }
        console.log(`   ${textInputs.length} input(s) texte`);

        if (textInputs.length >= 2) {
            let nameInp = textInputs[textInputs.length - 2];
            await browser.executeScript("arguments[0].click();arguments[0].focus();", nameInp);
            await sleep(200);
            await humanType(nameInp, state.fullName);
            await fillReact(browser, nameInp, state.fullName);
            console.log("✅ Nom : " + state.fullName);
            await sleep(400);
        }

        if (textInputs.length >= 1) {
            let userInp = textInputs[textInputs.length - 1];
            await browser.executeScript("arguments[0].click();arguments[0].focus();", userInp);
            await sleep(200);
            await browser.executeScript(`
                var e=arguments[0];
                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(e,'');
                e.dispatchEvent(new Event('input',{bubbles:true}));
            `, userInp);
            await sleep(150);
            await humanType(userInp, state.uName);
            await fillReact(browser, userInp, state.uName);
            console.log("✅ Username : " + state.uName);
            await sleep(1000);
        }

        // ── 7. ATTENTE SAISIE DATE PAR L'UTILISATEUR ──────────────────────────
        console.log("🎂 En attente de la date (interface web)...");
        state.status = 'ready_for_date';

        let waited = 0;
        while (state.status === 'ready_for_date' && waited < 600) {
            await sleep(2000); waited += 2;
        }

        if (state.status !== 'waiting_code') {
            state.status = 'error'; state.errorMsg = 'Timeout : pas de réponse';
            clearInterval(liveLoop); return;
        }

        // ── 8. CODE DE VÉRIFICATION ───────────────────────────────────────────
        console.log("📬 Attente code...");
        let code = await getCodeFromMail();

        if (!code) {
            console.log("   ⏳ Attente code manuel (5 min)...");
            let w = 0;
            while (!state.confirmCode && w < 300) { await sleep(2000); w += 2; }
            code = state.confirmCode;
        }

        if (code && code.length >= 4) {
            console.log("🔑 Code : " + code);
            let codeInput = null;
            try {
                codeInput = await browser.wait(until.elementLocated(
                    By.xpath("//input[@name='confirmationCode' or @inputmode='numeric' or @autocomplete='one-time-code']")
                ), 10000);
            } catch(e) {
                let ins = await browser.findElements(By.tagName("input"));
                if (ins.length > 0) codeInput = ins[0];
            }
            if (codeInput) {
                await browser.executeScript("arguments[0].focus();", codeInput);
                await humanType(codeInput, code);
                await fillReact(browser, codeInput, code);
                await sleep(800);
                let cBtns = await browser.findElements(By.tagName("button"));
                if (cBtns.length > 0) {
                    await browser.executeScript("arguments[0].click();", cBtns[0]);
                    console.log("✅ Code soumis !");
                }
            }
        }

        await sleep(5000);
        clearInterval(liveLoop);
        try { state.screenshot = await browser.takeScreenshot(); } catch(e) {}
        state.status = 'done';

        console.log("════════════════════════════════════════");
        console.log("🎉 COMPTE CRÉÉ !");
        console.log(`   📧 Email    : ${state.email}`);
        console.log(`   🔒 Password : ${state.password}`);
        console.log(`   👤 Username : @${state.uName}`);
        console.log(`   🏷️  Nom      : ${state.fullName}`);
        console.log("════════════════════════════════════════");

    } catch(e) {
        clearInterval(liveLoop);
        console.error("❌ ERREUR : " + e.message);
        state.status = 'error'; state.errorMsg = e.message;
        try { state.screenshot = await browser.takeScreenshot(); } catch(_) {}
    } finally {
        await sleep(60000);
        await browser.quit();
    }
})();
