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
            console.log("📧 Email : " + data.email);
            return data.email;
        }
    } catch(e) { console.log("⚠️ API mail : " + e.message); }
    const fb = "user" + Math.floor(Math.random()*99999) + "@guerrillamail.com";
    return fb;
}

async function getCodeFromMail() {
    if (!global._mailToken) return "";
    for (let i = 1; i <= 8; i++) {
        try {
            const res  = await fetch(`https://doux.gleeze.com/tempmail/inbox?token=${encodeURIComponent(global._mailToken)}`, { timeout: 10000 });
            const data = await res.json();
            console.log(`   📬 Tentative ${i} : ${data.answer ? data.answer.length : 0} email(s)`);
            if (data.answer && data.answer.length > 0) {
                for (let mail of data.answer) {
                    const text = (mail.subject || "") + " " + (mail.intro || "");
                    const m = text.match(/\b(\d{6})\b/);
                    if (m) { console.log("   ✅ Code : " + m[1]); return m[1]; }
                }
            }
        } catch(e) { console.log("   ⚠️ " + e.message); }
        await sleep(5000);
    }
    return "";
}

// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────────
let state = {
    status: 'starting',
    email: '', password: 'Azerty12345!', fullName: '', uName: '',
    // Données soumises par l'utilisateur
    formSubmitted: false,
    userEmail: '', userPassword: '', userFullName: '', userUsername: '',
    userDay: '', userMonth: '', userYear: '',
    confirmCode: ''
};

// ─── SERVEUR EXPRESS ──────────────────────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: true }));
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {

    // ── Page de saisie du formulaire complet ──────────────────────────────────
    if (state.status === 'waiting_form') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;max-width:500px;margin:20px auto;padding:15px;background:#fafafa}
    h2{color:#e1306c;text-align:center;margin-bottom:5px}
    .sub{text-align:center;color:#666;font-size:14px;margin-bottom:20px}
    .card{background:#fff;border:1px solid #ddd;border-radius:12px;padding:20px;margin-bottom:15px}
    .auto{background:#d4edda;border-color:#28a745}
    .auto p{margin:5px 0;color:#155724}
    label{display:block;margin-top:12px;font-weight:bold;font-size:15px}
    input,select{width:100%;padding:11px;margin-top:4px;border:1.5px solid #ccc;border-radius:8px;font-size:16px;background:#fff}
    input:focus,select:focus{border-color:#0095f6;outline:none}
    .row{display:flex;gap:10px}
    .row>div{flex:1}
    button{width:100%;padding:15px;background:#0095f6;color:#fff;border:none;border-radius:10px;font-size:17px;font-weight:bold;cursor:pointer;margin-top:20px}
    button:active{background:#007acc}
    .note{font-size:13px;color:#666;margin-top:8px;text-align:center}
  </style>
</head>
<body>
  <h2>🤖 Bot Instagram</h2>
  <p class="sub">Vérifie et complète le formulaire, puis clique sur Créer</p>

  <div class="card auto">
    <p>✅ <strong>Généré automatiquement :</strong></p>
    <p>📧 Email : <strong>${state.email}</strong></p>
    <p>👤 Username suggéré : <strong>${state.uName}</strong></p>
    <p>🏷️ Nom suggéré : <strong>${state.fullName}</strong></p>
  </div>

  <form action="/submit-form" method="POST">
    <div class="card">
      <label>📧 Email (modifiable)</label>
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
          <label style="font-size:13px;margin-top:0">Jour</label>
          <select name="day" required>
            <option value="">--</option>
            ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:13px;margin-top:0">Mois</label>
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
          <label style="font-size:13px;margin-top:0">Année</label>
          <select name="year" required>
            <option value="">--</option>
            ${Array.from({length:80},(_,i)=>`<option value="${2006-i}">${2006-i}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <button type="submit">🚀 Créer le compte Instagram !</button>
    <p class="note">Le bot va remplir le formulaire et créer le compte automatiquement</p>
  </form>
</body></html>`);

    // ── Page d'attente pendant que le bot travaille ───────────────────────────
    } else if (state.status === 'working') {
        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3"></head>
<body style="font-family:Arial;text-align:center;padding:60px;background:#fafafa">
  <h2 style="color:#0095f6">⚙️ Création en cours...</h2>
  <p>Le bot remplit le formulaire Instagram.</p>
  <p style="color:#666">Cette page se rafraîchit automatiquement.</p>
</body></html>`);

    // ── Page de saisie du code de confirmation ────────────────────────────────
    } else if (state.status === 'waiting_code') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code Instagram</title>
<style>
  body{font-family:Arial;max-width:440px;margin:60px auto;padding:20px;background:#fafafa;text-align:center}
  h2{color:#e1306c}
  .info{background:#e8f4fd;border-radius:10px;padding:15px;margin:15px 0;text-align:left}
  input{width:90%;padding:16px;font-size:30px;text-align:center;letter-spacing:12px;border:2px solid #ccc;border-radius:10px;margin:15px 0}
  input:focus{border-color:#0095f6;outline:none}
  button{width:100%;padding:14px;background:#0095f6;color:#fff;border:none;border-radius:10px;font-size:18px;cursor:pointer}
</style></head>
<body>
  <h2>📧 Code de confirmation</h2>
  <div class="info">
    <p>📧 Email utilisé : <strong>${state.userEmail || state.email}</strong></p>
    <p>🔑 Vérifie ta boîte mail et entre le code à 6 chiffres.</p>
  </div>
  <form action="/submit-code" method="POST">
    <input type="number" name="code" maxlength="6" placeholder="000000" required autofocus>
    <button>✅ Valider le code</button>
  </form>
  <p style="color:#666;font-size:13px;margin-top:15px">Le bot essaie de récupérer le code automatiquement. Si la page reste bloquée ici, entre le code manuellement.</p>
</body></html>`);

    // ── Page de succès ────────────────────────────────────────────────────────
    } else if (state.status === 'done') {
        res.send(`<!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:40px;background:#fafafa">
  <h1 style="color:#28a745">🎉 Compte créé avec succès !</h1>
  <div style="background:#d4edda;border:1px solid #28a745;border-radius:12px;padding:25px;max-width:400px;margin:20px auto;text-align:left">
    <p style="font-size:18px">📧 <strong>Email :</strong><br><span style="color:#0095f6">${state.userEmail || state.email}</span></p>
    <p style="font-size:18px">🔒 <strong>Mot de passe :</strong><br>${state.userPassword || state.password}</p>
    <p style="font-size:18px">👤 <strong>Username :</strong><br>@${state.userUsername || state.uName}</p>
    <p style="font-size:18px">🏷️ <strong>Nom :</strong><br>${state.userFullName || state.fullName}</p>
  </div>
  <p style="color:#666">Sauvegarde ces informations !</p>
</body></html>`);

    // ── Page d'erreur ─────────────────────────────────────────────────────────
    } else if (state.status === 'error') {
        res.send(`<body style="font-family:Arial;padding:30px"><h1 style="color:red">❌ Erreur</h1><p>${state.errorMsg}</p><img src="/debug-image" style="width:100%;max-width:600px"></body>`);

    // ── Page de démarrage ─────────────────────────────────────────────────────
    } else {
        res.send(`<body style="font-family:Arial;text-align:center;padding:60px"><h2>⏳ Démarrage... (${state.status})</h2><meta http-equiv="refresh" content="2"></body>`);
    }
});

// Réception du formulaire complet
app.post('/submit-form', (req, res) => {
    state.userEmail    = req.body.email;
    state.userPassword = req.body.password;
    state.userFullName = req.body.fullName;
    state.userUsername = req.body.username;
    state.userDay      = req.body.day;
    state.userMonth    = req.body.month;
    state.userYear     = req.body.year;
    state.formSubmitted = true;
    console.log(`📋 Formulaire reçu : ${state.userEmail} | ${state.userDay}/${state.userMonth}/${state.userYear}`);
    res.send(`<body style="font-family:Arial;text-align:center;padding:40px"><h2 style="color:green">✅ Reçu ! Création en cours...</h2><meta http-equiv="refresh" content="3;url=/"></body>`);
});

// Réception du code de confirmation
app.post('/submit-code', (req, res) => {
    state.confirmCode = req.body.code;
    console.log("🔑 Code manuel reçu : " + state.confirmCode);
    res.send(`<body style="font-family:Arial;text-align:center;padding:40px"><h2 style="color:green">✅ Code reçu !</h2><meta http-equiv="refresh" content="3;url=/"></body>`);
});

app.get('/debug-image', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) res.sendFile(path.join(process.cwd(), 'error_screenshot.png'));
    else res.send('Pas de screenshot');
});

app.listen(port, '0.0.0.0', () => console.log(`🌐 Serveur sur le port ${port}`));

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function save(browser) {
    try { fs.writeFileSync('error_screenshot.png', await browser.takeScreenshot(), 'base64'); console.log('📸 Screenshot'); } catch(e) {}
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
        '--window-size=1920,1080','--disable-blink-features=AutomationControlled','--lang=en-US,en');
    opts.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    opts.setUserPreferences({'intl.accept_languages':'en-US,en'});

    let browser = await new Builder().forBrowser('chrome').setChromeOptions(opts).setChromeService(service).build();

    try {
        // ── 1. PRÉPARER LES INFOS & AFFICHER LE FORMULAIRE ───────────────────
        state.status = 'starting';
        let mail = await getFakeMail();
        state.email    = mail;
        state.fullName = generatingName();
        state.uName    = username();

        console.log(`👤 Nom: "${state.fullName}" | Username: "${state.uName}"`);
        console.log("🌐 Ouvre l'URL de Render pour remplir le formulaire !");

        // Afficher le formulaire à l'utilisateur
        state.status = 'waiting_form';

        // Attendre que l'utilisateur soumette le formulaire (max 15 min)
        let waited = 0;
        while (!state.formSubmitted && waited < 900) {
            await sleep(2000); waited += 2;
        }
        if (!state.formSubmitted) {
            state.status = 'error'; state.errorMsg = 'Timeout : formulaire non soumis';
            return;
        }

        // ── 2. OUVRIR INSTAGRAM ET REMPLIR ───────────────────────────────────
        state.status = 'working';
        console.log("🌍 Ouverture Instagram...");
        await browser.get("https://www.instagram.com/accounts/emailsignup/");
        await sleep(8000);

        try {
            let btn = await browser.findElement(By.xpath("//button[contains(.,'Allow') or contains(.,'Accept') or contains(.,'Accepter') or contains(.,'Tout autoriser')]"));
            await btn.click(); await sleep(2000);
        } catch(e) {}

        await save(browser);

        // ── 3. EMAIL ──────────────────────────────────────────────────────────
        console.log("✍️ Email : " + state.userEmail);
        let inputs = await browser.findElements(By.tagName("input"));
        let emailInput = null;
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "email" || t === "tel") { emailInput = inp; break; }
        }
        if (emailInput) {
            await browser.executeScript("arguments[0].click();arguments[0].focus();", emailInput);
            await sleep(400);
            await humanType(emailInput, state.userEmail);
            await fillReact(browser, emailInput, state.userEmail);
            console.log("✅ Email saisi");
        }

        // ── 4. PASSWORD ───────────────────────────────────────────────────────
        console.log("🔒 Password...");
        let passInput = null;
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "password") { passInput = inp; break; }
        }
        if (passInput) {
            await browser.executeScript("arguments[0].click();arguments[0].focus();", passInput);
            await sleep(300);
            await humanType(passInput, state.userPassword);
            await fillReact(browser, passInput, state.userPassword);
            await browser.executeScript("arguments[0].blur();document.body.click();", passInput);
            await sleep(2500);
            console.log("✅ Password saisi");
        }

        // ── 5. DATE DE NAISSANCE ──────────────────────────────────────────────
        console.log(`🎂 Date : ${state.userDay}/${state.userMonth}/${state.userYear}`);
        let selects = [];
        for (let i = 0; i < 8; i++) {
            selects = await browser.findElements(By.tagName("select"));
            if (selects.length >= 3) break;
            if (selects.length === 1 && i === 1) {
                await browser.executeScript("arguments[0].click();", selects[0]);
                await sleep(800);
                await browser.executeScript("arguments[0].blur();", selects[0]);
            }
            console.log(`   select(s) : ${selects.length} (tentative ${i+1})`);
            await sleep(1500);
        }

        if (selects.length >= 3) {
            let opt1 = await browser.executeScript(`return arguments[0].options.length>1?arguments[0].options[1].text.trim():'';`, selects[0]);
            let mFirst = /january|february|march|janvier|février|mars/i.test(opt1);
            let [dI,mI,yI] = mFirst ? [1,0,2] : [0,1,2];
            let r1 = await selectOpt(browser, selects[dI], state.userDay);
            await sleep(500);
            let r2 = await selectOpt(browser, selects[mI], state.userMonth);
            await sleep(500);
            let r3 = await selectOpt(browser, selects[yI], state.userYear);
            console.log(`   Date injectée : jour=${r1} mois=${r2} année=${r3}`);
        } else {
            console.log(`   ⚠️ ${selects.length} select(s) — date non injectée`);
        }

        // ── 6. NOM & USERNAME ─────────────────────────────────────────────────
        console.log("👤 Nom & Username...");
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

        let userInp = textInputs[textInputs.length - 1];
        if (userInp) {
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
            console.log(`   btn: type="${t}" txt="${txt}"`);
            if (t === "submit" || /submit|envoyer|next|sign up/i.test(txt)) { submitBtn = b; break; }
        }
        if (!submitBtn && btns.length > 0) submitBtn = btns[btns.length - 1];

        if (submitBtn) {
            await browser.executeScript("arguments[0].removeAttribute('disabled');arguments[0].click();", submitBtn);
            console.log("✅ Submit cliqué !");
        } else {
            console.log("❌ Aucun bouton submit");
        }

        await sleep(6000);
        await save(browser);

        // ── 8. CODE DE VÉRIFICATION ───────────────────────────────────────────
        console.log("📬 Attente code...");
        state.status = 'waiting_code';

        // Si l'email utilisé est celui de l'API doux.gleeze, récupérer auto
        // Sinon, attendre saisie manuelle
        let code = "";
        if (global._mailToken && state.userEmail === state.email) {
            console.log("   Tentative récupération auto du code...");
            code = await getCodeFromMail();
        }

        if (!code) {
            console.log("   En attente du code manuel (max 5 min)...");
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
                let confirmBtns = await browser.findElements(By.tagName("button"));
                if (confirmBtns.length > 0) {
                    await browser.executeScript("arguments[0].click();", confirmBtns[0]);
                    console.log("✅ Code soumis !");
                }
            }
        }

        await sleep(5000);
        await save(browser);

        // ── RÉSULTAT FINAL ────────────────────────────────────────────────────
        state.status = 'done';
        console.log("════════════════════════════════════════");
        console.log("🎉 COMPTE INSTAGRAM CRÉÉ !");
        console.log(`   📧 Email    : ${state.userEmail}`);
        console.log(`   🔒 Password : ${state.userPassword}`);
        console.log(`   👤 Username : @${state.userUsername}`);
        console.log(`   🏷️  Nom      : ${state.userFullName}`);
        console.log("════════════════════════════════════════");

    } catch(e) {
        console.error("❌ ERREUR : " + e.message);
        state.status = 'error'; state.errorMsg = e.message;
        try { await save(browser); } catch(_) {}
    } finally {
        await sleep(60000);
        await browser.quit();
        console.log("🔒 Browser fermé.");
    }
})();
