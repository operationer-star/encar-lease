@echo off
chcp 65001 >nul
REM 엔카 HEV 승계 주간 수집 — Windows 작업 스케줄러가 매주 월 08:00 실행
set REPO=%USERPROFILE%\encar-lease
set LOG=%REPO%\logs\run_%date:~0,4%%date:~5,2%%date:~8,2%.log
if not exist "%REPO%\logs" mkdir "%REPO%\logs"
cd /d "%REPO%" || exit /b 1
echo ===== %date% %time% 시작 >> "%LOG%"
git pull --rebase origin main >> "%LOG%" 2>&1
node scripts\collect.mjs >> "%LOG%" 2>&1
if errorlevel 1 (
  echo 수집 실패 >> "%LOG%"
  git add report.json >> "%LOG%" 2>&1
  git -c user.name=encar-bot -c user.email=encar-bot@users.noreply.github.com commit -m "watch: 수집 실패 기록" >> "%LOG%" 2>&1
  git push origin HEAD:main >> "%LOG%" 2>&1
  exit /b 1
)
git add watch.html watch_data.json watch_history.json report.json report.md >> "%LOG%" 2>&1
git -c user.name=encar-bot -c user.email=encar-bot@users.noreply.github.com commit -m "watch: %date% 주간 수집 (PC)" >> "%LOG%" 2>&1
git push origin HEAD:main >> "%LOG%" 2>&1
echo ===== %date% %time% 끝 >> "%LOG%"
