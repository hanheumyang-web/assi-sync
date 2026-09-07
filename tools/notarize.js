/* 공증(notarize) — 애플 서버에 앱을 보내 "안전하다" 도장을 받고, 그 도장을 앱에 박는다.
   도장이 없으면 앱을 새로 내려받은 사람의 맥이 실행을 막는다.

   로그인 방법이 두 가지다. 있는 쪽을 쓴다.
   ① CI (깃허브 액션): 비밀값 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID
   ② 내 맥: 키체인에 저장해 둔 프로필 이름 (아래 PROFILE)
      등록:  xcrun notarytool store-credentials "pofol-notary" \
               --apple-id "<애플ID>" --team-id "3V9GKC2R66"

   ⚠️ 둘 다 없으면 **일부러 실패시킨다.** 조용히 건너뛰면 안 된다 —
      2026-09-07 에 서명 없이 나간 빌드가 모든 사용자의 자동 업데이트를 막았고,
      그 원인이 "못 하면 건너뛴다" 였다. 암호는 코드에도 저장소에도 두지 않는다. */
const PROFILE = 'pofol-notary'

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`
  const { execSync } = require('child_process')
  const { notarize } = require('@electron/notarize')

  const appleId = process.env.APPLE_ID
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID

  let opts = null
  if (appleId && applePassword && teamId) {
    console.log('[notarize] 계정 정보로 로그인한다 (CI)')
    opts = { tool: 'notarytool', appPath, appleId, appleIdPassword: applePassword, teamId }
  } else {
    let hasProfile = false
    try {
      execSync(`xcrun notarytool history --keychain-profile "${PROFILE}"`, { stdio: 'ignore' })
      hasProfile = true
    } catch {}
    if (hasProfile) {
      console.log(`[notarize] 키체인에 저장된 프로필로 로그인한다 (${PROFILE})`)
      opts = { tool: 'notarytool', appPath, keychainProfile: PROFILE }
    }
  }

  if (!opts) {
    throw new Error(
      '공증 로그인 정보가 없다. 둘 중 하나가 있어야 한다.\n' +
      '  · CI: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID 비밀값\n' +
      `  · 내 맥: xcrun notarytool store-credentials "${PROFILE}" --apple-id "<애플ID>" --team-id "3V9GKC2R66"`
    )
  }

  console.log(`[notarize] 애플에 보내는 중 — ${appPath} (몇 분 걸린다)`)
  await notarize(opts)
  console.log('[notarize] 도장 받았다')
}
