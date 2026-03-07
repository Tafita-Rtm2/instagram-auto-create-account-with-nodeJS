const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');

// --- SERVEUR DE MONITORING POUR RENDER ---
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) {
        res.send('<h1>Dernier aperçu du Bot</h1><img src="/debug-image" style="width:100%; max-width:500px;"><p>Si vous voyez un formulaire vide, c\'est que le bot a échoué à le remplir.</p>');
    } else {
        res.send('Le serveur est en ligne. Le bot est en train de travailler...');
    }
});

app.get('/debug-image', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'error_screenshot.png'));
});

app.listen(port, () => {
    console.log(`Serveur actif sur le port ${port}`);
});

// --- IMPORTS DES MODULES ---
const accountInfo = require('./accountInfoGenerator');
const verifiCode = require('./getCode');
const email = require('./createFakeMail');

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

(async function fakeInstagramAccount() {
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
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.94 Safari/537.36');

    let browser = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .setChromeService(service)
        .build();

    try {
        console.log("Navigation vers Instagram...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");

        // 1. Attente du champ Email (selon ta photo)
        console.log("Attente du champ email...");
        let emailInput = await browser.wait(until.elementLocated(By.name("emailOrPhone")), 20000);
        let fakeMail = await email.getFakeMail();
        console.log("Utilisation de : " + fakeMail);
        await emailInput.sendKeys(fakeMail);
        await sleep(1000);

        // 2. Mot de passe
        let passwordInput = await browser.findElement(By.name("password"));
        await passwordInput.sendKeys("me47m47eaa");
        await sleep(1000);

        // 3. Sélection de la Date (XPath flexible pour les menus de ta photo)
        console.log("Sélection de la date...");
        await (await browser.findElement(By.xpath("//select[contains(@title, 'Month')] | //select[1]"))).sendKeys("March");
        await sleep(800);
        await (await browser.findElement(By.xpath("//select[contains(@title, 'Day')] | //select[2]"))).sendKeys("12");
        await sleep(800);
        await (await browser.findElement(By.xpath("//select[contains(@title, 'Year')] | //select[3]"))).sendKeys("1995");
        await sleep(1500);

        // 4. Nom Complet
        let nameInput = await browser.findElement(By.name("fullName"));
        await nameInput.sendKeys(await accountInfo.generatingName());
        await sleep(1000);

        // 5. Nom d'utilisateur
        let usernameInput = await browser.findElement(By.name("username"));
        await usernameInput.sendKeys(await accountInfo.username());
        await sleep(2000);

        // 6. Clic sur le bouton bleu "Submit" (en bas de ta photo)
        let submitBtn = await browser.findElement(By.xpath("//button[@type='submit']"));
        await submitBtn.click();
        console.log("Formulaire envoyé ! Attente du code...");

        // --- PARTIE RÉCUPÉRATION DU CODE ---
        await sleep(10000);
        let fMail = fakeMail.split("@");
        let veriCode = await verifiCode.getInstCode(fMail[1], fMail[0], browser);
        console.log("Code reçu : " + veriCode);
        
        let codeField = await browser.wait(until.elementLocated(By.name("email_confirmation_code")), 10000);
        await codeField.sendKeys(veriCode, Key.RETURN);

    } catch (e) {
        console.error("ERREUR : " + e.message);
        // On prend une photo pour comprendre pourquoi ça a bloqué
        let image = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', image, 'base64');
    } finally {
        await sleep(5000);
        await browser.quit();
    } 
})();
