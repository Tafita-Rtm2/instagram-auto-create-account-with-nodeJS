const { By, until } = require('selenium-webdriver');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getInstCode = async function (domain, mailName, browser) {

    const MAIL_URL = 'https://email-fake.com/' + domain + '/' + mailName;
    let code = "";

    try {
        console.log("📬 Ouverture du webmail : " + MAIL_URL);

        // Ouvrir un nouvel onglet
        await browser.executeScript('window.open("");');
        await sleep(1500);

        const tabs = await browser.getAllWindowHandles();
        await browser.switchTo().window(tabs[tabs.length - 1]);
        await browser.get(MAIL_URL);
        await sleep(12000); // Attendre l'arrivée de l'email

        // Essai 1 : XPath original
        try {
            let emailTitle = await browser.findElement(
                By.xpath("//*[@id='email-table']/div[2]/div[1]/div/h1")
            ).getText();
            console.log("📨 Email reçu : " + emailTitle);
            code = emailTitle.replace("is your Instagram code", "").trim();
        } catch (e) { /* Essai suivant */ }

        // Essai 2 : chercher un nombre à 6 chiffres dans la page
        if (!code || code.length < 4) {
            try {
                let pageText = await browser.findElement(By.tagName("body")).getText();
                let match = pageText.match(/\b(\d{6})\b/);
                if (match) {
                    code = match[1];
                    console.log("📨 Code trouvé dans la page : " + code);
                }
            } catch (e) { /* Essai suivant */ }
        }

        // Essai 3 : cliquer sur le premier email et chercher le code
        if (!code || code.length < 4) {
            try {
                let firstEmail = await browser.findElement(
                    By.xpath("//div[contains(@class,'email') or contains(@id,'email')]//h2 | //tr[1] | //div[@class='mail-item'][1]")
                );
                await firstEmail.click();
                await sleep(3000);

                let bodyText = await browser.findElement(By.tagName("body")).getText();
                let match = bodyText.match(/\b(\d{6})\b/);
                if (match) {
                    code = match[1];
                    console.log("📨 Code trouvé après clic : " + code);
                }
            } catch (e) { /* Pas d'email */ }
        }

        // Retourner sur l'onglet principal
        await browser.switchTo().window(tabs[0]);

    } catch (error) {
        console.log("❌ Erreur getInstCode : " + error.message);
        try {
            const tabs = await browser.getAllWindowHandles();
            await browser.switchTo().window(tabs[0]);
        } catch (e) {}
    }

    return code.trim();
};

module.exports = { getInstCode };
