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
            // ✅ Afficher le token dans les logs pour pouvoir le copier
            console.log("════════════════════════════════════════════");
            console.log("📧 EMAIL    : " + data.email);
            console.log("🔑 TOKEN    : " + data.token);
            console.log("════════════════════════════════════════════");
            return data.email;
        }
    } catch(e) { console.log("⚠️ API mail : " + e.message); }
    return "user" + Math.floor(Math.random()*99999) + "@guerrillamail.com";
}

async function getCodeFromMail() {
    if (!global._mailToken) return "";
    for (let i = 1; i <= 10; i++) {
        try {
            const res  = await fetch(`https://doux.gleeze.com/tempmail/inbox?token=${encodeURIComponent(global._mailToken)}`, { timeout: 10000 });
            const data = await res.json();
            console.log(`   📬 Tentative ${i} : ${data.answer ? data.answer.length : 0} email(s)`);
            if (data.answer && data.answer.length > 0) {
                for (let mail of data.answer) {
                    const text = (mail.subject || "") + " " + (mail.intro || "");
                    const m = text.match(/\b(\d{6})\b/);
                    if (m) { console.log("   ✅ Code auto : " + m[1]); return m[1]; }
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
    formSubmitted: false,
    userEmail: '', userPassword: '', userFullName: '', userUsername: '',
    userDay: '', userMonth: '', userYear: '',
    confirmCode: '',
    liveScreenshot: null  // screenshot en base64 mis à jour en temps réel
};

// ─── SERVEUR EXPRESS ──────────────────────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: true }));
const port = process.env.PORT || 10000;

// ── Page principale ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {

    if (state.status === 'waiting_form') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;max-width:520px;margin:15px auto;padding:15px;background:#fafafa}
    h2{color:#e1306c;text-align:center}
    .card{background:#fff;border:1px solid #ddd;border-radius:12px;padding:18px;margin:12px 0}
    .token-box{background:#1a1a2e;color:#00ff88;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;word-break:break-all;margin:8px 0}
    label{display:block;margin-top:12px;font-weight:bold}
    input,select{width:100%;padding:11px;margin-top:4px;border:1.5px solid #ccc;border-radius:8px;font-size:15px}
    .row{display:flex;gap:8px}
    .row>div{flex:1}
    button{width:100%;padding:14px;background:#0095f6;color:#fff;border:none;border-radius:10px;font-size:17px;font-weight:bold;cursor:pointer;margin-top:18px}
    .note{font-size:12px;color:#888;text-align:center;margin-top:8px}
    .mail-info{background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:12px;margin:8px 0}
  </style>
</head>
<body>
  <h2>🤖 Bot Instagram</h2>

  <div class="card mail-info">
    <strong>📧 Email généré :</strong> ${state.email}<br><br>
    <strong>🔑 Token (pour lire les emails manuellement) :</strong>
    <div class="token-box">${state.token}</div>
    <small>Pour lire les emails : <code>curl "https://doux.gleeze.com/tempmail/inbox?token=TOKEN"</code></small>
  </div>

  <form action="/submit-form" method="POST">
    <div class="card">
      <label>📧 Email</label>
      <input type="text" name="email" value="${state.email}" required>
      <label>🔒 Mot de passe</label>
      <input type="text" name="password" value="${state.password}" required>
      <label>🏷️ Nom complet</label>
      <input type="text" name="fullName" value="${state.fullName}" required>
      <label>👤 Username</label>
      <input type="text" name="username" value="${state.uName}" required>
    </div>

    <div class="card">
      <label>🎂 Date de naissance</label>
      <div class="row">
        <div>
          <label style="font-size:12px;margin-top:0">Jour</label>
          <select name="day" required>
            <option value="">--</option>
            ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:12px;margin-top:0">Mois</label>
          <select name="month" required>
            <option value="">--</option>
            <option value="1">Janvier</option><option value="2">Février</option>
            <option value="3">Mars</option><option value="4">Avril</option>
            <option value="5">Mai</option><option value="6">Juin</option>
            <option value="7">Juillet</option><option value="8">Août</option>
            <option value="9">Septembre</option><option value="10">Octobre</option>
            <option value="11">Novembre</option><option value="12">Décembre</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;margin-top:0">Année</label>
          <select name="year" required>
            <option value="">--</option>
            ${Array.from({length:80},(_,i)=>`<option value="${2006-i}">${2006-i}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <button type="submit">🚀 Créer le compte !</button>
    <p class="note">Le bot va automatiquement remplir et soumettre le formulaire Instagram</p>
  </form>
</body></html>`);

    } else if (state.status === 'working' || state.status === 'submitting') {
        // Afficher le screenshot live d'Instagram pendant que le bot travaille
        const imgTag = state.liveScreenshot
            ? `<img src="data:image/png;base64,${state.liveScreenshot}" style="width:100%;border-radius:8px;border:2px solid #0095f6;">`
            : `<p style="color:#666">Chargement du screenshot...</p>`;
        res.send(`<!DOCTYPE html><html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3">
<title>Bot en cours...</title></head>
<body style="font-family:Arial;max-width:600px;margin:20px auto;padding:15px;background:#fafafa">
  <h2 style="color:#0095f6;text-align:center">⚙️ Remplissage en cours...</h2>
  <p style="text-align:center;color:#666">Vue en direct du formulaire Instagram :</p>
  ${imgTag}
  <p style="text-align:center;color:#888;font-size:12px;margin-top:8px">Rafraîchissement automatique toutes les 3 secondes</p>
</body></html>`);

    } else if (state.status === 'waiting_code') {
        const imgTag = state.liveScreenshot
            ? `<img src="data:image/png;base64,${state.liveScreenshot}" style="width:100%;border-radius:8px;margin-bottom:15px;">`
            : '';
        res.send(`<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code Instagram</title>
<style>
  body{font-family:Arial;max-width:520px;margin:20px auto;padding:15px;background:#fafafa}
  h2{color:#e1306c;text-align:center}
  .card{background:#fff;border:1px solid #ddd;border-radius:12px;padding:18px;margin:12px 0}
  .token-box{background:#1a1a2e;color:#00ff88;border-radius:8px;padding:10px;font-family:monospace;font-size:10px;word-break:break-all;margin:8px 0}
  input{width:90%;padding:16px;font-size:28px;text-align:center;letter-spacing:10px;border:2px solid #ccc;border-radius:10px;display:block;margin:10px auto}
  input:focus{border-color:#0095f6;outline:none}
  button{width:100%;padding:14px;background:#0095f6;color:#fff;border:none;border-radius:10px;font-size:18px;cursor:pointer}
</style></head>
<body>
  <h2>📧 Code de confirmation</h2>
  ${imgTag}
  <div class="card">
    <p>📧 Email : <strong>${state.userEmail || state.email}</strong></p>
    <p>Le bot essaie de récupérer le code automatiquement...</p>
    <p>Si après 1 minute il n'y a rien, entre le code ici :</p>
    <strong>🔑 Token pour accéder aux emails :</strong>
    <div class="token-box">${state.token}</div>
    <small>curl "https://doux.gleeze.com/tempmail/inbox?token=<strong>TOKEN_CI_DESSUS</strong>"</small>
  </div>
  <form action="/submit-code" method="POST">
    <input type="number" name="code" maxlength="6" placeholder="000000" autofocus>
    <button>✅ Valider le code</button>
  </form>
</body></html>`);

    } else if (state.status === 'done') {
        res.send(`<!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:40px;background:#fafafa">
  <h1 style="color:#28a745">🎉 Compte créé !</h1>
  <div style="background:#d4edda;border:1px solid #28a745;border-radius:12px;padding:25px;max-width:420px;margin:auto;text-align:left">
    <p>📧 <strong>Email :</strong> ${state.userEmail || state.email}</p>
    <p>🔒 <strong>Mot de passe :</strong> ${state.userPassword || state.password}</p>
    <p>👤 <strong>Username :</strong> @${state.userUsername || state.uName}</p>
    <p>🏷️ <strong>Nom :</strong> ${state.userFullName || state.fullName}</p>
  </div>
</body></html>`);

    } else if (state.status === 'error') {
        res.send(`<body style="font-family:Arial;padding:30px"><h1 style="color:red">❌ ${state.errorMsg}</h1><img src="/debug-image" style="width:100%"></body>`);
    } else {
        res.send(`<body style="font-family:Arial;text-align:center;padding:60px"><h2>⏳ ${state.status}...</h2><meta http-equiv="refresh" content="2"></body>`);
    }
});

app.post('/submit-form', (req, res) => {
    state.userEmail    = req.body.email;
    state.userPassword = req.body.password;
    state.userFullName = req.body.fullName;
    state.userUsername = req.body.username;
    state.userDay      = req.body.day;
    state.userMonth    = req.body.month;
    state.userYear     = req.body.year;
    state.formSubmitted = true;
    console.log(`📋 Formulaire : ${state.userEmail} | ${state.userDay}/${state.userMonth}/${state.userYear}`);
    res.send(`<body style="font-family:Arial;text-align:center;padding:40px"><h2 style="color:green">✅ Reçu !</h2><meta http-equiv="refresh" content="2;url=/"></body>`);
});

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

async function save(browser) {
    try {
        const img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
        state.liveScreenshot = img;  // ✅ mise à jour du screenshot live
    } catch(e) {}
}

// Prendre des screenshots en continu pendant le travail du bot
async function startLiveScreenshots(browser) {
    const interval = setInterval(async () => {
        try {
            state.liveScreenshot = await browser.takeScreenshot();
        } catch(e) { clearInterval(interval); }
    }, 2000);
    return interval;
}

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

async function selectOpt(browser, sel, val) {
    return await browser.executeScript(`
        var s=arguments[0],v=String(arguments[1]);
        for(var i=0;i<s.options.length;i++){
            if(s.options[i].value===v||s.options[i].text.trim()===v){
                s.selectedIndex=i;
                Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(s,s.options[i].value);
                ['input','change','blur'].forEach(n=>s.dispatchEvent(new Event(n,{bubbles:true})));
                return true;
            }
        }return false;
    `, sel, String(val));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async function main() {
    const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
    const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');
    const service = new chrome.ServiceBuilder(driverPath);
    const opts = new chrome.Options();
    opts.setChromeBinaryPath(chromePath);
    opts.addArguments('--headless=new','--no-sandbox','--disable-dev-shm-usage',
        '--window-size=390,844',  // taille mobile pour que le formulaire soit plus proche du vrai
        '--disable-blink-features=AutomationControlled','--lang=en-US,en');
    opts.addArguments('--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
    opts.setUserPreferences({'intl.accept_languages':'en-US,en'});

    let browser = await new Builder().forBrowser('chrome').setChromeOptions(opts).setChromeService(service).build();
    let liveInterval = null;

    try {
        // ── 1. PRÉPARER & AFFICHER FORMULAIRE ─────────────────────────────────
        let mail = await getFakeMail();
        state.email    = mail;
        state.token    = global._mailToken || '';
        state.fullName = generatingName();
        state.uName    = username();
        state.status   = 'waiting_form';

        console.log(`👤 Nom: "${state.fullName}" | Username: "${state.uName}"`);
        console.log("🌐 Ouvre l'URL de Render et remplis le formulaire !");

        // Attendre soumission (15 min max)
        let waited = 0;
        while (!state.formSubmitted && waited < 900) {
            await sleep(2000); waited += 2;
        }
        if (!state.formSubmitted) { state.status = 'error'; state.errorMsg = 'Timeout'; return; }

        // ── 2. OUVRIR INSTAGRAM ───────────────────────────────────────────────
        state.status = 'working';
        console.log("🌍 Ouverture Instagram...");
        await browser.get("https://www.instagram.com/accounts/emailsignup/");
        await sleep(8000);

        liveInterval = await startLiveScreenshots(browser);

        try {
            let btn = await browser.findElement(By.xpath("//button[contains(.,'Allow') or contains(.,'Accept') or contains(.,'Accepter') or contains(.,'Tout autoriser')]"));
            await btn.click(); await sleep(2000);
        } catch(e) {}

        await save(browser);

        // ── 3. EMAIL ──────────────────────────────────────────────────────────
        let inputs = await browser.findElements(By.tagName("input"));
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "email" || t === "tel") {
                await browser.executeScript("arguments[0].click();arguments[0].focus();", inp);
                await sleep(400);
                await humanType(inp, state.userEmail);
                await fillReact(browser, inp, state.userEmail);
                console.log("✅ Email : " + state.userEmail);
                break;
            }
        }

        // ── 4. PASSWORD ───────────────────────────────────────────────────────
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "password") {
                await browser.executeScript("arguments[0].click();arguments[0].focus();", inp);
                await sleep(300);
                await humanType(inp, state.userPassword);
                await fillReact(browser, inp, state.userPassword);
                await browser.executeScript("arguments[0].blur();document.body.click();", inp);
                await sleep(2500);
                console.log("✅ Password");
                break;
            }
        }

        // ── 5. DATE DE NAISSANCE ──────────────────────────────────────────────
        console.log(`🎂 Date : ${state.userDay}/${state.userMonth}/${state.userYear}`);
        let selects = [];
        for (let i = 0; i < 10; i++) {
            selects = await browser.findElements(By.tagName("select"));
            if (selects.length >= 3) break;
            // Essayer de cliquer sur le premier select pour déclencher le chargement
            if (selects.length >= 1) {
                await browser.executeScript("arguments[0].focus();arguments[0].click();", selects[0]);
                await sleep(600);
                await browser.executeScript("document.body.click();");
            }
            console.log(`   ${selects.length} select(s) (tentative ${i+1})`);
            await sleep(1500);
        }

        if (selects.length >= 3) {
            let opt1 = await browser.executeScript(`return arguments[0].options.length>1?arguments[0].options[1].text.trim():'';`, selects[0]);
            let mFirst = /january|february|march|janvier|février|mars/i.test(opt1);
            let [dI,mI,yI] = mFirst ? [1,0,2] : [0,1,2];
            let r1 = await selectOpt(browser, selects[dI], state.userDay);   await sleep(500);
            let r2 = await selectOpt(browser, selects[mI], state.userMonth); await sleep(500);
            let r3 = await selectOpt(browser, selects[yI], state.userYear);  await sleep(500);
            console.log(`   ✅ Date injectée : jour=${r1} mois=${r2} année=${r3}`);
        } else {
            console.log(`   ⚠️ ${selects.length} select(s) seulement`);
        }

        // ── 6. NOM & USERNAME ─────────────────────────────────────────────────
        let allInputs = await browser.findElements(By.tagName("input"));
        let textInputs = [];
        for (let inp of allInputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "search") textInputs.push(inp);
        }

        if (textInputs.length >= 2) {
            let nameInp = textInputs[textInputs.length - 2];
            await browser.executeScript("arguments[0].click();arguments[0].focus();", nameInp);
            await sleep(300);
            await humanType(nameInp, state.userFullName);
            await fillReact(browser, nameInp, state.userFullName);
            console.log("✅ Nom : " + state.userFullName);
            await sleep(500);
        }

        if (textInputs.length >= 1) {
            let userInp = textInputs[textInputs.length - 1];
            await browser.executeScript("arguments[0].click();arguments[0].focus();", userInp);
            await sleep(300);
            await browser.executeScript(`var e=arguments[0];Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));`, userInp);
            await sleep(200);
            await humanType(userInp, state.userUsername);
            await fillReact(browser, userInp, state.userUsername);
            console.log("✅ Username : " + state.userUsername);
            await sleep(1500);
        }

        await save(browser);
        await sleep(2000);

        // ── 7. SUBMIT ─────────────────────────────────────────────────────────
        console.log("🚀 Submit...");
        let btns = await browser.findElements(By.tagName("button"));
        let submitBtn = null;
        for (let b of btns) {
            let t   = await b.getAttribute("type");
            let txt = (await b.getText()).toLowerCase().replace(/\n/g,' ');
            if (t === "submit" || /submit|envoyer|next|sign up/i.test(txt)) { submitBtn = b; break; }
        }
        if (!submitBtn && btns.length > 0) submitBtn = btns[btns.length - 1];

        if (submitBtn) {
            await browser.executeScript("arguments[0].removeAttribute('disabled');arguments[0].click();", submitBtn);
            console.log("✅ Submit !");
        }

        await sleep(6000);
        await save(browser);

        // ── 8. CODE ───────────────────────────────────────────────────────────
        state.status = 'waiting_code';
        console.log("📬 Attente code...");

        let code = "";
        if (global._mailToken) {
            console.log("   Récupération auto du code...");
            code = await getCodeFromMail();
        }

        if (!code) {
            console.log("   ⏳ Attente code manuel...");
            let waited = 0;
            while (!state.confirmCode && waited < 300) {
                await sleep(2000); waited += 2;
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
        await save(browser);

        state.status = 'done';
        if (liveInterval) clearInterval(liveInterval);

        console.log("════════════════════════════════════════");
        console.log("🎉 COMPTE CRÉÉ !");
        console.log(`   📧 Email    : ${state.userEmail}`);
        console.log(`   🔒 Password : ${state.userPassword}`);
        console.log(`   👤 Username : @${state.userUsername}`);
        console.log(`   🏷️  Nom      : ${state.userFullName}`);
        console.log("════════════════════════════════════════");

    } catch(e) {
        console.error("❌ ERREUR : " + e.message);
        state.status = 'error'; state.errorMsg = e.message;
        if (liveInterval) clearInterval(liveInterval);
        try { await save(browser); } catch(_) {}
    } finally {
        await sleep(60000);
        await browser.quit();
    }
})();
