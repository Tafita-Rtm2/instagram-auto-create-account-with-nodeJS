const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');
const cheerio = require("cheerio");
const fetch = require('node-fetch');
const _ = require('lodash');

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
    } catch (e) { return "user" + Math.floor(Math.random()*9999) + "@emltmp.com"; }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 100 + 30);
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
        console.log("Navigation vers Instagram...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");
        await sleep(5000);

        // --- ÉTAPE 1 : EMAIL ---
        console.log("Recherche email...");
        let emailInput = await browser.wait(until.elementLocated(By.name("emailOrPhone")), 15000);
        let fakeMail = await getFakeMail();
        console.log("Saisie : " + fakeMail);
        await emailInput.click();
        await humanType(emailInput, fakeMail);
        await sleep(2000); // Pause pour laisser Instagram valider l'email

        // --- ÉTAPE 2 : PASSWORD ---
        console.log("Attente du password...");
        let passwordInput = await browser.wait(until.elementLocated(By.name("password")), 15000);
        await passwordInput.click();
        await humanType(passwordInput, "me47m47eaa");
        await sleep(1500);

        // --- ÉTAPE 3 : DATE ---
        console.log("Saisie date...");
        let selects = await browser.wait(until.elementsLocated(By.tagName("select")), 10000);
        await selects[0].sendKeys("March");
        await sleep(500);
        await selects[1].sendKeys("12");
        await sleep(500);
        await selects[2].sendKeys("1995");
        await sleep(1500);

        // --- ÉTAPE 4 : NAME ---
        console.log("Saisie nom...");
        let nameInput = await browser.wait(until.elementLocated(By.name("fullName")), 10000);
        await nameInput.click();
        await humanType(nameInput, "Alan Azad");
        await sleep(1000);

        // --- ÉTAPE 5 : USERNAME ---
        console.log("Saisie username...");
        let userInput = await browser.wait(until.elementLocated(By.name("username")), 10000);
        await userInput.click();
        await humanType(userInput, "alan_azad_" + Math.floor(Math.random()*9999));
        await sleep(2000);

        // Screenshot pour vérifier que tout est rempli
        let finalPic = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', finalPic, 'base64');

        // --- ÉTAPE 6 : SUBMIT ---
        let submitBtn = await browser.wait(until.elementLocated(By.xpath("//button[@type='submit']")), 10000);
        await submitBtn.click();
        console.log("Terminé ! Vérifiez l'image sur Render.");

    } catch (e) {
        console.error("ERREUR : " + e.message);
        let img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
    } finally {
        await sleep(10000);
        await browser.quit();
    }
})();
