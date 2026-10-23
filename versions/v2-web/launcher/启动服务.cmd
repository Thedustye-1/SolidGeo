@echo off
chcp 65001 >nul
title SolidGeo Local Server - keep this window open
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [SolidGeo] Node.js not found in PATH.
  echo Please install Node.js 22 or newer, then run this file again.
  pause
  exit /b 1
)
echo Opening SolidGeo in your default browser...
start "" "http://127.0.0.1:47821/index.html?web=1"
node "%~dp0launcher\serve.mjs"
if errorlevel 1 pause
