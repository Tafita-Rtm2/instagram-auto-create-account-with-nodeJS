const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const accountInfo = require('./accountInfoGenerator');
const verifiCode = require('./getCode');
const email = require('./createFakeMail');

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

(async function fakeInstagramAccount() {
  // --- CONFIGURATION CHEMINS RENDER ---
  const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
  const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');

  let service = new chrome.ServiceBuilder(driverPath);
  let options = new chrome.Options();
  
  options.setChromeBinaryPath(chromePath);
  
  // Arguments indispensables pour un serveur sans écran
  options.addArguments('--headless=new'); 
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  options.addArguments('--disable-gpu');
  options.addArguments('--window-size=1920,1080');
  // Simulation d'un vrai navigateur pour éviter d'être bloqué trop vite
  options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  console.log("Démarrage de Chrome...");
  let browser = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .setChromeService(service)
    .build();

  try {
    await browser.get("https://www.instagram.com/accounts/signup/email/");
    await sleep(7000);

    let fakeMail = await email.getFakeMail();
    console.log("Email utilisé : " + fakeMail);

    await browser.findElement(By.name("emailOrPhone")).sendKeys(fakeMail, Key.RETURN);
    await sleep(2000);
    
    await browser.findElement(By.name("fullName")).sendKeys(await accountInfo.generatingName(), Key.RETURN);
    await sleep(2000);

    await browser.findElement(By.name("username")).sendKeys(await accountInfo.username(), Key.RETURN);
    await sleep(3000);

    await browser.findElement(By.name("password")).sendKeys("me47m47eaa", Key.RETURN);
    await sleep(5000);

    // Sélection Date de naissance
    await browser.findElement(By.xpath("//select[contains(@title, 'Mois')]/option[3]")).click();
    await sleep(1000);
    await browser.findElement(By.xpath("//select[contains(@title, 'Jour')]/option[12]")).click();
    await sleep(1000);
    await browser.findElement(By.xpath("//select[contains(@title, 'Année')]/option[26]")).click();
    await sleep(3000);
    
    await browser.findElement(By.xpath("//button[text()='Suivant' or @type='submit']")).click();
    await sleep(8000);

    let fMail = fakeMail.split("@");
    let mailName = fMail[0];
    let domain = fMail[1];
    
    console.log("Attente du code Instagram...");
    let veriCode = await verifiCode.getInstCode(domain, mailName, browser);
    console.log("Code reçu : " + veriCode);
    
    await sleep(2000);
    await browser.findElement(By.name("email_confirmation_code")).sendKeys(veriCode, Key.RETURN);

  } catch (e) {
    console.error("ERREUR :");
    console.error(e);
  } finally {
    console.log("Fermeture du navigateur.");
    await browser.quit();
  } 
})();
