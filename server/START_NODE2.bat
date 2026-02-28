@echo off
title BlockAudit Node 2 (Port 5001)
echo =============================================
echo  BlockAudit Node 2 - Sync Node
echo  Port: 5001  |  Peer: localhost:5000
echo =============================================
cd /d "%~dp0"
npm run node2
pause