@echo off
title BlockAudit Server - Port 5000
color 0B
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   BlockAudit University Edition v3.0     ║
echo  ║   Starting backend on port 5000...       ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Check if dotenv installed
if not exist "node_modules\dotenv" (
    echo [!] dotenv not found. Running npm install...
    npm install
    echo.
)

:: Check if nodemon installed
if not exist "node_modules\nodemon" (
    echo [!] nodemon not found. Running npm install...
    npm install
    echo.
)

echo [*] Starting server with nodemon...
echo [*] OTP will appear in THIS window - keep it open!
echo [*] Press Ctrl+C to stop
echo.
npx nodemon index.js
pause