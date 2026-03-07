const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');
const { getFakeMail } = require('./createFakeMail');
const { getInstCode } = require('./getCode');
const { generatingName, username } = require('./accountInfoGenerator');

// ─── SERVEUR EXPRESS (debug visuel) ──────────────────────────────────────────
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) {
        res.send(`
            <h1>📸 Aperçu du Bot</h1>
            <img src="/debug-image" style="width:100%;max-width:800px;border:2px solid #333;">
            <p><a href="/debug-image">Voir en plein écran</a></p>
        `);
    } else {
        res.send('<h1>✅ Bot actif - En attente du screenshot...</h1>');
    }
});
app.get('/debug-image', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'error_screenshot.png'));
});
app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Serveur Express démarré sur le port ${port}`);
});

// ─── UTILITAIRES ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function saveScreenshot(browser, filename = 'error_screenshot.png') {
    try {
        let img = await browser.takeScreenshot();
        fs.writeFileSync(filename, img, 'base64');
        console.log(`📸 Screenshot sauvegardé : ${filename}`);
    } catch (e) {
        console.log('⚠️ Screenshot impossible : ' + e.message);
    }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 50 + 30);
    }
}

// ✅ Sélectionner une option <select> via JavaScript (contourne React)
async function selectOption(browser, selectElement, value) {
    await browser.executeScript(`
        var select = arguments[0];
        var val = arguments[1];
        var found = false;
        for (var i = 0; i < select.options.length; i++) {
            if (String(select.options[i].value) === String(val) || 
                select.options[i].text.trim() === String(val)) {
                select.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (found) {
            ['input', 'change', 'blur'].forEach(function(evtName) {
                var evt = new Event(evtName, { bubbles: true, cancelable: true });
                select.dispatchEvent(evt);
            });
            // React synthetic event
            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
            nativeInputValueSetter.call(select, select.options[select.selectedIndex].value);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return found;
    `, selectElement, value);
    await sleep(700);
}

// ─── PROGRAMME PRINCIPAL ─────────────────────────────────────────────────────
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
        '--lang=en-US'
    );
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    options.setUserPreferences({ 'intl.accept_languages': 'en,en_US' });

    let browser = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .setChromeService(service)
        .build();

    // Variables pour getCode plus tard
    let emailDomain = "";
    let emailName = "";

    try {
        // ── ÉTAPE 1 : Récupérer un faux email ────────────────────────────────
        console.log("📧 Récupération d'un email temporaire...");
        let mail = await getFakeMail();
        if (!mail || mail.length < 5) {
            mail = "alan" + Math.floor(Math.random() * 99999) + "@guerrillamail.com";
        }
        console.log("📧 Email obtenu : " + mail);

        // Extraire domain et name pour getCode
        if (mail.includes("@")) {
            const parts = mail.split("@");
            emailName = parts[0];
            emailDomain = parts[1];
        }

        // ── ÉTAPE 2 : Ouvrir Instagram ────────────────────────────────────────
        console.log("🌍 Navigation vers Instagram...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");
        await sleep(6000);

        // Accepter les cookies si présents
        try {
            let cookieBtn = await browser.findElement(
                By.xpath("//button[contains(text(),'Allow') or contains(text(),'Accept') or contains(text(),'Accepter')]")
            );
            await cookieBtn.click();
            console.log("🍪 Cookies acceptés");
            await sleep(2000);
        } catch (e) { /* Pas de popup cookies */ }

        await saveScreenshot(browser);

        // ── ÉTAPE 3 : Remplir l'email ─────────────────────────────────────────
        console.log("✍️ Saisie de l'email...");
        let emailInput = await browser.wait(
            until.elementLocated(By.xpath("//input[@name='emailOrPhone' or @type='text' or @type='email']")),
            15000
        );
        await browser.executeScript("arguments[0].focus();", emailInput);
        await sleep(500);
        await humanType(emailInput, mail);
        await sleep(1000);
        console.log("✅ Email saisi : " + mail);

        // ── ÉTAPE 4 : Remplir le password ─────────────────────────────────────
        console.log("🔒 Saisie du mot de passe...");
        let passInput = await browser.wait(
            until.elementLocated(By.xpath("//input[@type='password']")),
            10000
        );
        await browser.executeScript("arguments[0].focus();", passInput);
        await sleep(300);
        await humanType(passInput, "Azerty12345!");
        await sleep(500);

        // ✅ CLÉ : simuler blur sur password pour déclencher l'apparition des selects de date
        await browser.executeScript("arguments[0].blur();", passInput);
        await sleep(500);
        // Cliquer ailleurs sur la page pour forcer le rendu React
        await browser.executeScript("document.body.click();");
        await sleep(2000);
        console.log("✅ Mot de passe saisi");

        // ── ÉTAPE 5 : Date de naissance ───────────────────────────────────────
        console.log("🎂 Saisie de la date de naissance...");

        // Attendre que les 3 selects apparaissent (avec scroll pour les rendre visibles)
        let selects = [];
        let attempts = 0;
        while (selects.length < 3 && attempts < 8) {
            selects = await browser.findElements(By.tagName("select"));
            console.log(`   Tentative ${attempts + 1} : ${selects.length} select(s) trouvé(s)`);
            if (selects.length < 3) {
                // Essayer de scroller vers le bas pour déclencher le lazy render
                await browser.executeScript("window.scrollBy(0, 200);");
                await sleep(1500);
                await browser.executeScript("window.scrollBy(0, -200);");
                await sleep(500);
            }
            attempts++;
        }

        if (selects.length >= 3) {
            let monthOptions = await browser.executeScript(
                `return Array.from(arguments[0].options).map(o => o.value + '|' + o.text);`,
                selects[0]
            );
            console.log("   Options mois :", monthOptions.slice(0, 5).join(", "));

            // Mois Mars = value "3" (ou "March" selon la langue)
            await selectOption(browser, selects[0], "3");
            await sleep(600);
            await selectOption(browser, selects[1], "10");
            await sleep(600);
            await selectOption(browser, selects[2], "1995");
            await sleep(600);
            console.log("✅ Date de naissance saisie !");
        } else {
            console.log("❌ Impossible de trouver les selects de date !");
        }

        await saveScreenshot(browser);
        await sleep(1000);

        // ── ÉTAPE 6 : Nom complet & Username ─────────────────────────────────
        console.log("👤 Saisie du nom et username...");

        const fullName = generatingName();
        const uName = username();
        console.log(`   Nom : ${fullName} | Username : ${uName}`);

        // ✅ Fonction pour remplir un input React correctement (déclenche les événements natifs)
        async function fillReactInput(browser, element, value) {
            await browser.executeScript(`
                var input = arguments[0];
                var value = arguments[1];
                var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            `, element, value);
            await sleep(300);
        }

        let allInputs = await browser.findElements(By.tagName("input"));

        for (let input of allInputs) {
            let name = await input.getAttribute("name");

            if (name === "fullName") {
                await browser.executeScript("arguments[0].click();", input);
                await sleep(300);
                await fillReactInput(browser, input, fullName);
                // Taper un espace puis backspace pour forcer la validation React
                await input.sendKeys(" ");
                await sleep(100);
                await input.sendKeys(Key.BACK_SPACE);
                await sleep(300);
                console.log("✅ Nom complet saisi : " + fullName);
            }

            if (name === "username") {
                await browser.executeScript("arguments[0].click();", input);
                await sleep(300);
                await fillReactInput(browser, input, uName);
                await input.sendKeys(" ");
                await sleep(100);
                await input.sendKeys(Key.BACK_SPACE);
                await sleep(300);
                console.log("✅ Username saisi : " + uName);
            }
        }

        await sleep(3000);
        await saveScreenshot(browser);

        // ── ÉTAPE 7 : Cliquer Submit ─────────────────────────────────────────
        console.log("🚀 Recherche et clic sur le bouton Submit...");

        let submitBtn = null;

        // Essai 1 : button[type=submit]
        try {
            submitBtn = await browser.wait(
                until.elementLocated(By.xpath("//button[@type='submit']")),
                8000
            );
        } catch (e) { console.log("   button[type=submit] non trouvé, essai 2..."); }

        // Essai 2 : bouton par texte
        if (!submitBtn) {
            try {
                submitBtn = await browser.findElement(
                    By.xpath("//button[.//text()[contains(., 'Next') or contains(., 'Submit') or contains(., 'Sign up')]]")
                );
            } catch (e) { console.log("   Bouton par texte non trouvé, essai 3..."); }
        }

        // Essai 3 : n'importe quel bouton
        if (!submitBtn) {
            let allBtns = await browser.findElements(By.tagName("button"));
            if (allBtns.length > 0) submitBtn = allBtns[allBtns.length - 1];
        }

        if (submitBtn) {
            let isDisabled = await submitBtn.getAttribute("disabled");
            if (isDisabled) {
                console.log("⚠️ Le bouton est désactivé ! Vérification des champs manquants...");
                await saveScreenshot(browser);

                // Forcer le clic quand même via JS
                await browser.executeScript("arguments[0].removeAttribute('disabled'); arguments[0].click();", submitBtn);
            } else {
                await browser.executeScript("arguments[0].click();", submitBtn);
                console.log("✅ Bouton Submit cliqué !");
            }
        } else {
            console.log("❌ Aucun bouton trouvé !");
        }

        await sleep(5000);
        await saveScreenshot(browser);

        // ── ÉTAPE 8 : Récupérer le code de vérification ──────────────────────
        console.log("📬 Attente du code de vérification Instagram...");
        await sleep(15000);

        if (emailDomain && emailName) {
            console.log(`🔍 Lecture des emails : ${emailName}@${emailDomain}`);
            let code = await getInstCode(emailDomain, emailName, browser);
            if (code && code.trim().length > 0) {
                console.log("✅ Code reçu : " + code.trim());

                // Chercher le champ de code de confirmation
                let codeInput = null;
                try {
                    codeInput = await browser.wait(
                        until.elementLocated(By.xpath("//input[@name='confirmationCode' or @aria-label='Confirmation Code' or @inputmode='numeric']")),
                        10000
                    );
                } catch (e) {
                    let inputs2 = await browser.findElements(By.tagName("input"));
                    if (inputs2.length > 0) codeInput = inputs2[0];
                }

                if (codeInput) {
                    await browser.executeScript("arguments[0].focus();", codeInput);
                    await humanType(codeInput, code.trim());
                    await sleep(1000);

                    // Valider le code
                    let confirmBtn = null;
                    try {
                        confirmBtn = await browser.findElement(
                            By.xpath("//button[@type='submit' or contains(text(),'Next') or contains(text(),'Confirm')]")
                        );
                        await browser.executeScript("arguments[0].click();", confirmBtn);
                        console.log("✅ Code soumis avec succès !");
                    } catch(e) {
                        console.log("⚠️ Bouton confirmation non trouvé");
                    }
                }
            } else {
                console.log("⚠️ Aucun code reçu dans le délai imparti");
            }
        }

        await sleep(5000);
        await saveScreenshot(browser);
        console.log("🎉 Processus terminé ! Vérifiez le screenshot.");

    } catch (e) {
        console.error("❌ ERREUR GÉNÉRALE : " + e.message);
        console.error(e.stack);
        await saveScreenshot(browser);
    } finally {
        await sleep(30000);
        await browser.quit();
        console.log("🔒 Browser fermé.");
    }
})();
