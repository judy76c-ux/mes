@echo off
echo.
echo  MES 로컬 개발 서버 시작
echo  브라우저에서 열기: http://localhost:8080
echo  종료: Ctrl+C
echo.
cd /d "%~dp0"
python -m http.server 8080
