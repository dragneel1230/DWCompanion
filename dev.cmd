@echo off
cd /d "%~dp0"
rem Portable Node and rustup live in the user profile; add them in case PATH was not refreshed yet.
set "PATH=%LOCALAPPDATA%\Programs\node-v24.19.0-win-x64;%USERPROFILE%\.cargo\bin;%PATH%"
pnpm tauri dev
if errorlevel 1 pause
