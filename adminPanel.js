/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          PANEL ADMIN — Système de Licences & Rapport         ║
 * ║  Deploy gratuit : Railway / Render / Vercel                  ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * PORT: 8080
 * Run: node adminPanel.js
 * 
 * ENDPOINTS:
 *   GET  /admin              → Dashboard Admin (UI)
 *   POST /admin/license/gen  → Générer une clé de licence
 *   GET  /admin/report       → Rapport JSON de tous les employés
 *   POST /api/license/check  → Vérifier une clé (appelé par le bot)
 *   POST /api/accounts/save  → Sauvegarder comptes créés + cookies
 *   GET  /api/accounts/export → Exporter tous les comptes (CSV)
 */

const express    = require('express');
const crypto     = require('crypto');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 8080;
const DB   = path.join(__dirname, 'admin_db.json');

app.use(express.json());

// ── Base de données JSON simple ───────────────────────────────────────────────
function loadDB() {
    if (!fs.existsSync(DB)) {
        fs.writeFileSync(DB, JSON.stringify({ licenses: {}, employees: {}, accounts: [] }));
    }
    return JSON.parse(fs.readFileSync(DB, 'utf8'));
}
function saveDB(data) {
    fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

// ── Générer une clé de licence unique ────────────────────────────────────────
function genLicense(employeeName, maxUses = 9999) {
    const key = 'IG-' + crypto.randomBytes(4).toString('hex').toUpperCase()
              + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const db = loadDB();
    db.licenses[key] = {
        key, employeeName,
        maxUses, uses: 0,
        active: true,
        createdAt: new Date().toISOString(),
        lastUsed: null,
    };
    if (!db.employees[employeeName]) {
        db.employees[employeeName] = { name: employeeName, totalCreated: 0, sessions: [] };
    }
    saveDB(db);
    return key;
}

// ── ADMIN : Route sécurisée (mot de passe simple) ────────────────────────────
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin1234';

function checkAdmin(req, res) {
    const pass = req.headers['x-admin-pass'] || req.query.pass;
    if (pass !== ADMIN_PASS) { res.status(401).json({ error: 'Non autorisé' }); return false; }
    return true;
}

// ── API : Vérifier licence (appelé par le bot worker) ────────────────────────
app.post('/api/license/check', (req, res) => {
    const { key, employeeName } = req.body;
    if (!key) return res.json({ valid: false, reason: 'Clé manquante' });
    const db = loadDB();
    const lic = db.licenses[key];
    if (!lic)         return res.json({ valid: false, reason: 'Clé invalide' });
    if (!lic.active)  return res.json({ valid: false, reason: 'Clé désactivée' });
    if (lic.uses >= lic.maxUses) return res.json({ valid: false, reason: 'Limite atteinte' });

    lic.uses++;
    lic.lastUsed = new Date().toISOString();
    if (employeeName) lic.employeeName = employeeName;

    // Enregistrer session
    const emp = db.employees[lic.employeeName] || { name: lic.employeeName, totalCreated: 0, sessions: [] };
    emp.sessions.push({ date: new Date().toISOString(), action: 'login' });
    db.employees[lic.employeeName] = emp;
    saveDB(db);
    res.json({ valid: true, employeeName: lic.employeeName, usesLeft: lic.maxUses - lic.uses });
});

// ── API : Sauvegarder comptes créés + cookies ─────────────────────────────────
app.post('/api/accounts/save', (req, res) => {
    const { licenseKey, accounts } = req.body;
    if (!licenseKey || !accounts) return res.json({ ok: false });
    const db = loadDB();
    const lic = db.licenses[licenseKey];
    if (!lic) return res.json({ ok: false, reason: 'Licence invalide' });

    const employeeName = lic.employeeName || 'unknown';
    const emp = db.employees[employeeName] || { name: employeeName, totalCreated: 0, sessions: [] };

    for (const acc of accounts) {
        db.accounts.push({
            ...acc,
            createdBy: employeeName,
            savedAt: new Date().toISOString(),
        });
        emp.totalCreated++;
    }
    emp.sessions.push({ date: new Date().toISOString(), action: 'saved', count: accounts.length });
    db.employees[employeeName] = emp;
    saveDB(db);
    res.json({ ok: true, saved: accounts.length });
});

// ── API : Export CSV tous les comptes ─────────────────────────────────────────
app.get('/api/accounts/export', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const db = loadDB();
    const csv = ['email,password,username,fullName,cookies,createdBy,savedAt']
        .concat(db.accounts.map(a =>
            `"${a.email}","${a.password}","${a.uName || ''}","${a.fullName || ''}","${(a.cookies||'').replace(/"/g,'""')}","${a.createdBy}","${a.savedAt}"`
        )).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="comptes_instagram.csv"');
    res.send(csv);
});

// ── ADMIN : Générer clé ────────────────────────────────────────────────────────
app.post('/admin/license/gen', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const { employeeName, maxUses } = req.body;
    if (!employeeName) return res.json({ error: 'Nom employé requis' });
    const key = genLicense(employeeName, maxUses || 9999);
    res.json({ key, employeeName });
});

// ── ADMIN : Désactiver clé ────────────────────────────────────────────────────
app.post('/admin/license/disable', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const { key } = req.body;
    const db = loadDB();
    if (db.licenses[key]) { db.licenses[key].active = false; saveDB(db); }
    res.json({ ok: true });
});

// ── ADMIN : Rapport JSON ───────────────────────────────────────────────────────
app.get('/admin/report', (req, res) => {
    if (!checkAdmin(req, res)) return;
    const db = loadDB();
    res.json({
        totalAccounts: db.accounts.length,
        totalEmployees: Object.keys(db.employees).length,
        totalLicenses: Object.keys(db.licenses).length,
        employees: Object.values(db.employees).map(e => ({
            name: e.name,
            totalCreated: e.totalCreated,
            lastActive: e.sessions.length ? e.sessions[e.sessions.length-1].date : null,
        })),
        recentAccounts: db.accounts.slice(-20).reverse(),
    });
});

// ── ADMIN : Dashboard HTML ────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
    const db = loadDB();
    const totalAcc = db.accounts.length;
    const totalEmp = Object.keys(db.employees).length;
    const empRows = Object.values(db.employees).map(e => `
        <tr>
            <td>${e.name}</td>
            <td><strong>${e.totalCreated}</strong></td>
            <td>${e.sessions.length ? new Date(e.sessions[e.sessions.length-1].date).toLocaleString('fr') : 'jamais'}</td>
        </tr>`).join('');
    const licRows = Object.values(db.licenses).map(l => `
        <tr>
            <td><code>${l.key}</code></td>
            <td>${l.employeeName}</td>
            <td>${l.uses} / ${l.maxUses}</td>
            <td><span class="badge ${l.active ? 'ok' : 'off'}">${l.active ? 'Active' : 'Désactivée'}</span></td>
            <td>${l.lastUsed ? new Date(l.lastUsed).toLocaleString('fr') : '—'}</td>
            <td><button onclick="disable('${l.key}')" ${!l.active ? 'disabled' : ''}>🚫 Désactiver</button></td>
        </tr>`).join('');
    const recentRows = db.accounts.slice(-10).reverse().map(a => `
        <tr>
            <td>${a.email}</td>
            <td>@${a.uName||''}</td>
            <td>${a.createdBy}</td>
            <td>${new Date(a.savedAt).toLocaleString('fr')}</td>
        </tr>`).join('');

    res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Panel Admin Instagram Bot</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', sans-serif; background: #0f0f1a; color: #e2e8f0; min-height: 100vh; }
        header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 20px 30px; }
        header h1 { font-size: 1.5rem; color: white; }
        header p  { color: rgba(255,255,255,.7); font-size: .9rem; }
        .container { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: #1e1e2e; border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #2d2d3e; }
        .stat-card .num { font-size: 2.5rem; font-weight: 700; color: #818cf8; }
        .stat-card .lbl { font-size: .85rem; color: #94a3b8; margin-top: 4px; }
        .card { background: #1e1e2e; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #2d2d3e; }
        .card h2 { font-size: 1rem; color: #c4b5fd; margin-bottom: 16px; border-bottom: 1px solid #2d2d3e; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; font-size: .85rem; }
        th { text-align: left; padding: 8px 10px; color: #94a3b8; border-bottom: 1px solid #2d2d3e; }
        td { padding: 8px 10px; border-bottom: 1px solid #1a1a2a; }
        code { background: #2d2d3e; padding: 2px 6px; border-radius: 4px; font-size: .8rem; color: #a5b4fc; }
        .badge { padding: 2px 8px; border-radius: 10px; font-size: .75rem; font-weight: 600; }
        .badge.ok  { background: #14532d; color: #4ade80; }
        .badge.off { background: #450a0a; color: #f87171; }
        .form-row { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
        input { flex: 1; background: #2d2d3e; border: 1px solid #3d3d5e; border-radius: 8px; padding: 9px 12px; color: white; min-width: 150px; }
        button { background: #6366f1; color: white; border: none; border-radius: 8px; padding: 9px 18px; cursor: pointer; font-size: .85rem; }
        button:hover { background: #4f46e5; }
        button:disabled { background: #374151; cursor: default; }
        .result-key { background: #14532d; color: #4ade80; padding: 10px 14px; border-radius: 8px; margin-top: 10px; font-family: monospace; display: none; }
        a.export-btn { display: inline-block; background: #059669; color: white; padding: 9px 18px; border-radius: 8px; text-decoration: none; font-size: .85rem; margin-top: 8px; }
    </style>
    </head><body>
    <header>
        <h1>🛡️ Panel Admin — Instagram Bot</h1>
        <p>${totalAcc} comptes créés • ${totalEmp} employés actifs</p>
    </header>
    <div class="container">
        <div class="stats">
            <div class="stat-card"><div class="num">${totalAcc}</div><div class="lbl">Comptes créés</div></div>
            <div class="stat-card"><div class="num">${totalEmp}</div><div class="lbl">Employés</div></div>
            <div class="stat-card"><div class="num">${Object.keys(db.licenses).length}</div><div class="lbl">Licences</div></div>
        </div>

        <div class="card">
            <h2>🔑 Générer une clé de licence</h2>
            <div class="form-row">
                <input id="empName" placeholder="Nom de l'employé" />
                <input id="maxUses" type="number" placeholder="Max utilisations (défaut: 9999)" />
                <button onclick="genKey()">Générer</button>
            </div>
            <div class="result-key" id="resultKey"></div>
        </div>

        <div class="card">
            <h2>👥 Rapport Employés</h2>
            <table>
                <tr><th>Employé</th><th>Comptes créés</th><th>Dernière activité</th></tr>
                ${empRows || '<tr><td colspan="3" style="color:#64748b;text-align:center">Aucun employé</td></tr>'}
            </table>
        </div>

        <div class="card">
            <h2>🗝️ Licences</h2>
            <table>
                <tr><th>Clé</th><th>Employé</th><th>Utilisations</th><th>Statut</th><th>Dernière use</th><th>Action</th></tr>
                ${licRows || '<tr><td colspan="6" style="color:#64748b;text-align:center">Aucune licence</td></tr>'}
            </table>
        </div>

        <div class="card">
            <h2>📋 Comptes récents</h2>
            <a class="export-btn" href="/api/accounts/export?pass=${ADMIN_PASS}">⬇️ Exporter CSV complet</a>
            <table style="margin-top:12px">
                <tr><th>Email</th><th>Username</th><th>Créé par</th><th>Date</th></tr>
                ${recentRows || '<tr><td colspan="4" style="color:#64748b;text-align:center">Aucun compte</td></tr>'}
            </table>
        </div>
    </div>
    <script>
    async function genKey() {
        const n = document.getElementById('empName').value.trim();
        const m = parseInt(document.getElementById('maxUses').value) || 9999;
        if (!n) return alert('Entrez un nom employé');
        const r = await fetch('/admin/license/gen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pass': '${ADMIN_PASS}' },
            body: JSON.stringify({ employeeName: n, maxUses: m })
        }).then(x => x.json());
        const el = document.getElementById('resultKey');
        el.textContent = '✅ Clé générée : ' + r.key;
        el.style.display = 'block';
        navigator.clipboard?.writeText(r.key);
        setTimeout(() => location.reload(), 2000);
    }
    async function disable(key) {
        if (!confirm('Désactiver cette clé ?')) return;
        await fetch('/admin/license/disable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pass': '${ADMIN_PASS}' },
            body: JSON.stringify({ key })
        });
        location.reload();
    }
    </script>
    </body></html>`);
});

app.listen(PORT, () => console.log('🛡️  Panel Admin : http://localhost:' + PORT + '/admin'));
