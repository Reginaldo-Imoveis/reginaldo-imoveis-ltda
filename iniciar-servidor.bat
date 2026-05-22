@echo off
title Reginaldo Imoveis — Servidor
color 0A

echo.
echo  ============================================
echo   Reginaldo Imoveis — Iniciando servidor...
echo  ============================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERRO] Node.js nao encontrado.
    echo  Instale em: https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo  Instalando dependencias...
    npm install
    echo.
)

echo  Servidor iniciando em http://localhost:3000
echo  Painel admin em   http://localhost:3000/admin
echo.
echo  Pressione Ctrl+C para encerrar.
echo.

node backend/server.js

pause
