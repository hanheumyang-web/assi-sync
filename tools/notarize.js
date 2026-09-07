/* 공증(notarize) — 애플 서버에 앱을 보내 "안전하다" 도장을 받고, 그 도장을 앱에 박는다.
   도장이 없으면 앱을 새로 내려받은 사람의 맥이 실행을 막는다.

   ⚠️ 암호를 여기에도, 환경변수에도 두지 않는다.
      맥 키체인에 저장해 둔 프로필 이름만 부른다 (xcrun notarytool store-credentials 로 등록).
      등록: xcrun notarytool store-credentials "pofol-notary" \
              --apple-id "<애플ID>" --team-id "3V9GKC2R66" */
const PROFILE = 'pofol-notary'

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`

  const { execSync } = require('child_process')
  try {
    execSync(`security find-generic-password -s "com.apple.gs.appleid.auth" >/dev/null 2>&1 || true`)
    execSync(`xcrun notarytool history --keychain-profile "${PROFILE}" >/dev/null 2>&1`)
  } catch {
    throw new Error(
      `공증 계정이 등록되어 있지 않다 (프로필: ${PROFILE}).\n` +
      `  등록:  xcrun notarytool store-credentials "${PROFILE}" --apple-id "<애플ID>" --team-id "3V9GKC2R66"`
    )
  }

  console.log(`[notarize] 애플에 보내는 중 — ${appPath} (몇 분 걸린다)`)
  const { notarize } = require('@electron/notarize')
  await notarize({ tool: 'notarytool', appPath, keychainProfile: PROFILE })
  console.log('[notarize] 도장 받았다')
}
