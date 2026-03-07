const fetch = require('node-fetch');

const API_BASE = 'https://doux.gleeze.com/tempmail';

// Génère un email temporaire et retourne { email, token }
const getFakeMail = async function () {
    try {
        const res  = await fetch(`${API_BASE}/gen`, { timeout: 10000 });
        const data = await res.json();

        if (data && data.email && data.token) {
            console.log(`📧 Email généré : ${data.email}`);
            // On stocke le token globalement pour getCode
            global._tempMailToken = data.token;
            global._tempMailEmail = data.email;
            return data.email;
        }
    } catch (e) {
        console.log("⚠️ doux.gleeze.com inaccessible : " + e.message);
    }

    // Fallback
    const fallback = "user" + Math.floor(Math.random() * 99999) + "@guerrillamail.com";
    console.log("📧 Email fallback : " + fallback);
    return fallback;
};

module.exports = { getFakeMail };
