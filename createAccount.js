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
        res.send('<h1>📸 Aperçu du Bot</h1><img src="/debug-image" style="width:100%;max-width:800px;border:2px solid #333;"><p><a href="/debug-image">Plein écran</a></p>');
    } else { res.send('<h1>✅ Bot actif...</h1>'); }
});
app.get('/debug-image', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'error_screenshot.png'));
});
app.listen(port, '0.0.0.0', () => console.log(`🌐 Serveur sur le port ${port}`));

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function saveScreenshot(browser, filename = 'error_screenshot.png') {
    try {
        let img = await browser.takeScreenshot();
        fs.writeFileSync(filename, img, 'base64');
        console.log(`📸 Screenshot : ${filename}`);
    } catch (e) { console.log('⚠️ Screenshot impossible'); }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 50 + 30);
    }
}

// ✅ Remplit un input React en déclenchant les bons événements natifs
async function fillReactInput(browser, element, value) {
    await browser.executeScript(`
        var el = arguments[0];
        var val = arguments[1];
        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(el, val);
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur',   { bubbles: true }));
    `, element, value);
    await sleep(400);
}

// ✅ Sélectionne une option dans un <select> React
async function selectOption(browser, selectElement, value) {
    let found = await browser.executeScript(`
        var select = arguments[0];
        var val = String(arguments[1]);
        var found = false;
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === val || select.options[i].text.trim() === val) {
                select.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (found) {
            var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
            setter.call(select, select.options[select.selectedIndex].value);
            ['input','change','blur'].forEach(function(n){
                select.dispatchEvent(new Event(n, {bubbles:true, cancelable:true}));
            });
        }
        return found;
    `, selectElement, String(value));
    await sleep(600);
    return found;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async function main() {

    const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
    const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');

    const service = new chrome.ServiceBuilder(driverPath);
    const options = new chrome.Options();
    options.setChromeBinaryPath(chromePath);
    options.addArguments(
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--lang=en-US,en'
    );
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    options.setUserPreferences({
        'intl.accept_languages': 'en-US,en',
        'profile.default_content_setting_values.notifications': 2
    });

    let browser = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .setChromeService(service)
        .build();

    let emailDomain = "";
    let emailName   = "";

    try {
        // ── 1. EMAIL ──────────────────────────────────────────────────────────
        console.log("📧 Récupération email...");
        let mail = await getFakeMail();
        if (!mail || !mail.includes('@') || mail.length < 6) {
            mail = "user" + Math.floor(Math.random() * 99999) + "@guerrillamail.com";
        }
        console.log("📧 Email : " + mail);
        const parts = mail.split('@');
        emailName   = parts[0];
        emailDomain = parts[1];

        // ── 2. OUVRIR INSTAGRAM ───────────────────────────────────────────────
        // ✅ URL /emailsignup/ = formulaire complet visible d'un coup
        console.log("🌍 Navigation Instagram...");
        await browser.get("https://www.instagram.com/accounts/emailsignup/");
        await sleep(7000);

        // Accepter cookies
        try {
            let cookieBtn = await browser.findElement(
                By.xpath("//button[contains(.,'Allow') or contains(.,'Accept') or contains(.,'Accepter') or contains(.,'Tout autoriser')]")
            );
            await cookieBtn.click();
            console.log("🍪 Cookies acceptés");
            await sleep(2000);
        } catch (e) { /* pas de popup */ }

        await saveScreenshot(browser);

        // ── 3. SAISIR L'EMAIL ─────────────────────────────────────────────────
        console.log("✍️ Saisie email...");
        let emailInput = await browser.wait(
            until.elementLocated(By.xpath("//input[@name='emailOrPhone' or @type='email' or @autocomplete='email']")),
            15000
        );
        await browser.executeScript("arguments[0].click(); arguments[0].focus();", emailInput);
        await sleep(400);
        await humanType(emailInput, mail);
        await fillReactInput(browser, emailInput, mail);
        await sleep(800);
        console.log("✅ Email saisi");

        // ── 4. MOT DE PASSE ───────────────────────────────────────────────────
        console.log("🔒 Saisie mot de passe...");
        let passInput = await browser.wait(
            until.elementLocated(By.xpath("//input[@type='password']")), 10000
        );
        await browser.executeScript("arguments[0].click(); arguments[0].focus();", passInput);
        await sleep(300);
        await humanType(passInput, "Azerty12345!");
        await fillReactInput(browser, passInput, "Azerty12345!");
        await sleep(500);
        // blur sur password pour déclencher le rendu des selects de date
        await browser.executeScript("arguments[0].blur(); document.body.click();", passInput);
        await sleep(2500);
        console.log("✅ Mot de passe saisi");

        // ── 5. DATE DE NAISSANCE ──────────────────────────────────────────────
        console.log("🎂 Saisie date de naissance...");

        let selects = await browser.findElements(By.tagName("select"));
        console.log(`   ${selects.length} select(s) au départ`);

        // Si < 3 selects, cliquer sur le 1er pour déclencher les autres
        if (selects.length < 3) {
            try {
                await browser.executeScript("arguments[0].click();", selects[0]);
                await sleep(1000);
                await browser.executeScript("arguments[0].blur();", selects[0]);
                await sleep(1000);
                selects = await browser.findElements(By.tagName("select"));
                console.log(`   Après clic sur select[0] : ${selects.length} select(s)`);
            } catch(e) {}
        }

        // Attendre jusqu'à 3 selects (max 10 tentatives)
        for (let i = 0; i < 10 && selects.length < 3; i++) {
            await sleep(1500);
            selects = await browser.findElements(By.tagName("select"));
            console.log(`   Tentative ${i+1} : ${selects.length} select(s)`);
        }

        if (selects.length >= 3) {
            // Afficher toutes les options pour diagnostic
            for (let i = 0; i < Math.min(selects.length, 3); i++) {
                let opts = await browser.executeScript(
                    `return Array.from(arguments[0].options).slice(0,5).map(o => '"'+o.value+'"="'+o.text+'"');`,
                    selects[i]
                );
                console.log(`   select[${i}] : ${opts.join(', ')}`);
            }

            // Détecter l'ordre : Jour/Mois/Année ou Month/Day/Year
            // Regarder la 2ème option du select[0] pour identifier
            let opt1Text = await browser.executeScript(
                `return arguments[0].options.length > 1 ? arguments[0].options[1].text.trim() : '';`,
                selects[0]
            );
            console.log("   2ème option select[0] :", opt1Text);

            // En anglais : Month first (January), Day second (1,2,3), Year last
            // En français : Jour first (1,2,3), Mois second (janvier), Année last
            let monthIdx, dayIdx, yearIdx;

            // Si la 2ème option ressemble à un nom de mois → Month/Day/Year order
            let isMonthFirst = /january|february|march|april|may|june|juillet|janvier|février|mars/i.test(opt1Text);
            // Si la 2ème option est un nombre → Jour/Day first
            let isNumberFirst = /^\d+$/.test(opt1Text);

            if (isMonthFirst) {
                monthIdx = 0; dayIdx = 1; yearIdx = 2;
                console.log("   Ordre : Month/Day/Year");
            } else {
                // Ordre français ou générique : Jour=0, Mois=1, Année=2
                dayIdx = 0; monthIdx = 1; yearIdx = 2;
                console.log("   Ordre : Day/Month/Year (français)");
            }

            // Sélectionner jour = 10
            let ok = await selectOption(browser, selects[dayIdx], "10");
            console.log(`   Jour "10" : ${ok}`);
            await sleep(700);

            // Sélectionner mois = 3 (ou "March" ou "mars" selon la langue)
            ok = await selectOption(browser, selects[monthIdx], "3");
            if (!ok) ok = await selectOption(browser, selects[monthIdx], "March");
            if (!ok) ok = await selectOption(browser, selects[monthIdx], "mars");
            console.log(`   Mois "3" : ${ok}`);
            await sleep(700);

            // Sélectionner année = 1995
            ok = await selectOption(browser, selects[yearIdx], "1995");
            console.log(`   Année "1995" : ${ok}`);
            await sleep(700);

            console.log("✅ Date de naissance saisie !");
        } else {
            console.log(`❌ Seulement ${selects.length} select(s) trouvé(s), date non remplie`);
        }

        await saveScreenshot(browser);
        await sleep(1000);

        // ── 6. NOM COMPLET & USERNAME ─────────────────────────────────────────
        console.log("👤 Saisie nom & username...");
        const fullName = generatingName();
        const uName    = username();
        console.log(`   Nom : ${fullName} | Username : ${uName}`);

        let allInputs = await browser.findElements(By.tagName("input"));
        console.log(`   ${allInputs.length} input(s) trouvé(s)`);

        for (let input of allInputs) {
            let name = await input.getAttribute("name");
            if (name === "fullName") {
                await browser.executeScript("arguments[0].click(); arguments[0].focus();", input);
                await sleep(300);
                await humanType(input, fullName);
                await fillReactInput(browser, input, fullName);
                console.log("✅ Nom : " + fullName);
                await sleep(500);
            }
            if (name === "username") {
                await browser.executeScript("arguments[0].click(); arguments[0].focus();", input);
                await sleep(300);
                // Vider si pré-rempli
                await browser.executeScript(`
                    var el = arguments[0];
                    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    setter.call(el, '');
                    el.dispatchEvent(new Event('input', {bubbles:true}));
                `, input);
                await sleep(200);
                await humanType(input, uName);
                await fillReactInput(browser, input, uName);
                console.log("✅ Username : " + uName);
                await sleep(1500); // attendre validation username disponible
            }
        }

        await sleep(3000);
        await saveScreenshot(browser);

        // ── 7. SUBMIT ─────────────────────────────────────────────────────────
        console.log("🚀 Recherche bouton Submit...");

        // Lister tous les boutons pour debug
        let allBtns = await browser.findElements(By.tagName("button"));
        for (let btn of allBtns) {
            let txt  = (await btn.getText()).replace(/\n/g,' ');
            let type = await btn.getAttribute("type");
            let dis  = await btn.getAttribute("disabled");
            console.log(`   btn type="${type}" disabled="${dis}" texte="${txt}"`);
        }

        let submitBtn = null;

        // Essai 1 : type=submit
        try { submitBtn = await browser.findElement(By.xpath("//button[@type='submit']")); } catch(e) {}

        // Essai 2 : textes connus
        if (!submitBtn) {
            try {
                submitBtn = await browser.findElement(
                    By.xpath("//button[contains(.,'Submit') or contains(.,'Next') or contains(.,'Envoyer') or contains(.,'Sign up') or contains(.,'Inscription')]")
                );
            } catch(e) {}
        }

        // Essai 3 : dernier bouton
        if (!submitBtn && allBtns.length > 0) submitBtn = allBtns[allBtns.length - 1];

        if (submitBtn) {
            let dis = await submitBtn.getAttribute("disabled");
            console.log(`   Submit disabled="${dis}"`);
            // Forcer même si désactivé
            await browser.executeScript(
                "arguments[0].removeAttribute('disabled'); arguments[0].click();",
                submitBtn
            );
            console.log("✅ Submit cliqué !");
        } else {
            console.log("❌ Aucun bouton trouvé !");
        }

        await sleep(6000);
        await saveScreenshot(browser);

        // ── 8. CODE DE VÉRIFICATION ───────────────────────────────────────────
        console.log("📬 Attente code de vérification...");
        await sleep(15000);
        await saveScreenshot(browser);

        if (emailDomain && emailName) {
            console.log(`🔍 Lecture email : ${emailName}@${emailDomain}`);
            let code = await getInstCode(emailDomain, emailName, browser);

            if (code && code.trim().length >= 4) {
                console.log("✅ Code reçu : " + code.trim());
                let codeInput = null;
                try {
                    codeInput = await browser.wait(
                        until.elementLocated(By.xpath(
                            "//input[@name='confirmationCode' or @inputmode='numeric' or @autocomplete='one-time-code']"
                        )), 10000
                    );
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
                        let confirmBtn = await browser.findElement(
                            By.xpath("//button[@type='submit' or contains(.,'Next') or contains(.,'Continuer') or contains(.,'Confirm')]")
                        );
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
        console.log("🎉 Processus terminé !");

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
