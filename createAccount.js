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

// ── Email temporaire — Multi-services rotation ───────────────────────────────
const EMAIL_SERVICES = [
    // Service 1 : doux.gleeze.com (actuel)
    async () => {
        const r = await fetch('https://doux.gleeze.com/tempmail/gen', { timeout: 10000 });
        const d = await r.json();
        if (d?.email && d?.token) return { email: d.email, token: d.token, service: 'gleeze' };
        throw new Error('gleeze failed');
    },
    // Service 2 : Guerrilla Mail
    async () => {
        const r = await fetch('https://api.guerrillamail.com/ajax.php?f=get_email_address', { timeout: 10000 });
        const d = await r.json();
        if (d?.email_addr) return { email: d.email_addr, token: d.sid_token, service: 'guerrilla' };
        throw new Error('guerrilla failed');
    },
    // Service 3 : mail.tm
    async () => {
        // Créer un compte mail.tm
        const domain_r = await fetch('https://api.mail.tm/domains', { timeout: 8000 });
        const domains = await domain_r.json();
        const domain = domains['hydra:member']?.[0]?.domain || 'dcctb.com';
        const rand = 'user' + Math.random().toString(36).slice(2,10);
        const pass = 'Pass' + Math.random().toString(36).slice(2,10) + '!';
        const email = rand + '@' + domain;
        const reg = await fetch('https://api.mail.tm/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: email, password: pass }),
            timeout: 10000,
        });
        if (!reg.ok) throw new Error('mail.tm register failed');
        const tok_r = await fetch('https://api.mail.tm/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: email, password: pass }),
            timeout: 10000,
        });
        const tok = await tok_r.json();
        if (!tok.token) throw new Error('mail.tm token failed');
        return { email, token: tok.token, service: 'mailtm', mailtm_pass: pass };
    },
];

let emailServiceIndex = 0;

async function getFakeMail() {
    // Essayer chaque service en rotation
    for (let i = 0; i < EMAIL_SERVICES.length; i++) {
        const idx = (emailServiceIndex + i) % EMAIL_SERVICES.length;
        try {
            const result = await EMAIL_SERVICES[idx]();
            emailServiceIndex = (idx + 1) % EMAIL_SERVICES.length; // rotation
            return result;
        } catch(e) {}
    }
    // Fallback absolu
    const rand = Math.floor(Math.random() * 99999);
    return { email: 'user' + rand + '@guerrillamail.com', token: '', service: 'fallback' };
}

// ── Poll email — Multi-services ───────────────────────────────────────────────
async function pollEmailCode(token, service) {
    // mail.tm
    if (service === 'mailtm') {
        for (let i = 0; i < 3; i++) {
            try {
                const r = await fetch('https://api.mail.tm/messages', {
                    headers: { 'Authorization': 'Bearer ' + token },
                    timeout: 8000,
                });
                const d = await r.json();
                for (const msg of (d['hydra:member'] || [])) {
                    const intro = (msg.subject || '') + ' ' + (msg.intro || '');
                    const m = intro.match(/\b(\d{6})\b/);
                    if (m) return m[1];
                    // Lire le message complet si intro n'a pas le code
                    try {
                        const mr = await fetch('https://api.mail.tm/messages/' + msg.id, {
                            headers: { 'Authorization': 'Bearer ' + token }, timeout: 8000,
                        });
                        const md = await mr.json();
                        const body = (md.text || '') + ' ' + (md.html || '');
                        const mc = body.match(/\b(\d{6})\b/);
                        if (mc) return mc[1];
                    } catch(e) {}
                }
            } catch(e) {}
            if (i < 2) await sleep(1000);
        }
        return null;
    }

    // Guerrilla Mail
    if (service === 'guerrilla') {
        for (let i = 0; i < 3; i++) {
            try {
                const r = await fetch('https://api.guerrillamail.com/ajax.php?f=check_email&seq=0&sid_token=' + encodeURIComponent(token), { timeout: 8000 });
                const d = await r.json();
                for (const msg of (d.list || [])) {
                    const txt = (msg.mail_subject || '') + ' ' + (msg.mail_excerpt || '');
                    const m = txt.match(/\b(\d{6})\b/);
                    if (m) return m[1];
                }
            } catch(e) {}
            if (i < 2) await sleep(1000);
        }
        return null;
    }

    // gleeze (défaut)
    for (let i = 0; i < 3; i++) {
        try {
            const r = await fetch('https://doux.gleeze.com/tempmail/inbox?token=' + encodeURIComponent(token), { timeout: 8000 });
            const d = await r.json();
            if (d.answer?.length > 0) {
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

        const mobileUA = 'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

        // ── Récupérer la vraie URL challenge depuis l'API Instagram ──────────
        // L'URL /accounts/suspended/ n'est pas la vraie page challenge
        // On doit récupérer l'URL /challenge/action/<token>/ via l'API
        log('📡 Récupération URL challenge réelle…');
        
        // Essayer de récupérer le challenge depuis l'API web
        const challengeApiResp = await makeFetch('https://www.instagram.com/api/v1/web/accounts/login/ajax/checkpoint/trusted_notification/', {
            method: 'POST',
            headers: {
                'User-Agent': mobileUA,
                'X-CSRFToken': csrf,
                'Cookie': cookieStr,
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://www.instagram.com/',
            },
            body: enc({ choice: 0 }),
            timeout: 10000, redirect: 'follow',
        });
        const challengeApiData = await challengeApiResp.json().catch(() => ({}));
        log('📡 Challenge API2 → ' + JSON.stringify(challengeApiData).substring(0, 120));

        // Chercher l'URL challenge dans la réponse
        let challengeUrl = challengeApiData.checkpoint_url
                        || challengeApiData.challenge?.url
                        || null;

        // Si pas trouvé, charger la page suspended pour trouver le lien challenge
        if (!challengeUrl) {
            log('🔍 Recherche URL challenge dans la page suspended…');
            const suspResp = await makeFetch('https://www.instagram.com/accounts/suspended/', {
                headers: { 'User-Agent': mobileUA, 'Cookie': cookieStr, 'Accept': 'text/html,*/*' },
                redirect: 'follow', timeout: 10000,
            });
            cookieStr = mergeCookies(cookieStr, suspResp.headers.raw()['set-cookie']);
            const suspHtml = await suspResp.text();
            csrf = extractCsrf(suspHtml, csrf);

            // Chercher le lien vers /challenge/ dans le HTML
            const challengeMatch = suspHtml.match(/href="(\/challenge\/action\/[^"]+)"/)
                                || suspHtml.match(/href="(https:\/\/www\.instagram\.com\/challenge\/[^"]+)"/)
                                || suspHtml.match(/"challenge_url"\s*:\s*"([^"]+)"/)
                                || suspHtml.match(/action="(\/challenge\/[^"]+)"/);
            if (challengeMatch) {
                challengeUrl = challengeMatch[1].startsWith('http') ? challengeMatch[1] : baseUrl + challengeMatch[1];
                log('✅ URL challenge trouvée : ' + challengeUrl.substring(0, 80));
            }
        }

        // Utiliser l'URL challenge ou rester sur suspended
        if (challengeUrl) {
            currentUrl = challengeUrl.startsWith('http') ? challengeUrl : baseUrl + challengeUrl;
        }

        // ── Charger la vraie page challenge ───────────────────────────────────
        log('📄 Chargement page challenge : ' + currentUrl.substring(0, 80));
        let resp = await makeFetch(currentUrl, {
            headers: {
                'User-Agent': mobileUA,
                'Cookie': cookieStr,
                'Accept': 'text/html,application/xhtml+xml,*/*',
                'Accept-Language': 'fr-FR,fr;q=0.9',
            },
            redirect: 'follow', timeout: 15000,
        });
        cookieStr = mergeCookies(cookieStr, resp.headers.raw()['set-cookie']);
        let html = await resp.text();
        csrf = extractCsrf(html, csrf);
        const pageUrl = resp.url || currentUrl;
        log('📄 Page → ' + resp.status + ' | ' + pageUrl.substring(0, 70));

        // ── Clic "Continuer" si la page le demande ────────────────────────────
        const needsContinue = html.includes('Continuer') || html.includes('Continue') || html.includes('personne réelle');
        if (needsContinue) {
            log('📄 Clic Continuer…');
            const jazoest1 = (html.match(/name="jazoest"\s+value="([^"]+)"/) || [])[1] || '';
            const action1  = (html.match(/<form[^>]+action="([^"]+)"/) || [])[1] || pageUrl;
            const postUrl1 = action1.startsWith('http') ? action1 : baseUrl + action1;

            resp = await makeFetch(postUrl1, {
                method: 'POST',
                headers: {
                    'User-Agent': mobileUA, 'Cookie': cookieStr,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': pageUrl, 'Origin': baseUrl, 'X-CSRFToken': csrf,
                },
                body: enc({ csrfmiddlewaretoken: csrf, jazoest: jazoest1, choice: '0' }),
                redirect: 'follow', timeout: 15000,
            });
            cookieStr = mergeCookies(cookieStr, resp.headers.raw()['set-cookie']);
            html = await resp.text();
            csrf = extractCsrf(html, csrf);
            const newUrl = resp.url || postUrl1;
            log('📄 Après Continuer → ' + resp.status + ' | ' + newUrl.substring(0, 70));
            currentUrl = newUrl;
        }

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
        const captchaPageUrl = currentUrl;
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
    result.email       = mailData.email;
    result.emailService = mailData.service || 'gleeze';
    result.fullName    = generatingName();
    result.uName       = username();
    const token        = mailData.token;

    log('📧 ' + result.email + ' [' + result.emailService + '] | @' + result.uName);

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
    log('📬 Attente code email [' + (result.emailService||'?') + ']…');
    let code = null;
    for (let tries = 0; tries < 24 && !code; tries++) {
        await sleep(5000);
        if (token) code = await pollEmailCode(token, result.emailService);
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

    // ── Auto-login : sauvegarder session cookies ───────────────────────────────
    try {
        // Vérifier que la session est valide via l'API
        const meResp = await makeFetch('https://www.instagram.com/api/v1/accounts/current_user/?edit=true', {
            headers: { 'User-Agent': IG_UA, 'Cookie': cookieStr, 'X-CSRFToken': csrf, 'X-Requested-With': 'XMLHttpRequest' },
            timeout: 10000,
        });
        const meData = await meResp.json().catch(() => ({}));
        if (meData.user || meData.status === 'ok') {
            result.loggedIn = true;
            result.sessionCookies = cookieStr;
            result.sessionCsrf = csrf;
            log('🔑 Session active ! Compte connecté.');
        } else {
            // Tenter un login explicite
            const loginResp = await makeFetch('https://www.instagram.com/accounts/login/ajax/', {
                method: 'POST',
                headers: {
                    ...IG_HEADERS(csrf, cookieStr, 'https://www.instagram.com/'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: enc({ username: result.uName, enc_password: '#PWD_INSTAGRAM_BROWSER:0:'+Math.floor(Date.now()/1000)+':'+PASSWORD, optIntoOneTap: 'false' }),
                timeout: 15000,
            });
            const loginData = await loginResp.json().catch(() => ({}));
            if (loginData.authenticated) {
                cookieStr = mergeCookies(cookieStr, loginResp.headers.raw()['set-cookie']);
                result.loggedIn = true;
                result.sessionCookies = cookieStr;
                result.sessionCsrf = csrf;
                log('🔑 Login automatique réussi !');
            } else {
                log('⚠️ Login auto : ' + JSON.stringify(loginData).substring(0,60));
            }
        }
    } catch(e) { log('⚠️ Login auto : ' + e.message); }

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
const UI_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Instagram Bot — Live</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0a12; color: #e2e8f0; min-height: 100vh; }

/* TOPBAR */
.topbar {
  background: linear-gradient(135deg, #e1306c, #f77737);
  padding: 0 20px; height: 56px;
  display: flex; align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 100;
  box-shadow: 0 2px 20px rgba(225,48,108,.4);
}
.topbar h1 { font-size: 1.05rem; font-weight: 800; color: #fff; letter-spacing: .5px; }
.topbar-right { display: flex; align-items: center; gap: 12px; }
#ip-badge { font-size: .75rem; background: rgba(255,255,255,.15); color: #fff; padding: 4px 10px; border-radius: 20px; }

/* LAYOUT */
.layout { display: grid; grid-template-columns: 320px 1fr; gap: 0; min-height: calc(100vh - 56px); }

/* LEFT PANEL */
.left { background: #10101c; border-right: 1px solid #1e1e30; padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; max-height: calc(100vh - 56px); }

/* CONFIG CARD */
.config-card { background: #16162a; border: 1px solid #2a2a40; border-radius: 14px; padding: 16px; }
.card-title { font-size: .8rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; }
.count-ctrl { display: flex; align-items: center; justify-content: center; gap: 0; background: #0d0d1a; border-radius: 12px; padding: 8px; margin-bottom: 14px; }
.count-btn { background: linear-gradient(135deg,#e1306c,#f77737); border: none; color: #fff; width: 40px; height: 40px; border-radius: 10px; font-size: 1.3rem; cursor: pointer; font-weight: 700; transition: .15s; }
.count-btn:hover { opacity: .85; }
.count-val { font-size: 2.2rem; font-weight: 900; color: #fff; min-width: 70px; text-align: center; }
.count-lbl { font-size: .72rem; color: #64748b; text-align: center; margin-top: 2px; }
.btn-launch { width: 100%; padding: 14px; background: linear-gradient(135deg, #e1306c, #f77737); color: #fff; border: none; border-radius: 12px; font-size: 1rem; font-weight: 800; cursor: pointer; transition: .2s; box-shadow: 0 4px 20px rgba(225,48,108,.35); letter-spacing: .5px; }
.btn-launch:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(225,48,108,.5); }
.btn-launch:disabled { opacity: .4; cursor: not-allowed; transform: none; }

/* PROGRESS */
.prog-card { background: #16162a; border: 1px solid #2a2a40; border-radius: 14px; padding: 16px; display: none; }
.pbar-track { background: #0d0d1a; border-radius: 10px; height: 10px; margin: 10px 0; overflow: hidden; }
.pbar-fill { height: 100%; background: linear-gradient(90deg, #e1306c, #f77737); border-radius: 10px; transition: width .6s ease; width: 0%; }
.stats-row { display: flex; justify-content: space-between; font-size: .8rem; margin-top: 8px; }
.stat-item { text-align: center; }
.stat-num { font-size: 1.2rem; font-weight: 700; }
.stat-ok { color: #34d399; }
.stat-fail { color: #f87171; }
.stat-left { color: #fbbf24; }
.stat-lbl { font-size: .7rem; color: #64748b; margin-top: 1px; }
.btn-export { width: 100%; margin-top: 12px; padding: 10px; background: #1e293b; color: #818cf8; border: 1px solid #334155; border-radius: 10px; font-size: .85rem; cursor: pointer; font-weight: 600; display: none; }
.btn-export:hover { background: #263248; }

/* LOGS */
.logs-card { background: #16162a; border: 1px solid #2a2a40; border-radius: 14px; padding: 14px; flex: 1; min-height: 200px; }
.logs-box { background: #080812; border-radius: 8px; padding: 10px; height: 220px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: .75rem; }
.log-line { padding: 2px 0; border-bottom: 1px solid #0d0d1a; white-space: pre-wrap; word-break: break-all; }
.log-ok  { color: #34d399; }
.log-err { color: #f87171; }
.log-warn{ color: #fbbf24; }
.log-info{ color: #60a5fa; }
.log-def { color: #94a3b8; }

/* RIGHT PANEL — LIVE ACCOUNTS */
.right { padding: 16px; overflow-y: auto; max-height: calc(100vh - 56px); }
.right-title { font-size: .8rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
.live-dot { width: 8px; height: 8px; background: #34d399; border-radius: 50%; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }

.accounts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }

/* ACCOUNT CARD */
.acc-card { background: #16162a; border: 2px solid #2a2a40; border-radius: 14px; padding: 14px; transition: .3s; animation: slideIn .3s ease; }
@keyframes slideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
.acc-card.success { border-color: #065f46; background: #0d1f18; }
.acc-card.error   { border-color: #7f1d1d; background: #1a0f0f; }
.acc-card.running { border-color: #1e3a5f; background: #0d1829; }

.acc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.acc-num { font-size: .75rem; font-weight: 700; color: #64748b; }
.acc-status { display: flex; align-items: center; gap: 6px; font-size: .78rem; font-weight: 700; }
.acc-status.ok   { color: #34d399; }
.acc-status.err  { color: #f87171; }
.acc-status.run  { color: #60a5fa; }

.acc-avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg,#e1306c,#f77737); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; margin: 0 auto 10px; border: 2px solid #2a2a40; overflow: hidden; }
.acc-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

.acc-username { font-size: .95rem; font-weight: 800; color: #fff; text-align: center; margin-bottom: 4px; }
.acc-name     { font-size: .78rem; color: #64748b; text-align: center; margin-bottom: 12px; }

.acc-fields { display: flex; flex-direction: column; gap: 6px; }
.acc-field { display: flex; justify-content: space-between; align-items: center; background: #0d0d1a; border-radius: 8px; padding: 6px 10px; }
.acc-field-lbl { font-size: .72rem; color: #64748b; }
.acc-field-val { font-size: .78rem; font-weight: 600; color: #e2e8f0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy-btn { background: #1e293b; border: none; color: #818cf8; border-radius: 5px; padding: 2px 7px; font-size: .68rem; cursor: pointer; margin-left: 4px; white-space: nowrap; }
.copy-btn:hover { background: #263248; }

.acc-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: .68rem; font-weight: 700; }
.b-active  { background: #064e3b; color: #34d399; }
.b-suspend { background: #451a03; color: #fbbf24; }
.b-photo   { background: #1e1b4b; color: #818cf8; }
.b-login   { background: #0c1a3a; color: #60a5fa; }
.b-email   { background: #1a0533; color: #c084fc; }

/* ACC CARD LOADING SKELETON */
.acc-card.skeleton { border-color: #1e2a3a; }
.skel { background: linear-gradient(90deg, #1a1a2e 25%, #252545 50%, #1a1a2e 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 6px; }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

.empty-state { text-align: center; padding: 60px 20px; color: #334155; }
.empty-state .ico { font-size: 3rem; margin-bottom: 12px; }
.empty-state p { font-size: .9rem; }

/* RESPONSIVE */
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .left { max-height: none; border-right: none; border-bottom: 1px solid #1e1e30; }
  .logs-box { height: 160px; }
  .right { max-height: none; }
}
@media (max-width: 480px) {
  .accounts-grid { grid-template-columns: 1fr; }
  .topbar h1 { font-size: .9rem; }
}
</style>
</head>
<body>

<div class="topbar">
  <h1>🤖 Instagram Bot — Live Creator</h1>
  <div class="topbar-right">
    <span id="ip-badge">⏳ Vérification…</span>
  </div>
</div>

<div class="layout">

  <!-- ── GAUCHE : Contrôles ── -->
  <div class="left">

    <!-- Config -->
    <div class="config-card">
      <div class="card-title">⚙️ Configuration</div>
      <div style="margin-bottom:14px">
        <div style="font-size:.82rem;color:#64748b;text-align:center;margin-bottom:10px">Nombre de comptes</div>
        <div class="count-ctrl">
          <button class="count-btn" onclick="chg(-1)">−</button>
          <div>
            <div class="count-val" id="count-val">1</div>
            <div class="count-lbl">comptes</div>
          </div>
          <button class="count-btn" onclick="chg(+1)">+</button>
        </div>
      </div>
      <button class="btn-launch" id="btn-launch" onclick="startBulk()">🚀 Lancer la création</button>
    </div>

    <!-- Progression -->
    <div class="prog-card" id="prog-card">
      <div class="card-title">📊 Progression <span id="prog-txt" style="font-weight:400;text-transform:none;letter-spacing:0;color:#94a3b8"></span></div>
      <div class="pbar-track"><div class="pbar-fill" id="pbar"></div></div>
      <div class="stats-row">
        <div class="stat-item"><div class="stat-num stat-ok" id="cnt-ok">0</div><div class="stat-lbl">✅ Réussis</div></div>
        <div class="stat-item"><div class="stat-num stat-fail" id="cnt-fail">0</div><div class="stat-lbl">❌ Échoués</div></div>
        <div class="stat-item"><div class="stat-num stat-left" id="cnt-left">0</div><div class="stat-lbl">⏳ Restants</div></div>
      </div>
      <button class="btn-export" id="btn-export" onclick="exportResults()">📋 Exporter les comptes (.txt)</button>
    </div>

    <!-- Logs -->
    <div class="logs-card">
      <div class="card-title">📋 Logs en temps réel</div>
      <div class="logs-box" id="logs-box"></div>
    </div>

  </div>

  <!-- ── DROITE : Comptes live ── -->
  <div class="right">
    <div class="right-title">
      <div class="live-dot" id="live-dot" style="display:none"></div>
      🎉 Comptes créés
    </div>
    <div class="accounts-grid" id="accounts-grid">
      <div class="empty-state">
        <div class="ico">🤖</div>
        <p>Lance la création pour voir les comptes apparaître ici en temps réel</p>
      </div>
    </div>
  </div>

</div>

<script>
var count = 1;
var sessionId = null;
var pollTimer = null;
var lastLog = 0;
var allAccounts = [];
var renderedIds = {};

function chg(d) {
  count = Math.max(1, Math.min(10, count + d));
  document.getElementById('count-val').textContent = count;
}

function log(msg, type) {
  var box = document.getElementById('logs-box');
  var cls = 'log-def';
  if (msg.includes('✅') || msg.includes('🎉')) cls = 'log-ok';
  else if (msg.includes('❌')) cls = 'log-err';
  else if (msg.includes('⚠️')) cls = 'log-warn';
  else if (msg.includes('📡') || msg.includes('📬') || msg.includes('🚀')) cls = 'log-info';
  var d = document.createElement('div');
  d.className = 'log-line ' + cls;
  var t = new Date().toLocaleTimeString('fr');
  d.textContent = t + '  ' + msg;
  box.insertBefore(d, box.firstChild);
  while (box.children.length > 150) box.removeChild(box.lastChild);
}

async function checkTor() {
  try {
    var d = await fetch('/api/tor').then(r => r.json());
    var el = document.getElementById('ip-badge');
    el.textContent = d.available ? '🧅 Tor actif' : '📶 IP mobile directe';
    el.style.background = d.available ? 'rgba(16,185,129,.25)' : 'rgba(255,255,255,.12)';
  } catch(e) {}
}

async function startBulk() {
  document.getElementById('btn-launch').disabled = true;
  document.getElementById('prog-card').style.display = 'block';
  document.getElementById('btn-export').style.display = 'none';
  document.getElementById('accounts-grid').innerHTML = '';
  document.getElementById('live-dot').style.display = 'block';
  document.getElementById('logs-box').innerHTML = '';
  document.getElementById('cnt-ok').textContent = '0';
  document.getElementById('cnt-fail').textContent = '0';
  document.getElementById('cnt-left').textContent = count;
  document.getElementById('pbar').style.width = '0%';
  document.getElementById('prog-txt').textContent = '0/' + count;
  allAccounts = [];
  renderedIds = {};
  lastLog = 0;

  // Afficher les cartes skeleton en attente
  for (var i = 1; i <= count; i++) renderSkeleton(i);

  log('🚀 Lancement de ' + count + ' création(s)…');

  var resp = await fetch('/api/create-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: count })
  });
  var data = await resp.json();
  sessionId = data.sessionId;
  pollTimer = setInterval(pollSession, 1500);
}

function renderSkeleton(i) {
  var grid = document.getElementById('accounts-grid');
  var el = document.createElement('div');
  el.className = 'acc-card skeleton running';
  el.id = 'acc-' + i;
  el.innerHTML =
    '<div class="acc-header">' +
      '<span class="acc-num">Compte #' + i + '</span>' +
      '<span class="acc-status run">⏳ En cours…</span>' +
    '</div>' +
    '<div class="acc-avatar">⏳</div>' +
    '<div class="skel" style="height:14px;width:70%;margin:8px auto"></div>' +
    '<div class="skel" style="height:10px;width:50%;margin:4px auto 12px"></div>' +
    '<div class="skel" style="height:32px;margin-bottom:6px"></div>' +
    '<div class="skel" style="height:32px;margin-bottom:6px"></div>' +
    '<div class="skel" style="height:32px"></div>';
  grid.appendChild(el);
}

function renderAccount(acc) {
  var el = document.getElementById('acc-' + acc.index);
  if (!el) { el = document.createElement('div'); el.id = 'acc-' + acc.index; document.getElementById('accounts-grid').appendChild(el); }

  if (acc.success) {
    el.className = 'acc-card success';
    var avatarHtml = acc.uName
      ? '<img src="https://ui-avatars.com/api/?name=' + encodeURIComponent(acc.fullName || acc.uName) + '&background=e1306c&color=fff&size=64" />'
      : '👤';

    var badges =
      (acc.checkpointResolved ? '<span class="badge b-active">✅ Actif</span>' : '<span class="badge b-suspend">⚠️ Vérifié?</span>') +
      (acc.photo   ? '<span class="badge b-photo">📷 Photo</span>' : '') +
      (acc.loggedIn? '<span class="badge b-login">🔑 Connecté</span>' : '') +
      '<span class="badge b-email">' + (acc.emailService || 'email') + '</span>';

    el.innerHTML =
      '<div class="acc-header">' +
        '<span class="acc-num">Compte #' + acc.index + '</span>' +
        '<span class="acc-status ok">✅ Créé</span>' +
      '</div>' +
      '<div class="acc-avatar">' + avatarHtml + '</div>' +
      '<div class="acc-username">@' + (acc.uName || '') + '</div>' +
      '<div class="acc-name">' + (acc.fullName || '') + '</div>' +
      '<div class="acc-fields">' +
        '<div class="acc-field"><span class="acc-field-lbl">📧 Email</span><span class="acc-field-val">' + (acc.email || '') + '</span><button class="copy-btn" onclick="cp(\'' + (acc.email || '').replace(/'/g,"\\'") + '\')">Copier</button></div>' +
        '<div class="acc-field"><span class="acc-field-lbl">🔒 Mdp</span><span class="acc-field-val">' + (acc.password || '') + '</span><button class="copy-btn" onclick="cp(\'' + (acc.password || '').replace(/'/g,"\\'") + '\')">Copier</button></div>' +
        '<div class="acc-field"><span class="acc-field-lbl">👤 User</span><span class="acc-field-val">@' + (acc.uName || '') + '</span><button class="copy-btn" onclick="cp(\'' + (acc.uName || '').replace(/'/g,"\\'") + '\')">Copier</button></div>' +
      '</div>' +
      '<div class="acc-badges">' + badges + '</div>';
  } else {
    el.className = 'acc-card error';
    el.innerHTML =
      '<div class="acc-header">' +
        '<span class="acc-num">Compte #' + acc.index + '</span>' +
        '<span class="acc-status err">❌ Échec</span>' +
      '</div>' +
      '<div class="acc-avatar">❌</div>' +
      '<div style="font-size:.82rem;color:#f87171;text-align:center;margin-top:8px;padding:0 4px">' + (acc.error || 'Erreur inconnue') + '</div>';
  }
}

async function pollSession() {
  if (!sessionId) return;
  try {
    var d = await fetch('/api/session/' + sessionId).then(r => r.json());

    // Nouveaux logs
    var newLogs = d.logs.slice(lastLog);
    newLogs.forEach(function(m) { log(m); });
    lastLog = d.logs.length;

    // Progression
    var pct = d.total > 0 ? Math.round(d.done / d.total * 100) : 0;
    document.getElementById('pbar').style.width = pct + '%';
    document.getElementById('prog-txt').textContent = d.done + '/' + d.total;
    document.getElementById('cnt-left').textContent = d.total - d.done;

    var ok   = d.accounts.filter(function(a){ return a.success; }).length;
    var fail = d.accounts.filter(function(a){ return !a.success; }).length;
    document.getElementById('cnt-ok').textContent   = ok;
    document.getElementById('cnt-fail').textContent = fail;

    // Render nouveaux comptes
    d.accounts.forEach(function(acc) {
      if (!renderedIds[acc.index]) {
        renderAccount(acc);
        renderedIds[acc.index] = true;
        allAccounts = d.accounts;
      }
    });

    if (!d.running) {
      clearInterval(pollTimer);
      document.getElementById('btn-launch').disabled = false;
      document.getElementById('live-dot').style.display = 'none';
      document.getElementById('btn-export').style.display = ok > 0 ? 'block' : 'none';
      log('✅ Terminé ! ' + ok + '/' + d.total + ' comptes créés.');
    }
  } catch(e) {}
}

function cp(txt) {
  if (navigator.clipboard) { navigator.clipboard.writeText(txt).catch(function(){}); return; }
  var t = document.createElement('textarea');
  t.value = txt; document.body.appendChild(t); t.select();
  document.execCommand('copy'); document.body.removeChild(t);
}

function exportResults() {
  var lines = allAccounts.filter(function(a){ return a.success; }).map(function(a){
    return 'User: @' + a.uName + ' | Email: ' + a.email + ' | Pass: ' + a.password + ' | Nom: ' + a.fullName + ' | Service: ' + (a.emailService||'?');
  });
  var blob = new Blob([lines.join('\\n')], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'comptes_' + Date.now() + '.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

checkTor();
</script>
</body></html>`;

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(UI_HTML);
});

app.listen(PORT, '0.0.0.0', () => slog('🌐 Port ' + PORT));
(async () => {
    slog('🤖 Bot Instagram prêt sur le port ' + PORT);
    await checkLicense();
    await checkTor();
})();
