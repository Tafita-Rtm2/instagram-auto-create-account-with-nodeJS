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
        res.send('<h1>Aperçu Bot</h1><img src="/debug-image" style="width:100%;max-width:500px;">');
    } else { res.send('Bot en attente...'); }
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
    } catch (e) { return "user" + Math.floor(Math.random()*9999) + "@emltmp.com"; }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 80 + 20);
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
        let attempts = 0;
        let found = false;

        while (attempts < 3 && !found) {
            console.log(`Tentative ${attempts + 1} : Navigation vers Instagram...`);
            await browser.get("https://www.instagram.com/accounts/signup/email/");
            await sleep(7000);

            try {
                // On cherche l'email avec un sélecteur très large
                let emailInput = await browser.wait(until.elementLocated(By.xpath("//input[contains(@name,'emailOrPhone')] | //input[@type='text']")), 10000);
                found = true;
                console.log("Champ trouvé !");
                
                let fakeMail = await getFakeMail();
                console.log("Saisie : " + fakeMail);
                await emailInput.click();
                await humanType(emailInput, fakeMail);
            } catch (e) {
                attempts++;
                console.log("Champ non trouvé, nouvel essai...");
                let img = await browser.takeScreenshot();
                fs.writeFileSync('error_screenshot.png', img, 'base64');
            }
        }

        if (!found) throw new Error("Impossible de charger le formulaire après 3 essais.");

        // --- PASSWORD ---
        let passwordInput = await browser.wait(until.elementLocated(By.name("password")), 10000);
        await passwordInput.click();
        await humanType(passwordInput, "me47m47eaa");

        // --- DATE ---
        let selects = await browser.findElements(By.tagName("select"));
        if(selects.length >= 3) {
            await selects[0].sendKeys("March");
            await selects[1].sendKeys("12");
            await selects[2].sendKeys("1995");
        }

        // --- NAME & USERNAME ---
        let nameInput = await browser.wait(until.elementLocated(By.name("fullName")), 10000);
        await humanType(nameInput, "Alan Azad");

        let userInput = await browser.wait(until.elementLocated(By.name("username")), 10000);
        await humanType(userInput, "alan_azad_" + Math.floor(Math.random()*9999));

        // Screenshot final
        await sleep(2000);
        let finalPic = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', finalPic, 'base64');

        let submitBtn = await browser.wait(until.elementLocated(By.xpath("//button[@type='submit']")), 10000);
        await submitBtn.click();
        console.log("Formulaire soumis !");

    } catch (e) {
        console.error("ERREUR : " + e.message);
        let img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
    } finally {
        await sleep(10000);
        await browser.quit();
    }
})();
