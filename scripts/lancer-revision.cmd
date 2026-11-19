@echo off
title Revision - fermer cette fenetre ferme l'app
cd /d "%~dp0.."
if not exist node_modules (
  echo Premiere utilisation : installation des dependances...
  call npm install --no-fund --no-audit
)
node scripts\ensure-build.mjs
if errorlevel 1 goto erreur
set REVISION_OPEN=1
node node_modules\tsx\dist\cli.mjs server\index.ts
if errorlevel 1 goto erreur
exit /b 0

:erreur
echo.
echo Une erreur est survenue (voir ci-dessus).
pause
