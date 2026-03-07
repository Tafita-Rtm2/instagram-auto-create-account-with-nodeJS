const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
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
  options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  console.log("Démarrage de Chrome...");
  let browser = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .setChromeService(service)
    .build();

  try {
    console.log("Navigation vers Instagram...");
    await browser.get("https://www.instagram.com/accounts/signup/email/");

    // --- GESTION DES COOKIES ---
    try {
      // Attend 5 secondes max pour le bouton "Accepter tout" si il apparaît
      let cookieBtn = await browser.wait(until.elementLocated(By.xpath("//button[contains(text(), 'Autoriser') or contains(text(), 'Accept')]")), 5000);
      await cookieBtn.click();
      console.log("Cookies acceptés.");
    } catch (e) {
      console.log("Pas de pop-up de cookies détectée.");
    }

    // --- ATTENTE DU FORMULAIRE ---
    console.log("Attente du champ email...");
    let emailInput = await browser.wait(until.elementLocated(By.name("emailOrPhone")), 15000);
    
    let fakeMail = await email.getFakeMail();
    console.log("Email utilisé : " + fakeMail);

    await emailInput.sendKeys(fakeMail, Key.RETURN);
    await sleep(2000);
    
    // Remplissage du reste avec des attentes
    let nameInput = await browser.wait(until.elementLocated(By.name("fullName")), 5000);
    await nameInput.sendKeys(await accountInfo.generatingName(), Key.RETURN);
    
    let userInput = await browser.wait(until.elementLocated(By.name("username")), 5000);
    await userInput.sendKeys(await accountInfo.username(), Key.RETURN);
    
    let passInput = await browser.wait(until.elementLocated(By.name("password")), 5000);
    await passInput.sendKeys("me47m47eaa", Key.RETURN);

    await sleep(5000);

    // Sélection Date (Xpath plus générique)
    await (await browser.findElement(By.xpath("//select[@title='Mois'] or //select[1]"))).sendKeys("Mars");
    await (await browser.findElement(By.xpath("//select[@title='Jour'] or //select[2]"))).sendKeys("12");
    await (await browser.findElement(By.xpath("//select[@title='Année'] or //select[3]"))).sendKeys("1995");
    
    let nextBtn = await browser.findElement(By.xpath("//button[@type='submit']"));
    await nextBtn.click();
    
    console.log("Formulaire soumis, attente du code...");
    await sleep(10000);

    let fMail = fakeMail.split("@");
    let veriCode = await verifiCode.getInstCode(fMail[1], fMail[0], browser);
    console.log("Code reçu : " + veriCode);
    
    let codeInput = await browser.wait(until.elementLocated(By.name("email_confirmation_code")), 10000);
    await codeInput.sendKeys(veriCode, Key.RETURN);

  } catch (e) {
    console.error("ERREUR lors de la recherche d'élément :");
    console.error(e.message);
    // Prendre une capture d'écran pour débugger sur Render si ça échoue encore
    await browser.takeScreenshot().then(image => {
        require('fs').writeFileSync('error_screenshot.png', image, 'base64');
        console.log("Screenshot d'erreur enregistré sous error_screenshot.png");
    });
  } finally {
    console.log("Fermeture du navigateur.");
    await browser.quit();
  } 
})();
