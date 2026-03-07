const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const express = require('express');
const fs = require('fs');
const fetch = require('node-fetch');
const { generatingName, username } = require('./accountInfoGenerator');

// ─── FAKE MAIL API ────────────────────────────────────────────────────────────
async function getFakeMail() {
    try {
        const res  = await fetch('https://doux.gleeze.com/tempmail/gen', { timeout: 10000 });
        const data = await res.json();
        if (data && data.email && data.token) {
            global._mailToken = data.token;
            global._mailEmail = data.email;
            console.log("════════════════════════════════════════");
            console.log("📧 EMAIL : " + data.email);
            console.log("🔑 TOKEN : " + data.token);
            console.log("════════════════════════════════════════");
            return data.email;
        }
    } catch(e) { console.log("⚠️ API mail : " + e.message); }
    const fb = "user" + Math.floor(Math.random()*99999) + "@guerrillamail.com";
    console.log("📧 Fallback : " + fb);
    return fb;
}

async function getCodeFromMail() {
    if (!global._mailToken) return "";
    for (let i = 1; i <= 12; i++) {
        try {
            const res  = await fetch(`https://doux.gleeze.com/tempmail/inbox?token=${encodeURIComponent(global._mailToken)}`, { timeout: 10000 });
            const data = await res.json();
            console.log(`   📬 Tentative ${i} : ${data.answer ? data.answer.length : 0} email(s)`);
            if (data.answer && data.answer.length > 0) {
                for (let m of data.answer) {
                    const txt = (m.subject||"") + " " + (m.intro||"");
                    const match = txt.match(/\b(\d{6})\b/);
                    if (match) { console.log("   ✅ Code : " + match[1]); return match[1]; }
                }
            }
        } catch(e) {}
        await sleep(5000);
    }
    return "";
}

// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────────
let state = {
    status: 'starting',
    email: '', password: 'Azerty12345!', fullName: '', uName: '', token: '',
    screenshot: '',
    confirmCode: ''
};
let browserRef = null;

// ─── SERVEUR EXPRESS ──────────────────────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {

    // ── Saisie de la date ─────────────────────────────────────────────────────
    if (state.status === 'ready_for_date') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#f0f2f5;min-height:100vh}
    .header{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:17px;font-weight:bold}
    .container{max-width:460px;margin:0 auto;padding:12px}
    .card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .info-row{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:14px;border-bottom:1px solid #f0f0f0}
    .info-row:last-child{border:none}
    .info-label{color:#888;width:90px;flex-shrink:0}
    .info-val{color:#222;font-weight:bold;word-break:break-all}
    .date-title{font-size:15px;font-weight:bold;color:#333;margin-bottom:12px}
    .date-row{display:flex;gap:8px}
    .date-col{flex:1;text-align:center}
    .date-col label{display:block;font-size:11px;font-weight:bold;color:#888;margin-bottom:4px;text-transform:uppercase}
    select{width:100%;padding:12px 4px;border:2px solid #e0e0e0;border-radius:10px;font-size:16px;background:#fff;text-align:center;cursor:pointer;transition:border-color .2s}
    select:focus{border-color:#e1306c;outline:none}
    .btn{width:100%;padding:16px;background:linear-gradient(135deg,#0095f6,#0074cc);color:#fff;border:none;border-radius:12px;font-size:18px;font-weight:bold;cursor:pointer;margin-top:4px;transition:opacity .2s}
    .btn:disabled{opacity:.5}
    .status{text-align:center;font-size:14px;padding:8px;min-height:22px;border-radius:8px;margin-top:8px}
    .status.ok{background:#d4edda;color:#155724}
    .status.err{background:#f8d7da;color:#721c24}
    .status.wait{background:#fff3cd;color:#856404}
    .screenshot{width:100%;border-radius:10px;border:1px solid #eee;display:block}
    .screen-label{font-size:12px;color:#888;text-align:center;margin:6px 0 4px}
  </style>
</head>
<body>
  <div class="header">🤖 Bot Instagram — Choisis la date</div>
  <div class="container">

    <div class="card">
      <div class="info-row"><span class="info-label">📧 Email</span><span class="info-val">${state.email}</span></div>
      <div class="info-row"><span class="info-label">🔒 Password</span><span class="info-val">${state.password}</span></div>
      <div class="info-row"><span class="info-label">🏷️ Nom</span><span class="info-val">${state.fullName}</span></div>
      <div class="info-row"><span class="info-label">👤 Username</span><span class="info-val">${state.uName}</span></div>
    </div>

    <div class="card">
      <div class="date-title">🎂 Date de naissance</div>
      <div class="date-row">
        <div class="date-col">
          <label>Mois</label>
          <select id="selMonth">
            <option value="">--</option>
            <option value="1">Janvier</option><option value="2">Février</option>
            <option value="3">Mars</option><option value="4">Avril</option>
            <option value="5">Mai</option><option value="6">Juin</option>
            <option value="7">Juillet</option><option value="8">Août</option>
            <option value="9">Septembre</option><option value="10">Octobre</option>
            <option value="11">Novembre</option><option value="12">Décembre</option>
          </select>
        </div>
        <div class="date-col">
          <label>Jour</label>
          <select id="selDay">
            <option value="">--</option>
            ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
          </select>
        </div>
        <div class="date-col">
          <label>Année</label>
          <select id="selYear">
            <option value="">--</option>
            ${Array.from({length:80},(_,i)=>`<option value="${2006-i}">${2006-i}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn" id="btnCreate" onclick="go()">🚀 Créer le compte !</button>
      <div class="status wait" id="statusMsg">Choisis le mois, le jour et l'année</div>
    </div>

    <div class="card">
      <div class="screen-label">📸 Vue en direct (rafraîchissement auto)</div>
      <img id="liveImg" class="screenshot" src="/screenshot?t=0" alt="Instagram">
    </div>
  </div>

  <script>
    // Rafraîchir screenshot toutes les 2s
    setInterval(() => {
      const img = document.getElementById('liveImg');
      img.src = '/screenshot?t=' + Date.now();
    }, 2000);

    async function go() {
      const m = document.getElementById('selMonth').value;
      const d = document.getElementById('selDay').value;
      const y = document.getElementById('selYear').value;
      const st = document.getElementById('statusMsg');
      if (!m || !d || !y) {
        st.className = 'status err';
        st.textContent = '⚠️ Choisis le mois, le jour ET l\\'année !';
        return;
      }
      document.getElementById('btnCreate').disabled = true;
      st.className = 'status wait';
      st.textContent = '⏳ Injection en cours...';
      try {
        const r = await fetch('/inject-date-and-submit', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({month:m, day:d, year:y})
        });
        const data = await r.json();
        if (data.ok) {
          st.className = 'status ok';
          st.textContent = data.msg;
          setTimeout(() => location.href = '/', 2000);
        } else {
          st.className = 'status err';
          st.textContent = data.msg;
          document.getElementById('btnCreate').disabled = false;
        }
      } catch(e) {
        st.className = 'status err';
        st.textContent = '⚠️ Erreur réseau';
        document.getElementById('btnCreate').disabled = false;
      }
    }
  </script>
</body></html>`);

    // ── Page bouton Submit ───────────────────────────────────────────────────
    } else if (state.status === 'ready_for_submit') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bot Instagram - Submit</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#f0f2f5;min-height:100vh}
    .header{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:17px;font-weight:bold}
    .container{max-width:460px;margin:0 auto;padding:12px}
    .card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .info-row{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:14px;border-bottom:1px solid #f0f0f0}
    .info-row:last-child{border:none}
    .info-label{color:#888;width:90px;flex-shrink:0}
    .info-val{color:#222;font-weight:bold;word-break:break-all}
    .btn{width:100%;padding:18px;background:linear-gradient(135deg,#28a745,#20c997);color:#fff;border:none;border-radius:12px;font-size:20px;font-weight:bold;cursor:pointer;margin-top:4px}
    .btn:disabled{opacity:.5}
    .status{text-align:center;font-size:14px;padding:8px;min-height:22px;border-radius:8px;margin-top:8px}
    .status.ok{background:#d4edda;color:#155724}
    .status.err{background:#f8d7da;color:#721c24}
    .status.wait{background:#fff3cd;color:#856404}
    .screenshot{width:100%;border-radius:10px;border:1px solid #eee;display:block}
    .screen-label{font-size:12px;color:#888;text-align:center;margin:6px 0 4px}
  </style>
</head>
<body>
  <div class="header">🤖 Tout est prêt — Clique Submit !</div>
  <div class="container">
    <div class="card">
      <div class="info-row"><span class="info-label">📧 Email</span><span class="info-val">${state.email}</span></div>
      <div class="info-row"><span class="info-label">🔒 Password</span><span class="info-val">${state.password}</span></div>
      <div class="info-row"><span class="info-label">🏷️ Nom</span><span class="info-val">${state.fullName}</span></div>
      <div class="info-row"><span class="info-label">👤 Username</span><span class="info-val">${state.uName}</span></div>
      <div class="info-row"><span class="info-label">🎂 Date</span><span class="info-val">${state.birthDate||'—'}</span></div>
    </div>
    <div class="card">
      <button class="btn" id="btnSubmit" onclick="doSubmit()">🚀 Soumettre le formulaire !</button>
      <div class="status wait" id="statusMsg">Formulaire prêt — clique pour créer le compte</div>
    </div>
    <div class="card">
      <div class="screen-label">📸 Vue en direct</div>
      <img id="liveImg" class="screenshot" src="/screenshot?t=0" alt="Instagram">
    </div>
  </div>
  <script>
    setInterval(() => { document.getElementById('liveImg').src = '/screenshot?t=' + Date.now(); }, 2000);
    async function doSubmit() {
      document.getElementById('btnSubmit').disabled = true;
      const st = document.getElementById('statusMsg');
      st.className = 'status wait';
      st.textContent = '⏳ Clic Submit en cours...';
      try {
        const r = await fetch('/do-submit', {method:'POST', headers:{'Content-Type':'application/json'}});
        const data = await r.json();
        if (data.ok) {
          st.className = 'status ok';
          st.textContent = data.msg;
          setTimeout(() => location.href = '/', 2000);
        } else {
          st.className = 'status err';
          st.textContent = data.msg;
          document.getElementById('btnSubmit').disabled = false;
        }
      } catch(e) {
        st.className = 'status err';
        st.textContent = '⚠️ Erreur réseau';
        document.getElementById('btnSubmit').disabled = false;
      }
    }
  </script>
</body></html>`);

    // ── Code de confirmation ──────────────────────────────────────────────────
    } else if (state.status === 'waiting_code') {
        res.send(`<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code Instagram</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial;background:#f0f2f5;min-height:100vh}
  .header{background:linear-gradient(135deg,#e1306c,#f77737);color:#fff;padding:14px;text-align:center;font-size:17px;font-weight:bold}
  .container{max-width:460px;margin:0 auto;padding:12px}
  .card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .token{background:#1a1a2e;color:#00ff88;border-radius:8px;padding:10px;font-family:monospace;font-size:10px;word-break:break-all;margin:10px 0}
  input[type=number]{width:100%;padding:16px;font-size:28px;text-align:center;letter-spacing:10px;border:2px solid #e0e0e0;border-radius:10px;margin:10px 0;-moz-appearance:textfield}
  input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none}
  input:focus{border-color:#e1306c;outline:none}
  .btn{width:100%;padding:14px;background:linear-gradient(135deg,#0095f6,#0074cc);color:#fff;border:none;border-radius:12px;font-size:17px;font-weight:bold;cursor:pointer}
  .screenshot{width:100%;border-radius:10px;border:1px solid #eee}
  p{margin:6px 0;font-size:14px;color:#444}
</style></head>
<body>
  <div class="header">📧 Code de confirmation</div>
  <div class="container">
    <div class="card">
      <p>📧 Email : <strong>${state.email}</strong></p>
      <p>Le bot récupère le code automatiquement.<br>Si rien dans 1 min, entre-le ici :</p>
      <p style="margin-top:10px;font-size:13px;color:#888">🔑 Token pour accéder aux emails :</p>
      <div class="token">${state.token}</div>
      <code style="font-size:11px;color:#666;word-break:break-all">curl "https://doux.gleeze.com/tempmail/inbox?token=TOKEN_CI_DESSUS"</code>
    </div>
    <div class="card">
      <form action="/submit-code" method="POST">
        <input type="number" name="code" placeholder="000000" autofocus>
        <button class="btn">✅ Valider le code</button>
      </form>
    </div>
    <div class="card">
      <img class="screenshot" src="/screenshot?t=${Date.now()}" alt="Instagram">
    </div>
  </div>
</body></html>`);

    // ── Succès ────────────────────────────────────────────────────────────────
    } else if (state.status === 'done') {
        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial;background:#f0f2f5;min-height:100vh">
  <div style="background:linear-gradient(135deg,#28a745,#20c997);color:#fff;padding:20px;text-align:center;font-size:20px;font-weight:bold">
    🎉 Compte Instagram créé !
  </div>
  <div style="max-width:460px;margin:20px auto;padding:0 12px">
    <div style="background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
      <p style="margin:8px 0;font-size:16px">📧 <b>Email :</b> <span style="color:#0095f6">${state.email}</span></p>
      <p style="margin:8px 0;font-size:16px">🔒 <b>Mot de passe :</b> ${state.password}</p>
      <p style="margin:8px 0;font-size:16px">👤 <b>Username :</b> @${state.uName}</p>
      <p style="margin:8px 0;font-size:16px">🏷️ <b>Nom :</b> ${state.fullName}</p>
    </div>
    <p style="text-align:center;color:#666;margin-top:15px;font-size:14px">💾 Sauvegarde ces informations !</p>
  </div>
</body></html>`);

    // ── Erreur ────────────────────────────────────────────────────────────────
    } else if (state.status === 'error') {
        res.send(`<body style="font-family:Arial;padding:20px"><h2 style="color:red">❌ ${state.errorMsg}</h2><img src="/screenshot" style="width:100%;border-radius:8px"></body>`);

    // ── Chargement ────────────────────────────────────────────────────────────
    } else {
        res.send(`<body style="font-family:Arial;text-align:center;padding:60px;background:#f0f2f5">
  <h2 style="color:#0095f6">⏳ ${state.status}...</h2>
  <p style="color:#666;margin-top:10px">Le bot initialise le formulaire Instagram</p>
  <meta http-equiv="refresh" content="2">
</body>`);
    }
});

// Screenshot live
app.get('/screenshot', (req, res) => {
    if (state.screenshot) {
        res.set('Content-Type','image/png');
        res.set('Cache-Control','no-cache,no-store');
        res.send(Buffer.from(state.screenshot, 'base64'));
    } else { res.status(404).send(''); }
});

// ✅ Injection date + submit (avec scroll pour trouver le bouton)
// ✅ Injection date via querySelector direct + React native setter
// ✅ Injection date — essaie toutes les formes possibles
// ✅ Injection date via clic sur les vrais dropdowns React Instagram
// ✅ Injection date via clic Selenium sur les vrais composants React
app.post('/inject-date-and-submit', async (req, res) => {
    const { month, day, year } = req.body;
    const monthNum = parseInt(month);
    const dayNum   = parseInt(day);
    const yearNum  = parseInt(year);

    const months_en = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const months_fr = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const targetMonth = months_en[monthNum - 1];
    const targetMonthFr = months_fr[monthNum - 1];

    console.log(`📅 Clic date : ${targetMonth} ${dayNum} ${yearNum}`);

    try {
        if (!browserRef) return res.json({ ok:false, msg:'❌ Browser non dispo' });

        // D'abord inspecter les vrais éléments Birthday dans le DOM
        const domInfo = await browserRef.executeScript(`
            // Chercher par aria-label ou role="combobox" ou role="listbox"
            var combos = Array.from(document.querySelectorAll('[role="combobox"],[role="listbox"],[aria-label*="Month"],[aria-label*="Day"],[aria-label*="Year"],[aria-label*="Mois"],[aria-label*="Jour"],[aria-label*="Année"]'));
            // Chercher le label Birthday et ses éléments enfants
            var labels = Array.from(document.querySelectorAll('label,span,div')).filter(function(el){
                return el.textContent.trim() === 'Birthday' || el.textContent.trim() === 'Anniversaire';
            });
            // Chercher tous les éléments avec tabindex dans la zone Birthday
            var tabEls = Array.from(document.querySelectorAll('[tabindex]')).filter(function(el){
                return el.tagName !== 'INPUT' && el.tagName !== 'BUTTON' && el.tagName !== 'SELECT' && el.tagName !== 'A';
            }).map(function(el){
                var r = el.getBoundingClientRect();
                return { tag:el.tagName, aria:el.getAttribute('aria-label'), role:el.getAttribute('role'), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), text:el.textContent.trim().substring(0,30) };
            }).filter(function(el){ return el.w > 50 && el.h > 20 && el.y > 100 && el.y < 600; });

            return {
                combos: combos.map(function(el){
                    var r = el.getBoundingClientRect();
                    return { aria:el.getAttribute('aria-label'), role:el.getAttribute('role'), x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), text:el.textContent.trim().substring(0,20) };
                }),
                tabEls: tabEls
            };
        `);
        console.log(`   Combos : ${JSON.stringify(domInfo.combos)}`);
        console.log(`   TabEls : ${JSON.stringify(domInfo.tabEls)}`);

        // Trouver les dropdowns Month/Day/Year via leur aria-label
        let monthEl = null, dayEl = null, yearEl = null;

        const allCombos = domInfo.combos || [];
        for (let el of allCombos) {
            if (/month|mois/i.test(el.aria)) monthEl = el;
            else if (/day|jour/i.test(el.aria)) dayEl = el;
            else if (/year|ann/i.test(el.aria)) yearEl = el;
        }

        // Si pas trouvé via aria, utiliser les tabEls positionnés (les 3 dropdowns sont côte à côte)
        if (!monthEl || !dayEl || !yearEl) {
            const tabEls = (domInfo.tabEls || []).filter(el => el.w > 80 && el.h > 30);
            // Trier par x pour avoir Month (gauche), Day (milieu), Year (droite)
            tabEls.sort((a, b) => a.x - b.x);
            if (tabEls.length >= 3) {
                if (!monthEl) monthEl = tabEls[0];
                if (!dayEl)   dayEl   = tabEls[1];
                if (!yearEl)  yearEl  = tabEls[2];
            }
        }

        console.log(`   Month@(${monthEl?.x},${monthEl?.y}) Day@(${dayEl?.x},${dayEl?.y}) Year@(${yearEl?.x},${yearEl?.y})`);

        if (!monthEl || !dayEl || !yearEl) {
            return res.json({ ok:false, msg:`❌ Dropdowns introuvables. Combos:${allCombos.length}` });
        }

        // Fonction pour cliquer sur un dropdown et sélectionner une option
        async function clickDropdownAndSelect(dropX, dropY, optionText) {
            // Cliquer sur le dropdown pour l'ouvrir
            await browserRef.executeScript(`
                var el = document.elementFromPoint(arguments[0], arguments[1]);
                if (el) { el.click(); el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:arguments[0],clientY:arguments[1]})); }
            `, dropX, dropY);
            await sleep(800);

            // Chercher l'option dans le menu ouvert (listbox/option)
            const selected = await browserRef.executeScript(`
                var target = arguments[0];
                var targets = [target, String(parseInt(target))];
                // Chercher dans les options du menu ouvert
                var options = Array.from(document.querySelectorAll('[role="option"],[role="listitem"],li,div[class*="option"]'));
                for (var i = 0; i < options.length; i++) {
                    var txt = options[i].textContent.trim();
                    for (var j = 0; j < targets.length; j++) {
                        if (txt === targets[j] || txt.toLowerCase() === targets[j].toLowerCase()) {
                            options[i].scrollIntoView({block:'center'});
                            options[i].click();
                            return txt;
                        }
                    }
                }
                // Si pas de menu ouvert, essayer le select natif juste après le clic
                return null;
            `, String(optionText));

            if (!selected) {
                // Peut-être que c'est un vrai select natif qui s'est ouvert — utiliser sendKeys
                try {
                    const { Key } = require('selenium-webdriver');
                    const el = await browserRef.findElement(By.css(':focus'));
                    if (el) {
                        await el.sendKeys(String(optionText).charAt(0));
                        await sleep(300);
                    }
                } catch(e) {}
            }
            await sleep(500);
            return selected;
        }

        // Cliquer Month
        let mRes = await clickDropdownAndSelect(monthEl.x, monthEl.y, targetMonth);
        if (!mRes) mRes = await clickDropdownAndSelect(monthEl.x, monthEl.y, targetMonthFr);
        console.log(`   Month cliqué : "${mRes}"`);
        await sleep(300);

        // Cliquer Day
        let dRes = await clickDropdownAndSelect(dayEl.x, dayEl.y, String(dayNum));
        console.log(`   Day cliqué : "${dRes}"`);
        await sleep(300);

        // Cliquer Year
        let yRes = await clickDropdownAndSelect(yearEl.x, yearEl.y, String(yearNum));
        console.log(`   Year cliqué : "${yRes}"`);
        await sleep(800);

        state.screenshot = await browserRef.takeScreenshot();

        // ── SCROLL BAS + CLIC SUBMIT ─────────────────────────────────────────
        // Scroller tout en bas de la page pour faire apparaître le bouton Submit
        await browserRef.executeScript("window.scrollTo(0, document.body.scrollHeight);");
        await sleep(1000);
        state.screenshot = await browserRef.takeScreenshot();

        let submitOk = false;
        for (let si = 0; si < 6; si++) {
            // Scroller encore pour s'assurer que le bouton est visible
            await browserRef.executeScript("window.scrollTo(0, document.body.scrollHeight);");
            await sleep(500);

            // Trouver le bouton Submit via Selenium (type=submit ou texte "Submit")
            let submitBtn = null;
            try {
                submitBtn = await browserRef.findElement(By.xpath("//button[@type='submit']"));
            } catch(e) {}
            if (!submitBtn) {
                try {
                    submitBtn = await browserRef.findElement(By.xpath("//button[normalize-space(text())='Submit' or normalize-space(text())='Next' or normalize-space(text())='Sign up']"));
                } catch(e) {}
            }
            if (!submitBtn) {
                // Dernier bouton dans le DOM
                const allBtns = await browserRef.findElements(By.tagName('button'));
                if (allBtns.length > 0) submitBtn = allBtns[allBtns.length - 1];
            }

            if (submitBtn) {
                // Supprimer disabled
                await browserRef.executeScript("arguments[0].removeAttribute('disabled'); arguments[0].removeAttribute('aria-disabled');", submitBtn);
                // Scroller vers le bouton et attendre
                await browserRef.executeScript("arguments[0].scrollIntoView({block:'end',behavior:'instant'});", submitBtn);
                await sleep(800);
                state.screenshot = await browserRef.takeScreenshot();

                // Obtenir les coordonnées réelles du bouton
                const rect = await browserRef.executeScript(
                    "var r=arguments[0].getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), w:Math.round(r.width), h:Math.round(r.height)};",
                    submitBtn
                );
                console.log(`   Bouton coords : ${JSON.stringify(rect)}`);

                // Méthode 1 : Selenium Actions (clic physique aux coordonnées)
                try {
                    const { Builder, By: B, Key, until } = require('selenium-webdriver');
                    await browserRef.actions().move({x: rect.x, y: rect.y}).click().perform();
                    console.log(`   ✅ Clic Actions (${rect.x},${rect.y})`);
                } catch(e1) {
                    // Méthode 2 : Selenium click direct
                    try {
                        await submitBtn.click();
                        console.log(`   ✅ Clic Selenium direct`);
                    } catch(e2) {
                        // Méthode 3 : JS click avec dispatchEvent
                        await browserRef.executeScript(`
                            var el = arguments[0];
                            var x = arguments[1], y = arguments[2];
                            el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, clientX:x, clientY:y, button:0}));
                            el.dispatchEvent(new MouseEvent('mouseup',   {bubbles:true, cancelable:true, clientX:x, clientY:y, button:0}));
                            el.dispatchEvent(new MouseEvent('click',     {bubbles:true, cancelable:true, clientX:x, clientY:y, button:0}));
                            el.click();
                        `, submitBtn, rect.x, rect.y);
                        console.log(`   ✅ Clic JS mousedown/up/click`);
                    }
                }
            } else {
                console.log(`   Essai ${si+1} : aucun bouton trouvé`);
            }

            await sleep(3000);
            const url = await browserRef.getCurrentUrl();
            console.log(`   URL essai ${si+1} : ${url}`);
            state.screenshot = await browserRef.takeScreenshot();

            if (!url.includes('emailsignup')) {
                submitOk = true;
                console.log("✅ Page changée — Submit réussi !");
                break;
            }
            // Vérifier si champ code apparu sur la même page
            try {
                await browserRef.findElement(By.xpath("//input[@inputmode='numeric' or @name='confirmationCode' or @autocomplete='one-time-code']"));
                submitOk = true;
                console.log("✅ Champ code apparu !");
                break;
            } catch(e) {}
        }

        if (submitOk) {
            state.status = 'waiting_code';
            res.json({ ok:true, msg:'✅ Submit réussi ! En attente du code...' });
        } else {
            // Submit auto échoué → l'utilisateur clique manuellement
            state.status = 'ready_for_submit';
            res.json({ ok:true, msg:'⚠️ Clique sur "Soumettre" dans la prochaine page !' });
        }

    } catch(e) {
        console.error("❌ inject : " + e.message);
        res.json({ ok:false, msg:'❌ ' + e.message });
    }
});

// Route /do-submit — clic manuel sur le bouton Submit Instagram
app.post('/do-submit', async (req, res) => {
    try {
        if (!browserRef) return res.json({ ok:false, msg:'❌ Browser non dispo' });

        let clicked = false;
        for (let si = 0; si < 5; si++) {
            // Scroll en bas
            await browserRef.executeScript("window.scrollTo(0, document.body.scrollHeight);");
            await sleep(600);

            // Trouver bouton Submit
            let submitBtn = null;
            try { submitBtn = await browserRef.findElement(By.xpath("//button[@type='submit']")); } catch(e) {}
            if (!submitBtn) {
                try { submitBtn = await browserRef.findElement(By.xpath("//button[normalize-space(.)='Submit' or normalize-space(.)='Next']")); } catch(e) {}
            }
            if (!submitBtn) {
                const btns = await browserRef.findElements(By.tagName('button'));
                if (btns.length > 0) submitBtn = btns[btns.length - 1];
            }

            if (submitBtn) {
                await browserRef.executeScript("arguments[0].removeAttribute('disabled'); arguments[0].scrollIntoView({block:'center',behavior:'instant'});", submitBtn);
                await sleep(500);
                // Clic via Actions (le plus fiable)
                try {
                    await browserRef.actions({async: true}).move({origin: submitBtn}).click().perform();
                    console.log(`   ✅ do-submit Actions clic (essai ${si+1})`);
                } catch(e) {
                    await browserRef.executeScript("arguments[0].click();", submitBtn);
                    console.log(`   ✅ do-submit JS clic (essai ${si+1})`);
                }
                clicked = true;
                await sleep(3000);
                state.screenshot = await browserRef.takeScreenshot();
                const url = await browserRef.getCurrentUrl();
                console.log(`   URL : ${url}`);
                if (!url.includes('emailsignup')) {
                    state.status = 'waiting_code';
                    return res.json({ ok:true, msg:'✅ Compte soumis ! En attente du code...' });
                }
                // Vérifier champ code sur même page
                try {
                    await browserRef.findElement(By.xpath("//input[@inputmode='numeric' or @name='confirmationCode']"));
                    state.status = 'waiting_code';
                    return res.json({ ok:true, msg:'✅ Code demandé !' });
                } catch(e) {}
            }
            await sleep(1000);
        }
        if (clicked) {
            state.status = 'waiting_code';
            res.json({ ok:true, msg:'⚠️ Submit cliqué — vérifie le screenshot' });
        } else {
            res.json({ ok:false, msg:'❌ Bouton Submit introuvable' });
        }
    } catch(e) {
        console.error("❌ do-submit : " + e.message);
        res.json({ ok:false, msg:'❌ ' + e.message });
    }
});

// Code manuel
app.post('/submit-code', (req, res) => {
    state.confirmCode = req.body.code;
    console.log("🔑 Code manuel : " + state.confirmCode);
    res.send(`<body style="font-family:Arial;text-align:center;padding:40px"><h2 style="color:green">✅ Code reçu !</h2><meta http-equiv="refresh" content="2;url=/"></body>`);
});

app.get('/debug-image', (req, res) => {
    if (fs.existsSync('error_screenshot.png')) res.sendFile(path.join(process.cwd(), 'error_screenshot.png'));
    else res.send('Pas de screenshot');
});

app.listen(port, '0.0.0.0', () => console.log(`🌐 Port ${port}`));

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function humanType(el, text) {
    for (let c of text) { await el.sendKeys(c); await sleep(Math.random()*30+15); }
}
async function fillReact(browser, el, val) {
    await browser.executeScript(`
        var e=arguments[0],v=arguments[1];
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(e,v);
        ['input','change','blur'].forEach(function(n){ e.dispatchEvent(new Event(n,{bubbles:true})); });
    `, el, val);
    await sleep(200);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async function main() {
    const chromePath = path.join(process.cwd(), 'chrome-linux64/chrome');
    const driverPath = path.join(process.cwd(), 'chromedriver-linux64/chromedriver');
    const service = new chrome.ServiceBuilder(driverPath);
    const opts = new chrome.Options();
    opts.setChromeBinaryPath(chromePath);
    opts.addArguments('--headless=new','--no-sandbox','--disable-dev-shm-usage',
        '--window-size=1280,900','--disable-blink-features=AutomationControlled','--lang=en-US,en');
    opts.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    opts.setUserPreferences({'intl.accept_languages':'en-US,en'});

    let browser = await new Builder().forBrowser('chrome').setChromeOptions(opts).setChromeService(service).build();
    browserRef = browser;

    // Screenshot en continu toutes les 2s
    const liveLoop = setInterval(async () => {
        try { state.screenshot = await browser.takeScreenshot(); }
        catch(e) { clearInterval(liveLoop); }
    }, 2000);

    try {
        // ── 1. SETUP ──────────────────────────────────────────────────────────
        let mail = await getFakeMail();
        state.email    = mail;
        state.token    = global._mailToken || '';
        state.fullName = generatingName();
        state.uName    = username();
        state.status   = 'loading';
        console.log(`👤 Nom: "${state.fullName}" | Username: "${state.uName}"`);

        // ── 2. OUVRIR INSTAGRAM ───────────────────────────────────────────────
        console.log("🌍 Ouverture Instagram...");
        await browser.get("https://www.instagram.com/accounts/emailsignup/");
        await sleep(6000);

        // Cookie popup
        try {
            let btn = await browser.findElement(By.xpath("//button[contains(.,'Allow') or contains(.,'Accept') or contains(.,'Accepter') or contains(.,'Tout autoriser')]"));
            await btn.click(); await sleep(1500);
        } catch(e) {}

        // ── 3. EMAIL ──────────────────────────────────────────────────────────
        console.log("✍️ Email...");
        let inputs = await browser.findElements(By.tagName("input"));
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "email" || t === "tel") {
                await browser.executeScript("arguments[0].click();arguments[0].focus();", inp);
                await sleep(300);
                await humanType(inp, mail);
                await fillReact(browser, inp, mail);
                console.log("✅ Email : " + mail);
                break;
            }
        }
        await sleep(500);

        // ── 4. PASSWORD ───────────────────────────────────────────────────────
        console.log("🔒 Password...");
        inputs = await browser.findElements(By.tagName("input"));
        for (let inp of inputs) {
            let t = await inp.getAttribute("type");
            if (t === "password") {
                await browser.executeScript("arguments[0].click();arguments[0].focus();", inp);
                await sleep(200);
                await humanType(inp, state.password);
                await fillReact(browser, inp, state.password);
                // Blur fort pour déclencher l'apparition des selects
                await browser.executeScript(`
                    arguments[0].blur();
                    document.body.click();
                    document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));
                `, inp);
                await sleep(3000); // Attendre que les selects apparaissent
                console.log("✅ Password saisi");
                break;
            }
        }

        // ── 5. VÉRIFIER QUE LES SELECTS SONT LÀ ──────────────────────────────
        let selects = await browser.findElements(By.tagName("select"));
        console.log(`   ${selects.length} select(s) après password blur`);
        if (selects.length < 3) {
            // Attendre encore
            for (let i = 0; i < 5; i++) {
                await sleep(2000);
                selects = await browser.findElements(By.tagName("select"));
                console.log(`   Attente selects ${i+1}/5 : ${selects.length}`);
                if (selects.length >= 3) break;
            }
        }

        // ── 6. NOM & USERNAME ─────────────────────────────────────────────────
        console.log("👤 Nom & Username...");
        let allInputs = await browser.findElements(By.tagName("input"));
        let textInputs = [];
        for (let inp of allInputs) {
            let t = await inp.getAttribute("type");
            if (t === "text" || t === "search") textInputs.push(inp);
        }
        console.log(`   ${textInputs.length} input(s) texte`);

        if (textInputs.length >= 2) {
            let nameInp = textInputs[textInputs.length - 2];
            await browser.executeScript("arguments[0].click();arguments[0].focus();", nameInp);
            await sleep(200);
            await humanType(nameInp, state.fullName);
            await fillReact(browser, nameInp, state.fullName);
            console.log("✅ Nom : " + state.fullName);
            await sleep(400);
        }

        // Saisir le username et vérifier qu'il est disponible (pas d'erreur rouge)
        if (textInputs.length >= 1) {
            let userInp = textInputs[textInputs.length - 1];
            let usernameOk = false;
            for (let attempt = 0; attempt < 8; attempt++) {
                // Générer un nouveau username si ce n'est pas le premier essai
                if (attempt > 0) {
                    const { username: genUsername } = require('./accountInfoGenerator');
                    state.uName = genUsername();
                    console.log(`   🔄 Nouveau username (essai ${attempt+1}) : ${state.uName}`);
                }
                // Vider et remplir le champ
                await browser.executeScript("arguments[0].click();arguments[0].focus();", userInp);
                await sleep(150);
                await browser.executeScript(`
                    var e=arguments[0];
                    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(e,'');
                    e.dispatchEvent(new Event('input',{bubbles:true}));
                `, userInp);
                await sleep(100);
                await humanType(userInp, state.uName);
                await fillReact(browser, userInp, state.uName);
                await sleep(1500); // Attendre la vérification Instagram
                // Vérifier s'il y a une erreur "not available"
                const hasError = await browser.executeScript(`
                    var errs = Array.from(document.querySelectorAll('p,span,div'));
                    return errs.some(function(el){
                        var t = el.textContent.toLowerCase();
                        return (t.includes('not available') || t.includes('pas disponible') || t.includes('already taken') || t.includes('déjà pris')) && el.offsetHeight > 0;
                    });
                `);
                // Vérifier s'il y a un checkmark vert (username dispo)
                const hasCheck = await browser.executeScript(`
                    var checks = Array.from(document.querySelectorAll('svg,[aria-label*="check"],[aria-label*="valid"]'));
                    var inp = document.querySelector('input[aria-label="Username"]') || document.querySelectorAll('input[type="text"]')[document.querySelectorAll('input[type="text"]').length-1];
                    if (inp) {
                        var parent = inp.parentElement;
                        while(parent && parent.tagName !== 'FORM') {
                            if(parent.querySelector('svg')) return true;
                            parent = parent.parentElement;
                        }
                    }
                    return false;
                `);
                console.log(`   Username "${state.uName}" : erreur=${hasError} check=${hasCheck}`);
                if (!hasError) { usernameOk = true; break; }
            }
            console.log(`✅ Username final : ${state.uName} (ok=${usernameOk})`);
        }

        // ── 7. ATTENTE SAISIE DATE PAR L'UTILISATEUR ──────────────────────────
        console.log("🎂 En attente de la date (interface web)...");
        state.status = 'ready_for_date';

        let waited = 0;
        while (state.status === 'ready_for_date' && waited < 600) {
            await sleep(2000); waited += 2;
        }

        if (state.status !== 'waiting_code') {
            state.status = 'error'; state.errorMsg = 'Timeout : pas de réponse';
            clearInterval(liveLoop); return;
        }

        // ── 8. CODE DE VÉRIFICATION ───────────────────────────────────────────
        console.log("📬 Attente code...");
        let code = await getCodeFromMail();

        if (!code) {
            console.log("   ⏳ Attente code manuel (5 min)...");
            let w = 0;
            while (!state.confirmCode && w < 300) { await sleep(2000); w += 2; }
            code = state.confirmCode;
        }

        if (code && code.length >= 4) {
            console.log("🔑 Code : " + code);
            let codeInput = null;
            try {
                codeInput = await browser.wait(until.elementLocated(
                    By.xpath("//input[@name='confirmationCode' or @inputmode='numeric' or @autocomplete='one-time-code']")
                ), 10000);
            } catch(e) {
                let ins = await browser.findElements(By.tagName("input"));
                if (ins.length > 0) codeInput = ins[0];
            }
            if (codeInput) {
                await browser.executeScript("arguments[0].focus();", codeInput);
                await humanType(codeInput, code);
                await fillReact(browser, codeInput, code);
                await sleep(800);
                let cBtns = await browser.findElements(By.tagName("button"));
                if (cBtns.length > 0) {
                    await browser.executeScript("arguments[0].click();", cBtns[0]);
                    console.log("✅ Code soumis !");
                }
            }
        }

        await sleep(5000);
        clearInterval(liveLoop);
        try { state.screenshot = await browser.takeScreenshot(); } catch(e) {}
        state.status = 'done';

        console.log("════════════════════════════════════════");
        console.log("🎉 COMPTE CRÉÉ !");
        console.log(`   📧 Email    : ${state.email}`);
        console.log(`   🔒 Password : ${state.password}`);
        console.log(`   👤 Username : @${state.uName}`);
        console.log(`   🏷️  Nom      : ${state.fullName}`);
        console.log("════════════════════════════════════════");

    } catch(e) {
        clearInterval(liveLoop);
        console.error("❌ ERREUR : " + e.message);
        state.status = 'error'; state.errorMsg = e.message;
        try { state.screenshot = await browser.takeScreenshot(); } catch(_) {}
    } finally {
        await sleep(60000);
        await browser.quit();
    }
})();
