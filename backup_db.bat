@echo off
REM ---------------------------------------------------------------
REM  Daily POS database backup
REM  - Dumps the live "posdb" database from the Docker "db" service
REM  - Saves to D:\POS_Production\backups\posdb_YYYY-MM-DD_HHMM.sql (UTF-8)
REM  - Deletes backups older than 30 days
REM  Restore: see "import previous db" in README.md
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

if not exist "backups" mkdir "backups"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set STAMP=%%i
set OUT=backups\posdb_%STAMP%.sql

docker compose exec -T db pg_dump -U postgres -d posdb > "%OUT%"
if errorlevel 1 (
  echo [%date% %time%] Backup FAILED >> backups\backup.log
  del "%OUT%" 2>nul
  exit /b 1
)

REM An empty file means the dump didn't work (e.g. Docker not running)
for %%A in ("%OUT%") do if %%~zA LSS 1000 (
  echo [%date% %time%] Backup FAILED - file too small >> backups\backup.log
  del "%OUT%"
  exit /b 1
)

echo [%date% %time%] Backup OK: %OUT% >> backups\backup.log

REM Keep the last 30 days
forfiles /p "backups" /m "posdb_*.sql" /d -30 /c "cmd /c del @path" 2>nul

endlocal
exit /b 0
