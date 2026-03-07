const cheerio = require("cheerio");
const fetch = require('node-fetch');

// ✅ Fonction robuste avec plusieurs fallbacks
const getFakeMail = async function () {
    // Essai 1 : email-fake.com
    try {
        const response = await fetch('https://email-fake.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 8000
        });
        const body = await response.text();
        const $ = cheerio.load(body);

        // Essayer plusieurs sélecteurs
        let email = $("#email_ch_text").text().trim();
        if (!email) email = $("b#email_ch_text").text().trim();
        if (!email) email = $(".email-text").text().trim();

        // Nettoyer le texte parasite turc
        email = email.replace(/Adım \d/g, "").replace(/\s+/g, "").trim();

        if (email && email.includes("@") && email.length > 5) {
            console.log("📧 Email obtenu depuis email-fake.com : " + email);
            return email;
        }
    } catch (e) {
        console.log("⚠️ email-fake.com inaccessible : " + e.message);
    }

    // Essai 2 : guerrillamail via API
    try {
        const response = await fetch('https://api.guerrillamail.com/ajax.php?f=get_email_address', {
            timeout: 8000
        });
        const data = await response.json();
        if (data && data.email_addr) {
            console.log("📧 Email obtenu depuis guerrillamail : " + data.email_addr);
            return data.email_addr;
        }
    } catch (e) {
        console.log("⚠️ guerrillamail inaccessible : " + e.message);
    }

    // Fallback final : email aléatoire
    const domains = ["yopmail.com", "tempmail.com", "mailnull.com"];
    const randomDomain = domains[Math.floor(Math.random() * domains.length)];
    const randomName = "user" + Math.floor(Math.random() * 999999);
    const fallback = `${randomName}@${randomDomain}`;
    console.log("📧 Email de fallback généré : " + fallback);
    return fallback;
};

module.exports = { getFakeMail };
