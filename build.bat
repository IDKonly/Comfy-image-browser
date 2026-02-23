@echo off
:: Set UTF-8 encoding
chcp 65001 > nul

echo [INFO] Starting ComfyView Release Build...

:: Check if node_modules exists
if not exist node_modules (
    echo [INFO] Installing dependencies...
    call npm install
)

:: Run Tauri Build (Frontend + Backend)
call npm run tauri build

if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    exit /b %errorlevel%
)

echo [SUCCESS] Build finished successfully!
echo [INFO] Check src-tauri/target/release/bundle/ for installers.

pause