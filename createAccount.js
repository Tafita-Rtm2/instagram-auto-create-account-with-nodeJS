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
    } else { res.send('Bot en cours de travail...'); }
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
        await sleep(Math.random() * 50 + 20);
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
        console.log("Navigation...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");
        await sleep(10000); // On donne 10s pour être sûr sur Render

        // 1. EMAIL
        console.log("Etape 1: Email");
        let emailField = await browser.wait(until.elementLocated(By.name("emailOrPhone")), 15000);
        let mail = await getFakeMail();
        await emailField.click();
        await humanType(emailField, mail);
        await sleep(2000);

        // 2. FULL NAME (C'est là que ça bloquait !)
        console.log("Etape 2: Full Name");
        let nameField = await browser.wait(until.elementLocated(By.name("fullName")), 15000);
        await nameField.click();
        await humanType(nameField, "Alan Azad");
        await sleep(1500);

        // 3. USERNAME
        console.log("Etape 3: Username");
        let userField = await browser.wait(until.elementLocated(By.name("username")), 15000);
        await userField.click();
        await humanType(userField, "alan_bot_" + Math.floor(Math.random()*99999));
        await sleep(1500);

        // 4. PASSWORD
        console.log("Etape 4: Password");
        let passField = await browser.wait(until.elementLocated(By.name("password")), 15000);
        await passField.click();
        await humanType(passField, "Azerty12345!");
        await sleep(2000);

        // 5. DATE
        console.log("Etape 5: Date");
        let selects = await browser.findElements(By.tagName("select"));
        if(selects.length >= 3) {
            await selects[0].sendKeys("March");
            await selects[1].sendKeys("12");
            await selects[2].sendKeys("1996", Key.ENTER);
        }
        await sleep(5000); // On attend que le bouton Submit s'allume

        // Screenshot de vérification
        let pic = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', pic, 'base64');

        // 6. SUBMIT
        console.log("Etape 6: Validation");
        let submitBtn = await browser.wait(until.elementLocated(By.xpath("//button[@type='submit']")), 10000);
        await submitBtn.click();
        console.log("Terminé !");

    } catch (e) {
        console.error("ERREUR : " + e.message);
        let errImg = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', errImg, 'base64');
    } finally {
        await sleep(20000);
        await browser.quit();
    }
})();
