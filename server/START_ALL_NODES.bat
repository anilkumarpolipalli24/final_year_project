@echo off
title BlockAudit - Starting All Nodes
echo =============================================
echo  Starting BlockAudit 3-Node Network...
echo =============================================

cd /d "%~dp0"

echo [1/3] Starting Node 1 (Port 5000)...
start "BlockAudit Node 1 - Port 5000" cmd /k "npm run dev"

echo Waiting 4 seconds for Node 1 to boot...
timeout /t 4 /nobreak >nul

echo [2/3] Starting Node 2 (Port 5001)...
start "BlockAudit Node 2 - Port 5001" cmd /k "npm run node2"

echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo [3/3] Starting Node 3 (Port 5002)...
start "BlockAudit Node 3 - Port 5002" cmd /k "npm run node3"

echo.
echo =============================================
echo  All 3 nodes started in separate windows!
echo  Node 1: http://localhost:5000
echo  Node 2: http://localhost:5001
echo  Node 3: http://localhost:5002
echo =============================================
pause