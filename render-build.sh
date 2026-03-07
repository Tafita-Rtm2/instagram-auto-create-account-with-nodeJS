#!/usr/bin/env bash
# Arrêter le script s'il y a une erreur
set -o errexit

# 1. Installer vos packages Node.js
npm install

# 2. Télécharger et extraire la version Linux de Google Chrome
echo "Téléchargement de Chrome..."
wget https://storage.googleapis.com/chrome-for-testing-public/122.0.6261.94/linux64/chrome-linux64.zip
unzip -o chrome-linux64.zip
rm chrome-linux64.zip
echo "Chrome installé avec succès !"
