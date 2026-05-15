@echo off
cd /d "%~dp0"
echo Lancement de La villa Romeo Admin...
echo.
echo Sur ce PC : http://localhost:4174
echo Sur ton telephone, si tu es sur le meme Wi-Fi : http://192.168.1.205:4174
echo Portail client : http://192.168.1.205:4174/guest.html?suite=1
echo.
node server.js
pause
