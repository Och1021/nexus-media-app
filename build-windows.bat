@echo off
rem Nexus Media appiig ene computer deer Windows-d zoriulj buteene (turshih zoriulalttai).
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Installing...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
echo.
echo [1/2] Installing packages (first time takes a few minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 goto err
echo.
echo [2/2] Building Windows app...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win --publish never
if errorlevel 1 goto err
echo.
echo DONE. Installer: dist\NexusMedia-Setup.exe
start "" "%~dp0dist"
pause
exit /b 0
:err
echo.
echo BUILD FAILED - see the messages above.
pause
exit /b 1
