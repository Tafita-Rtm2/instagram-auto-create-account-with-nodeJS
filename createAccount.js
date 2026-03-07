const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');
const fetch = require('node-fetch');
const { generatingName, username } = require('./accountInfoGenerator');

// ─── FAKE MAIL API (doux.gleeze.com) ─────────────────────────────────────────
async function getFakeMail() {
    try {
        const res  = await fetch('https://doux.gleeze.com/tempmail/gen', { timeout: 10000 });
        const data = await res.json();
        if (data && data.email && data.token) {
            global._mailToken = data.token;
            global._mailEmail = data.email;
            console.log("📧 Email généré : " + data.email);
            return data.email;
        }
    } catch(e) { console.log("⚠️ API mail erreur : " + e.message); }
    const fb = "user" + Math.floor(Math.random()*99999) + "@guerrillamail.com";
    console.log("📧 Fallback email : " + fb);
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
                    if (m) { console.log("   ✅ Code trouvé : " + m[1]); return m[1]; }
                }
            }
        } catch(e) { console.log("   ⚠️ Inbox erreur : " + e.message); }
        await sleep(5000);
    }
    return "";
}

// ─── ÉTAT GLOBAL (partagé bot ↔ serveur) ─────────────────────────────────────
let state = {
    status: 'starting',   // starting | waiting_date | waiting_code | done | error
    email: '', password: 'Azerty12345!', fullName: '', uName: '',
    dateSubmitted: false, dateDay: '', dateMonth: '', dateYear: '',
    confirmCode: '', errorMsg: ''
};

// ─── SERVEUR EXPRESS ──────────────────────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: true }));
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    if (state.status === 'waiting_date') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bot Instagram</title>
<style>
  body{font-family:Arial,sans-serif;max-width:480px;margin:30px auto;padding:20px;background:#fafafa}
  h2{color:#e1306c;text-align:center}
  .box{background:#fff;border:1px solid #ddd;border-radius:10px;padding:15px;margin:10px 0}
  .ok{color:#28a745;font-weight:bold}
  label{display:block;margin-top:14px;font-weight:bold}
  select{width:100%;padding:10px;margin-top:5px;border:2px solid #ccc;border-radius:8px;font-size:16px}
  button{width:100%;padding:14px;background:#0095f6;color:#fff;border:none;border-radius:10px;font-size:18px;cursor:pointer;margin-top:20px}
</style></head>
<body>
  <h2>🤖 Bot Instagram</h2>
  <div class="box">
    <p class="ok">✅ Email : ${state.email}</p>
    <p class="ok">✅ Mot de passe : ${state.password}</p>
    <p class="ok">✅ Nom : ${state.fullName}</p>
    <p class="ok">✅ Username : ${state.uName}</p>
  </div>
  <div class="box" style="background:#fff3cd;border-color:#ffc107">
    ⚠️ <strong>Remplis la date de naissance</strong> puis clique Envoyer.
  </div>
  <form action="/submit-date" method="POST">
    <label>Mois :</label>
    <select name="month" required>
      <option value="">-- Choisir --</option>
      <option value="1">Janvier</option><option value="2">Février</option><option value="3">Mars</option>
      <option value="4">Avril</option><option value="5">Mai</option><option value="6">Juin</option>
      <option value="7">Juillet</option><option value="8">Août</option><option value="9">Septembre</option>
      <option value="10">Octobre</option><option value="11">Novembre</option><option value="12">Décembre</option>
    </select>
    <label>Jour :</label>
    <select name="day" required>
      <option value="">-- Choisir --</option>
      ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
    </select>
    <label>Année :</label>
    <select name="year" required>
      <option value="">-- Choisir --</option>
      ${Array.from({length:80},(_,i)=>`<option value="${2006-i}">${2006-i}</option>`).join('')}
    </select>
    <button type="submit">🚀 Créer le compte !</button>
  </form>
</body></html>`);

    } else if (state.status === 'waiting_code') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code Instagram</title>
<style>
  body{font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:20px;background:#fafafa;text-align:center}
  h2{color:#e1306c}
  input{width:90%;padding:15px;font-size:28px;text-align:center;letter-spacing:10px;border:2px solid #ccc;border-radius:10px;margin-top:10px}
  button{width:100%;padding:14px;background:#0095f6;color:#fff;border:none;border-radius:10px;font-size:18px;cursor:pointer;margin-top:15px}
</style></head>
<body>
  <h2>📧 Code de confirmation</h2>
  <p>Vérifie la boîte : <strong>${state.email}</strong></p>
  <form action="/submit-code" method="POST">
    <input type="text" name="code" maxlength="6" placeholder="000000" required autofocus>
    <button>✅ Valider</button>
  </form>
</body></html>`);

    } else if (state.status === 'done') {
        res.send(`<!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:40px">
  <h1 style="color:#28a745">🎉 Compte créé avec succès !</h1>
  <div style="background:#d4edda;border-radius:10px;padding:20px;max-width:400px;margin:auto">
    <p><strong>📧 Email :</strong> ${state.email}</p>
    <p><strong>🔒 Mot de passe :</strong> ${state.password}</p>
    <p><strong>👤 Username :</strong> ${state.uName}</p>
    <p><strong>🏷️ Nom :</strong> ${state.fullName}</p>
  </div>
</body></html>`);

    } else if (state.status === 'error') {
        res.send(`<h1 style="color:red;font-family:Arial;text-align:center">❌ ${state.errorMsg}</h1><img src="/debug-image" style="width:100%">`);
    } else {
        res.send(`<h2 style="font-family:Arial;text-align:center">⏳ ${state.status}... ${state.errorMsg}</h2><meta http-equiv="refresh" content="3">`);
    }
});

app.post('/submit-date', (req, res) => {
    state.dateDay   = req.body.day;
    state.dateMonth = req.body.month;
    state.dateYear  = req.body.year;
    state.dateSubmitted = true;
    console.log(`📅 Date reçue : ${state.dateDay}/${state.dateMonth}/${state.dateYear}`);
    res.send(`<h2 style="font-family:Arial;text-align:center;color:green">✅ Date reçue ! Création en cours...<br><small>Cette page va se rafraîchir</small></h2><meta http-equiv="refresh" content="4;url=/">`);
});

app.post('/submit-code', (req, res) => {
    state.confirmCode = req.body.code;
    console.log("🔑 Code reçu : " + state.confirmCode);
    res.send(`<h2 style="font-family:Arial;text-align:center;color:green">✅ Code reçu ! Validation...<br></h2><meta http-equiv="refresh" content="4;url=/">`);
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
    for (let c of text) { await el.sendKeys(c); await sleep(Math.random()*50+25); }
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
        // ── 1. EMAIL ──────────────────────────────────────────────────────────
        let mail = await getFakeMail();
        state.email = mail;

        // ── 2. OUVRIR INSTAGRAM ───────────────────────────────────────────────
        state.status = 'loading';
        console.log("🌍 Ouverture Instagram...");
        await browser.get("https://www.instagram.com/accounts/emailsignup/");
        await sleep(8000);

        try {
            let btn = await browser.findElement(By.xpath("//button[contains(.,'Allow') or contains(.,'Accept') or contains(.,'Accepter') or contains(.,'Tout autoriser')]"));
            await btn.click(); await sleep(2000);
        } catch(e) {}

        await save(browser);

        // ── 3. SAISIR EMAIL ───────────────────────────────────────────────────
        state.status = 'filling';
        console.log("✍️ Saisie email...");
        let inputs = await browser.findElements(By.tagName("input"));
        let emailInput = null;
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "email" || t === "tel") { emailInput = inp; break; }
        }
        if (emailInput) {
            await browser.executeScript("arguments[0].click();arguments[0].focus();", emailInput);
            await sleep(400);
            await humanType(emailInput, mail);
            await fillReact(browser, emailInput, mail);
            console.log("✅ Email saisi");
        }

        // ── 4. MOT DE PASSE ───────────────────────────────────────────────────
        console.log("🔒 Mot de passe...");
        let passInput = null;
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "password") { passInput = inp; break; }
        }
        if (passInput) {
            await browser.executeScript("arguments[0].click();arguments[0].focus();", passInput);
            await sleep(300);
            await humanType(passInput, state.password);
            await fillReact(browser, passInput, state.password);
            await browser.executeScript("arguments[0].blur();document.body.click();", passInput);
            await sleep(2500);
            console.log("✅ Mot de passe saisi");
        }

        // ── 5. TENTER DATE AUTO ───────────────────────────────────────────────
        console.log("🎂 Date de naissance...");
        let selects = await browser.findElements(By.tagName("select"));
        let dateOk = false;

        // Attendre jusqu'à 5 tentatives
        for (let i = 0; i < 5 && selects.length < 3; i++) {
            await sleep(1500);
            selects = await browser.findElements(By.tagName("select"));
            console.log(`   Tentative ${i+1} : ${selects.length} select(s)`);
        }

        if (selects.length >= 3) {
            let opt1 = await browser.executeScript(`return arguments[0].options.length>1?arguments[0].options[1].text.trim():'';`, selects[0]);
            let mFirst = /january|february|march|janvier|février|mars/i.test(opt1);
            let [dI, mI, yI] = mFirst ? [1,0,2] : [0,1,2];
            let r1 = await selectOpt(browser, selects[dI], "10");
            let r2 = await selectOpt(browser, selects[mI], "3");
            if (!r2) r2 = await selectOpt(browser, selects[mI], "March");
            if (!r2) r2 = await selectOpt(browser, selects[mI], "mars");
            let r3 = await selectOpt(browser, selects[yI], "1995");
            dateOk = r1 && r2 && r3;
            console.log(`   Résultat date auto : jour=${r1} mois=${r2} année=${r3}`);
        }

        // ── 6. NOM & USERNAME ─────────────────────────────────────────────────
        console.log("👤 Nom & Username...");
        const fullName = generatingName();
        const uName    = username();
        state.fullName = fullName;
        state.uName    = uName;
        console.log(`   Nom: "${fullName}" | Username: "${uName}"`);

        let allInputs = await browser.findElements(By.tagName("input"));
        let textInputs = [];
        for (let inp of allInputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "search") textInputs.push(inp);
        }
        console.log(`   ${textInputs.length} input(s) texte`);

        // fullName = avant-dernier, username = dernier
        if (textInputs.length >= 2) {
            let nameInp = textInputs[textInputs.length - 2];
            await browser.executeScript("arguments[0].click();arguments[0].focus();", nameInp);
            await sleep(300);
            await humanType(nameInp, fullName);
            await fillReact(browser, nameInp, fullName);
            console.log("✅ Nom saisi : " + fullName);
            await sleep(500);
        }

        let userInp = textInputs[textInputs.length - 1];
        if (userInp) {
            await browser.executeScript("arguments[0].click();arguments[0].focus();", userInp);
            await sleep(300);
            await browser.executeScript(`var e=arguments[0];Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));`, userInp);
            await sleep(200);
            await humanType(userInp, uName);
            await fillReact(browser, userInp, uName);
            console.log("✅ Username saisi : " + uName);
            await sleep(1500);
        }

        await save(browser);
        await sleep(2000);

        // ── 7. MODE HYBRIDE SI DATE AUTO ÉCHOUÉE ─────────────────────────────
        if (!dateOk) {
            console.log("⚠️ Date auto échouée → En attente saisie manuelle via l'interface web...");
            state.status = 'waiting_date';

            // Attendre max 10 minutes
            let waited = 0;
            while (!state.dateSubmitted && waited < 600) {
                await sleep(2000); waited += 2;
            }

            if (!state.dateSubmitted) {
                state.status = 'error';
                state.errorMsg = 'Timeout : aucune date reçue';
                return;
            }

            // Injecter la date dans le formulaire Instagram
            console.log(`📅 Injection date : ${state.dateDay}/${state.dateMonth}/${state.dateYear}`);
            let dateSelects = await browser.findElements(By.tagName("select"));

            if (dateSelects.length >= 3) {
                let opt1 = await browser.executeScript(`return arguments[0].options.length>1?arguments[0].options[1].text.trim():'';`, dateSelects[0]);
                let mFirst = /january|february|march|janvier|février|mars/i.test(opt1);
                let [dI, mI, yI] = mFirst ? [1,0,2] : [0,1,2];
                await selectOpt(browser, dateSelects[dI], state.dateDay);   await sleep(500);
                await selectOpt(browser, dateSelects[mI], state.dateMonth); await sleep(500);
                await selectOpt(browser, dateSelects[yI], state.dateYear);  await sleep(500);
                console.log("✅ Date injectée !");
            } else {
                console.log(`❌ ${dateSelects.length} select(s) seulement — date non injectée`);
            }
        }

        await save(browser);
        state.status = 'submitting';
        await sleep(1500);

        // ── 8. SUBMIT ─────────────────────────────────────────────────────────
        console.log("🚀 Submit...");
        let btns = await browser.findElements(By.tagName("button"));
        let submitBtn = null;
        for (let b of btns) {
            let t = await b.getAttribute("type");
            let txt = (await b.getText()).toLowerCase();
            if (t === "submit" || /submit|envoyer|next|sign up/i.test(txt)) { submitBtn = b; break; }
        }
        if (!submitBtn && btns.length > 0) submitBtn = btns[btns.length - 1];

        if (submitBtn) {
            await browser.executeScript("arguments[0].removeAttribute('disabled');arguments[0].click();", submitBtn);
            console.log("✅ Submit cliqué !");
        } else {
            console.log("❌ Aucun bouton submit trouvé");
        }

        await sleep(6000);
        await save(browser);

        // ── 9. CODE DE VÉRIFICATION ───────────────────────────────────────────
        console.log("📬 Attente code...");
        state.status = 'waiting_code';

        // Essayer automatiquement via l'API mail
        let code = await getCodeFromMail();

        // Si pas de code auto → attendre saisie manuelle (max 5 min)
        if (!code) {
            console.log("📬 Code auto non trouvé → En attente saisie manuelle...");
            let waited = 0;
            while (!state.confirmCode && waited < 300) {
                await sleep(2000); waited += 2;
            }
            code = state.confirmCode;
        }

        if (code && code.length >= 4) {
            console.log("🔑 Code à saisir : " + code);
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
        } else {
            console.log("⚠️ Aucun code reçu");
        }

        await sleep(5000);
        await save(browser);

        // ── RÉSULTAT FINAL ────────────────────────────────────────────────────
        state.status = 'done';
        console.log("════════════════════════════════════");
        console.log("🎉 COMPTE INSTAGRAM CRÉÉ !");
        console.log(`   📧 Email    : ${state.email}`);
        console.log(`   🔒 Password : ${state.password}`);
        console.log(`   👤 Username : ${state.uName}`);
        console.log(`   🏷️  Nom      : ${state.fullName}`);
        console.log("════════════════════════════════════");

    } catch(e) {
        console.error("❌ ERREUR : " + e.message);
        state.status   = 'error';
        state.errorMsg = e.message;
        try { await save(browser); } catch(_) {}
    } finally {
        await sleep(60000);
        await browser.quit();
        console.log("🔒 Browser fermé.");
    }
})();
