#!/bin/bash
# 빌드된 앱이 배포용 명의로 서명됐는지 확인한다.
#
# ⚠️ 왜 있는가 — 2026-09-07.
#    서명 인증서가 키체인에서 사라진 줄 모르고 빌드해서 배포했다.
#    electron-builder 는 서명을 못 해도 '건너뛴다' 고만 찍고 **성공으로 끝난다.**
#    산출물이 나온 것만 보고 올렸더니 자동 업데이트가 전부 거부당했다
#    ("code signature at URL ... did not pass validation").
#    사람이 로그를 읽는 것에 기대면 안 된다. 여기서 막는다.
set -e
WANT="Developer ID Application"
FOUND=0
for APP in dist/mac-arm64/*.app dist/mac/*.app; do
  [ -d "$APP" ] || continue
  FOUND=1
  echo "── $APP"
  if ! codesign -dvvv "$APP" 2>&1 | grep -q "Authority=$WANT"; then
    echo "❌ 배포용 명의로 서명되지 않았다. 이대로 올리면 자동 업데이트가 전부 실패한다."
    echo "   키체인 확인:  security find-identity -v -p codesigning"
    exit 1
  fi
  codesign -dvvv "$APP" 2>&1 | grep "Authority=$WANT"
  codesign --verify --deep --strict "$APP"
done
[ "$FOUND" = 1 ] || { echo "❌ 확인할 앱을 못 찾았다 (빌드 먼저)"; exit 1; }
echo "✅ 서명 확인 완료"
