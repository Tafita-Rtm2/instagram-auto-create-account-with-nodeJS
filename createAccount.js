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
    } else { res.send('Bot en cours de remplissage...'); }
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
    } catch (e) { return "alan" + Math.floor(Math.random()*9999) + "@mailhvd.lat"; }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 60 + 30);
    }
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
        console.log("Accès à Instagram...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");
        await sleep(7000);

        // --- 1. EMAIL ---
        console.log("Recherche Email...");
        let emailInput = await browser.wait(until.elementLocated(By.xpath("//input[contains(@name,'emailOrPhone')] | //input[@type='text']")), 15000);
        let mail = await getFakeMail();
        console.log("Saisie : " + mail);
        await emailInput.click();
        await humanType(emailInput, mail);
        
        // --- 2. TRANSITION (L'ASTUCE DU TAB) ---
        console.log("Passage au champ suivant...");
        await emailInput.sendKeys(Key.TAB); // Simule la touche Tabulation
        await sleep(2000);

        // --- 3. PASSWORD ---
        console.log("Recherche Password...");
        // On cherche par name ou par type password
        let passInput = await browser.wait(until.elementLocated(By.xpath("//input[@name='password'] | //input[@type='password']")), 15000);
        await passInput.click();
        await humanType(passInput, "Azerty12345!");
        await sleep(1000);

        // --- 4. DATE ---
        console.log("Saisie Date...");
        let selects = await browser.findElements(By.tagName("select"));
        if(selects.length >= 3) {
            await selects[0].sendKeys("March");
            await selects[1].sendKeys("15");
            await selects[2].sendKeys("1996");
        }
        await sleep(1500);

        // --- 5. NOM & USER ---
        console.log("Saisie Identité...");
        let nameInput = await browser.wait(until.elementLocated(By.name("fullName")), 10000);
        await humanType(nameInput, "Alan Azad");

        let userInput = await browser.wait(until.elementLocated(By.name("username")), 10000);
        await humanType(userInput, "azad_bot_" + Math.floor(Math.random()*99999));

        // Screenshot final
        await sleep(3000);
        let finalImg = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', finalImg, 'base64');

        // --- 6. VALIDATION ---
        let submitBtn = await browser.wait(until.elementLocated(By.xpath("//button[@type='submit']")), 10000);
        await submitBtn.click();
        console.log("Succès : Formulaire envoyé !");

    } catch (e) {
        console.error("ERREUR : " + e.message);
        let errImg = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', errImg, 'base64');
    } finally {
        await sleep(20000);
        await browser.quit();
    }
})();
