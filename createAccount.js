const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');

// --- CONFIGURATION SERVEUR POUR RENDER ---
// Indispensable pour éviter que Render ne dise "Application exited early"
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Le Bot Instagram est en cours d\'exécution...');
});

app.listen(port, () => {
    console.log(`Serveur de monitoring actif sur le port ${port}`);
});

// --- IMPORT DE VOS MODULES PERSONNALISÉS ---
const accountInfo = require('./accountInfoGenerator');
const verifiCode = require('./getCode');
const email = require('./createFakeMail');

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

(async function fakeInstagramAccount() {
    // Configuration des chemins vers les fichiers téléchargés par render-build.sh
    const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
    const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');

    let service = new chrome.ServiceBuilder(driverPath);
    let options = new chrome.Options();
    
    options.setChromeBinaryPath(chromePath);
    
    // --- OPTIONS ANTI-DÉTECTION ET SERVEUR ---
    options.addArguments('--headless=new'); // Mode sans interface graphique
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    
    // Masquer l'automatisation pour éviter le blocage immédiat d'Instagram
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.excludeSwitches('enable-automation');
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log("Démarrage du navigateur Chrome...");
    let browser = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .setChromeService(service)
        .build();

    try {
        console.log("Navigation vers la page d'inscription Instagram...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");

        // --- ATTENTE DU FORMULAIRE (Wait au lieu de Sleep pour plus de fiabilité) ---
        console.log("Attente du champ email...");
        let emailInput = await browser.wait(until.elementLocated(By.name("emailOrPhone")), 20000);
        
        let fakeMail = await email.getFakeMail();
        console.log("Email généré : " + fakeMail);

        await emailInput.sendKeys(fakeMail, Key.RETURN);
        await sleep(2000);
        
        // Nom complet
        let fullName = await accountInfo.generatingName();
        await browser.findElement(By.name("fullName")).sendKeys(fullName, Key.RETURN);
        await sleep(2000);

        // Nom d'utilisateur
        let username = await accountInfo.username();
        await browser.findElement(By.name("username")).sendKeys(username, Key.RETURN);
        await sleep(3000);

        // Mot de passe
        await browser.findElement(By.name("password")).sendKeys("me47m47eaa", Key.RETURN);
        await sleep(5000);

        // --- SÉLECTION DE LA DATE DE NAISSANCE ---
        // Utilisation de sélecteurs plus robustes
        await (await browser.wait(until.elementLocated(By.xpath("//select[@title='Mois']")), 5000)).sendKeys("Mars");
        await (await browser.wait(until.elementLocated(By.xpath("//select[@title='Jour']")), 5000)).sendKeys("12");
        await (await browser.wait(until.elementLocated(By.xpath("//select[@title='Année']")), 5000)).sendKeys("1995");
        await sleep(2000);
        
        // Clic sur le bouton Suivant
        let nextBtn = await browser.findElement(By.xpath("//button[@type='submit']"));
        await nextBtn.click();
        console.log("Formulaire soumis. Attente du code de vérification...");

        await sleep(10000);

        // --- RÉCUPÉRATION DU CODE ---
        let fMail = fakeMail.split("@");
        let mailName = fMail[0];
        let domain = fMail[1];
        
        let veriCode = await verifiCode.getInstCode(domain, mailName, browser);
        console.log("Code de confirmation reçu : " + veriCode);
        
        // Saisie du code
        let codeField = await browser.wait(until.elementLocated(By.name("email_confirmation_code")), 10000);
        await codeField.sendKeys(veriCode, Key.RETURN);
        console.log("Code envoyé !");

    } catch (e) {
        console.error("ERREUR CRITIQUE :");
        console.error(e.message);
        
        // Prendre une capture d'écran pour voir ce qui bloque (ex: Captcha)
        await browser.takeScreenshot().then(image => {
            require('fs').writeFileSync('erreur_insta.png', image, 'base64');
            console.log("Capture d'écran de l'erreur enregistrée : erreur_insta.png");
        });
    } finally {
        console.log("Fermeture du navigateur.");
        await browser.quit();
    } 
})();
