const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const http = require('http');
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
    return "user" + Math.floor(Math.random()*99999) + "@guerrillamail.com";
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
    status: 'starting',   // starting → ready_for_date → waiting_code → done
    email: '', password: 'Azerty12345!', fullName: '', uName: '', token: '',
    screenshot: '',       // base64 PNG mis à jour en continu
    confirmCode: '',
    codeSubmitted: false
};

let browserRef = null;

// ─── SERVEUR EXPRESS ──────────────────────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const port = process.env.PORT || 10000;

// Page principale
app.get('/', (req, res) => {

    if (state.status === 'ready_for_date') {
        // ✅ Afficher le vrai formulaire Instagram en live + boutons pour interagir
        res.send(`<!DOCTYPE html><html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Instagram - Remplis la date</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#000;font-family:Arial,sans-serif}
    .header{background:#e1306c;color:#fff;padding:10px 15px;text-align:center;font-size:15px;font-weight:bold}
    .info{background:#1a1a1a;color:#fff;padding:10px 15px;font-size:13px}
    .info span{color:#00ff88}
    .screen-wrap{position:relative;width:100%;max-width:430px;margin:0 auto;cursor:crosshair}
    .screen-wrap img{width:100%;display:block}
    .overlay{position:absolute;top:0;left:0;width:100%;height:100%}
    .controls{background:#1a1a1a;padding:10px;max-width:430px;margin:0 auto}
    .btn-row{display:flex;gap:8px;margin-bottom:8px}
    button{flex:1;padding:10px;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold}
    .btn-click{background:#0095f6;color:#fff}
    .btn-scroll{background:#444;color:#fff}
    .btn-submit{background:#28a745;color:#fff;padding:14px;width:100%;font-size:16px;margin-top:5px}
    .btn-submit:active{background:#1e7e34}
    input[type=text]{width:100%;padding:10px;border-radius:8px;border:none;font-size:15px;margin-bottom:8px}
    .status{color:#aaa;font-size:12px;text-align:center;padding:5px}
  </style>
</head>
<body>
  <div class="header">🤖 Bot Instagram — Remplis la date de naissance</div>
  <div class="info">
    ✅ Email: <span>${state.email}</span> | ✅ Password: <span>${state.password}</span><br>
    ✅ Nom: <span>${state.fullName}</span> | ✅ Username: <span>${state.uName}</span>
  </div>

  <!-- Screenshot live d'Instagram -->
  <div class="screen-wrap" id="screenWrap">
    <img id="liveScreen" src="/screenshot" alt="Instagram">
    <div class="overlay" id="overlay"></div>
  </div>

  <div class="controls">
    <p style="color:#aaa;font-size:12px;margin-bottom:8px;text-align:center">
      👆 Clique sur l'image pour interagir avec Instagram (sélectionner la date)<br>
      Après avoir choisi la date, clique le bouton vert Submit
    </p>
    <div class="btn-row">
      <button class="btn-scroll" onclick="scrollPage(-300)">⬆️ Scroll haut</button>
      <button class="btn-scroll" onclick="scrollPage(300)">⬇️ Scroll bas</button>
    </div>
    <button class="btn-submit" onclick="submitForm()">🚀 Cliquer Submit sur Instagram</button>
    <div class="status" id="statusMsg">Prêt — clique sur les menus de date dans l'image</div>
  </div>

  <script>
    // Rafraîchir le screenshot toutes les 1.5 secondes
    setInterval(() => {
      document.getElementById('liveScreen').src = '/screenshot?t=' + Date.now();
    }, 1500);

    // Clic sur l'image → envoyer les coordonnées au bot
    document.getElementById('overlay').addEventListener('click', async function(e) {
      const img = document.getElementById('liveScreen');
      const rect = img.getBoundingClientRect();
      const scaleX = 390 / rect.width;   // la fenêtre du bot fait 390px de large
      const scaleY = 844 / rect.height;  // et 844px de haut
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      document.getElementById('statusMsg').textContent = '🖱️ Clic à (' + x + ', ' + y + ')...';
      try {
        const r = await fetch('/click', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({x,y})});
        const d = await r.json();
        document.getElementById('statusMsg').textContent = d.ok ? '✅ Clic effectué !' : '⚠️ Erreur clic';
      } catch(err) {
        document.getElementById('statusMsg').textContent = '⚠️ Erreur réseau';
      }
    });

    async function scrollPage(dy) {
      await fetch('/scroll', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({dy})});
    }

    async function submitForm() {
      document.getElementById('statusMsg').textContent = '⏳ Clic Submit en cours...';
      const r = await fetch('/do-submit', {method:'POST'});
      const d = await r.json();
      document.getElementById('statusMsg').textContent = d.msg || 'Fait !';
      setTimeout(() => { window.location.href = '/'; }, 3000);
    }
  </script>
</body></html>`);

    } else if (state.status === 'waiting_code') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code Instagram</title>
<style>
  body{font-family:Arial;max-width:430px;margin:20px auto;padding:15px;background:#fafafa}
  h2{color:#e1306c;text-align:center}
  .card{background:#fff;border:1px solid #ddd;border-radius:12px;padding:18px;margin:12px 0}
  .token{background:#1a1a2e;color:#00ff88;border-radius:8px;padding:10px;font-family:monospace;font-size:10px;word-break:break-all;margin:8px 0}
  img{width:100%;border-radius:8px;margin-bottom:12px}
  input{width:90%;padding:16px;font-size:28px;text-align:center;letter-spacing:10px;border:2px solid #ccc;border-radius:10px;display:block;margin:10px auto}
  button{width:100%;padding:14px;background:#0095f6;color:#fff;border:none;border-radius:10px;font-size:18px;cursor:pointer}
</style></head>
<body>
  <h2>📧 Code de confirmation</h2>
  <img src="/screenshot?t=${Date.now()}" alt="Instagram">
  <div class="card">
    <p>📧 <strong>${state.email}</strong></p>
    <p>Le bot récupère le code automatiquement...</p>
    <p>Si tu ne reçois rien dans 1 min, entre-le manuellement :</p>
    <div class="token">${state.token}</div>
    <small>curl "https://doux.gleeze.com/tempmail/inbox?token=TOKEN"</small>
  </div>
  <form action="/submit-code" method="POST">
    <input type="number" name="code" placeholder="000000" autofocus>
    <button>✅ Valider</button>
  </form>
</body></html>`);

    } else if (state.status === 'done') {
        res.send(`<!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:40px;background:#fafafa">
  <h1 style="color:#28a745">🎉 Compte créé !</h1>
  <div style="background:#d4edda;border:1px solid #28a745;border-radius:12px;padding:25px;max-width:400px;margin:auto;text-align:left">
    <p>📧 <b>Email :</b> ${state.email}</p>
    <p>🔒 <b>Mot de passe :</b> ${state.password}</p>
    <p>👤 <b>Username :</b> @${state.uName}</p>
    <p>🏷️ <b>Nom :</b> ${state.fullName}</p>
  </div>
  <p style="color:#666;margin-top:15px">Sauvegarde ces informations !</p>
</body></html>`);

    } else if (state.status === 'error') {
        res.send(`<body style="font-family:Arial;padding:30px"><h1 style="color:red">❌ ${state.errorMsg}</h1><img src="/screenshot" style="width:100%"></body>`);
    } else {
        res.send(`<body style="font-family:Arial;text-align:center;padding:60px;background:#fafafa">
  <h2>⏳ ${state.status}...</h2>
  <meta http-equiv="refresh" content="2">
</body>`);
    }
});

// Screenshot live
app.get('/screenshot', (req, res) => {
    if (state.screenshot) {
        const buf = Buffer.from(state.screenshot, 'base64');
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'no-cache');
        res.send(buf);
    } else {
        res.status(404).send('Pas de screenshot');
    }
});

// ✅ Recevoir un clic et l'exécuter dans le navigateur
app.post('/click', async (req, res) => {
    const { x, y } = req.body;
    try {
        if (browserRef) {
            await browserRef.executeScript(`
                var el = document.elementFromPoint(arguments[0], arguments[1]);
                if (el) {
                    el.click();
                    // Pour les selects, simuler un vrai clic
                    var evt = new MouseEvent('click', {bubbles:true, cancelable:true, clientX:arguments[0], clientY:arguments[1]});
                    el.dispatchEvent(evt);
                }
            `, x, y);
            await sleep(800);
            // Mettre à jour le screenshot après le clic
            state.screenshot = await browserRef.takeScreenshot();
        }
        res.json({ ok: true });
    } catch(e) {
        res.json({ ok: false, error: e.message });
    }
});

// Scroll
app.post('/scroll', async (req, res) => {
    const { dy } = req.body;
    try {
        if (browserRef) {
            await browserRef.executeScript(`window.scrollBy(0, arguments[0]);`, dy);
            await sleep(500);
            state.screenshot = await browserRef.takeScreenshot();
        }
        res.json({ ok: true });
    } catch(e) { res.json({ ok: false }); }
});

// ✅ Déclencher le Submit depuis l'interface
app.post('/do-submit', async (req, res) => {
    try {
        if (browserRef) {
            let btns = await browserRef.findElements(By.tagName("button"));
            let submitBtn = null;
            for (let b of btns) {
                let t   = await b.getAttribute("type");
                let txt = (await b.getText()).toLowerCase();
                if (t === "submit" || /submit|envoyer|next|sign up/i.test(txt)) { submitBtn = b; break; }
            }
            if (!submitBtn && btns.length > 0) submitBtn = btns[btns.length - 1];

            if (submitBtn) {
                await browserRef.executeScript("arguments[0].removeAttribute('disabled');arguments[0].click();", submitBtn);
                await sleep(3000);
                state.screenshot = await browserRef.takeScreenshot();
                // Passer à la phase code
                state.status = 'waiting_code';
                res.json({ ok: true, msg: '✅ Submit cliqué ! En attente du code...' });
            } else {
                res.json({ ok: false, msg: '❌ Aucun bouton submit trouvé' });
            }
        }
    } catch(e) { res.json({ ok: false, msg: '❌ ' + e.message }); }
});

// Code manuel
app.post('/submit-code', (req, res) => {
    state.confirmCode = req.body.code;
    console.log("🔑 Code manuel : " + state.confirmCode);
    res.send(`<body style="font-family:Arial;text-align:center;padding:40px"><h2 style="color:green">✅ Code reçu !</h2><meta http-equiv="refresh" content="2;url=/"></body>`);
});

app.listen(port, '0.0.0.0', () => console.log(`🌐 Port ${port}`));

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function humanType(el, text) {
    for (let c of text) { await el.sendKeys(c); await sleep(Math.random()*45+20); }
}
async function fillReact(browser, el, val) {
    await browser.executeScript(`
        var e=arguments[0],v=arguments[1];
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(e,v);
        ['input','change','blur'].forEach(n=>e.dispatchEvent(new Event(n,{bubbles:true})));
    `, el, val);
    await sleep(300);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async function main() {
    const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
    const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');
    const service = new chrome.ServiceBuilder(driverPath);
    const opts = new chrome.Options();
    opts.setChromeBinaryPath(chromePath);
    opts.addArguments('--headless=new','--no-sandbox','--disable-dev-shm-usage',
        '--window-size=390,844','--disable-blink-features=AutomationControlled','--lang=en-US,en');
    opts.addArguments('--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
    opts.setUserPreferences({'intl.accept_languages':'en-US,en'});

    let browser = await new Builder().forBrowser('chrome').setChromeOptions(opts).setChromeService(service).build();
    browserRef = browser;

    // Screenshot en continu
    const liveLoop = setInterval(async () => {
        try { state.screenshot = await browser.takeScreenshot(); } catch(e) { clearInterval(liveLoop); }
    }, 1500);

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
        await sleep(8000);

        try {
            let btn = await browser.findElement(By.xpath("//button[contains(.,'Allow') or contains(.,'Accept') or contains(.,'Accepter') or contains(.,'Tout autoriser')]"));
            await btn.click(); await sleep(2000);
        } catch(e) {}

        // ── 3. EMAIL ──────────────────────────────────────────────────────────
        console.log("✍️ Email...");
        let inputs = await browser.findElements(By.tagName("input"));
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "email" || t === "tel") {
                await browser.executeScript("arguments[0].click();arguments[0].focus();", inp);
                await sleep(400);
                await humanType(inp, mail);
                await fillReact(browser, inp, mail);
                console.log("✅ Email saisi");
                break;
            }
        }

        // ── 4. PASSWORD ───────────────────────────────────────────────────────
        console.log("🔒 Password...");
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "password") {
                await browser.executeScript("arguments[0].click();arguments[0].focus();", inp);
                await sleep(300);
                await humanType(inp, state.password);
                await fillReact(browser, inp, state.password);
                await browser.executeScript("arguments[0].blur();document.body.click();", inp);
                await sleep(2500);
                console.log("✅ Password saisi");
                break;
            }
        }

        // ── 5. NOM & USERNAME ─────────────────────────────────────────────────
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
            await sleep(300);
            await humanType(nameInp, state.fullName);
            await fillReact(browser, nameInp, state.fullName);
            console.log("✅ Nom : " + state.fullName);
            await sleep(500);
        }

        if (textInputs.length >= 1) {
            let userInp = textInputs[textInputs.length - 1];
            await browser.executeScript("arguments[0].click();arguments[0].focus();", userInp);
            await sleep(300);
            await browser.executeScript(`var e=arguments[0];Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));`, userInp);
            await sleep(200);
            await humanType(userInp, state.uName);
            await fillReact(browser, userInp, state.uName);
            console.log("✅ Username : " + state.uName);
            await sleep(1500);
        }

        // ── 6. PASSER EN MODE INTERACTIF pour la date ─────────────────────────
        console.log("🎂 En attente de la saisie de la date par l'utilisateur...");
        console.log("🌐 L'utilisateur doit ouvrir l'URL Render et cliquer sur les menus de date");
        state.status = 'ready_for_date';

        // Attendre que l'utilisateur clique Submit (via /do-submit)
        // Le status passera à 'waiting_code' quand Submit est cliqué
        let waited = 0;
        while (state.status === 'ready_for_date' && waited < 600) {
            await sleep(2000); waited += 2;
        }

        if (state.status !== 'waiting_code') {
            state.status = 'error'; state.errorMsg = 'Timeout : Submit non cliqué';
            clearInterval(liveLoop);
            return;
        }

        // ── 7. CODE DE VÉRIFICATION ───────────────────────────────────────────
        console.log("📬 Attente code...");
        let code = await getCodeFromMail();

        if (!code) {
            console.log("   ⏳ Attente code manuel...");
            let waitedCode = 0;
            while (!state.confirmCode && waitedCode < 300) {
                await sleep(2000); waitedCode += 2;
            }
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
                await sleep(1000);
                let cBtns = await browser.findElements(By.tagName("button"));
                if (cBtns.length > 0) {
                    await browser.executeScript("arguments[0].click();", cBtns[0]);
                    console.log("✅ Code soumis !");
                }
            }
        }

        await sleep(5000);
        clearInterval(liveLoop);
        state.screenshot = await browser.takeScreenshot();
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
