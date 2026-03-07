const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');
const cheerio = require("cheerio");
const fetch = require('node-fetch');
const _ = require('lodash');

// --- 1. CONFIGURATION SERVEUR ---
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) {
        res.send('<h1>Aperçu du Bot</h1><img src="/debug-image" style="width:100%;max-width:500px;">');
    } else { res.send('Bot actif...'); }
});
app.get('/debug-image', (req, res) => { res.sendFile(path.join(process.cwd(), 'error_screenshot.png')); });
app.listen(port);

// --- 2. FONCTIONS INTERNES (Remplacent tes autres fichiers) ---

async function getFakeMail() {
    try {
        const response = await fetch('https://email-fake.com/');
        const body = await response.text();
        const $ = cheerio.load(body);
        let mail = $("#email_ch_text").text();
        return mail.replace("Adım 1Adım 2Adım 3", "").trim();
    } catch (e) { return "alan" + Math.floor(Math.random()*1000) + "@emltmp.com"; }
}

function generateName() {
    const first = ["Alan", "Azad", "Murat", "Levent", "Cem", "Aras", "Yusuf"];
    const last = ["Abak", "Yasar", "Kilic", "Demir", "Vinos", "Dag", "Akdeniz"];
    return _.sample(first) + " " + _.sample(last);
}

function generateUsername() {
    return "user_" + Math.random().toString(36).substring(2, 9);
}

// Fonction pour taper comme un humain
async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await new Promise(r => setTimeout(r, Math.random() * 200 + 50));
    }
}

// --- 3. LOGIQUE PRINCIPALE ---

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
        console.log("Navigation...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");

        // Attente du formulaire
        let emailInput = await browser.wait(until.elementLocated(By.name("emailOrPhone")), 20000);
        let fakeMail = await getFakeMail();
        console.log("Email : " + fakeMail);

        // REMPLISSAGE (Ordre de ta photo)
        await humanType(emailInput, fakeMail);
        await new Promise(r => setTimeout(r, 1000));

        let passwordInput = await browser.findElement(By.name("password"));
        await humanType(passwordInput, "me47m47eaa");

        console.log("Sélection date...");
        await (await browser.findElement(By.xpath("//select[1]"))).sendKeys("March");
        await (await browser.findElement(By.xpath("//select[2]"))).sendKeys("12");
        await (await browser.findElement(By.xpath("//select[3]"))).sendKeys("1995");
        await new Promise(r => setTimeout(r, 1000));

        let nameInput = await browser.findElement(By.name("fullName"));
        await humanType(nameInput, generateName());

        let userInput = await browser.findElement(By.name("username"));
        await humanType(userInput, generateUsername());

        await new Promise(r => setTimeout(r, 2000));
        
        // Capture pour vérifier si c'est rempli avant de cliquer
        let checkImg = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', checkImg, 'base64');

        let submitBtn = await browser.findElement(By.xpath("//button[@type='submit']"));
        await submitBtn.click();
        console.log("Envoyé !");

        // --- RÉCUPÉRATION DU CODE ---
        await new Promise(r => setTimeout(r, 15000));
        let fMail = fakeMail.split("@");
        const codeUrl = 'https://email-fake.com/' + fMail[1] + '/' + fMail[0];
        
        await browser.executeScript('window.open("' + codeUrl + '");');
        let tabs = await browser.getAllWindowHandles();
        await browser.switchTo().window(tabs[1]);
        await new Promise(r => setTimeout(r, 10000));
        
        let codeText = await browser.findElement(By.xpath("//h1[contains(text(), 'Instagram')]")).getText();
        let cleanCode = codeText.replace(/\D/g, ""); // Garde seulement les chiffres
        console.log("Code trouvé : " + cleanCode);

        await browser.switchTo().window(tabs[0]);
        let codeField = await browser.wait(until.elementLocated(By.name("email_confirmation_code")), 10000);
        await codeField.sendKeys(cleanCode, Key.RETURN);

    } catch (e) {
        console.error("Erreur : " + e.message);
        let img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
    } finally {
        await new Promise(r => setTimeout(r, 10000));
        await browser.quit();
    }
})();
