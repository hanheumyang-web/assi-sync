# ASSI — Keynote → 테스터 인수용 폴더 원클릭 변환 (PowerShell)
# 사용법:
#   (A) ASSI-Keynote-변환.cmd 에 .key 드래그앤드롭
#   (B) 직접 실행: powershell -ExecutionPolicy Bypass -File .\ASSI-Keynote-변환.ps1

param(
    [string]$KeyPath = ""
)

$ErrorActionPreference = "Continue"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$projectDir = "C:\assi-proto\desktop"
$apiKeyFile = "$env:USERPROFILE\.assi-sync\anthropic-key.txt"
$sessionBase = "$env:USERPROFILE\.assi-sync\keynote-preview"

if (-not (Test-Path $projectDir)) {
    Write-Host "`n❌ 프로젝트 폴더 없음: $projectDir" -ForegroundColor Red
    Read-Host "Enter 눌러 종료"
    exit 1
}
Set-Location $projectDir

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ASSI Keynote → 테스터 인수 폴더 변환" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan

# ─── 1) API 키 확인 ───
if (-not (Test-Path $apiKeyFile)) {
    Write-Host ""
    Write-Host "Claude API 키 최초 입력 (1회만)" -ForegroundColor Yellow
    Write-Host "  https://console.anthropic.com/settings/keys"
    $key = Read-Host "`nsk-ant- 로 시작하는 키 붙여넣기"
    if ([string]::IsNullOrWhiteSpace($key)) {
        Write-Host "❌ 키 입력 안 됨." -ForegroundColor Red
        Read-Host "Enter"
        exit 1
    }
    $dir = Split-Path $apiKeyFile -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $key.Trim() | Out-File -FilePath $apiKeyFile -Encoding utf8 -NoNewline
    Write-Host "✓ 키 저장됨" -ForegroundColor Green
}
$env:ANTHROPIC_API_KEY = (Get-Content $apiKeyFile -Raw).Trim()

# ─── 2) .key 파일 경로 ───
if ([string]::IsNullOrWhiteSpace($KeyPath)) {
    Write-Host ""
    Write-Host "Keynote 파일 경로 입력" -ForegroundColor Yellow
    Write-Host "  💡 팁: .cmd 파일에 .key 를 드래그하면 자동 입력됨"
    $KeyPath = Read-Host "`n.key 파일 경로 (따옴표 빼고)"
}
$KeyPath = $KeyPath.Trim('"').Trim()
if (-not (Test-Path $KeyPath)) {
    Write-Host "`n❌ 파일 없음: $KeyPath" -ForegroundColor Red
    Read-Host "Enter"
    exit 1
}

# ─── 3) 테스터 이름 ───
Write-Host ""
$tester = Read-Host "테스터 이름 (예: 홍길동)"
if ([string]::IsNullOrWhiteSpace($tester)) { $tester = "unknown" }

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🔍 파싱 + AI 분류 시작" -ForegroundColor Cyan
Write-Host "  파일: $KeyPath"
Write-Host "  테스터: $tester"
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ─── 4) 파싱 + 분류 실행 ───
$before = Get-ChildItem $sessionBase -Directory -Filter "kn-handoff-*" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
& node scripts\keynote-handoff.js "$KeyPath" --tester "$tester"
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ 분류 실패" -ForegroundColor Red
    Read-Host "Enter"
    exit 1
}

# 최신 세션 ID 찾기
$after = Get-ChildItem $sessionBase -Directory -Filter "kn-handoff-*" | Sort-Object LastWriteTime -Descending
$latestSession = $after | Select-Object -First 1 -ExpandProperty Name
if (-not $latestSession) {
    Write-Host "❌ 세션 폴더 못 찾음" -ForegroundColor Red
    Read-Host "Enter"
    exit 1
}

$reviewHtml = "$sessionBase\$latestSession\review.html"
Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host "  📄 리뷰 HTML 브라우저 자동 오픈" -ForegroundColor Green
Write-Host "  세션: $latestSession"
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Start-Process $reviewHtml

# ─── 5) 모드 선택 ───
Write-Host ""
Write-Host "[A] AI 결과 그대로 바로 폴더 생성 (빠름, 1분)" -ForegroundColor White
Write-Host "[B] 브라우저에서 검수 후 JSON 적용 (추천, 3~5분)" -ForegroundColor White
$mode = Read-Host "`n선택 (A/B, 기본 A)"

if ($mode -ieq "B") {
    Write-Host ""
    Write-Host "📝 검수 모드:" -ForegroundColor Yellow
    Write-Host "  1) 브라우저에서 분류 수정"
    Write-Host "  2) '확정 · 폴더 생성' 버튼 클릭 (classification.json 다운로드됨)"
    Write-Host "  3) 기본 위치: $env:USERPROFILE\Downloads\classification.json"
    Write-Host ""
    Read-Host "완료하면 Enter 누르기"
    $jsonPath = "$env:USERPROFILE\Downloads\classification.json"
    if (-not (Test-Path $jsonPath)) {
        $jsonPath = Read-Host "classification.json 경로 직접 입력"
        $jsonPath = $jsonPath.Trim('"').Trim()
    }
    & node scripts\keynote-handoff.js --apply "$jsonPath" --session $latestSession --tester "$tester"
} else {
    Write-Host ""
    Write-Host "🟢 AI 결과 그대로 폴더 생성 중..." -ForegroundColor Green
    & node scripts\keynote-handoff.js --apply-auto --session $latestSession --tester "$tester"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ 폴더 생성 실패" -ForegroundColor Red
    Read-Host "Enter"
    exit 1
}

# ─── 6) 완료 + 탐색기 오픈 ───
Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ 완료!" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Green
$outputDir = "$env:USERPROFILE\Desktop\ASSI-handoff"
if (Test-Path $outputDir) {
    Start-Process $outputDir
}
Write-Host ""
Write-Host "👉 결과 폴더 탐색기에서 열렸습니다"
Write-Host "👉 테스터별 폴더를 우클릭 → 압축(zip) → 전달하세요"
Write-Host ""
Read-Host "Enter 눌러 종료"
