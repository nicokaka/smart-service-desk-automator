@echo off
title Smart Service Desk Automator
cd /d "%~dp0"
echo ===================================================
echo   Iniciando Smart Service Desk Automator...
echo ===================================================
npm start
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Erro ao iniciar. Pressione qualquer tecla para sair.
  pause >nul
)
