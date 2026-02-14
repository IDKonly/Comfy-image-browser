@echo off
chcp 65001
echo ========================================================
echo 이미지 관리 프로그램 (Image Manager Optimized) 실행
echo ========================================================
echo.

:: 가상환경이 있다면 활성화 (선택 사항)
:: call venv\Scripts\activate

echo Python 스크립트 실행 중...
python main.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [오류] 프로그램이 비정상적으로 종료되었습니다.
    echo 위 에러 메시지를 확인해주세요. (라이브러리 미설치 등)
    echo.
)

pause
