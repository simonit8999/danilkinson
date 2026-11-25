@echo off
chcp 65001 >nul
rem Запуск локального сервера каталога (сайт из dist + API на порту 3000).
rem Нужен, если PowerShell блокирует npm.ps1 (ExecutionPolicy = Restricted):
rem тогда npm run server не работает, а этот файл работает всегда.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установите Node.js 22.12+ и повторите.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo ВНИМАНИЕ: сборка dist\index.html не найдена.
  echo Сначала выполните:  npm.cmd run build
  echo.
)

echo [start-server] каталог и сайт: http://127.0.0.1:3000
echo [start-server] проверка:       http://127.0.0.1:3000/api/health
echo [start-server] туннель:        ngrok http 127.0.0.1:3000
echo.
node server\index.mjs

echo.
echo Сервер остановлен.
pause
