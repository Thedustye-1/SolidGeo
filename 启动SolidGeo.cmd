@echo off
chcp 65001 >nul
title SolidGeo Server - close this window to stop
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [SolidGeo] Node.js not found in PATH.
  echo Please install Node.js 22 or newer, then run this file again.
  pause
  exit /b 1
)
echo Starting SolidGeo...
echo Keep this window open while using SolidGeo. Close it to stop the local server.
node "%~dp0launcher\start.mjs"
if errorlevel 1 (
  echo.
  echo SolidGeo failed to start. See:
  echo %LOCALAPPDATA%\SolidGeo\launcher.log
  pause
)
