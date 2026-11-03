@echo off
cd /d "%~dp0"
rem Opsional: set APP_PASSWORD=isi_password
echo Membuka aplikasi di browser...
start http://localhost:3000
node local-server.js
pause
