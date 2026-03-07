#!/usr/bin/env bash
# Arrêter le script en cas d'erreur
set -o errexit

# 1. Installation des dépendances Node
npm install

# 2. Nettoyage des anciennes tentatives
rm -rf chrome-linux64 chromedriver-linux64

# 3. Téléchargement de Google Chrome (v122)
echo "Téléchargement de Chrome..."
wget https://storage.googleapis.com/chrome-for-testing-public/122.0.6261.94/linux64/chrome-linux64.zip
unzip -o chrome-linux64.zip

# 4. Téléchargement du ChromeDriver (v122)
echo "Téléchargement du ChromeDriver..."
wget https://storage.googleapis.com/chrome-for-testing-public/122.0.6261.94/linux64/chromedriver-linux64.zip
unzip -o chromedriver-linux64.zip

# 5. Donner les permissions d'exécution
chmod +x chrome-linux64/chrome
chmod +x chromedriver-linux64/chromedriver

# Nettoyage des fichiers zip
rm chrome-linux64.zip chromedriver-linux64.zip

echo "Installation terminée avec succès !"
