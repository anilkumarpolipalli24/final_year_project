@echo off
title BlockAudit - First Time Setup
color 0A
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   BlockAudit First-Time Setup            ║
echo  ║   Step 1: Install packages               ║
echo  ║   Step 2: Seed database                  ║
echo  ║   Step 3: Start server                   ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo [1/3] Installing npm packages...
npm install
echo.

echo [2/3] Seeding users into MongoDB Atlas...
node seed.js
echo.

echo [3/3] Starting server...
echo       OTP codes will appear here when you login!
echo       Keep this window open.
echo.
npx nodemon index.js
pause