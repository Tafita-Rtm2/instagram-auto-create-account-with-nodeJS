const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');
const cheerio = require("cheerio");
const fetch = require('node-fetch');
const _ = require('lodash');

// --- 1. CONFIGURATION DU SERVEUR DE MONITORING ---
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) {
        res.send('<h1>Aperçu du Bot</h1><img src="/debug-image" style="width:100%;max-width:500px;"><p>Regardez si les champs sont remplis sur l\'image.</p>');
    } else {
        res.send('Le bot est en cours d\'exécution...');
    }
});

app.get('/debug-image', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'error_screenshot.png'));
});

app.listen(port, () => {
    console.log(`Serveur monitoring sur port ${port}`);
});

// --- 2. FONCTIONS UTILITAIRES ---

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getFakeMail() {
    try {
        const response = await fetch('https://email-fake.com/');
        const body = await response.text();
        const $ = cheerio.load(body);
        let mail = $("#email_ch_text").text();
        return mail.replace("Adım 1Adım 2Adım 3", "").trim();
    } catch (e) {
        return "user" + Math.floor(Math.random() * 10000) + "@emltmp.com";
    }
}

async function humanType(element, text) {
    for (let char of text) {
        await element.sendKeys(char);
        await sleep(Math.random() * 150 + 50); // Tape doucement
    }
}

// --- 3. LOGIQUE PRINCIPALE DU BOT ---

(async function main() {
    const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
    const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');

    let service = new chrome.ServiceBuilder(driverPath);
    let options = new chrome.Options();
    
    options.setChromeBinaryPath(chromePath);
    options.addArguments('--headless=new'); 
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log("Démarrage du navigateur...");
    let browser = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .setChromeService(service)
        .build();

    try {
        console.log("Navigation vers Instagram...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");

        // --- ÉTAPE 1 : EMAIL ---
        console.log("Attente du champ email...");
        let emailInput = await browser.wait(until.elementLocated(By.name("emailOrPhone")), 20000);
        let fakeMail = await getFakeMail();
        console.log("Saisie email : " + fakeMail);
        await humanType(emailInput, fakeMail);
        await sleep(1500);

        // --- ÉTAPE 2 : MOT DE PASSE ---
        console.log("Attente du champ password...");
        let passwordInput = await browser.wait(until.elementLocated(By.name("password")), 10000);
        await humanType(passwordInput, "me47m47eaa");
        await sleep(1500);

        // --- ÉTAPE 3 : DATE DE NAISSANCE ---
        console.log("Sélection date...");
        let selects = await browser.wait(until.elementsLocated(By.tagName("select")), 10000);
        if (selects.length >= 3) {
            await selects[0].sendKeys("March"); // Mois
            await sleep(800);
            await selects[1].sendKeys("12");    // Jour
            await sleep(800);
            await selects[2].sendKeys("1995");  // Année
        }
        await sleep(1500);

        // --- ÉTAPE 4 : NOM COMPLET ---
        console.log("Attente du champ nom complet...");
        let nameInput = await browser.wait(until.elementLocated(By.name("fullName")), 10000);
        await humanType(nameInput, "Alan Azad");
        await sleep(1500);

        // --- ÉTAPE 5 : USERNAME ---
        console.log("Attente du champ username...");
        let userInput = await browser.wait(until.elementLocated(By.name("username")), 10000);
        let randomUser = "alan_azad_" + Math.floor(Math.random() * 10000);
        await humanType(userInput, randomUser);
        await sleep(2000);

        // --- VÉRIFICATION AVANT CLIC ---
        let checkImg = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', checkImg, 'base64');

        // --- ÉTAPE 6 : BOUTON SUBMIT ---
        console.log("Clic sur le bouton Submit...");
        let submitBtn = await browser.wait(until.elementLocated(By.xpath("//button[@type='submit']")), 10000);
        await submitBtn.click();
        
        console.log("Formulaire envoyé ! Attente du code par mail...");

        // --- ÉTAPE 7 : RÉCUPÉRATION DU CODE ---
        await sleep(15000); // Laisse le temps au mail d'arriver
        let fMail = fakeMail.split("@");
        const codeUrl = 'https://email-fake.com/' + fMail[1] + '/' + fMail[0];
        
        await browser.executeScript('window.open("' + codeUrl + '");');
        let tabs = await browser.getAllWindowHandles();
        await browser.switchTo().window(tabs[1]);
        
        await sleep(10000);
        let bodyText = await browser.findElement(By.tagName("body")).getText();
        
        // On cherche 6 chiffres consécutifs dans la page
        let codeMatch = bodyText.match(/\b\d{6}\b/);
        if (codeMatch) {
            let cleanCode = codeMatch[0];
            console.log("Code Instagram trouvé : " + cleanCode);
            
            await browser.switchTo().window(tabs[0]);
            let codeField = await browser.wait(until.elementLocated(By.name("email_confirmation_code")), 15000);
            await codeField.sendKeys(cleanCode, Key.RETURN);
            console.log("Code entré avec succès !");
        } else {
            console.log("Code non trouvé sur email-fake.com. Vérifiez l'image.");
            let mailImg = await browser.takeScreenshot();
            fs.writeFileSync('error_screenshot.png', mailImg, 'base64');
        }

    } catch (e) {
        console.error("ERREUR : " + e.message);
        let img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
    } finally {
        await sleep(10000);
        console.log("Fermeture du bot.");
        await browser.quit();
    }
})();
