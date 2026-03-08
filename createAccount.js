const express = require('express');
const fetch   = require('node-fetch');
const fs      = require('fs');
const { generatingName, username } = require('./accountInfoGenerator');

const PASSWORD    = 'Azerty12345!';
const PORT        = process.env.PORT || 10000;
const sleep       = ms => new Promise(r => setTimeout(r, ms));
const IG_UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Config Panel Admin (optionnel) ────────────────────────────────────────────
// Mets l'URL de ton panel déployé ici, ex: https://mon-panel.railway.app
const PANEL_URL  = process.env.PANEL_URL  || '';
const LICENSE_KEY = process.env.LICENSE_KEY || loadLicenseKey();

function loadLicenseKey() {
    try { return fs.readFileSync('./license.key', 'utf8').trim(); } catch(e) { return ''; }
}

// Vérifier la licence au démarrage (si panel configuré)
async function checkLicense() {
    if (!PANEL_URL || !LICENSE_KEY) return true; // Pas de panel = pas de vérif
    try {
        const r = await fetch(PANEL_URL + '/api/license/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: LICENSE_KEY }),
            timeout: 8000,
        });
        const d = await r.json();
        if (!d.valid) { console.log('❌ Licence invalide : ' + d.reason); process.exit(1); }
        console.log('✅ Licence valide — Bonjour ' + d.employeeName + ' (' + d.usesLeft + ' utilisations restantes)');
        return true;
    } catch(e) { console.log('⚠️ Panel injoignable — mode hors ligne'); return true; }
}

// Envoyer les comptes créés au panel admin
async function saveToPanel(accounts, log) {
    if (!PANEL_URL || !LICENSE_KEY || accounts.length === 0) return;
    try {
        const r = await fetch(PANEL_URL + '/api/accounts/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseKey: LICENSE_KEY, accounts }),
            timeout: 10000,
        });
        const d = await r.json();
        if (log) log('☁️ ' + (d.ok ? d.saved + ' comptes envoyés au panel' : 'Panel non joignable'));
    } catch(e) { if (log) log('⚠️ Panel save : ' + e.message); }
}

function slog(m) { console.log(m); }

// ── Tor optionnel ─────────────────────────────────────────────────────────────
let SocksProxyAgent = null;
try { SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent; } catch(e) {}

let torAvailable = false;
async function checkTor() {
    if (!SocksProxyAgent) { torAvailable = false; return false; }
    try {
        const agent = new SocksProxyAgent('socks5h://127.0.0.1:9050');
        const r = await fetch('https://api.ipify.org?format=json', { agent, timeout: 5000 });
        await r.json();
        torAvailable = true;
        slog('🧅 Tor disponible !');
        return true;
    } catch(e) {
        torAvailable = false;
        slog('⚠️ Tor non disponible — IP mobile directe utilisée');
        return false;
    }
}

function makeFetch(url, options = {}) {
    if (torAvailable && SocksProxyAgent) {
        try { options.agent = new SocksProxyAgent('socks5h://127.0.0.1:9050'); } catch(e) {}
    }
    return fetch(url, { ...options, timeout: options.timeout || 15000 });
}

async function renewTorIp() {
    if (!torAvailable) return false;
    return new Promise(resolve => {
        try {
            const net = require('net');
            const c = net.createConnection(9051, '127.0.0.1', () => {
                c.write('AUTHENTICATE ""\r\nSIGNAL NEWNYM\r\nQUIT\r\n');
            });
            c.on('data', () => {});
            c.on('close', () => { resolve(true); });
            c.on('error', () => resolve(false));
            setTimeout(() => { try { c.destroy(); } catch(e) {} resolve(false); }, 3000);
        } catch(e) { resolve(false); }
    });
}

// ── Email temporaire ──────────────────────────────────────────────────────────
async function getFakeMail() {
    try {
        const r = await fetch('https://doux.gleeze.com/tempmail/gen', { timeout: 10000 });
        const d = await r.json();
        if (d && d.email && d.token) return { email: d.email, token: d.token };
    } catch(e) {}
    const rand = Math.floor(Math.random() * 99999);
    return { email: 'user' + rand + '@guerrillamail.com', token: '' };
}

// ── Poll email ────────────────────────────────────────────────────────────────
async function pollEmailCode(token) {
    for (let i = 0; i < 3; i++) {
        try {
            const r = await fetch('https://doux.gleeze.com/tempmail/inbox?token=' + encodeURIComponent(token), { timeout: 8000 });
            const d = await r.json();
            if (d.answer && d.answer.length > 0) {
                for (let m of d.answer) {
                    const txt = (m.subject || '') + ' ' + (m.intro || '');
                    const match = txt.match(/\b(\d{6})\b/);
                    if (match) return match[1];
                }
            }
        } catch(e) {}
        if (i < 2) await sleep(1000);
    }
    return null;
}

// ── Confirmation email ────────────────────────────────────────────────────────
async function confirmEmail(token) {
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            const r = await fetch('https://doux.gleeze.com/tempmail/inbox?token=' + encodeURIComponent(token), { timeout: 8000 });
            const d = await r.json();
            if (d.answer && d.answer.length > 0) {
                for (let m of d.answer) {
                    const txt = (m.subject || '') + ' ' + (m.intro || '') + ' ' + (m.body || '');
                    const linkMatch = txt.match(/https?:\/\/[^\s"'<>]*(instagram\.com)[^\s"'<>]*(confirm|verif)[^\s"'<>]*/i)
                                   || txt.match(/https?:\/\/[^\s"'<>]*instagram[^\s"'<>]{10,}/i);
                    if (linkMatch) {
                        const link = linkMatch[0].replace(/&amp;/g, '&').split('"')[0].split("'")[0];
                        const cr = await makeFetch(link, { headers: { 'User-Agent': IG_UA }, redirect: 'follow' });
                        return { confirmed: true, status: cr.status };
                    }
                }
            }
        } catch(e) {}
        if (attempt < 9) await sleep(3000);
    }
    return { confirmed: false };
}

// ── SMS virtuel gratuit ───────────────────────────────────────────────────────
async function getFreePhone() {
    try {
        const r = await fetch('https://receive-smss.com/', { headers: { 'User-Agent': IG_UA }, timeout: 8000 });
        const html = await r.text();
        const matches = html.match(/\+\d{10,15}/g);
        if (matches && matches.length > 0) {
            const num = matches[Math.floor(Math.random() * Math.min(matches.length, 5))];
            return { number: num, service: 'receive-smss' };
        }
    } catch(e) {}
    const fallback = ['+12025550142', '+14155550199', '+16505550123'];
    return { number: fallback[Math.floor(Math.random() * fallback.length)], service: 'static' };
}

async function readSmsCode(number) {
    const clean = number.replace(/\D/g, '');
    const urls = [
        'https://receive-smss.com/sms/' + clean + '/',
        'https://www.receivesms.co/us-phone-number/' + clean + '/',
    ];
    for (let attempt = 0; attempt < 8; attempt++) {
        for (const url of urls) {
            try {
                const r = await fetch(url, { headers: { 'User-Agent': IG_UA }, timeout: 10000 });
                const html = await r.text();
                const igMatch = html.match(/Instagram[^0-9]*(\d{6})/i) || html.match(/(\d{6})[^0-9]*Instagram/i);
                if (igMatch) return igMatch[1];
            } catch(e) {}
        }
        if (attempt < 7) await sleep(5000);
    }
    return null;
}

// ── Photo de profil ───────────────────────────────────────────────────────────
async function setProfilePhoto(cookieStr, csrf) {
    try {
        const seed = Math.floor(Math.random() * 70) + 1;
        const imgResp = await fetch('https://i.pravatar.cc/150?img=' + seed, { timeout: 10000 });
        const imgBuffer = await imgResp.buffer();
        const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
        const bodyBuffer = Buffer.concat([
            Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="profile_pic"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'),
            imgBuffer,
            Buffer.from('\r\n--' + boundary + '--\r\n')
        ]);
        const r = await makeFetch('https://www.instagram.com/accounts/web_change_profile_picture/', {
            method: 'POST',
            headers: {
                'User-Agent': IG_UA, 'X-CSRFToken': csrf || '', 'Cookie': cookieStr || '',
                'Referer': 'https://www.instagram.com/accounts/edit/', 'Origin': 'https://www.instagram.com',
                'Accept': '*/*', 'Content-Type': 'multipart/form-data; boundary=' + boundary,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: bodyBuffer, timeout: 20000,
        });
        return r.status === 200;
    } catch(e) { return false; }
}

// ── Instagram fetch helpers ───────────────────────────────────────────────────
const IG_HEADERS = (csrf, cookieStr, referer) => ({
    'User-Agent': IG_UA, 'Content-Type': 'application/x-www-form-urlencoded',
    'X-CSRFToken': csrf || '', 'X-Requested-With': 'XMLHttpRequest',
    'Referer': referer || 'https://www.instagram.com/', 'Cookie': cookieStr || '',
    'Origin': 'https://www.instagram.com', 'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty',
});

function enc(obj) { return Object.entries(obj).map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&'); }

async function igPost(url, body, csrf, cookieStr, referer) {
    const r = await makeFetch(url, { method: 'POST', headers: IG_HEADERS(csrf, cookieStr, referer), body, timeout: 20000 });
    const text = await r.text();
    const newCookies = {};
    for (const c of (r.headers.raw()['set-cookie'] || [])) {
        const p = c.split(';')[0].trim(), i = p.indexOf('=');
        if (i > 0) newCookies[p.substring(0,i).trim()] = p.substring(i+1).trim();
    }
    let json = {};
    try { json = JSON.parse(text); } catch(e) { json = { error: text.substring(0, 200) }; }
    return { ...json, _newCookies: newCookies };
}

async function getCSRFData() {
    const r = await makeFetch('https://www.instagram.com/', {
        headers: { 'User-Agent': IG_UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const map = {};
    for (const c of (r.headers.raw()['set-cookie'] || [])) {
        const p = c.split(';')[0].trim(), i = p.indexOf('=');
        if (i > 0) map[p.substring(0,i).trim()] = p.substring(i+1).trim();
    }
    if (!map['csrftoken']) {
        const html = await r.text();
        const m = html.match(/"csrf_token"\s*:\s*"([^"]+)"/);
        if (m) map['csrftoken'] = m[1];
    }
    return {
        csrf: map['csrftoken'] || '',
        mid: map['mid'] || ('mid_' + Math.random().toString(36).slice(2,14)),
        cookieStr: Object.entries(map).map(e => e[0]+'='+e[1]).join('; '),
    };
}

// ── Helpers checkpoint ────────────────────────────────────────────────────────
function mergeCookies(existing, newCookieHeaders) {
    const map = {};
    for (const p of existing.split(';')) { const i = p.indexOf('='); if (i > 0) map[p.substring(0,i).trim()] = p.substring(i+1).trim(); }
    for (const c of (newCookieHeaders || [])) { const p = c.split(';')[0].trim(), i = p.indexOf('='); if (i > 0) map[p.substring(0,i).trim()] = p.substring(i+1).trim(); }
    return Object.entries(map).map(e => e[0]+'='+e[1]).join('; ');
}

function extractCsrf(html, fallback) {
    const m = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
           || html.match(/"csrf_token"\s*:\s*"([^"]+)"/)
           || html.match(/csrftoken=([a-zA-Z0-9]+)/);
    return m ? m[1] : fallback;
}

async function ocrImage(imgUrl, cookieStr) {
    try {
        const imgResp = await fetch(imgUrl, {
            headers: { 'User-Agent': IG_UA, 'Cookie': cookieStr, 'Referer': 'https://www.instagram.com/' },
            timeout: 10000
        });
        const imgBuf = await imgResp.buffer();
        const b64 = imgBuf.toString('base64');
        const ocrResp = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'apikey=K81885106588957&base64Image=data:image/jpeg;base64,' + b64 + '&OCREngine=2&isNumeric=true&scale=true',
            timeout: 15000,
        });
        const d = await ocrResp.json();
        return (d.ParsedResults?.[0]?.ParsedText || '').replace(/\D/g, '').trim();
    } catch(e) { return ''; }
}

// Résoudre captcha AUDIO Instagram via Wit.ai (speech-to-text gratuit)
async function solveAudioCaptcha(audioUrl, cookieStr, log) {
    try {
        // Télécharger le fichier audio MP3
        log('🔊 Téléchargement audio…');
        const audioResp = await fetch(audioUrl, {
            headers: { 'User-Agent': IG_UA, 'Cookie': cookieStr, 'Referer': 'https://www.instagram.com/' },
            timeout: 15000,
        });
        const audioBuf = await audioResp.buffer();
        log('🔊 Audio ' + audioBuf.length + ' bytes — envoi Wit.ai…');

        // Wit.ai speech-to-text (clé publique free tier)
        const witResp = await fetch('https://api.wit.ai/speech?v=20230215', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer JVHFQ3R7OOVEYJBGS3XU3GXKQPLKFVBF',
                'Content-Type': 'audio/mpeg3',
            },
            body: audioBuf,
            timeout: 20000,
        });
        const witText = await witResp.text();
        log('🔊 Wit.ai brut : ' + witText.substring(0, 150));

        // Wit.ai retourne du JSON multilignes, prendre la dernière ligne
        const lines = witText.trim().split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1] || '{}';
        const witData = JSON.parse(lastLine);
        const text = (witData.text || '').replace(/\D/g, '').trim();
        if (text) return text;

        // Fallback : chercher des chiffres dans le texte brut
        const nums = witText.match(/\d+/g);
        return nums ? nums.join('').substring(0, 8) : '';
    } catch(e) {
        log('⚠️ Audio OCR : ' + e.message);
        return '';
    }
}

// ── Gestion checkpoint Instagram via API JSON ─────────────────────────────────
async function handleCheckpoint(checkpointUrl, cookieStr, csrf, log) {
    try {
        const baseUrl = 'https://www.instagram.com';
        let currentUrl = checkpointUrl.startsWith('http') ? checkpointUrl : baseUrl + checkpointUrl;
        log('🔒 Checkpoint : ' + currentUrl.substring(0, 80));

        // ── Charger le checkpoint via API JSON ────────────────────────────────
        const apiUrl = currentUrl.replace('/accounts/suspended/', '/api/v1/challenge/').replace(/\?.*/, '') + '?guid=' + mid_global;
        
        // Approche 1 : API challenge JSON
        log('📡 Challenge API…');
        const apiResp = await makeFetch('https://i.instagram.com/api/v1/challenge/', {
            method: 'POST',
            headers: {
                'User-Agent': 'Instagram 195.0.0.31.123 Android',
                'X-CSRFToken': csrf,
                'Cookie': cookieStr,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: enc({ choice: 0, _uuid: require('crypto').randomUUID(), _uid: '' }),
            timeout: 15000,
            redirect: 'follow',
        });
        const apiData = await apiResp.json().catch(() => ({}));
        log('📡 Challenge API → ' + JSON.stringify(apiData).substring(0, 100));

        // Si l'API retourne un challenge avec image captcha
        if (apiData.challenge_type === 'RecaptchaChallenge' || apiData.step_name === 'verify_captcha') {
            log('🔢 Captcha via API…');
            // L'image est dans apiData
        }

        // ── Approche 2 : Simuler les étapes via l'URL /challenge/ ─────────────
        // Extraire l'ID du challenge depuis l'URL
        const challengeMatch = currentUrl.match(/\/challenge\/([^/?]+)/) ||
                               currentUrl.match(/suspended.*?next=([^&]+)/);

        // Charger la page avec les bons headers mobile
        const mobileUA = 'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram/195.0.0.31.123';
        
        log('📄 Chargement checkpoint mobile…');
        let resp = await makeFetch(currentUrl, {
            headers: {
                'User-Agent': mobileUA,
                'Cookie': cookieStr,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
            },
            redirect: 'follow', timeout: 15000,
        });
        cookieStr = mergeCookies(cookieStr, resp.headers.raw()['set-cookie']);
        let html = await resp.text();
        csrf = extractCsrf(html, csrf);
        const finalUrl = resp.url || currentUrl;
        log('📄 Page chargée → ' + resp.status + ' url:' + finalUrl.substring(0, 60));

        // ── Étape 1 : Clic "Continuer" ────────────────────────────────────────
        const jazoest1 = (html.match(/name="jazoest"\s+value="([^"]+)"/) || [])[1] || '';
        const choice1  = (html.match(/name="choice"\s+value="([^"]+)"/)  || [])[1] || '0';
        const action1  = (html.match(/<form[^>]+action="([^"]+)"/) || [])[1] || finalUrl;
        const postUrl1 = action1.startsWith('http') ? action1 : baseUrl + action1;

        log('📄 Clic Continuer → ' + postUrl1.substring(0, 60));
        resp = await makeFetch(postUrl1, {
            method: 'POST',
            headers: {
                'User-Agent': mobileUA, 'Cookie': cookieStr,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': finalUrl, 'Origin': baseUrl,
                'X-CSRFToken': csrf, 'Accept': 'text/html,*/*',
            },
            body: enc({ csrfmiddlewaretoken: csrf, jazoest: jazoest1, choice: choice1 }),
            redirect: 'follow', timeout: 15000,
        });
        cookieStr = mergeCookies(cookieStr, resp.headers.raw()['set-cookie']);
        html = await resp.text();
        csrf = extractCsrf(html, csrf);
        const captchaPageUrl = resp.url || postUrl1;
        log('📄 Après Continuer → ' + resp.status);

        // ── Étape 2 : Extraire les URLs captcha depuis le JSON React ─────────────
        // Instagram charge tout en React/JSON — les URLs sont dans des données JSON embarquées
        
        // Extraire tous les blocs JSON de la page
        let audioUrl = null;
        let imgCaptchaUrl = null;

        // Chercher dans les données JSON embarquées (format React/Instagram)
        const jsonBlocks = html.match(/"([^"]*(?:audio|captcha|challenge)[^"]*\.(?:mp3|wav|ogg|jpg|jpeg|png)(?:[^"]{0,50})?)"/gi) || [];
        for (const block of jsonBlocks) {
            const url = block.replace(/"/g, '').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
            if (!url.startsWith('http')) continue;
            if (/\.mp3|\.wav|\.ogg/i.test(url) && !audioUrl) audioUrl = url;
            if (/\.jpg|\.jpeg|\.png/i.test(url) && !imgCaptchaUrl) imgCaptchaUrl = url;
        }

        // Chercher l'audio via les liens "Écouter ce code"
        if (!audioUrl) {
            const audioPatterns = [
                /href="([^"]*\.mp3[^"]*)"/i,
                /"audio_url"\s*:\s*"([^"]+)"/i,
                /href="([^"]+)"[^>]*>[^<]*[ÉE]couter/i,
                /<a[^>]*href="([^"]+)"[^>]*>\s*[ÉE]couter/i,
            ];
            for (const p of audioPatterns) {
                const m = html.match(p);
                if (m) {
                    const u = m[1].replace(/\\u0026/g,'&').replace(/\\\//g,'/');
                    audioUrl = u.startsWith('http') ? u : baseUrl + u;
                    break;
                }
            }
        }

        // Chercher l'image captcha — UNIQUEMENT .jpg/.jpeg/.png, PAS .js
        if (!imgCaptchaUrl) {
            const imgPatterns = [
                /src="(https:\/\/[^"]+\.(?:jpg|jpeg|png)(?:\?[^"]{0,100})?)"/i,
                /"url"\s*:\s*"(https:[^"]+\.(?:jpg|jpeg|png)[^"]*)"/i,
                /\\"url\\"\s*:\s*\\"(https:[^"\\]+\.(?:jpg|jpeg|png)[^"\\]*)\\"/i,
            ];
            for (const p of imgPatterns) {
                const m = html.match(p);
                if (m) {
                    imgCaptchaUrl = m[1].replace(/\\u0026/g,'&').replace(/\\\//g,'/');
                    break;
                }
            }
        }

        log('🔍 Audio: ' + (audioUrl ? audioUrl.substring(0,60) : 'non trouvé'));
        log('🔍 Image: ' + (imgCaptchaUrl ? imgCaptchaUrl.substring(0,60) : 'non trouvée'));

        let captchaCode = '';

        // Priorité 1 : Audio (plus fiable)
        if (audioUrl) {
            log('🔊 Résolution audio captcha…');
            captchaCode = await solveAudioCaptcha(audioUrl, cookieStr, log);
            log('🔊 Audio résultat : "' + captchaCode + '"');
        }

        // Priorité 2 : Image OCR si audio échoue
        if ((!captchaCode || captchaCode.length < 4) && imgCaptchaUrl) {
            log('🖼️ Résolution image OCR…');
            captchaCode = await ocrImage(imgCaptchaUrl, cookieStr);
            log('🖼️ Image résultat : "' + captchaCode + '"');
        }

        // Aucun captcha trouvé — afficher HTML pour debug
        if (!captchaCode || captchaCode.length < 4) {
            if (!audioUrl && !imgCaptchaUrl) {
                // Logguer les premières URLs trouvées dans le HTML pour debug
                const allUrls = (html.match(/https:\/\/[^\s"'<>]{10,80}/g) || []).slice(0,5);
                log('⚠️ Aucun captcha trouvé. URLs page: ' + allUrls.join(' | '));
            } else {
                log('⚠️ Captcha illisible (OCR vide)');
            }
            return false;
        }
        log('✅ Code captcha : ' + captchaCode);

        // ── Soumettre le captcha ───────────────────────────────────────────────
        const jazoest2 = (html.match(/name="jazoest"\s+value="([^"]+)"/) || [])[1] || '';
        const action2  = (html.match(/<form[^>]+action="([^"]+)"/) || [])[1] || captchaPageUrl;
        const postUrl2 = action2.startsWith('http') ? action2 : baseUrl + action2;

        resp = await makeFetch(postUrl2, {
            method: 'POST',
            headers: {
                'User-Agent': mobileUA, 'Cookie': cookieStr,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': captchaPageUrl, 'Origin': baseUrl, 'X-CSRFToken': csrf,
            },
            body: enc({ csrfmiddlewaretoken: csrf, jazoest: jazoest2, response: captchaCode }),
            redirect: 'follow', timeout: 15000,
        });
        cookieStr = mergeCookies(cookieStr, resp.headers.raw()['set-cookie']);
        html = await resp.text();
        csrf = extractCsrf(html, csrf);
        const phonePageUrl = resp.url || postUrl2;
        log('🔢 Captcha soumis → ' + resp.status);

        // ── Étape 3 : Numéro de téléphone ─────────────────────────────────────
        const hasPhone = html.includes('phone') || html.includes('mobile') || html.includes('Numéro') || html.includes('téléphone');
        if (!hasPhone) {
            const noSuspend = !html.includes('suspended') && !html.includes('challenge');
            log(noSuspend ? '✅ Checkpoint résolu sans téléphone !' : '⚠️ Page inattendue après captcha');
            return noSuspend;
        }

        log('📱 Étape 3 : numéro de téléphone…');
        const phoneData = await getFreePhone();
        const phoneNum  = phoneData.number.replace(/[^\d]/g, '');
        log('📱 Numéro : +' + phoneNum);

        const jazoest3 = (html.match(/name="jazoest"\s+value="([^"]+)"/) || [])[1] || '';
        const action3  = (html.match(/<form[^>]+action="([^"]+)"/) || [])[1] || phonePageUrl;
        const postUrl3 = action3.startsWith('http') ? action3 : baseUrl + action3;

        resp = await makeFetch(postUrl3, {
            method: 'POST',
            headers: {
                'User-Agent': mobileUA, 'Cookie': cookieStr,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': phonePageUrl, 'Origin': baseUrl, 'X-CSRFToken': csrf,
            },
            body: enc({ csrfmiddlewaretoken: csrf, jazoest: jazoest3, phone_number: phoneNum }),
            redirect: 'follow', timeout: 15000,
        });
        cookieStr = mergeCookies(cookieStr, resp.headers.raw()['set-cookie']);
        html = await resp.text();
        csrf = extractCsrf(html, csrf);
        const smsPageUrl = resp.url || postUrl3;
        log('📱 Numéro envoyé → ' + resp.status);

        // ── Étape 4 : Code SMS ─────────────────────────────────────────────────
        log('📲 Lecture SMS pour +' + phoneNum + '…');
        await sleep(6000);
        const smsCode = await readSmsCode('+' + phoneNum);
        if (!smsCode) { log('⚠️ SMS non reçu'); return false; }
        log('✅ Code SMS : ' + smsCode);

        const jazoest4 = (html.match(/name="jazoest"\s+value="([^"]+)"/) || [])[1] || '';
        const action4  = (html.match(/<form[^>]+action="([^"]+)"/) || [])[1] || smsPageUrl;
        const postUrl4 = action4.startsWith('http') ? action4 : baseUrl + action4;

        resp = await makeFetch(postUrl4, {
            method: 'POST',
            headers: {
                'User-Agent': mobileUA, 'Cookie': cookieStr,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': smsPageUrl, 'Origin': baseUrl, 'X-CSRFToken': csrf,
            },
            body: enc({ csrfmiddlewaretoken: csrf, jazoest: jazoest4, response_code: smsCode }),
            redirect: 'follow', timeout: 15000,
        });
        cookieStr = mergeCookies(cookieStr, resp.headers.raw()['set-cookie']);
        const lastHtml = await resp.text();
        const ok = resp.status < 400 && !lastHtml.includes('suspended') && !lastHtml.includes('challenge');
        log(ok ? '🎉 Checkpoint 100% résolu !' : '⚠️ Statut final : ' + resp.status);
        return ok;

    } catch(e) { log('⚠️ Checkpoint : ' + e.message); return false; }
}

let mid_global = 'mid_' + Math.random().toString(36).slice(2,14);

// ── Création d'UN compte (fonction réutilisable) ──────────────────────────────
async function createOneAccount(log) {
    const result = { success: false, email:'', password: PASSWORD, uName:'', fullName:'', confirmed: false, photo: false, error: '' };

    // Renouveler IP si Tor dispo
    if (torAvailable) { await renewTorIp(); await sleep(2000); }

    // Infos
    const mailData = await getFakeMail();
    result.email    = mailData.email;
    result.fullName = generatingName();
    result.uName    = username();
    const token     = mailData.token;

    log('📧 ' + result.email + ' | @' + result.uName);

    // CSRF
    let csrf = '', mid = '', cookieStr = '';
    try {
        const d = await getCSRFData();
        csrf = d.csrf; mid = d.mid; cookieStr = d.cookieStr;
        log('🔐 CSRF ok');
    } catch(e) { result.error = 'CSRF: ' + e.message; return result; }

    const mergeNewCookies = (data) => {
        if (data._newCookies && Object.keys(data._newCookies).length > 0) {
            const ex = {};
            for (const p of cookieStr.split(';')) { const i = p.indexOf('='); if (i > 0) ex[p.substring(0,i).trim()] = p.substring(i+1).trim(); }
            Object.assign(ex, data._newCookies);
            cookieStr = Object.entries(ex).map(e => e[0]+'='+e[1]).join('; ');
            if (data._newCookies.csrftoken) csrf = data._newCookies.csrftoken;
        }
    };

    // Étape 1 : dry run — avec retry username si déjà pris
    log('📡 Étape 1 : dry run…');
    const randomY = 1980 + Math.floor(Math.random() * 25);
    const randomM = 1    + Math.floor(Math.random() * 12);
    const randomD = 1    + Math.floor(Math.random() * 28);

    let dry, usernameAttempts = 0;
    while (usernameAttempts < 5) {
        dry = await igPost('https://www.instagram.com/accounts/web_create_ajax/attempt/',
            enc({ enc_password: '#PWD_INSTAGRAM_BROWSER:0:'+Math.floor(Date.now()/1000)+':'+PASSWORD,
                  email: result.email, username: result.uName, first_name: result.fullName,
                  opt_into_one_tap: 'false', client_id: mid, seamless_login_enabled: '1' }),
            csrf, cookieStr, 'https://www.instagram.com/accounts/emailsignup/');
        mergeNewCookies(dry);

        // Username déjà pris → générer un nouveau et réessayer
        if (dry.errors && (dry.errors.username || dry.username_suggestions)) {
            const oldUName = result.uName;
            // Utiliser une suggestion d'Instagram si dispo
            if (dry.username_suggestions && dry.username_suggestions.length > 0) {
                result.uName = dry.username_suggestions[0];
            } else {
                result.uName = username();
            }
            log('♻️ Username @' + oldUName + ' pris → essai @' + result.uName);
            usernameAttempts++;
            continue;
        }
        break;
    }

    if (dry.errors && Object.keys(dry.errors).length > 0) {
        result.error = JSON.stringify(dry.errors).substring(0, 100);
        return result;
    }
    if (!dry.dryrun_passed) { result.error = 'dryrun_failed'; return result; }

    // Étape 2 : envoyer email
    log('📡 Étape 2 : send_verify_email…');
    const ver = await igPost('https://i.instagram.com/api/v1/accounts/send_verify_email/',
        enc({ device_id: mid, email: result.email }), csrf, cookieStr, 'https://www.instagram.com/');
    mergeNewCookies(ver);
    if (ver.require_captcha) { result.error = 'captcha_required'; return result; }
    if (!ver.email_sent) { result.error = 'email_not_sent: ' + JSON.stringify(ver).substring(0,80); return result; }
    log('✅ Email envoyé !');

    // Étape 3 : attendre code email
    log('📬 Attente code email…');
    let code = null;
    for (let tries = 0; tries < 24 && !code; tries++) {
        await sleep(5000);
        if (token) code = await pollEmailCode(token);
        log('📬 Tentative ' + (tries+1) + (code ? ' → '+code : '…'));
    }
    if (!code) { result.error = 'code_not_received'; return result; }

    // Étape 3b : check_confirmation_code
    log('📡 Étape 3 : check_confirmation_code…');
    const chk = await igPost('https://i.instagram.com/api/v1/accounts/check_confirmation_code/',
        enc({ code, device_id: mid, email: result.email }), csrf, cookieStr, 'https://www.instagram.com/');
    mergeNewCookies(chk);
    if (!chk.signup_code) { result.error = 'bad_code'; return result; }

    // Étape 4 : création finale
    log('📡 Étape 4 : web_create_ajax…');
    const final = await igPost('https://www.instagram.com/accounts/web_create_ajax/',
        enc({ enc_password: '#PWD_INSTAGRAM_BROWSER:0:'+Math.floor(Date.now()/1000)+':'+PASSWORD,
              email: result.email, username: result.uName, first_name: result.fullName,
              month: String(randomM), day: String(randomD), year: String(randomY),
              opt_into_one_tap: 'false', client_id: mid, seamless_login_enabled: '1',
              tos_version: 'row', force_sign_up_code: chk.signup_code }),
        csrf, cookieStr, 'https://www.instagram.com/accounts/emailsignup/');
    mergeNewCookies(final);

    if (!(final.account_created || final.user_id)) {
        result.error = JSON.stringify(final).substring(0, 100);
        return result;
    }

    log('🎉 Compte créé @' + result.uName + ' !');
    result.success = true;

    // ── Checkpoint automatique (toujours tenté) ───────────────────────────────
    log('🔒 Lancement checkpoint…');
    const cpUrl = final.checkpoint_url || '/accounts/suspended/?next=%2F';
    const resolved = await handleCheckpoint(cpUrl, cookieStr, csrf, log);
    result.checkpointResolved = resolved;
    log(resolved ? '✅ Compte 100% actif !' : '⚠️ Checkpoint non résolu');

    // Vérification téléphone API si demandée (sans checkpoint)
    if (!final.checkpoint_url && (final.phone_number_required)) {
        log('📱 Téléphone requis — recherche numéro…');
        try {
            const phoneData = await getFreePhone();
            log('📱 Numéro : ' + phoneData.number);
            const sms = await igPost('https://i.instagram.com/api/v1/accounts/send_signup_sms_code/',
                enc({ phone_number: phoneData.number, phone_id: mid, guid: mid, device_id: mid }),
                csrf, cookieStr, 'https://www.instagram.com/');
            mergeNewCookies(sms);
            if (sms.status === 'ok') {
                const smsCode = await readSmsCode(phoneData.number);
                if (smsCode) {
                    const v = await igPost('https://i.instagram.com/api/v1/accounts/validate_signup_sms_code/',
                        enc({ verification_code: smsCode, phone_number: phoneData.number, phone_id: mid, guid: mid, device_id: mid }),
                        csrf, cookieStr, 'https://www.instagram.com/');
                    mergeNewCookies(v);
                    log('✅ SMS vérifié !');
                } else log('⚠️ SMS non reçu');
            }
        } catch(e) { log('⚠️ SMS : ' + e.message); }
    }

    // Photo de profil
    const photoOk = await setProfilePhoto(cookieStr, csrf);
    result.photo = photoOk;
    log(photoOk ? '🖼️ Photo ajoutée !' : '⚠️ Photo non ajoutée');

    return result;
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Stockage des résultats multi-comptes
const sessions = {};

app.post('/api/create-bulk', async (req, res) => {
    const count = Math.min(parseInt(req.body.count) || 1, 10);
    const sessionId = Date.now().toString();
    sessions[sessionId] = { total: count, done: 0, accounts: [], logs: [], running: true };
    res.json({ sessionId });

    // Lancer les créations en parallèle (max 3 à la fois pour éviter les blocages)
    const PARALLEL = Math.min(count, 3);
    const queue = Array.from({ length: count }, (_, i) => i);
    const workers = Array.from({ length: PARALLEL }, async () => {
        while (queue.length > 0) {
            const idx = queue.shift();
            const log = (msg) => {
                sessions[sessionId].logs.push('[Compte ' + (idx+1) + '] ' + msg);
                slog('[#' + (idx+1) + '] ' + msg);
            };
            log('🚀 Démarrage…');
            try {
                const result = await createOneAccount(log);
                sessions[sessionId].accounts.push({ index: idx+1, ...result });
            } catch(e) {
                sessions[sessionId].accounts.push({ index: idx+1, success: false, error: e.message });
                log('❌ ' + e.message);
            }
            sessions[sessionId].done++;
        }
    });
    await Promise.all(workers);
    sessions[sessionId].running = false;
    const successAccounts = sessions[sessionId].accounts.filter(a => a.success);
    slog('✅ Session ' + sessionId + ' terminée : ' + successAccounts.length + '/' + count + ' succès');

    // ── Envoyer les comptes créés au panel admin ──────────────────────────────
    if (successAccounts.length > 0) {
        await saveToPanel(successAccounts, (m) => sessions[sessionId].logs.push(m));
    }
});

app.get('/api/session/:id', (req, res) => {
    const s = sessions[req.params.id];
    if (!s) return res.json({ error: 'Session not found' });
    res.json(s);
});

app.get('/api/tor', async (req, res) => {
    const ok = await checkTor();
    res.json({ available: ok });
});

// ── UI ────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => { res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#f0f2f5;min-height:100vh}
    .hdr{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:16px;text-align:center;font-size:20px;font-weight:bold}
    .wrap{max-width:500px;margin:0 auto;padding:14px}
    .card{background:#fff;border-radius:14px;padding:18px;margin-bottom:14px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
    .ttl{font-size:16px;font-weight:bold;color:#333;margin-bottom:14px}
    .btn{width:100%;padding:16px;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:8px;transition:.2s}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .btn:active{transform:scale(.98)}
    .btn-main{background:linear-gradient(135deg,#e1306c,#f77737)}
    .btn-gray{background:linear-gradient(135deg,#6c757d,#495057);font-size:13px;padding:10px}
    .counter{display:flex;align-items:center;justify-content:space-between;background:#f8f9fa;border-radius:12px;padding:12px 16px;margin-bottom:14px}
    .counter-val{font-size:36px;font-weight:bold;color:#e1306c;min-width:50px;text-align:center}
    .counter-btn{background:#e1306c;border:none;color:#fff;width:44px;height:44px;border-radius:50%;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center}
    .progress-wrap{background:#f0f0f0;border-radius:10px;height:12px;margin:10px 0;overflow:hidden}
    .progress-bar{height:100%;background:linear-gradient(135deg,#e1306c,#f77737);border-radius:10px;transition:width .5s;width:0%}
    .status-row{display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:8px}
    .accounts-list{display:flex;flex-direction:column;gap:10px;margin-top:10px}
    .acc-card{border-radius:10px;padding:12px;border:2px solid}
    .acc-ok{border-color:#86efac;background:#f0fdf4}
    .acc-err{border-color:#fca5a5;background:#fef2f2}
    .acc-row{display:flex;gap:8px;font-size:12px;padding:2px 0}
    .acc-lbl{color:#888;width:65px;flex-shrink:0}
    .acc-val{color:#222;font-weight:600;word-break:break-all}
    .badge{display:inline-block;border-radius:20px;padding:1px 8px;font-size:10px;font-weight:bold;margin-left:4px}
    .b-ok{background:#dcfce7;color:#166534}
    .b-warn{background:#fef9c3;color:#854d0e}
    .logs{background:#0f172a;border-radius:10px;padding:10px;max-height:250px;overflow-y:auto;margin-top:10px}
    .ll{font-family:monospace;font-size:11px;padding:2px 0;border-bottom:1px solid #1e293b;color:#34d399}
    .ll.e{color:#f87171}.ll.w{color:#fbbf24}.ll.i{color:#60a5fa}
    .tor-badge{font-size:11px;padding:4px 10px;border-radius:20px;display:inline-block;margin-top:6px}
    .tor-on{background:#dcfce7;color:#166534}
    .tor-off{background:#fef9c3;color:#854d0e}
    .copy-btn{background:none;border:1px solid #ddd;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;margin-left:4px;color:#666}
    .export-btn{background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;margin-top:10px;width:100%}
  </style>
</head>
<body>
<div class="hdr">🤖 Bot Instagram</div>
<div class="wrap">

  <div class="card">
    <div class="ttl">⚙️ Configuration</div>
    <div id="tor-status"><span class="tor-badge tor-off">⏳ Vérification Tor…</span></div>
    <div style="margin-top:16px">
      <div style="font-size:14px;color:#555;margin-bottom:10px;text-align:center">Nombre de comptes à créer</div>
      <div class="counter">
        <button class="counter-btn" onclick="changeCount(-1)">−</button>
        <div>
          <div class="counter-val" id="countVal">1</div>
          <div style="font-size:11px;color:#999;text-align:center">comptes</div>
        </div>
        <button class="counter-btn" onclick="changeCount(+1)">+</button>
      </div>
    </div>
    <button class="btn btn-main" id="btnStart" onclick="startBulk()">🚀 Lancer la création</button>
  </div>

  <div class="card" id="progress-card" style="display:none">
    <div class="ttl">📊 Progression <span id="prog-text" style="font-weight:normal;font-size:13px;color:#666"></span></div>
    <div class="progress-wrap"><div class="progress-bar" id="prog-bar"></div></div>
    <div class="status-row">
      <span>✅ Réussis : <strong id="cnt-ok">0</strong></span>
      <span>❌ Échoués : <strong id="cnt-fail">0</strong></span>
      <span>⏳ Restants : <strong id="cnt-left">0</strong></span>
    </div>
    <button class="export-btn" id="btnExport" onclick="exportResults()" style="display:none">📋 Exporter les comptes</button>
  </div>

  <div class="card" id="results-card" style="display:none">
    <div class="ttl">🎉 Comptes créés</div>
    <div class="accounts-list" id="accounts-list"></div>
  </div>

  <div class="card">
    <div class="ttl" style="margin-bottom:6px">📋 Logs en temps réel</div>
    <div class="logs" id="logs"></div>
  </div>

</div>
<script>
let count = 1;
let sessionId = null;
let pollInterval = null;
let allAccounts = [];

function changeCount(delta) {
    count = Math.max(1, Math.min(10, count + delta));
    document.getElementById('countVal').textContent = count;
}

function L(msg, t) {
    const el = document.getElementById('logs'), d = document.createElement('div');
    d.className = 'll' + (t ? ' ' + t : '');
    d.textContent = new Date().toLocaleTimeString('fr') + '  ' + msg;
    el.insertBefore(d, el.firstChild);
    while (el.children.length > 100) el.removeChild(el.lastChild);
}

async function checkTor() {
    try {
        const d = await (await fetch('/api/tor')).json();
        const el = document.getElementById('tor-status');
        if (d.available) {
            el.innerHTML = '<span class="tor-badge tor-on">🧅 Tor actif — IP différente par compte</span>';
        } else {
            el.innerHTML = '<span class="tor-badge tor-off">📶 IP mobile directe (Tor non actif)</span>';
        }
    } catch(e) {}
}

async function startBulk() {
    if (count < 1) return;
    document.getElementById('btnStart').disabled = true;
    document.getElementById('progress-card').style.display = 'block';
    document.getElementById('results-card').style.display = 'none';
    document.getElementById('accounts-list').innerHTML = '';
    document.getElementById('btnExport').style.display = 'none';
    document.getElementById('cnt-ok').textContent = '0';
    document.getElementById('cnt-fail').textContent = '0';
    document.getElementById('cnt-left').textContent = count;
    document.getElementById('prog-bar').style.width = '0%';
    document.getElementById('prog-text').textContent = '0/' + count;
    document.getElementById('logs').innerHTML = '';
    allAccounts = [];
    L('🚀 Lancement de ' + count + ' création(s)…', 'i');

    const resp = await fetch('/api/create-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
    });
    const data = await resp.json();
    sessionId = data.sessionId;
    pollInterval = setInterval(pollSession, 2000);
}

let lastLogCount = 0;
async function pollSession() {
    if (!sessionId) return;
    try {
        const d = await (await fetch('/api/session/' + sessionId)).json();

        // Nouveaux logs
        const newLogs = d.logs.slice(lastLogCount);
        newLogs.forEach(msg => {
            const t = msg.includes('❌') ? 'e' : msg.includes('⚠️') ? 'w' : msg.includes('🎉') || msg.includes('✅') ? '' : 'i';
            L(msg, t);
        });
        lastLogCount = d.logs.length;

        // Progression
        const pct = Math.round((d.done / d.total) * 100);
        document.getElementById('prog-bar').style.width = pct + '%';
        document.getElementById('prog-text').textContent = d.done + '/' + d.total;
        document.getElementById('cnt-left').textContent = d.total - d.done;

        const ok = d.accounts.filter(a => a.success).length;
        const fail = d.accounts.filter(a => !a.success).length;
        document.getElementById('cnt-ok').textContent = ok;
        document.getElementById('cnt-fail').textContent = fail;

        // Afficher comptes
        if (d.accounts.length > allAccounts.length) {
            const newAccs = d.accounts.slice(allAccounts.length);
            newAccs.forEach(acc => renderAccount(acc));
            allAccounts = d.accounts;
            document.getElementById('results-card').style.display = 'block';
        }

        if (!d.running) {
            clearInterval(pollInterval);
            document.getElementById('btnStart').disabled = false;
            document.getElementById('btnExport').style.display = 'block';
            L('✅ Terminé ! ' + ok + '/' + d.total + ' comptes créés avec succès.', '');
        }
    } catch(e) {}
}

function renderAccount(acc) {
    const list = document.getElementById('accounts-list');
    const div = document.createElement('div');
    div.className = 'acc-card ' + (acc.success ? 'acc-ok' : 'acc-err');
    if (acc.success) {
        div.innerHTML = \`
            <div style="font-weight:bold;color:#16a34a;margin-bottom:6px">
                ✅ Compte #\${acc.index}
                \${acc.checkpointResolved === true ? '<span class="badge b-ok">Actif ✓</span>' : acc.checkpointResolved === false ? '<span class="badge b-warn">Suspendu?</span>' : ''}
                \${acc.confirmed ? '<span class="badge b-ok">Email ✓</span>' : '<span class="badge b-warn">Email ?</span>'}
                \${acc.photo ? '<span class="badge b-ok">Photo ✓</span>' : ''}
            </div>
            <div class="acc-row"><span class="acc-lbl">📧 Email</span><span class="acc-val">\${acc.email}<button class="copy-btn" onclick="copy('\${acc.email}')">Copier</button></span></div>
            <div class="acc-row"><span class="acc-lbl">🔒 Pass</span><span class="acc-val">\${acc.password}</span></div>
            <div class="acc-row"><span class="acc-lbl">👤 User</span><span class="acc-val">@\${acc.uName}</span></div>
            <div class="acc-row"><span class="acc-lbl">🏷️ Nom</span><span class="acc-val">\${acc.fullName}</span></div>
        \`;
    } else {
        div.innerHTML = \`
            <div style="font-weight:bold;color:#dc2626;margin-bottom:4px">❌ Compte #\${acc.index} — Échec</div>
            <div style="font-size:12px;color:#666">\${acc.error || 'Erreur inconnue'}</div>
        \`;
    }
    list.appendChild(div);
}

function copy(text) {
    navigator.clipboard.writeText(text).catch(() => {
        const t = document.createElement('textarea');
        t.value = text; document.body.appendChild(t); t.select();
        document.execCommand('copy'); document.body.removeChild(t);
    });
}

function exportResults() {
    const lines = allAccounts.filter(a => a.success).map(a =>
        'Email: ' + a.email + ' | Pass: ' + a.password + ' | User: @' + a.uName + ' | Nom: ' + a.fullName
    );
    const blob = new Blob([lines.join('\\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'comptes_instagram_' + Date.now() + '.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// Démarrage
checkTor();
</script>
</body></html>`);});

app.listen(PORT, '0.0.0.0', () => slog('🌐 Port ' + PORT));
(async () => {
    slog('🤖 Bot Instagram prêt sur le port ' + PORT);
    await checkLicense();
    await checkTor();
})();
