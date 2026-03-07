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
        console.log("Démarrage (Logique Debug-6)...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");
        await sleep(8000);

        // 1. EMAIL
        let emailInput = await browser.wait(until.elementLocated(By.name("emailOrPhone")), 15000);
        let mail = await getFakeMail();
        console.log("Email : " + mail);
        await emailInput.click();
        await humanType(emailInput, mail);
        await sleep(1500);

        // 2. PASSWORD (Réussi sur debug-6)
        let passInput = await browser.wait(until.elementLocated(By.name("password")), 10000);
        await passInput.click();
        await humanType(passInput, "Azerty12345!");
        console.log("Password : OK");

        // 3. USERNAME (Réussi sur debug-6)
        let userInput = await browser.wait(until.elementLocated(By.name("username")), 10000);
        await userInput.click();
        await humanType(userInput, "analaurase" + Math.floor(Math.random()*9999));
        console.log("Username : OK");

        // 4. DATE
        let selects = await browser.findElements(By.tagName("select"));
        if(selects.length >= 3) {
            await selects[0].sendKeys("March");
            await selects[1].sendKeys("10");
            await selects[2].sendKeys("1995");
        }
        await sleep(2000);

        // --- LA CORRECTION POUR LE FULL NAME ---
        console.log("Tentative forcée sur Full Name...");
        // On clique sur le texte "Name" pour être sûr de faire défiler
        try {
            let nameInput = await browser.wait(until.elementLocated(By.name("fullName")), 10000);
            // On utilise JavaScript pour cliquer si le clic Selenium échoue
            await browser.executeScript("arguments[0].click();", nameInput);
            await sleep(500);
            await humanType(nameInput, "Alan Azad");
            console.log("Full Name : Saisi !");
        } catch (e) {
            console.log("Petit souci sur le nom, on tente via TAB...");
            await userInput.sendKeys(Key.SHIFT, Key.TAB); // On remonte depuis le username
            let active = await browser.switchTo().activeElement();
            await humanType(active, "Alan Azad");
        }

        // Screenshot final pour voir si tout est vert
        await sleep(2000);
        let finalPic = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', finalPic, 'base64');

        // 5. SUBMIT
        let submitBtn = await browser.wait(until.elementLocated(By.xpath("//button[@type='submit']")), 10000);
        await submitBtn.click();
        console.log("Bouton cliqué !");

    } catch (e) {
        console.error("ERREUR : " + e.message);
        let img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
    } finally {
        await sleep(20000);
        await browser.quit();
    }
})();
