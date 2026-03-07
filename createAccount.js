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
    } else { res.send('Bot en attente...'); }
});
app.get('/debug-image', (req, res) => { res.sendFile(path.join(process.cwd(), 'error_screenshot.png')); });
app.listen(port);

async function getFakeMail() {
    try {
        const response = await fetch('https://email-fake.com/');
        const body = await response.text();
        const $ = cheerio.load(body);
        return $("#email_ch_text").text().trim();
    } catch (e) { return "user" + Math.floor(Math.random()*10000) + "@emltmp.com"; }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await new Promise(r => setTimeout(r, Math.random() * 150 + 50));
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
        await new Promise(r => setTimeout(r, 5000));

        // --- GESTION DES COOKIES ---
        try {
            let cookieBtn = await browser.wait(until.elementLocated(By.xpath("//button[text()='Allow all cookies' or contains(., 'Autoriser')]")), 5000);
            await cookieBtn.click();
            console.log("Cookies acceptés.");
        } catch (e) { console.log("Pas de fenêtre de cookies."); }

        // --- ATTENTE DU CHAMP EMAIL ---
        console.log("Recherche du champ email...");
        // On cherche par NAME, par XPATH ou par CSS pour être sûr
        let emailInput = await browser.wait(until.elementLocated(By.css('input[name="emailOrPhone"], input[type="text"]')), 15000);
        
        let fakeMail = await getFakeMail();
        console.log("Saisie de l'email : " + fakeMail);
        await humanType(emailInput, fakeMail);

        let passwordInput = await browser.findElement(By.name("password"));
        await humanType(passwordInput, "me47m47eaa");

        // --- DATE DE NAISSANCE ---
        console.log("Saisie date...");
        let selects = await browser.findElements(By.tagName("select"));
        if(selects.length >= 3) {
            await selects[0].sendKeys("March");
            await selects[1].sendKeys("12");
            await selects[2].sendKeys("1995");
        }

        let nameInput = await browser.findElement(By.name("fullName"));
        await humanType(nameInput, "Alan Abak");

        let userInput = await browser.findElement(By.name("username"));
        await humanType(userInput, "alan_abak_" + Math.floor(Math.random()*1000));

        await new Promise(r => setTimeout(r, 2000));
        
        // Screenshot de vérification avant de cliquer
        let screenshot = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', screenshot, 'base64');

        let submitBtn = await browser.findElement(By.xpath("//button[@type='submit']"));
        await submitBtn.click();
        console.log("Bouton cliqué !");

    } catch (e) {
        console.error("ERREUR : " + e.message);
        let img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
    } finally {
        await new Promise(r => setTimeout(r, 10000));
        await browser.quit();
    }
})();
