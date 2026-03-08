/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║       PANEL ADMIN — Instagram Bot Manager                    ║
 * ║  Deploy : Render / Railway (gratuit)                         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 8080;
const DB   = path.join(__dirname, 'admin_db.json');
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin1234';

app.use(express.json());

function loadDB() {
    if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({ licenses:{}, employees:{}, accounts:[] }));
    try { return JSON.parse(fs.readFileSync(DB,'utf8')); }
    catch(e) { return { licenses:{}, employees:{}, accounts:[] }; }
}
function saveDB(d) { fs.writeFileSync(DB, JSON.stringify(d,null,2)); }

function checkAdmin(req,res) {
    const p = req.headers['x-admin-pass'] || req.query.pass || req.body?.pass;
    if (p !== ADMIN_PASS) { res.status(401).json({error:'Non autorisé'}); return false; }
    return true;
}

// ── API : Vérifier licence ────────────────────────────────────────────────────
app.post('/api/license/check', (req,res) => {
    const {key} = req.body;
    if (!key) return res.json({valid:false,reason:'Clé manquante'});
    const db = loadDB();
    const lic = db.licenses[key];
    if (!lic)        return res.json({valid:false,reason:'Clé invalide'});
    if (!lic.active) return res.json({valid:false,reason:'Clé désactivée'});
    if (lic.uses >= lic.maxUses) return res.json({valid:false,reason:'Limite atteinte'});
    lic.lastUsed = new Date().toISOString();
    saveDB(db);
    res.json({valid:true, employeeName:lic.employeeName, usesLeft: lic.maxUses - lic.uses});
});

// ── API : Sauvegarder comptes (incrémente compteur employé) ───────────────────
app.post('/api/accounts/save', (req,res) => {
    const {licenseKey, accounts} = req.body;
    if (!licenseKey || !accounts?.length) return res.json({ok:false,reason:'Données manquantes'});
    const db = loadDB();
    const lic = db.licenses[licenseKey];
    if (!lic) return res.json({ok:false,reason:'Licence inconnue'});

    const empName = lic.employeeName;
    if (!db.employees[empName]) db.employees[empName] = {name:empName,totalCreated:0,sessions:[]};
    const emp = db.employees[empName];

    for (const acc of accounts) {
        db.accounts.push({...acc, createdBy:empName, savedAt:new Date().toISOString()});
        emp.totalCreated++;
        lic.uses++;
    }
    lic.lastUsed = new Date().toISOString();
    emp.sessions.push({date:new Date().toISOString(), count:accounts.length});
    saveDB(db);
    res.json({ok:true, saved:accounts.length, total:emp.totalCreated});
});

// ── API : Export CSV ──────────────────────────────────────────────────────────
app.get('/api/accounts/export', (req,res) => {
    if (!checkAdmin(req,res)) return;
    const db = loadDB();
    const rows = db.accounts.map(a =>
        [a.email,a.password,a.uName||'',a.fullName||'',a.createdBy,a.savedAt]
        .map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')
    );
    res.setHeader('Content-Type','text/csv;charset=utf-8');
    res.setHeader('Content-Disposition','attachment;filename="comptes_instagram.csv"');
    res.send('email,password,username,fullName,createdBy,savedAt\n'+rows.join('\n'));
});

// ── ADMIN API ─────────────────────────────────────────────────────────────────
app.post('/admin/license/gen', (req,res) => {
    if (!checkAdmin(req,res)) return;
    const {employeeName, maxUses} = req.body;
    if (!employeeName) return res.status(400).json({error:'Nom requis'});
    const key = 'IG-'+crypto.randomBytes(4).toString('hex').toUpperCase()+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();
    const db = loadDB();
    db.licenses[key] = {key, employeeName, maxUses:parseInt(maxUses)||9999, uses:0, active:true, createdAt:new Date().toISOString(), lastUsed:null};
    if (!db.employees[employeeName]) db.employees[employeeName] = {name:employeeName,totalCreated:0,sessions:[]};
    saveDB(db);
    res.json({ok:true,key,employeeName});
});

app.post('/admin/license/toggle', (req,res) => {
    if (!checkAdmin(req,res)) return;
    const {key} = req.body;
    const db = loadDB();
    if (!db.licenses[key]) return res.status(404).json({error:'Introuvable'});
    db.licenses[key].active = !db.licenses[key].active;
    saveDB(db);
    res.json({ok:true, active:db.licenses[key].active});
});

app.post('/admin/employee/delete', (req,res) => {
    if (!checkAdmin(req,res)) return;
    const {name} = req.body;
    const db = loadDB();
    delete db.employees[name];
    Object.values(db.licenses).forEach(l => { if(l.employeeName===name) l.active=false; });
    saveDB(db);
    res.json({ok:true});
});

app.get('/admin/data', (req,res) => {
    if (!checkAdmin(req,res)) return;
    const db = loadDB();
    res.json({
        totalAccounts: db.accounts.length,
        totalEmployees: Object.keys(db.employees).length,
        totalLicenses: Object.keys(db.licenses).length,
        employees: Object.values(db.employees),
        licenses: Object.values(db.licenses),
        recentAccounts: db.accounts.slice(-100).reverse(),
    });
});

// ── Dashboard HTML ────────────────────────────────────────────────────────────
app.get('/admin', (req,res) => { res.send(`<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel Admin — Instagram Bot</title>
<style>
:root{--bg:#0d0d1a;--bg2:#13131f;--bg3:#1a1a2e;--border:#2a2a40;--purple:#7c3aed;--purple2:#6d28d9;--green:#10b981;--red:#ef4444;--text:#e2e8f0;--muted:#64748b;--accent:#818cf8}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
#login{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.lbox{background:var(--bg3);border:1px solid var(--border);border-radius:16px;padding:40px;width:100%;max-width:360px;text-align:center}
.lbox h1{font-size:1.4rem;margin-bottom:6px}.lbox p{color:var(--muted);font-size:.9rem;margin-bottom:20px}
.lbox input{width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;color:var(--text);font-size:1rem;margin-bottom:10px}
.lbox input:focus{outline:none;border-color:var(--purple)}
.btn-primary{width:100%;background:var(--purple);color:#fff;border:none;border-radius:10px;padding:12px;font-size:1rem;cursor:pointer;font-weight:600}
.btn-primary:hover{background:var(--purple2)}
.lerr{color:var(--red);font-size:.85rem;margin-top:8px;display:none}
#app{display:none}
.topbar{background:linear-gradient(135deg,var(--purple),#4f46e5);padding:0 20px;height:58px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.topbar h1{font-size:1rem;color:#fff}
.btn-sm{background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:.8rem}
.hamburger{background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:1.1rem;display:none}
.layout{display:grid;grid-template-columns:210px 1fr;min-height:calc(100vh - 58px)}
.sidebar{background:var(--bg2);border-right:1px solid var(--border);padding:16px 0}
.nav{display:flex;align-items:center;gap:10px;padding:10px 18px;cursor:pointer;color:var(--muted);font-size:.88rem;transition:.15s;border-left:3px solid transparent}
.nav:hover,.nav.on{color:var(--text);background:var(--bg3);border-left-color:var(--purple)}
.main{padding:20px;overflow-y:auto}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px;margin-bottom:20px}
.stat{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:18px;text-align:center}
.stat .n{font-size:1.8rem;font-weight:700;color:var(--accent)}.stat .l{font-size:.78rem;color:var(--muted);margin-top:3px}
.card{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px}
.ctitle{font-size:.9rem;color:var(--accent);margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.83rem;min-width:400px}
th{text-align:left;padding:9px 10px;color:var(--muted);border-bottom:1px solid var(--border);font-weight:500;white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid #12121e;vertical-align:middle}
tr:last-child td{border:none}
code{background:var(--bg2);padding:2px 7px;border-radius:5px;font-size:.78rem;color:var(--accent);word-break:break-all}
.badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:.72rem;font-weight:600}
.bg{background:#064e3b;color:#34d399}.br{background:#450a0a;color:#f87171}
.frow{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.frow input{flex:1;min-width:150px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text);font-size:.88rem}
.frow input:focus{outline:none;border-color:var(--purple)}
.btn{border:none;border-radius:8px;padding:9px 16px;cursor:pointer;font-size:.83rem;font-weight:600;transition:.15s}
.bp{background:var(--purple);color:#fff}.bp:hover{background:var(--purple2)}
.bg2b{background:#065f46;color:#34d399}.bg2b:hover{background:#047857}
.brd{background:#7f1d1d;color:#f87171}.brd:hover{background:#991b1b}
.bsm{padding:5px 10px;font-size:.76rem}
.rbox{background:#064e3b;border:1px solid #065f46;color:#34d399;padding:12px 14px;border-radius:8px;margin-top:12px;font-family:monospace;display:none;font-size:.85rem;word-break:break-all}
.tab{display:none}.tab.on{display:block}
.progress-bar{flex:1;height:5px;background:var(--bg2);border-radius:3px;min-width:50px}
.progress-fill{height:100%;background:var(--purple);border-radius:3px}
@media(max-width:768px){
  .layout{grid-template-columns:1fr}
  .sidebar{display:none;position:fixed;top:58px;left:0;right:0;z-index:99;max-height:55vh;overflow-y:auto}
  .sidebar.open{display:block}
  .hamburger{display:block}
  .main{padding:14px}
  .stats{grid-template-columns:repeat(2,1fr)}
}
</style></head><body>

<div id="login">
  <div class="lbox">
    <div style="font-size:2.5rem;margin-bottom:10px">🛡️</div>
    <h1>Panel Admin</h1>
    <p>Instagram Bot Manager</p>
    <input type="password" id="pi" placeholder="Mot de passe admin" onkeydown="if(event.key==='Enter')doLogin()">
    <button type="button" class="btn-primary" onclick="doLogin()">Connexion</button>
    <div class="lerr" id="le">❌ Mot de passe incorrect</div>
  </div>
</div>

<div id="app">
  <div class="topbar">
    <div style="display:flex;align-items:center;gap:10px">
      <button class="hamburger" onclick="toggleSB()">☰</button>
      <h1>🤖 Instagram Bot Admin</h1>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <span id="ts" style="font-size:.78rem;color:rgba(255,255,255,.6)"></span>
      <button class="btn-sm" onclick="logout()">Déconnexion</button>
    </div>
  </div>

  <div class="layout">
    <div class="sidebar" id="sb">
      <div class="nav on" onclick="go('dashboard')"><span>📊</span> Dashboard</div>
      <div class="nav" onclick="go('employees')"><span>👥</span> Employés</div>
      <div class="nav" onclick="go('licenses')"><span>🔑</span> Licences</div>
      <div class="nav" onclick="go('accounts')"><span>📋</span> Comptes</div>
      <div class="nav" onclick="go('newlic')"><span>➕</span> Nouvelle licence</div>
    </div>

    <div class="main">

      <div class="tab on" id="t-dashboard">
        <div class="stats">
          <div class="stat"><div class="n" id="s1">…</div><div class="l">Comptes créés</div></div>
          <div class="stat"><div class="n" id="s2">…</div><div class="l">Employés</div></div>
          <div class="stat"><div class="n" id="s3">…</div><div class="l">Licences</div></div>
          <div class="stat"><div class="n" id="s4">…</div><div class="l">Aujourd'hui</div></div>
        </div>
        <div class="card">
          <div class="ctitle">📋 Comptes récents</div>
          <div class="tw"><table id="rt"><tr><th>Email</th><th>Username</th><th>Employé</th><th>Date</th></tr></table></div>
        </div>
      </div>

      <div class="tab" id="t-employees">
        <div class="card">
          <div class="ctitle">👥 Rapport Employés</div>
          <div class="tw"><table id="et"><tr><th>Employé</th><th>Comptes créés</th><th>Dernière activité</th><th>Action</th></tr></table></div>
        </div>
      </div>

      <div class="tab" id="t-licenses">
        <div class="card">
          <div class="ctitle">🔑 Licences</div>
          <div class="tw"><table id="lt"><tr><th>Clé</th><th>Employé</th><th>Progression</th><th>Statut</th><th>Dernière use</th><th>Action</th></tr></table></div>
        </div>
      </div>

      <div class="tab" id="t-accounts">
        <div class="card">
          <div class="ctitle">📋 Tous les comptes <a id="expbtn" href="#" style="margin-left:auto;background:#065f46;color:#34d399;padding:5px 12px;border-radius:7px;text-decoration:none;font-size:.78rem">⬇️ CSV</a></div>
          <div class="tw"><table id="at"><tr><th>Email</th><th>Password</th><th>Username</th><th>Nom</th><th>Créé par</th><th>Date</th></tr></table></div>
        </div>
      </div>

      <div class="tab" id="t-newlic">
        <div class="card">
          <div class="ctitle">➕ Générer une licence</div>
          <div class="frow">
            <input id="ne" placeholder="Nom employé (ex: Tafita)">
            <input id="nm" type="number" placeholder="Max comptes (défaut: 9999)">
            <button class="btn bp" onclick="genLic()">🔑 Générer</button>
          </div>
          <div class="rbox" id="gr"></div>
        </div>
        <div class="card">
          <div class="ctitle">ℹ️ Instructions pour l'employé</div>
          <div style="font-size:.85rem;color:var(--muted);line-height:1.8">
            <p><strong style="color:var(--text)">Sur PC (Windows/Mac/Linux) :</strong></p>
            <p>1. Installer <a href="https://nodejs.org" target="_blank" style="color:var(--accent)">Node.js</a> et <a href="https://git-scm.com" target="_blank" style="color:var(--accent)">Git</a></p>
            <p>2. <code>git clone https://github.com/Tafita-Rtm2/instagram-auto-create-account-with-nodeJS.git bot</code></p>
            <p>3. <code>cd bot && npm install</code></p>
            <p>4. Créer le fichier <code>license.key</code> avec la clé générée</p>
            <p>5. <code>node createAccount.js</code> → ouvrir <code>http://localhost:10000</code></p>
            <br>
            <p><strong style="color:var(--text)">Sur Android (Termux) :</strong></p>
            <p>1. <code>pkg install nodejs git -y</code></p>
            <p>2. Même étapes 2-5 ci-dessus</p>
            <br>
            <p><strong style="color:var(--text)">Variables d'environnement (optionnel) :</strong></p>
            <p><code>PANEL_URL=https://instagram-admin-panel.onrender.com</code></p>
            <p><code>LICENSE_KEY=IG-XXXX-XXXX</code></p>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<script>
let pw='', db={};

async function doLogin(){
  const p=document.getElementById('pi').value.trim();
  if(!p){document.getElementById('le').textContent='⚠️ Entrez le mot de passe';document.getElementById('le').style.display='block';return;}
  const btn=document.querySelector('.btn-primary');
  btn.textContent='Connexion…';btn.disabled=true;
  document.getElementById('le').style.display='none';
  try{
    const r=await fetch('/admin/data?pass='+encodeURIComponent(p));
    if(r.status===401){
      document.getElementById('le').textContent='❌ Mot de passe incorrect';
      document.getElementById('le').style.display='block';
      btn.textContent='Connexion';btn.disabled=false;
      return;
    }
    if(!r.ok){
      document.getElementById('le').textContent='❌ Erreur serveur: '+r.status;
      document.getElementById('le').style.display='block';
      btn.textContent='Connexion';btn.disabled=false;
      return;
    }
    pw=p; db=await r.json();
    document.getElementById('login').style.display='none';
    document.getElementById('app').style.display='block';
    render(); setInterval(refresh,8000);
  }catch(e){
    document.getElementById('le').textContent='❌ Erreur réseau: '+e.message;
    document.getElementById('le').style.display='block';
    btn.textContent='Connexion';btn.disabled=false;
  }
}
function logout(){pw='';document.getElementById('login').style.display='flex';document.getElementById('app').style.display='none';document.getElementById('pi').value='';}
async function refresh(){try{const r=await fetch('/admin/data?pass='+encodeURIComponent(pw));if(r.ok){db=await r.json();render();}}catch(e){}}
function go(t){
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.nav').forEach(x=>x.classList.remove('on'));
  document.getElementById('t-'+t).classList.add('on');
  document.querySelectorAll('.nav').forEach(x=>{if(x.getAttribute('onclick').includes("'"+t+"'"))x.classList.add('on');});
  if(window.innerWidth<=768)document.getElementById('sb').classList.remove('open');
}
function toggleSB(){document.getElementById('sb').classList.toggle('open');}
function fmt(d){try{return new Date(d).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(e){return d;}}
function empty(tbl,cols,msg){const tr=tbl.insertRow();tr.innerHTML='<td colspan="'+cols+'" style="color:var(--muted);text-align:center;padding:18px">'+msg+'</td>';}

function render(){
  const today=new Date().toDateString();
  const tod=(db.recentAccounts||[]).filter(a=>new Date(a.savedAt).toDateString()===today).length;
  document.getElementById('s1').textContent=db.totalAccounts||0;
  document.getElementById('s2').textContent=db.totalEmployees||0;
  document.getElementById('s3').textContent=db.totalLicenses||0;
  document.getElementById('s4').textContent=tod;
  document.getElementById('ts').textContent=(db.totalAccounts||0)+' comptes';
  document.getElementById('expbtn').href='/api/accounts/export?pass='+pw;

  // Recent
  const rt=document.getElementById('rt');
  rt.innerHTML='<tr><th>Email</th><th>Username</th><th>Employé</th><th>Date</th></tr>';
  const ra=db.recentAccounts||[];
  if(!ra.length){empty(rt,4,'Aucun compte créé');}
  else ra.slice(0,20).forEach(a=>{const tr=rt.insertRow();tr.innerHTML='<td>'+a.email+'</td><td>@'+(a.uName||'')+'</td><td>'+a.createdBy+'</td><td>'+fmt(a.savedAt)+'</td>';});

  // Employees
  const et=document.getElementById('et');
  et.innerHTML='<tr><th>Employé</th><th>Comptes créés</th><th>Dernière activité</th><th>Action</th></tr>';
  const emps=db.employees||[];
  if(!emps.length){empty(et,4,'Aucun employé');}
  else emps.forEach(e=>{
    const last=e.sessions?.length?e.sessions[e.sessions.length-1].date:null;
    const tr=et.insertRow();
    tr.innerHTML='<td><strong>'+e.name+'</strong></td>'
      +'<td><span style="color:var(--green);font-size:1.1rem;font-weight:700">'+e.totalCreated+'</span></td>'
      +'<td>'+(last?fmt(last):'<span style="color:var(--muted)">jamais</span>')+'</td>'
      +'<td><button class="btn brd bsm" onclick="delEmp(\''+e.name+'\')">🗑️ Supprimer</button></td>';
  });

  // Licenses
  const lt=document.getElementById('lt');
  lt.innerHTML='<tr><th>Clé</th><th>Employé</th><th>Progression</th><th>Statut</th><th>Dernière use</th><th>Action</th></tr>';
  const lics=db.licenses||[];
  if(!lics.length){empty(lt,6,'Aucune licence');}
  else lics.forEach(l=>{
    const pct=Math.min(100,Math.round(l.uses/l.maxUses*100));
    const tr=lt.insertRow();
    tr.innerHTML='<td><code>'+l.key+'</code></td><td>'+l.employeeName+'</td>'
      +'<td><div style="display:flex;align-items:center;gap:6px"><span style="white-space:nowrap">'+l.uses+'/'+l.maxUses+'</span>'
      +'<div class="progress-bar"><div class="progress-fill" style="width:'+pct+'%"></div></div></div></td>'
      +'<td><span class="badge '+(l.active?'bg':'br')+'">'+(l.active?'Active':'Désactivée')+'</span></td>'
      +'<td>'+(l.lastUsed?fmt(l.lastUsed):'<span style="color:var(--muted)">—</span>')+'</td>'
      +'<td><button class="btn '+(l.active?'brd':'bg2b')+' bsm" onclick="togLic(\''+l.key+'\')">'+(l.active?'🚫 Désactiver':'✅ Activer')+'</button></td>';
  });

  // All accounts
  const at=document.getElementById('at');
  at.innerHTML='<tr><th>Email</th><th>Password</th><th>Username</th><th>Nom</th><th>Créé par</th><th>Date</th></tr>';
  if(!ra.length){empty(at,6,'Aucun compte');}
  else ra.forEach(a=>{const tr=at.insertRow();tr.innerHTML='<td>'+a.email+'</td><td><code>'+a.password+'</code></td><td>@'+(a.uName||'')+'</td><td>'+(a.fullName||'')+'</td><td>'+a.createdBy+'</td><td>'+fmt(a.savedAt)+'</td>';});
}

async function genLic(){
  const name=document.getElementById('ne').value.trim();
  const max=parseInt(document.getElementById('nm').value)||9999;
  if(!name)return alert('Entrez un nom d\'employé');
  const r=await fetch('/admin/license/gen',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pw},body:JSON.stringify({employeeName:name,maxUses:max})}).then(x=>x.json());
  const box=document.getElementById('gr');
  box.textContent='✅ Clé générée pour '+name+' :\\n'+r.key+'\\n\\nDonne cette clé à l\'employé.\\nElle est copiée dans ton presse-papier.';
  box.style.display='block';
  navigator.clipboard?.writeText(r.key).catch(()=>{});
  await refresh();
}
async function togLic(key){
  await fetch('/admin/license/toggle',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pw},body:JSON.stringify({key})});
  await refresh();
}
async function delEmp(name){
  if(!confirm('Supprimer '+name+' et désactiver ses licences ?'))return;
  await fetch('/admin/employee/delete',{method:'POST',headers:{'Content-Type':'application/json','x-admin-pass':pw},body:JSON.stringify({name})});
  await refresh();
}
document.getElementById('pi').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
</script>
</body></html>`);
});

app.listen(PORT, () => {
    console.log('🛡️  Panel Admin : http://localhost:' + PORT + '/admin');
    console.log('🔐  Mot de passe : ' + ADMIN_PASS);
});
