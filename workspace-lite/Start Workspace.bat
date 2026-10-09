@echo off
title Integral Workspace
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and then run this again.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Your Node.js is too old. Install the LTS version from https://nodejs.org and then run this again.
  pause
  exit /b 1
)
echo Starting Integral Workspace...
node --disable-warning=ExperimentalWarning server.js --open
pause
