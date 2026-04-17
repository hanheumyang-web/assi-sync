@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title ASSI Keynote 변환 도구

:: ────────────────────────────────────────────────────────────
::  ASSI — Keynote → 테스터 인수용 폴더 원클릭 변환
::  사용법: 이 파일에 .key 파일을 드래그앤드롭 하거나 더블클릭
:: ────────────────────────────────────────────────────────────

set "PROJECT_DIR=C:\assi-proto\desktop"
set "API_KEY_FILE=%USERPROFILE%\.assi-sync\anthropic-key.txt"

cd /d "%PROJECT_DIR%"
if errorlevel 1 (
  echo.
  echo ❌ 프로젝트 폴더 못 찾음: %PROJECT_DIR%
  pause
  exit /b 1
)

:: API 키 로드 (없으면 입력 받고 저장)
if not exist "%API_KEY_FILE%" goto ASK_KEY
set /p ANTHROPIC_API_KEY=<"%API_KEY_FILE%"
if "%ANTHROPIC_API_KEY%"=="" goto ASK_KEY
goto KEY_OK

:ASK_KEY
echo.
echo ════════════════════════════════════════
echo   Claude API 키 최초 입력 (1회만)
echo ════════════════════════════════════════
echo   https://console.anthropic.com/settings/keys
echo.
set /p "ANTHROPIC_API_KEY=API 키 (sk-ant-...): "
if "%ANTHROPIC_API_KEY%"=="" (
  echo ❌ 키 입력 안 됨. 종료.
  pause
  exit /b 1
)
if not exist "%USERPROFILE%\.assi-sync" mkdir "%USERPROFILE%\.assi-sync"
>"%API_KEY_FILE%" echo %ANTHROPIC_API_KEY%
echo ✓ 키 저장됨: %API_KEY_FILE%

:KEY_OK

:: .key 파일 경로
set "KEY_PATH=%~1"
if "%KEY_PATH%"=="" (
  echo.
  echo ════════════════════════════════════════
  echo   Keynote 파일 경로 입력
  echo ════════════════════════════════════════
  echo   💡 팁: 이 .cmd 파일에 .key 파일을 드래그앤드롭 하면 자동 입력됩니다
  echo.
  set /p "KEY_PATH=.key 파일 경로 (따옴표 없이): "
)
if not exist "%KEY_PATH%" (
  echo.
  echo ❌ 파일 없음: %KEY_PATH%
  pause
  exit /b 1
)

:: 테스터 이름
echo.
echo ════════════════════════════════════════
echo   테스터 이름 입력 (결과 폴더명에 사용)
echo ════════════════════════════════════════
set /p "TESTER=테스터 이름 (예: 홍길동): "
if "%TESTER%"=="" set "TESTER=unknown"

echo.
echo ════════════════════════════════════════
echo   🔍 파싱 + AI 분류 시작
echo   파일: %KEY_PATH%
echo   테스터: %TESTER%
echo ════════════════════════════════════════
echo.

:: 1단계: 파싱 + AI 분류 → review.html 생성
node scripts/keynote-handoff.js "%KEY_PATH%" --tester "%TESTER%" > "%TEMP%\assi-handoff.log" 2>&1
type "%TEMP%\assi-handoff.log"

:: 세션 ID 로그에서 추출
for /f "tokens=* delims=" %%A in ('findstr /C:"kn-handoff-" "%TEMP%\assi-handoff.log"') do (
  for %%B in (%%A) do (
    echo %%B | findstr /C:"kn-handoff-" > nul && set "LINE=%%B"
  )
)
:: 더 간단한 세션 ID 추출 — 생성된 세션 폴더 탐색
for /f "delims=" %%A in ('dir /b /od /ad "%USERPROFILE%\.assi-sync\keynote-preview\kn-handoff-*" 2^>nul') do set "LATEST_SESSION=%%A"
if "%LATEST_SESSION%"=="" (
  echo ❌ 세션 생성 실패. 로그 확인: %TEMP%\assi-handoff.log
  pause
  exit /b 1
)

echo.
echo ════════════════════════════════════════
echo   📄 리뷰 HTML 브라우저에서 열림
echo   세션: %LATEST_SESSION%
echo ════════════════════════════════════════
echo.
start "" "%USERPROFILE%\.assi-sync\keynote-preview\%LATEST_SESSION%\review.html"

echo [A] AI 결과 그대로 바로 폴더 생성
echo [B] 브라우저에서 검수 후 JSON 내보내기 → 적용 (수동 단계)
echo.
set /p "MODE=선택 (A/B): "

if /i "%MODE%"=="B" goto MODE_B

:MODE_A
echo.
echo 🟢 AI 결과 그대로 폴더 생성 중...
node scripts/keynote-handoff.js --apply-auto --session %LATEST_SESSION% --tester "%TESTER%"
goto DONE

:MODE_B
echo.
echo 📝 검수 모드:
echo   1) 브라우저에서 분류 수정
echo   2) "확정 · 폴더 생성" 버튼 클릭 (JSON 다운로드됨)
echo   3) 기본 위치: %USERPROFILE%\Downloads\classification.json
echo.
echo 완료하면 아무 키나 누르세요...
pause > nul
set "JSON_PATH=%USERPROFILE%\Downloads\classification.json"
if not exist "%JSON_PATH%" (
  set /p "JSON_PATH=classification.json 경로 입력: "
)
node scripts/keynote-handoff.js --apply "%JSON_PATH%" --session %LATEST_SESSION% --tester "%TESTER%"

:DONE
echo.
echo ════════════════════════════════════════
echo   ✅ 완료!
echo ════════════════════════════════════════
set "OUTPUT_DIR=%USERPROFILE%\Desktop\ASSI-handoff"
echo 결과 폴더 탐색기에서 열기...
start "" "%OUTPUT_DIR%"
echo.
echo 👉 테스터별 폴더를 우클릭 → 압축(zip) 해서 전달하세요
echo.
pause
