@echo off
timeout /t 15 /nobreak

call "C:\Users\lenovo\AppData\Roaming\npm\pm2" resurrect

:keepalive
timeout /t 60 /nobreak
pm2 ping >nul 2>&1
if errorlevel 1 (
    pm2 resurrect
)
goto keepalive