@echo off
title Guion en Pantalla
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo Compilando la app por primera vez...
  call npm run build
)
start "" http://localhost:4173
node server.mjs
pause
