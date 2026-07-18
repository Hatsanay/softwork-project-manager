@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Deploy softwork-project-manager
echo ============================================

REM ---- 1) Build frontend (standalone output) ----
echo.
echo [1/5] Building frontend...
cd frontend
call npm run build
if errorlevel 1 (
    echo.
    echo Frontend build FAILED. Aborting deploy.
    pause
    exit /b 1
)
cd ..

REM ---- 2) Assemble deployable frontend bundle into frontend-dist ----
echo.
echo [2/5] Assembling frontend-dist...
if exist frontend-dist rmdir /s /q frontend-dist
mkdir frontend-dist
xcopy /e /i /y /q "frontend\.next\standalone\*" "frontend-dist\" >nul
mkdir frontend-dist\.next
xcopy /e /i /y /q "frontend\.next\static" "frontend-dist\.next\static\" >nul
xcopy /e /i /y /q "frontend\public" "frontend-dist\public\" >nul

REM ---- 3) Commit everything to the main repo (origin) ----
echo.
echo [3/5] Committing to main repo...
git add backend database frontend frontend-dist
git commit -m "Deploy %date% %time%"

echo.
echo [4/5] Pushing main repo to origin...
git push origin master
if errorlevel 1 (
    echo.
    echo Push to origin FAILED.
    pause
    exit /b 1
)

REM ---- 5) Split-push backend/ and frontend-dist/ to their own deploy repos ----
echo.
echo [5/5] Pushing backend -^> backend-deploy, frontend-dist -^> frontend-deploy...
git subtree push --prefix=backend backend-deploy master
if errorlevel 1 (
    echo.
    echo backend-deploy push FAILED.
    pause
    exit /b 1
)

git subtree push --prefix=frontend-dist frontend-deploy master
if errorlevel 1 (
    echo.
    echo frontend-deploy push FAILED.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Deploy complete.
echo   backend-deploy   ^<- backend\
echo   frontend-deploy  ^<- frontend-dist\  (startup file: server.js)
echo ============================================
pause
