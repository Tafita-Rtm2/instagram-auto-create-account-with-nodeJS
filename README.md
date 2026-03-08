# 🤖 Bot Instagram — Guide Termux (100% Gratuit)

## Pourquoi Termux ?

| Render (avant) | Termux (maintenant) |
|---|---|
| IP datacenter → bloquée par Instagram | IP mobile → acceptée par Instagram |
| Captcha à chaque fois | Peu ou pas de captcha |
| Payant pour éviter le sleep | 100% gratuit |
| Serveur distant | Ton téléphone = le serveur |

---

## 📦 Installation (une seule fois)

### 1. Installe Termux
Télécharge **Termux** depuis **F-Droid** (pas le Play Store, la version Play Store est obsolète) :
👉 https://f-droid.org/packages/com.termux/

### 2. Ouvre Termux et tape ces commandes une par une

```bash
# Mettre à jour les paquets
pkg update -y && pkg upgrade -y

# Installer Node.js et git
pkg install nodejs git -y

# Aller dans le dossier home
cd ~

# Cloner ton repo GitHub
git clone https://github.com/TON_USER/TON_REPO.git bot
cd bot

# Installer les dépendances
npm install
```

### 3. Si tu n'as pas de repo GitHub, crée les fichiers directement

```bash
cd ~
mkdir bot && cd bot

# Créer package.json
cat > package.json << 'EOF'
{
  "name": "create-instagram-account",
  "version": "1.0.0",
  "main": "createAccount.js",
  "scripts": { "start": "node createAccount.js" },
  "dependencies": {
    "express": "^4.18.2",
    "node-fetch": "^2.6.1"
  }
}
EOF

# Installer les dépendances
npm install
```

Puis copie-colle le contenu de `createAccount.js` et `accountInfoGenerator.js` dans les fichiers :
```bash
nano createAccount.js
# (colle le contenu, puis Ctrl+X, Y, Entrée pour sauvegarder)

nano accountInfoGenerator.js
# (idem)
```

---

## 🚀 Lancer le bot

```bash
cd ~/bot
node createAccount.js
```

Tu verras :
```
🌐 Port 10000
🤖 Bot prêt — 2captcha : ❌ pas de clé (mode manuel)
```

---

## 🌐 Accéder à l'interface

### Option A — Sur ton téléphone (même appareil)
Ouvre Chrome et va sur :
```
http://localhost:10000
```

### Option B — Sur un autre appareil (PC, autre téléphone)
Dans Termux, trouve ton IP locale :
```bash
ifconfig | grep "inet " | grep -v 127
```
Tu verras quelque chose comme `192.168.1.45`

Depuis ton PC sur le même WiFi :
```
http://192.168.1.45:10000
```

### Option C — Accès depuis n'importe où (internet) avec ngrok
```bash
# Installer ngrok
pkg install wget -y
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz
tar xvzf ngrok-v3-stable-linux-arm64.tgz

# Créer un compte gratuit sur ngrok.com et récupérer ton authtoken
./ngrok config add-authtoken TON_TOKEN

# Dans un 2ème onglet Termux, lancer le tunnel
./ngrok http 10000
```
Ngrok te donne une URL publique type `https://abc123.ngrok.io` accessible de partout.

---

## 💡 Garder le bot actif en arrière-plan

Par défaut, si tu fermes Termux le bot s'arrête. Pour le garder actif :

```bash
# Installer screen (multiplexeur de terminal)
pkg install screen -y

# Lancer le bot dans une session persistante
screen -S bot
cd ~/bot
node createAccount.js

# Détacher la session (le bot continue à tourner)
# Appuie sur : Ctrl+A puis D

# Pour revenir à la session plus tard
screen -r bot
```

Ou utilise `nohup` :
```bash
nohup node createAccount.js > bot.log 2>&1 &
echo "Bot lancé en arrière-plan, PID: $!"
```

---

## 🔄 Mettre à jour le bot

Si tu utilises GitHub :
```bash
cd ~/bot
git pull
node createAccount.js
```

Si tu modifies manuellement :
```bash
nano createAccount.js
# (fais tes modifications)
# Ctrl+X, Y, Entrée pour sauvegarder
node createAccount.js
```

---

## ❓ Problèmes courants

### "command not found: node"
```bash
pkg install nodejs -y
```

### "Cannot find module 'express'"
```bash
cd ~/bot && npm install
```

### "Port already in use"
```bash
# Trouver et tuer le processus
kill $(lsof -t -i:10000)
# Ou changer le port
PORT=3000 node createAccount.js
```

### Le bot s'arrête quand l'écran se verrouille
Va dans **Paramètres Android → Batterie → Termux → Pas d'optimisation batterie**

### "require_captcha: true" malgré l'IP mobile
Ton opérateur mobile partage peut-être une IP avec des bots.
Solution : coupe le WiFi et utilise la **data mobile** (4G/5G).

---

## 📁 Structure des fichiers

```
~/bot/
├── createAccount.js        ← bot principal
├── accountInfoGenerator.js ← générateur noms/usernames
├── package.json            ← dépendances
└── node_modules/           ← installé par npm
```

---

## ⚡ Commande tout-en-un (démarrage rapide)

```bash
cd ~/bot && node createAccount.js
```

Puis ouvre : **http://localhost:10000**
