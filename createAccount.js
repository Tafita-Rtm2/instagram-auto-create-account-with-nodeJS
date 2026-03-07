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
app.get('/', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) {
        res.send('<h1>📸 Bot</h1><img src="/debug-image" style="width:100%;max-width:800px;"><p><a href="/debug-image">Plein écran</a></p>');
    } else { res.send('<h1>✅ Bot actif...</h1>'); }
});
app.get('/debug-image', (req, res) => res.sendFile(path.join(process.cwd(), 'error_screenshot.png')));
app.listen(port, '0.0.0.0', () => console.log(`🌐 Port ${port}`));

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function saveScreenshot(browser, filename = 'error_screenshot.png') {
    try {
        fs.writeFileSync(filename, await browser.takeScreenshot(), 'base64');
        console.log(`📸 Screenshot : ${filename}`);
    } catch (e) { console.log('⚠️ Screenshot impossible'); }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 50 + 25);
    }
}

// ✅ Remplit un input React avec les vrais événements natifs
async function fillReactInput(browser, element, value) {
    await browser.executeScript(`
        var el = arguments[0], val = arguments[1];
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        ['input','change','blur'].forEach(n => el.dispatchEvent(new Event(n, {bubbles:true})));
    `, element, value);
    await sleep(300);
}

// ✅ Sélectionne une valeur dans un <select> React
async function selectOption(browser, sel, value) {
    let ok = await browser.executeScript(`
        var s = arguments[0], v = String(arguments[1]);
        for (var i = 0; i < s.options.length; i++) {
            if (s.options[i].value === v || s.options[i].text.trim() === v) {
                s.selectedIndex = i;
                Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value')
                    .set.call(s, s.options[i].value);
                ['input','change','blur'].forEach(n => s.dispatchEvent(new Event(n,{bubbles:true})));
                return true;
            }
        }
        return false;
    `, sel, String(value));
    await sleep(500);
    return ok;
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
        '--disable-infobars', '--lang=en-US,en'
    );
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    options.setUserPreferences({ 'intl.accept_languages': 'en-US,en' });

    let browser = await new Builder().forBrowser('chrome')
        .setChromeOptions(options).setChromeService(service).build();

    let emailDomain = "", emailName = "";

    try {
        // ── 1. EMAIL ──────────────────────────────────────────────────────────
        console.log("📧 Récupération email...");
        let mail = await getFakeMail();
        if (!mail || !mail.includes('@') || mail.length < 6)
            mail = "user" + Math.floor(Math.random() * 99999) + "@guerrillamail.com";
        console.log("📧 Email : " + mail);
        [emailName, emailDomain] = mail.split('@');

        // ── 2. OUVRIR INSTAGRAM ───────────────────────────────────────────────
        console.log("🌍 Ouverture Instagram...");
        await browser.get("https://www.instagram.com/accounts/emailsignup/");
        await sleep(8000);

        // Accepter cookies si popup
        try {
            let btn = await browser.findElement(By.xpath(
                "//button[contains(.,'Allow') or contains(.,'Accept') or contains(.,'Accepter') or contains(.,'Tout autoriser')]"
            ));
            await btn.click();
            await sleep(2000);
            console.log("🍪 Cookies acceptés");
        } catch(e) {}

        await saveScreenshot(browser);

        // ── DEBUG : Lister TOUS les inputs présents sur la page ───────────────
        let debugInputs = await browser.findElements(By.tagName("input"));
        console.log(`🔍 ${debugInputs.length} input(s) trouvé(s) sur la page :`);
        for (let inp of debugInputs) {
            let n    = await inp.getAttribute("name")        || "(no name)";
            let t    = await inp.getAttribute("type")        || "(no type)";
            let ph   = await inp.getAttribute("placeholder") || "(no placeholder)";
            let ac   = await inp.getAttribute("autocomplete")|| "(no autocomplete)";
            let aria = await inp.getAttribute("aria-label")  || "(no aria)";
            console.log(`   input: name="${n}" type="${t}" placeholder="${ph}" autocomplete="${ac}" aria="${aria}"`);
        }

        // ── 3. TROUVER LE CHAMP EMAIL (robuste) ──────────────────────────────
        console.log("✍️ Saisie email...");
        let emailInput = null;

        // Essai par ordre de priorité
        const emailSelectors = [
            By.name("emailOrPhone"),
            By.xpath("//input[@type='email']"),
            By.xpath("//input[@autocomplete='email']"),
            By.xpath("//input[contains(@placeholder,'email') or contains(@placeholder,'Email') or contains(@placeholder,'e-mail')]"),
            By.xpath("//input[contains(@aria-label,'email') or contains(@aria-label,'Email') or contains(@aria-label,'mobile')]"),
            By.xpath("//input[@type='text'][1]"),   // premier input texte
        ];

        for (let sel of emailSelectors) {
            try {
                emailInput = await browser.findElement(sel);
                console.log("   Email input trouvé avec : " + sel);
                break;
            } catch(e) {}
        }

        // Dernier recours : premier input visible
        if (!emailInput) {
            let allInps = await browser.findElements(By.tagName("input"));
            for (let inp of allInps) {
                let t = await inp.getAttribute("type");
                if (t !== "hidden" && t !== "password") { emailInput = inp; break; }
            }
        }

        if (emailInput) {
            await browser.executeScript("arguments[0].click(); arguments[0].focus();", emailInput);
            await sleep(400);
            await humanType(emailInput, mail);
            await fillReactInput(browser, emailInput, mail);
            console.log("✅ Email saisi : " + mail);
        } else {
            console.log("❌ Champ email introuvable !");
        }
        await sleep(800);

        // ── 4. MOT DE PASSE ───────────────────────────────────────────────────
        console.log("🔒 Saisie mot de passe...");
        let passInput = null;
        try {
            passInput = await browser.findElement(By.xpath("//input[@type='password']"));
        } catch(e) { console.log("❌ Champ password introuvable"); }

        if (passInput) {
            await browser.executeScript("arguments[0].click(); arguments[0].focus();", passInput);
            await sleep(300);
            await humanType(passInput, "Azerty12345!");
            await fillReactInput(browser, passInput, "Azerty12345!");
            // ✅ blur = déclenche l'affichage des selects de date
            await browser.executeScript("arguments[0].blur(); document.body.click();", passInput);
            await sleep(2500);
            console.log("✅ Mot de passe saisi");
        }

        // ── 5. DATE DE NAISSANCE ──────────────────────────────────────────────
        console.log("🎂 Date de naissance...");

        // Attendre les selects
        let selects = [];
        for (let i = 0; i < 12; i++) {
            selects = await browser.findElements(By.tagName("select"));
            if (selects.length >= 3) break;
            // Déclencher le rendu : cliquer sur le premier select si disponible
            if (selects.length === 1 && i === 2) {
                await browser.executeScript("arguments[0].click();", selects[0]);
                await sleep(500);
                await browser.executeScript("arguments[0].blur();", selects[0]);
            }
            console.log(`   Attente selects : ${selects.length}/3 (tentative ${i+1})`);
            await sleep(1500);
        }

        if (selects.length >= 3) {
            // Debug : afficher options de chaque select
            for (let i = 0; i < 3; i++) {
                let opts = await browser.executeScript(
                    `return Array.from(arguments[0].options).slice(0,4).map(o => o.value+'|'+o.text);`, selects[i]
                );
                console.log(`   select[${i}] : ${opts.join(', ')}`);
            }

            // Détecter l'ordre (Jour/Mois/Année ou Month/Day/Year)
            let opt1 = await browser.executeScript(
                `return arguments[0].options.length>1 ? arguments[0].options[1].text.trim() : '';`, selects[0]
            );
            console.log("   opt1 de select[0] = '" + opt1 + "'");

            let monthFirst = /january|february|march|januar|février|janvier/i.test(opt1);
            let [dayIdx, monthIdx, yearIdx] = monthFirst ? [1, 0, 2] : [0, 1, 2];
            console.log(`   Ordre : monthFirst=${monthFirst} → day[${dayIdx}] month[${monthIdx}] year[${yearIdx}]`);

            // Sélectionner les valeurs
            let r;
            r = await selectOption(browser, selects[dayIdx], "10");
            console.log(`   Jour "10" : ${r}`);
            await sleep(600);

            // Essayer plusieurs formes pour le mois
            r = await selectOption(browser, selects[monthIdx], "3");
            if (!r) r = await selectOption(browser, selects[monthIdx], "March");
            if (!r) r = await selectOption(browser, selects[monthIdx], "mars");
            if (!r) r = await selectOption(browser, selects[monthIdx], "03");
            console.log(`   Mois "3" : ${r}`);
            await sleep(600);

            r = await selectOption(browser, selects[yearIdx], "1995");
            console.log(`   Année "1995" : ${r}`);
            await sleep(600);

            console.log("✅ Date saisie !");
        } else {
            console.log(`❌ Seulement ${selects.length} select(s) trouvé(s)`);
        }

        await saveScreenshot(browser);
        await sleep(800);

        // ── 6. NOM COMPLET & USERNAME ─────────────────────────────────────────
        console.log("👤 Nom & Username...");
        const fullName = generatingName();
        const uName    = username();
        console.log(`   Nom: "${fullName}" | Username: "${uName}"`);

        // Debug : lister tous les inputs à ce stade
        let currentInputs = await browser.findElements(By.tagName("input"));
        for (let inp of currentInputs) {
            let n  = await inp.getAttribute("name") || "(no name)";
            let t  = await inp.getAttribute("type") || "(no type)";
            let ph = await inp.getAttribute("placeholder") || "(no ph)";
            console.log(`   input: name="${n}" type="${t}" placeholder="${ph}"`);
        }

        for (let inp of currentInputs) {
            let n = await inp.getAttribute("name");

            // ✅ Nom complet (fullName)
            if (n === "fullName") {
                await browser.executeScript("arguments[0].click(); arguments[0].focus();", inp);
                await sleep(300);
                await humanType(inp, fullName);
                await fillReactInput(browser, inp, fullName);
                console.log("✅ Nom : " + fullName);
                await sleep(500);
            }

            // ✅ Username
            if (n === "username") {
                await browser.executeScript("arguments[0].click(); arguments[0].focus();", inp);
                await sleep(300);
                // Vider si pré-rempli
                await browser.executeScript(`
                    var el=arguments[0];
                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')
                        .set.call(el,'');
                    el.dispatchEvent(new Event('input',{bubbles:true}));
                `, inp);
                await sleep(200);
                await humanType(inp, uName);
                await fillReactInput(browser, inp, uName);
                console.log("✅ Username : " + uName);
                await sleep(1500);
            }
        }

        await sleep(3000);
        await saveScreenshot(browser);

        // ── 7. BOUTON SUBMIT ──────────────────────────────────────────────────
        console.log("🚀 Clic Submit...");

        // Debug : lister tous les boutons
        let btns = await browser.findElements(By.tagName("button"));
        console.log(`   ${btns.length} bouton(s) :`);
        for (let b of btns) {
            let txt = (await b.getText()).replace(/\n/g,' ').trim();
            let t   = await b.getAttribute("type");
            let d   = await b.getAttribute("disabled");
            console.log(`   btn: type="${t}" disabled="${d}" texte="${txt}"`);
        }

        let submitBtn = null;
        try { submitBtn = await browser.findElement(By.xpath("//button[@type='submit']")); } catch(e) {}
        if (!submitBtn) {
            try {
                submitBtn = await browser.findElement(By.xpath(
                    "//button[contains(.,'Submit') or contains(.,'Envoyer') or contains(.,'Next') or contains(.,'Sign up') or contains(.,'Inscription') or contains(.,'Continuer')]"
                ));
            } catch(e) {}
        }
        if (!submitBtn && btns.length > 0) submitBtn = btns[btns.length - 1];

        if (submitBtn) {
            // Forcer le clic même si désactivé
            await browser.executeScript(
                "arguments[0].removeAttribute('disabled'); arguments[0].click();", submitBtn
            );
            console.log("✅ Submit cliqué !");
        } else {
            console.log("❌ Aucun bouton trouvé !");
        }

        await sleep(6000);
        await saveScreenshot(browser);

        // ── 8. CODE DE VÉRIFICATION ───────────────────────────────────────────
        console.log("📬 Attente code...");
        await sleep(15000);
        await saveScreenshot(browser);

        if (emailDomain && emailName) {
            let code = await getInstCode(emailDomain, emailName, browser);
            if (code && code.trim().length >= 4) {
                console.log("✅ Code : " + code.trim());
                let codeInput = null;
                try {
                    codeInput = await browser.wait(until.elementLocated(By.xpath(
                        "//input[@name='confirmationCode' or @inputmode='numeric' or @autocomplete='one-time-code']"
                    )), 10000);
                } catch(e) {
                    let ins = await browser.findElements(By.tagName("input"));
                    if (ins.length > 0) codeInput = ins[0];
                }
                if (codeInput) {
                    await browser.executeScript("arguments[0].focus();", codeInput);
                    await humanType(codeInput, code.trim());
                    await fillReactInput(browser, codeInput, code.trim());
                    await sleep(1000);
                    try {
                        let confirmBtn = await browser.findElement(By.xpath(
                            "//button[@type='submit' or contains(.,'Next') or contains(.,'Continuer') or contains(.,'Confirm')]"
                        ));
                        await browser.executeScript("arguments[0].click();", confirmBtn);
                        console.log("✅ Code soumis !");
                    } catch(e) { console.log("⚠️ Bouton confirmation non trouvé"); }
                }
            } else {
                console.log("⚠️ Aucun code reçu");
            }
        }

        await sleep(5000);
        await saveScreenshot(browser);
        console.log("🎉 Terminé !");

    } catch (e) {
        console.error("❌ ERREUR : " + e.message);
        console.error(e.stack);
        await saveScreenshot(browser);
    } finally {
        await sleep(30000);
        await browser.quit();
        console.log("🔒 Browser fermé.");
    }
})();
