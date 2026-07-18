@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Deploy softwork-project-manager
echo ============================================
echo.
echo This only pushes source code. Plesk builds frontend itself
echo (Node.js panel: NPM install -^> Run script "build" -^> Restart App).
echo We do NOT pre-build locally anymore -- a Windows-built frontend
echo bakes Windows-style paths that crash on the Linux server.

REM ---- 1) Commit everything to the main repo (origin) ----
echo.
echo [1/3] Committing to main repo...
git add backend database frontend
git commit -m "Deploy %date% %time%"

echo.
echo [2/3] Pushing main repo to origin...
git push origin master
if errorlevel 1 (
    echo.
    echo Push to origin FAILED.
    pause
    exit /b 1
)

REM ---- 2) Split-push backend/ and frontend/ (source only) to their own deploy repos ----
echo.
echo [3/3] Pushing backend -^> backend-deploy, frontend -^> frontend-deploy...
git subtree push --prefix=backend backend-deploy master
if errorlevel 1 (
    echo.
    echo backend-deploy push FAILED.
    pause
    exit /b 1
)

git subtree push --prefix=frontend frontend-deploy master
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
echo   frontend-deploy  ^<- frontend\  (source only)
echo.
echo   On Plesk, for frontend, after pulling:
echo     1. NPM install
echo     2. Run script -^> build
echo     3. Restart App
echo   Startup file: server.js
echo ============================================
pause
