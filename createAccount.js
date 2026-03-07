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
    } else { res.send('Bot en cours...'); }
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
    } catch (e) { return "alan" + Math.floor(Math.random()*9999) + "@buybm.one"; }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 40 + 20);
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
        console.log("Démarrage...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");
        await sleep(8000);

        // 1. EMAIL
        let inputs = await browser.findElements(By.tagName("input"));
        let mail = await getFakeMail();
        console.log("Saisie Email : " + mail);
        await inputs[0].click();
        await humanType(inputs[0], mail);
        await sleep(1000);

        // 2. FULL NAME (Correction : On le fait avant le password pour plus de stabilité)
        console.log("Saisie Nom Complet...");
        let nameInput = await browser.wait(until.elementLocated(By.name("fullName")), 10000);
        await nameInput.click();
        await humanType(nameInput, "Alan Azad");
        await sleep(1000);

        // 3. USERNAME
        console.log("Saisie Username...");
        let userInput = await browser.wait(until.elementLocated(By.name("username")), 10000);
        await userInput.click();
        await humanType(userInput, "analaurase" + Math.floor(Math.random()*9999));
        await sleep(1000);

        // 4. PASSWORD
        console.log("Saisie Password...");
        let passInput = await browser.wait(until.elementLocated(By.name("password")), 10000);
        await passInput.click();
        await humanType(passInput, "Azerty12345!");
        await sleep(1000);

        // 5. DATE
        console.log("Saisie Date...");
        let selects = await browser.findElements(By.tagName("select"));
        if(selects.length >= 3) {
            await selects[0].sendKeys("March");
            await selects[1].sendKeys("10");
            await selects[2].sendKeys("1995", Key.ENTER);
        }
        await sleep(4000);

        // Screenshot de contrôle avant validation
        let checkPic = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', checkPic, 'base64');

        // 6. SUBMIT (Plusieurs tentatives si nécessaire)
        console.log("Tentative de validation...");
        let submitBtn = await browser.wait(until.elementLocated(By.xpath("//button[@type='submit']")), 15000);
        
        // On scroll vers le bouton pour être sûr qu'il est cliquable
        await browser.executeScript("arguments[0].scrollIntoView();", submitBtn);
        await sleep(1000);
        await submitBtn.click();
        
        console.log("BRAVO ! Formulaire envoyé.");

    } catch (e) {
        console.error("ERREUR : " + e.message);
        let img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
    } finally {
        await sleep(20000);
        await browser.quit();
    }
})();
