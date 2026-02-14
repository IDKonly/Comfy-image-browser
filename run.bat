@echo off
:: UTF-8 설정 (한글 깨짐 방지)
chcp 65001 > nul

echo [INFO] ComfyView Next-Gen 시작 중...

:: 환경 체크
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm이 설치되어 있지 않습니다. Node.js를 설치해주세요.
    pause
    exit /b 1
)

:: 의존성 설치 확인 및 실행
if not exist node_modules (
    echo [INFO] 의존성 설치 중...
    npm install
)

echo [INFO] Tauri 개발 서버 실행...
npm run tauri dev

if %errorlevel% neq 0 (
    echo [ERROR] 프로그램 실행 중 오류가 발생했습니다.
    pause
)
