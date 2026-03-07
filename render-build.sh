#!/usr/bin/env bash
set -o errexit

npm install

# Installe Chrome pour Linux (Render)
wget https://storage.googleapis.com/chrome-for-testing-public/122.0.6261.94/linux64/chrome-linux64.zip
unzip -o chrome-linux64.zip
rm chrome-linux64.zip
