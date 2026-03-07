#!/usr/bin/env bash
set -o errexit

npm install

# Téléchargement
wget https://storage.googleapis.com/chrome-for-testing-public/122.0.6261.94/linux64/chrome-linux64.zip
unzip -o chrome-linux64.zip

# Vérification : on s'assure que le binaire est exécutable
chmod +x chrome-linux64/chrome
