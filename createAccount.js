const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');
const { getFakeMail } = require('./createFakeMail');
const { getInstCode } = require('./getCode');
const { generatingName, username } = require('./accountInfoGenerator');

// ─── SERVEUR EXPRESS ──────────────────────────────────────────────────────────
const app = express();
const port = process.env.PORT || 10000;

// État global partagé entre le bot et le serveur
let botState = {
    status: 'starting',   // starting | waiting_date | waiting_code | done | error
    message: '',
    email: '',
    password: 'Azerty12345!',
    fullName: '',
    uName: '',
    code: '',
    dateSubmitted: false,
    confirmCode: ''
};

// Page principale : affiche le formulaire interactif quand le bot attend l'utilisateur
app.get('/', (req, res) => {
    if (botState.status === 'waiting_date') {
        res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot Instagram - Action requise</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; background: #fafafa; }
        h2 { color: #e1306c; }
        .info { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .field { background: #d4edda; border: 1px solid #28a745; padding: 10px; border-radius: 6px; margin: 8px 0; font-size: 15px; }
        label { font-weight: bold; display: block; margin-top: 15px; }
        select, input { width: 100%; padding: 10px; margin-top: 5px; border: 2px solid #ccc; border-radius: 6px; font-size: 16px; }
        button { width: 100%; padding: 14px; background: #0095f6; color: white; border: none; border-radius: 8px; font-size: 18px; cursor: pointer; margin-top: 20px; }
        button:hover { background: #007acc; }
        .step { background: #e8f4fd; padding: 10px; border-radius: 6px; margin: 10px 0; }
    </style>
</head>
<body>
    <h2>🤖 Bot Instagram</h2>
    <div class="info">
        ⚠️ <strong>Action requise !</strong><br>
        Le bot a rempli tous les champs sauf la <strong>date de naissance</strong>.<br>
        Remplis la date ci-dessous et clique sur <strong>Envoyer</strong>.
    </div>

    <div class="step">✅ Email : <strong>${botState.email}</strong></div>
    <div class="step">✅ Mot de passe : <strong>${botState.password}</strong></div>
    <div class="step">✅ Nom : <strong>${botState.fullName}</strong></div>
    <div class="step">✅ Username : <strong>${botState.uName}</strong></div>

    <form action="/submit-date" method="POST">
        <label>📅 Mois de naissance :</label>
        <select name="month" required>
            <option value="">-- Choisir --</option>
            <option value="1">Janvier</option><option value="2">Février</option>
            <option value="3">Mars</option><option value="4">Avril</option>
            <option value="5">Mai</option><option value="6">Juin</option>
            <option value="7">Juillet</option><option value="8">Août</option>
            <option value="9">Septembre</option><option value="10">Octobre</option>
            <option value="11">Novembre</option><option value="12">Décembre</option>
        </select>

        <label>📅 Jour de naissance :</label>
        <select name="day" required>
            <option value="">-- Choisir --</option>
            ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
        </select>

        <label>📅 Année de naissance :</label>
        <select name="year" required>
            <option value="">-- Choisir --</option>
            ${Array.from({length:80},(_,i)=>`<option value="${2005-i}">${2005-i}</option>`).join('')}
        </select>

        <button type="submit">🚀 Soumettre la date et créer le compte !</button>
    </form>
</body>
</html>`);
    } else if (botState.status === 'waiting_code') {
        res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code de vérification</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; background: #fafafa; }
        h2 { color: #e1306c; }
        input { width:100%; padding:12px; font-size:22px; text-align:center; border:2px solid #ccc; border-radius:8px; margin-top:10px; letter-spacing:8px; }
        button { width:100%; padding:14px; background:#0095f6; color:white; border:none; border-radius:8px; font-size:18px; cursor:pointer; margin-top:15px; }
    </style>
</head>
<body>
    <h2>📧 Code de confirmation Instagram</h2>
    <p>Un code à 6 chiffres a été envoyé à : <strong>${botState.email}</strong></p>
    <p>Vérifie ta boîte mail et entre le code ici :</p>
    <form action="/submit-code" method="POST">
        <input type="text" name="code" maxlength="6" placeholder="000000" required autofocus>
        <button type="submit">✅ Valider le code</button>
    </form>
</body>
</html>`);
    } else if (botState.status === 'done') {
        res.send(`<h1 style="color:green;text-align:center;font-family:Arial;">🎉 Compte Instagram créé avec succès !</h1><p style="text-align:center">Email : ${botState.email}</p>`);
    } else if (botState.status === 'error') {
        res.send(`<h1 style="color:red;text-align:center;font-family:Arial;">❌ Erreur : ${botState.message}</h1><img src="/debug-image" style="width:100%;">`);
    } else {
        res.send(`<h1 style="font-family:Arial;text-align:center;">⏳ Bot en cours... (${botState.status})</h1><p style="text-align:center">${botState.message}</p><meta http-equiv="refresh" content="3">`);
    }
});

// Réception de la date soumise par l'utilisateur
app.use(express.urlencoded({ extended: true }));
app.post('/submit-date', (req, res) => {
    botState.dateMonth = req.body.month;
    botState.dateDay   = req.body.day;
    botState.dateYear  = req.body.year;
    botState.dateSubmitted = true;
    console.log(`📅 Date reçue de l'utilisateur : ${req.body.day}/${req.body.month}/${req.body.year}`);
    res.send('<h2 style="font-family:Arial;text-align:center;">✅ Date reçue ! Le bot continue... <meta http-equiv="refresh" content="3;url=/">');
});

// Réception du code de vérification
app.post('/submit-code', (req, res) => {
    botState.confirmCode = req.body.code;
    console.log(`🔑 Code reçu de l'utilisateur : ${req.body.code}`);
    res.send('<h2 style="font-family:Arial;text-align:center;">✅ Code reçu ! Validation en cours... <meta http-equiv="refresh" content="3;url=/">');
});

app.get('/debug-image', (req, res) => {
    if (fs.existsSync('error_screenshot.png'))
        res.sendFile(path.join(process.cwd(), 'error_screenshot.png'));
    else res.send('Pas de screenshot');
});

app.listen(port, '0.0.0.0', () => console.log(`🌐 Serveur sur le port ${port}`));

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function saveScreenshot(browser) {
    try {
        fs.writeFileSync('error_screenshot.png', await browser.takeScreenshot(), 'base64');
        console.log('📸 Screenshot sauvegardé');
    } catch(e) {}
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 50 + 25);
    }
}

async function fillReactInput(browser, element, value) {
    await browser.executeScript(`
        var el=arguments[0], v=arguments[1];
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);
        ['input','change','blur'].forEach(n=>el.dispatchEvent(new Event(n,{bubbles:true})));
    `, element, value);
    await sleep(300);
}

async function selectOption(browser, sel, value) {
    return await browser.executeScript(`
        var s=arguments[0], v=String(arguments[1]);
        for(var i=0;i<s.options.length;i++){
            if(s.options[i].value===v||s.options[i].text.trim()===v){
                s.selectedIndex=i;
                Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(s,s.options[i].value);
                ['input','change','blur'].forEach(n=>s.dispatchEvent(new Event(n,{bubbles:true})));
                return true;
            }
        }
        return false;
    `, sel, String(value));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async function main() {
    const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
    const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');

    const service = new chrome.ServiceBuilder(driverPath);
    const options = new chrome.Options();
    options.setChromeBinaryPath(chromePath);
    options.addArguments(
        '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
        '--window-size=1920,1080', '--disable-blink-features=AutomationControlled',
        '--lang=en-US,en'
    );
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    options.setUserPreferences({ 'intl.accept_languages': 'en-US,en' });

    let browser = await new Builder().forBrowser('chrome')
        .setChromeOptions(options).setChromeService(service).build();

    let emailDomain = "", emailName = "";

    try {
        botState.status  = 'filling';
        botState.message = 'Récupération de l\'email...';

        // ── 1. EMAIL ──────────────────────────────────────────────────────────
        let mail = await getFakeMail();
        if (!mail || !mail.includes('@') || mail.length < 6)
            mail = "user" + Math.floor(Math.random() * 99999) + "@guerrillamail.com";
        [emailName, emailDomain] = mail.split('@');
        botState.email = mail;
        console.log("📧 Email : " + mail);

        // ── 2. OUVRIR INSTAGRAM ───────────────────────────────────────────────
        botState.message = 'Ouverture Instagram...';
        await browser.get("https://www.instagram.com/accounts/emailsignup/");
        await sleep(8000);

        // Accepter cookies
        try {
            let btn = await browser.findElement(By.xpath(
                "//button[contains(.,'Allow') or contains(.,'Accept') or contains(.,'Accepter') or contains(.,'Tout autoriser')]"
            ));
            await btn.click();
            await sleep(2000);
        } catch(e) {}

        await saveScreenshot(browser);

        // Trouver les inputs par position (pas par name car Instagram ne les nomme pas)
        let inputs = await browser.findElements(By.tagName("input"));
        console.log(`🔍 ${inputs.length} input(s) trouvé(s)`);

        // ── 3. EMAIL (1er input texte) ────────────────────────────────────────
        botState.message = 'Saisie email...';
        let emailInput = null;
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "email" || t === "tel") { emailInput = inp; break; }
        }
        if (emailInput) {
            await browser.executeScript("arguments[0].click(); arguments[0].focus();", emailInput);
            await sleep(400);
            await humanType(emailInput, mail);
            await fillReactInput(browser, emailInput, mail);
            console.log("✅ Email saisi");
        }

        // ── 4. PASSWORD ───────────────────────────────────────────────────────
        botState.message = 'Saisie mot de passe...';
        let passInput = null;
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "password") { passInput = inp; break; }
        }
        if (passInput) {
            await browser.executeScript("arguments[0].click(); arguments[0].focus();", passInput);
            await sleep(300);
            await humanType(passInput, "Azerty12345!");
            await fillReactInput(browser, passInput, "Azerty12345!");
            await browser.executeScript("arguments[0].blur(); document.body.click();", passInput);
            await sleep(2500);
            console.log("✅ Password saisi");
        }

        // ── 5. TENTER LA DATE AUTOMATIQUEMENT ────────────────────────────────
        botState.message = 'Tentative date automatique...';
        let selects = await browser.findElements(By.tagName("select"));
        let dateAutoSuccess = false;

        if (selects.length >= 3) {
            // Détecter ordre
            let opt1 = await browser.executeScript(
                `return arguments[0].options.length>1?arguments[0].options[1].text.trim():'';`, selects[0]
            );
            let monthFirst = /january|february|march|janvier|février|mars/i.test(opt1);
            let [dayIdx, monthIdx, yearIdx] = monthFirst ? [1,0,2] : [0,1,2];

            let r1 = await selectOption(browser, selects[dayIdx], "10");
            let r2 = await selectOption(browser, selects[monthIdx], "3");
            if (!r2) r2 = await selectOption(browser, selects[monthIdx], "March");
            if (!r2) r2 = await selectOption(browser, selects[monthIdx], "mars");
            let r3 = await selectOption(browser, selects[yearIdx], "1995");

            dateAutoSuccess = r1 && r2 && r3;
            console.log(`📅 Date auto : jour=${r1} mois=${r2} année=${r3}`);
        }

        // ── 6. NOM COMPLET & USERNAME ─────────────────────────────────────────
        botState.message = 'Saisie nom & username...';
        const fullName = generatingName();
        const uName    = username();
        botState.fullName = fullName;
        botState.uName    = uName;
        console.log(`👤 Nom: "${fullName}" | Username: "${uName}"`);

        // Re-scanner les inputs (ils peuvent avoir changé après blur password)
        let allInputs = await browser.findElements(By.tagName("input"));
        let textInputs = [];
        for (let inp of allInputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "search") textInputs.push(inp);
        }
        console.log(`   ${textInputs.length} input(s) texte trouvé(s)`);

        // Les inputs texte sont généralement : [0]=email, [1]=fullName, [2]=username
        if (textInputs.length >= 2) {
            // fullName = avant-dernier input texte (ou index 1)
            let nameInput = textInputs.length >= 3 ? textInputs[textInputs.length - 2] : textInputs[1];
            await browser.executeScript("arguments[0].click(); arguments[0].focus();", nameInput);
            await sleep(300);
            await humanType(nameInput, fullName);
            await fillReactInput(browser, nameInput, fullName);
            console.log("✅ Nom saisi");
            await sleep(500);
        }

        if (textInputs.length >= 1) {
            // username = dernier input texte (type="search" avec aria-label="Username")
            let userInput = textInputs[textInputs.length - 1];
            await browser.executeScript("arguments[0].click(); arguments[0].focus();", userInput);
            await sleep(300);
            // Vider si pré-rempli
            await browser.executeScript(`
                var el=arguments[0];
                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,'');
                el.dispatchEvent(new Event('input',{bubbles:true}));
            `, userInput);
            await sleep(200);
            await humanType(userInput, uName);
            await fillReactInput(browser, userInput, uName);
            console.log("✅ Username saisi");
            await sleep(1500);
        }

        await saveScreenshot(browser);
        await sleep(2000);

        // ── 7. SI DATE AUTO ÉCHOUÉE → MODE HYBRIDE ───────────────────────────
        if (!dateAutoSuccess) {
            console.log("⚠️ Date auto échouée → Mode hybride : l'utilisateur doit remplir la date");
            botState.status  = 'waiting_date';
            botState.message = 'En attente de la date de naissance saisie par l\'utilisateur';

            // Attendre que l'utilisateur soumette la date (max 10 minutes)
            let waited = 0;
            while (!botState.dateSubmitted && waited < 600) {
                await sleep(2000);
                waited += 2;
            }

            if (!botState.dateSubmitted) {
                console.log("⏰ Timeout : l'utilisateur n'a pas soumis la date");
                botState.status = 'error';
                botState.message = 'Timeout : aucune date reçue après 10 minutes';
                return;
            }

            // ✅ Injecter la date reçue dans le formulaire Instagram
            console.log(`📅 Injection date : ${botState.dateDay}/${botState.dateMonth}/${botState.dateYear}`);
            let dateSelects = await browser.findElements(By.tagName("select"));

            if (dateSelects.length >= 3) {
                let opt1 = await browser.executeScript(
                    `return arguments[0].options.length>1?arguments[0].options[1].text.trim():'';`, dateSelects[0]
                );
                let monthFirst = /january|february|march|janvier|février|mars/i.test(opt1);
                let [dayIdx, monthIdx, yearIdx] = monthFirst ? [1,0,2] : [0,1,2];

                await selectOption(browser, dateSelects[dayIdx],   botState.dateDay);
                await sleep(500);
                await selectOption(browser, dateSelects[monthIdx], botState.dateMonth);
                await sleep(500);
                await selectOption(browser, dateSelects[yearIdx],  botState.dateYear);
                await sleep(500);
                console.log("✅ Date injectée !");
            } else {
                console.log(`❌ Toujours ${dateSelects.length} select(s) - impossible d'injecter`);
            }
        }

        await saveScreenshot(browser);
        botState.status  = 'submitting';
        botState.message = 'Soumission du formulaire...';
        await sleep(1500);

        // ── 8. SUBMIT ─────────────────────────────────────────────────────────
        console.log("🚀 Submit...");
        let btns = await browser.findElements(By.tagName("button"));
        let submitBtn = null;

        for (let b of btns) {
            let t   = await b.getAttribute("type");
            let txt = (await b.getText()).replace(/\n/g,' ').trim();
            console.log(`   btn type="${t}" txt="${txt}"`);
            if (t === "submit" || /submit|envoyer|next|sign up|inscription/i.test(txt)) {
                submitBtn = b; break;
            }
        }
        if (!submitBtn && btns.length > 0) submitBtn = btns[btns.length - 1];

        if (submitBtn) {
            await browser.executeScript(
                "arguments[0].removeAttribute('disabled'); arguments[0].click();", submitBtn
            );
            console.log("✅ Submit cliqué !");
        }

        await sleep(6000);
        await saveScreenshot(browser);

        // ── 9. CODE DE VÉRIFICATION ───────────────────────────────────────────
        console.log("📬 Attente code de vérification...");

        // Vérifier si on est sur la page de code
        let pageSource = await browser.getPageSource();
        let needsCode  = pageSource.includes('confirmationCode') || pageSource.includes('confirmation') ||
                         pageSource.includes('code') || pageSource.includes('verify');

        if (needsCode) {
            botState.status  = 'waiting_code';
            botState.message = 'En attente du code de vérification';
            console.log("📧 Page de code détectée → Mode hybride pour le code");

            // Essayer d'abord automatiquement
            await sleep(15000);
            let autoCode = await getInstCode(emailDomain, emailName, browser);

            if (autoCode && autoCode.trim().length >= 4) {
                console.log("✅ Code auto : " + autoCode);
                botState.confirmCode = autoCode.trim();
            } else {
                // Attendre que l'utilisateur entre le code manuellement (max 5 min)
                let waited = 0;
                while ((!botState.confirmCode || botState.confirmCode.length < 4) && waited < 300) {
                    await sleep(2000);
                    waited += 2;
                }
            }

            if (botState.confirmCode && botState.confirmCode.length >= 4) {
                let codeInput = null;
                try {
                    codeInput = await browser.findElement(By.xpath(
                        "//input[@name='confirmationCode' or @inputmode='numeric' or @autocomplete='one-time-code']"
                    ));
                } catch(e) {
                    let ins = await browser.findElements(By.tagName("input"));
                    if (ins.length > 0) codeInput = ins[0];
                }

                if (codeInput) {
                    await browser.executeScript("arguments[0].focus();", codeInput);
                    await humanType(codeInput, botState.confirmCode);
                    await fillReactInput(browser, codeInput, botState.confirmCode);
                    await sleep(1000);

                    let confirmBtns = await browser.findElements(By.tagName("button"));
                    if (confirmBtns.length > 0) {
                        await browser.executeScript("arguments[0].click();", confirmBtns[0]);
                        console.log("✅ Code soumis !");
                    }
                }
            }
        }

        await sleep(5000);
        await saveScreenshot(browser);
        botState.status  = 'done';
        botState.message = 'Compte créé !';
        console.log("🎉 Terminé !");

    } catch (e) {
        console.error("❌ ERREUR : " + e.message);
        botState.status  = 'error';
        botState.message = e.message;
        await saveScreenshot(browser);
    } finally {
        await sleep(60000); // garder le bot en vie 60s pour que l'utilisateur voie le résultat
        await browser.quit();
        console.log("🔒 Browser fermé.");
    }
})();
