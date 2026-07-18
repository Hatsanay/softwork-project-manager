@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Deploy softwork-project-manager
echo ============================================

REM ---- 1) Build frontend INSIDE WSL (Linux), not on Windows ----
REM     Building with `next build` directly on Windows bakes Windows-style
REM     backslash paths into .next/required-server-files.json (appDir, files[]).
REM     On the Linux production server, Passenger's server.js reads that file
REM     to find its own manifests -- backslash paths don't resolve on Linux,
REM     so the app crashes on startup with "Web application could not be
REM     started". Building inside WSL produces a genuinely Linux-native bundle.
echo.
echo [1/5] Building frontend via WSL (Linux)...
wsl -e bash -c "rm -rf ~/build/frontend && mkdir -p ~/build/frontend"
wsl -e bash -c "cd /mnt/d/project/softwork-project-manager/frontend && tar --exclude=node_modules --exclude=.next -cf - . | (cd ~/build/frontend && tar -xf -)"
wsl -e bash -c "cd ~/build/frontend && npm install"
if errorlevel 1 (
    echo.
    echo Frontend npm install FAILED ^(WSL^). Aborting deploy.
    pause
    exit /b 1
)
wsl -e bash -c "cd ~/build/frontend && npm run build"
if errorlevel 1 (
    echo.
    echo Frontend build FAILED ^(WSL^). Aborting deploy.
    pause
    exit /b 1
)
wsl -e bash -c "cd ~/build/frontend && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public"

REM ---- 2) Copy the built bundle from WSL back into frontend-dist ----
echo.
echo [2/5] Assembling frontend-dist...
if exist frontend-dist rmdir /s /q frontend-dist
mkdir frontend-dist
wsl -e bash -c "cd ~/build/frontend/.next/standalone && tar -cf - . | tar -xf - -C /mnt/d/project/softwork-project-manager/frontend-dist"
if errorlevel 1 (
    echo.
    echo Copying built bundle out of WSL FAILED. Aborting deploy.
    pause
    exit /b 1
)

REM ---- Safety check: refuse to deploy if Windows-style paths leaked into the bundle ----
findstr /c:"appDir\": \"D:" frontend-dist\.next\required-server-files.json >nul 2>&1
if not errorlevel 1 (
    echo.
    echo Frontend bundle contains a Windows path in required-server-files.json.
    echo This build was not produced in WSL correctly. Aborting deploy.
    pause
    exit /b 1
)

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

for /f %%i in ('git subtree split --prefix=frontend-dist HEAD') do set SPLIT_HASH=%%i
git push frontend-deploy %SPLIT_HASH%:master --force
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
