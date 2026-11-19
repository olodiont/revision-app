@echo off
title Revision (laisse cette fenetre ouverte pendant que tu revises)
cd /d "%~dp0.."
if not exist node_modules (
  echo Premiere utilisation : installation des dependances...
  call npm install --no-fund --no-audit
)
start "" http://127.0.0.1:5317
npm start
