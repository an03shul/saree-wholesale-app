@echo off
REM Double-click this file to start the Gopiram Tally Sync Agent on Windows.
cd /d "%~dp0"
if not exist node_modules ( echo Installing dependencies for the first time... & call npm install )
echo Starting Tally Sync Agent...
node agent.js
pause
