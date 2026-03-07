const fetch = require('node-fetch');

const API_BASE = 'https://doux.gleeze.com/tempmail';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Récupère le code Instagram depuis la boîte mail temporaire
// Le token est stocké dans global._tempMailToken par createFakeMail.js
const getInstCode = async function (domain, mailName, browser) {
    const token = global._tempMailToken;

    if (!token) {
        console.log("❌ Pas de token disponible pour lire les emails");
        return "";
    }

    console.log(`📬 Lecture inbox pour : ${global._tempMailEmail}`);

    // Essayer jusqu'à 6 fois (attente de l'email Instagram)
    for (let attempt = 1; attempt <= 6; attempt++) {
        try {
            const res  = await fetch(`${API_BASE}/inbox?token=${encodeURIComponent(token)}`, { timeout: 10000 });
            const data = await res.json();

            console.log(`   Tentative ${attempt} : ${data.answer ? data.answer.length : 0} email(s) reçu(s)`);

            if (data.answer && data.answer.length > 0) {
                for (let mail of data.answer) {
                    const subject = mail.subject || "";
                    console.log(`   Email : "${subject}"`);

                    // Chercher un code à 6 chiffres dans le sujet
                    const match = subject.match(/\b(\d{6})\b/);
                    if (match) {
                        console.log(`✅ Code trouvé dans le sujet : ${match[1]}`);
                        return match[1];
                    }

                    // Chercher aussi dans l'intro
                    const intro = mail.intro || "";
                    const match2 = intro.match(/\b(\d{6})\b/);
                    if (match2) {
                        console.log(`✅ Code trouvé dans l'intro : ${match2[1]}`);
                        return match2[1];
                    }
                }
            }
        } catch (e) {
            console.log(`   Erreur tentative ${attempt} : ${e.message}`);
        }

        if (attempt < 6) await sleep(5000); // attendre 5s entre chaque tentative
    }

    console.log("⚠️ Aucun code trouvé après toutes les tentatives");
    return "";
};

module.exports = { getInstCode };
