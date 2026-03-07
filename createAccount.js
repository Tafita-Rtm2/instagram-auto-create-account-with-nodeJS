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
    } else { res.send('Bot actif - En attente...'); }
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
    } catch (e) { return "alan" + Math.floor(Math.random()*9999) + "@mail.com"; }
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
        console.log("Navigation vers Instagram...");
        await browser.get("https://www.instagram.com/accounts/signup/email/");
        await sleep(8000); 

        console.log("Recherche des champs du formulaire...");
        let inputs = await browser.findElements(By.tagName("input"));
        
        if (inputs.length === 0) {
            await browser.navigate().refresh();
            await sleep(5000);
            inputs = await browser.findElements(By.tagName("input"));
        }

        // 1. EMAIL
        let mail = await getFakeMail();
        console.log("Saisie Email : " + mail);
        await inputs[0].click();
        await humanType(inputs[0], mail);
        await sleep(1000);

        // 2. PASSWORD
        console.log("Saisie Password...");
        let passInput = await browser.wait(until.elementLocated(By.xpath("//input[@type='password']")), 10000);
        await passInput.click();
        await humanType(passInput, "Azerty12345!");
        await sleep(1000);

        // 3. DATE DE NAISSANCE (LA CORRECTION EST ICI)
        console.log("Saisie Date de Naissance...");
        let selects = await browser.wait(until.elementsLocated(By.tagName("select")), 10000);
        
        if(selects.length >= 3) {
            // Mois
            await selects[0].click();
            await selects[0].sendKeys("March");
            await selects[0].sendKeys(Key.ENTER);
            await sleep(500);
            
            // Jour
            await selects[1].click();
            await selects[1].sendKeys("10");
            await selects[1].sendKeys(Key.ENTER);
            await sleep(500);
            
            // Année
            await selects[2].click();
            await selects[2].sendKeys("1995");
            await selects[2].sendKeys(Key.ENTER);
            console.log("Date enregistrée avec succès !");
        } else {
            console.log("ERREUR : Menus de date introuvables.");
        }
        await sleep(2000);

        // 4. NOM COMPLET & USERNAME
        console.log("Finalisation identité...");
        let finalInputs = await browser.findElements(By.tagName("input"));
        
        for(let input of finalInputs) {
            let name = await input.getAttribute("name");
            
            if(name === "fullName") {
                console.log("Saisie du Nom Complet...");
                await browser.executeScript("arguments[0].click();", input);
                await sleep(500);
                await humanType(input, "Alan Azad");
            }
            
            if(name === "username") {
                console.log("Saisie du Username...");
                await browser.executeScript("arguments[0].click();", input);
                await sleep(500);
                await humanType(input, "azad_alan_" + Math.floor(Math.random()*9999));
            }
        }

        // Capture d'écran pour vérifier que TOUT est rempli (Date incluse)
        await sleep(3000); 
        let pic = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', pic, 'base64');

        // 5. VALIDATION
        console.log("Recherche du bouton Submit...");
        let submitBtn = await browser.wait(until.elementLocated(By.xpath("//button[@type='submit']")), 10000);
        
        // On clique via JavaScript pour contourner les blocages
        await browser.executeScript("arguments[0].click();", submitBtn);
        console.log("Formulaire envoyé avec succès !");

    } catch (e) {
        console.error("ERREUR GÉNÉRALE : " + e.message);
        let img = await browser.takeScreenshot();
        fs.writeFileSync('error_screenshot.png', img, 'base64');
    } finally {
        await sleep(20000);
        await browser.quit();
    }
})();
