const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');
const cheerio = require("cheerio");
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) {
        res.send('<h1>Aperçu du Bot</h1><img src="/debug-image" style="width:100%;max-width:500px;">');
    } else { res.send('Bot actif - En attente...'); }
});
app.get('/debug-image', (req, res) => { res.sendFile(path.join(process.cwd(), 'error_screenshot.png')); });
app.listen(port, '0.0.0.0');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getFakeMail() {
    try {
        const response = await fetch('https://email-fake.com/');
        const body = await response.text();
        const $ = cheerio.load(body);
        return $("#email_ch_text").text().trim();
    } catch (e) { return "alan" + Math.floor(Math.random()*9999) + "@mail.com"; }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 40 + 20);
    }
}

// ✅ NOUVELLE FONCTION : sélectionner une option dans un <select> via JavaScript
async function selectOption(browser, selectElement, value) {
    await browser.executeScript(`
        var select = arguments[0];
        var value = arguments[1];
        // Cherche par value OU par texte visible
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value == value || select.options[i].text == value) {
                select.selectedIndex = i;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                select.dispatchEvent(new Event('input', { bubbles: true }));
                break;
            }
        }
    `, selectElement, value);
    await sleep(600);
}

(async function main() {
    const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
    const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');

    let service = new chrome.ServiceBuilder(driverPath);
    let options = new chrome.Options();
    options.setChromeBinaryPath(chromePath);
    options.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    let browser = await new Builder().forBrowser('chrome').setChromeOptions(options).setChromeService(service).build();

    try {
        console.log("Navigation vers Instagram...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");
        await sleep(8000);

        console.log("Recherche des champs du formulaire...");
        let inputs = await browser.findElements(By.tagName("input"));
        if (inputs.length === 0) {
            await browser.navigate().refresh();
            await sleep(5000);
            inputs = await browser.findElements(By.tagName("input"));
        }

        // 1. EMAIL
        let mail = await getFakeMail();
        console.log("Saisie Email : " + mail);
        await inputs[0].click();
        await humanType(inputs[0], mail);
        await sleep(1000);

        // 2. PASSWORD
        console.log("Saisie Password...");
        let passInput = await browser.wait(until.elementLocated(By.xpath("//input[@type='password']")), 10000);
        await passInput.click();
        await humanType(passInput, "Azerty12345!");
        await sleep(1000);

        // 3. DATE DE NAISSANCE ✅ CORRIGÉ
        console.log("Saisie Date de Naissance...");
        
        // Attendre que les selects soient présents
        await browser.wait(until.elementLocated(By.tagName("select")), 10000);
        await sleep(1000);
        
        let selects = await browser.findElements(By.tagName("select"));
        console.log(`Nombre de selects trouvés : ${selects.length}`);

        if (selects.length >= 3) {
            // Mois (valeur numérique : "3" = Mars)
            console.log("Sélection du mois...");
            await selectOption(browser, selects[0], "3");

            // Jour
            console.log("Sélection du jour...");
            await selectOption(browser, selects[1], "10");

            // Année
            console.log("Sélection de l'année...");
            await selectOption(browser, selects[2], "1995");

            console.log("✅ Date enregistrée avec succès !");
        } else {
            console.log("⚠️ Seulement " + selects.length + " select(s) trouvés, tentative alternative...");
            
            // Fallback : chercher par aria-label ou placeholder
            try {
                let monthSelect = await browser.findElement(By.xpath("//select[contains(@title,'Month') or contains(@aria-label,'Month')]"));
                await selectOption(browser, monthSelect, "3");
                
                let daySelect = await browser.findElement(By.xpath("//select[contains(@title,'Day') or contains(@aria-label,'Day')]"));
                await selectOption(browser, daySelect, "10");
                
                let yearSelect = await browser.findElement(By.xpath("//select[contains(@title,'Year') or contains(@aria-label,'Year')]"));
                await selectOption(browser, yearSelect, "1995");
                
                console.log("✅ Date enregistrée via fallback !");
            } catch(dateErr) {
                console.log("❌ Erreur date fallback : " + dateErr.message);
            }
        }
        
        await sleep(2000);

        // 4. NOM COMPLET & USERNAME
        console.log("Finalisation identité...");
        let finalInputs = await browser.findElements(By.tagName("input"));
        
        for (let input of finalInputs) {
            let name = await input.getAttribute("name");
            
            if (name === "fullName") {
                console.log("Saisie du Nom Complet...");
                await browser.executeScript("arguments[0].click();", input);
                await sleep(500);
                await humanType(input, "Alan Azad");
            }
            
            if (name === "username") {
                console.log("Saisie du Username...");
                await browser.executeScript("arguments[0].click();", input);
                await sleep(500);
                await humanType(input, "azad_alan_" + Math.floor(Math.random()*9999));
            }
        }

        await sleep(3000);

        // Screenshot avant submit
        let pic = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', pic, 'base64');
        console.log("📸 Screenshot sauvegardé.");

        // 5. VALIDATION ✅ CORRIGÉ - cherche aussi par texte
        console.log("Recherche du bouton Submit...");
        let submitBtn;
        try {
            submitBtn = await browser.wait(
                until.elementLocated(By.xpath("//button[@type='submit']")),
                10000
            );
        } catch(e) {
            // Fallback : chercher un bouton contenant "Next" ou "Submit"
            submitBtn = await browser.findElement(
                By.xpath("//button[contains(text(),'Next') or contains(text(),'Submit') or contains(text(),'Suivant')]")
            );
        }

        // Vérifier que le bouton n'est pas désactivé
        let isDisabled = await submitBtn.getAttribute("disabled");
        if (isDisabled) {
            console.log("⚠️ Le bouton est désactivé - vérifier que tous les champs sont remplis");
            let img2 = await browser.takeScreenshot();
            fs.writeFileSync('error_screenshot.png', img2, 'base64');
        } else {
            await browser.executeScript("arguments[0].click();", submitBtn);
            console.log("✅ Formulaire envoyé avec succès !");
        }

    } catch (e) {
        console.error("ERREUR GÉNÉRALE : " + e.message);
        let img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
    } finally {
        await sleep(20000);
        await browser.quit();
    }
})();
