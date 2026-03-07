const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');

// --- SERVEUR POUR RENDER ET DEBUG ---
const app = express();
const port = process.env.PORT || 10000;

// Cette route te permet de voir ce que le bot voit (CAPTCHA ou Erreur)
app.get('/', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) {
        res.send('<h1>Ecran du Bot</h1><img src="/debug-image" style="width:100%">');
    } else {
        res.send('Le bot tourne... Aucune capture d\'écran pour le moment.');
    }
});

app.get('/debug-image', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'error_screenshot.png'));
});

app.listen(port, () => {
    console.log(`Serveur de monitoring actif sur le port ${port}`);
});

// --- IMPORTS ---
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
    
    // Arguments pour passer inaperçu
    options.addArguments('--headless=new'); 
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    
    // ANTI-DETECTION
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.excludeSwitches('enable-automation');
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.94 Safari/537.36');

    console.log("Démarrage de Chrome...");
    let browser = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .setChromeService(service)
        .build();

    try {
        console.log("Navigation vers Instagram...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");

        // Attente de 20 secondes pour le champ email
        console.log("Attente du champ email...");
        let emailInput = await browser.wait(until.elementLocated(By.name("emailOrPhone")), 20000);
        
        let fakeMail = await email.getFakeMail();
        console.log("Email : " + fakeMail);
        await emailInput.sendKeys(fakeMail, Key.RETURN);
        
        // Remplissage des infos
        await (await browser.wait(until.elementLocated(By.name("fullName")), 5000)).sendKeys(await accountInfo.generatingName(), Key.RETURN);
        await (await browser.wait(until.elementLocated(By.name("username")), 5000)).sendKeys(await accountInfo.username(), Key.RETURN);
        await (await browser.wait(until.elementLocated(By.name("password")), 5000)).sendKeys("me47m47eaa", Key.RETURN);

        await sleep(5000);

        // Date de naissance
        await (await browser.findElement(By.xpath("//select[@title='Mois']"))).sendKeys("Mars");
        await (await browser.findElement(By.xpath("//select[@title='Jour']"))).sendKeys("12");
        await (await browser.findElement(By.xpath("//select[@title='Année']"))).sendKeys("1995");
        
        await (await browser.findElement(By.xpath("//button[@type='submit']"))).click();
        console.log("Formulaire envoyé !");

        // Code de vérification
        await sleep(10000);
        let fMail = fakeMail.split("@");
        let veriCode = await verifiCode.getInstCode(fMail[1], fMail[0], browser);
        console.log("Code : " + veriCode);
        
        await (await browser.wait(until.elementLocated(By.name("email_confirmation_code")), 10000)).sendKeys(veriCode, Key.RETURN);

    } catch (e) {
        console.error("Erreur détectée. Capture d'écran en cours...");
        let image = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', image, 'base64');
        console.log("Image enregistrée. Allez sur votre URL Render pour la voir.");
    } finally {
        // On ne ferme pas le browser tout de suite pour laisser le temps de voir l'image si besoin
        await sleep(10000);
        await browser.quit();
    } 
})();
