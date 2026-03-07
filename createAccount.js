const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const accountInfo = require('./accountInfoGenerator');
const verifiCode = require('./getCode');
const email = require('./createFakeMail');

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

(async function fakeInstagramAccount() {
  // --- CONFIGURATION SERVEUR RENDER ---
  let options = new chrome.Options();
  
  // Chemin vers le binaire Chrome que le script de build va installer
  options.setChromeBinaryPath('./chrome-linux64/chrome');
  
  // Arguments pour faire tourner Chrome sans interface graphique
  options.addArguments('--headless=new');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  options.addArguments('--disable-gpu');
  options.addArguments('--window-size=1920,1080');
  // -------------------------------------

  let browser = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  try {
    console.log("Navigateur lancé en mode headless...");
    await browser.get("https://www.instagram.com/accounts/signup/email/");
    await sleep(7000); // Un peu plus de temps pour le chargement serveur

    let fakeMail = await email.getFakeMail();
    console.log("Email généré : " + fakeMail);

    await browser.findElement(By.name("emailOrPhone")).sendKeys(fakeMail, Key.RETURN);
    await sleep(2000);
    
    await browser.findElement(By.name("fullName")).sendKeys(await accountInfo.generatingName(), Key.RETURN);
    await sleep(2000);

    await browser.findElement(By.name("username")).sendKeys(await accountInfo.username(), Key.RETURN);
    await sleep(3000);

    await browser.findElement(By.name("password")).sendKeys("me47m47eaa", Key.RETURN);
    await sleep(5000);

    // Sélection de la date de naissance
    await browser.findElement(By.xpath("//*[@id='react-root']/section/main/div/article/div/div[1]/div/div[4]/div/div/span/span[1]/select/option[3]")).click();
    await sleep(2000);
    await browser.findElement(By.xpath("//*[@id='react-root']/section/main/div/article/div/div[1]/div/div[4]/div/div/span/span[2]/select/option[12]")).click();
    await sleep(2000);
    await browser.findElement(By.xpath("//*[@id='react-root']/section/main/div/article/div/div[1]/div/div[4]/div/div/span/span[3]/select/option[26]")).click();
    await sleep(2000);
    
    // Clic sur Suivant
    await browser.findElement(By.xpath("//*[@id='react-root']/section/main/div/article/div/div[1]/div/div[6]/button")).click();
    await sleep(8000);

    console.log("Attente du code de vérification...");
    let fMail = fakeMail.split("@");
    let mailName = fMail[0];
    let domain = fMail[1];
    
    let veriCode = await verifiCode.getInstCode(domain, mailName, browser);
    console.log("Code reçu : " + veriCode);
    
    await sleep(2000);
    await browser.findElement(By.name("email_confirmation_code")).sendKeys(veriCode, Key.RETURN);
    console.log("Code envoyé !");

  } catch (e) {
    console.error("Erreur durant l'exécution :");
    console.error(e);
  } finally {
    console.log("Fermeture du navigateur.");
    await browser.quit();
  } 

})();
