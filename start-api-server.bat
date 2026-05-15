@echo off
setlocal

cd /d "%~dp0api-server"

if not exist node_modules (
  echo [MES] Installing API server dependencies...
  npm install
)

echo [MES] Starting API server on http://0.0.0.0:3000
npm start
