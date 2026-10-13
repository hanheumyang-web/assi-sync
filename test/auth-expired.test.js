/* 로그인이 끝났을 때 — 실행: node test/auth-expired.test.js
 *
 * ⚠️ 2026-10-13 테스터 화면. 앱 로그인이 끝났는데(구글 쪽 TOKEN_EXPIRED) 위에는 「● 동기화 중」 이 그대로였고,
 *    영상 7개가 하나씩 「Token refresh failed: TOKEN_EXPIRED」 로 실패해 「재시도」 가 쌓였다. 재시도해도 같은 답이었다.
 * 지켜야 할 것:
 *   1) 로그인이 끝났다는 답은 한 번만 받고, 그 뒤로는 서버를 두드리지 않는다
 *   2) 앱에는 한 번만 알린다 (파일마다가 아니라)
 *   3) 못 올린 파일은 「실패」 가 아니라 「대기(held)」 로 붙들고, 다시 로그인하면 다시 올린다
 *   4) 잠깐 끊긴 것(네트워크 등)은 로그인 끝남으로 보지 않는다
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { ApiClient } = require(path.join(__dirname, '..', 'lib', 'api-client.js'))
const M = require(path.join(__dirname, '..', 'lib', 'sync-engine.js'))
const Engine = M.SyncEngine || M

let fail = 0, n = 0
const ok = (t, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + t + (x ? '  ' + x : '')); if (!c) fail++ }
const head = t => { n++; console.log(`\n${'━'.repeat(64)}\n${n}. ${t}`) }

/* 가짜 인터넷 — 열쇠 갱신(securetoken)과 우리 서버(api/desktop) 부른 횟수를 센다 */
function 가짜인터넷({ refresh = 'TOKEN_EXPIRED' } = {}) {
  const 셈 = { refresh: 0, api: 0 }
  global.fetch = async (url) => {
    if (String(url).includes('securetoken.googleapis.com')) {
      셈.refresh++
      if (refresh === 'ok') return { json: async () => ({ id_token: 'new-id', refresh_token: 'new-rt' }) }
      return { json: async () => ({ error: { message: refresh } }) }
    }
    셈.api++
    return { status: 401, ok: false, text: async () => '{"error":"Unauthorized"}', json: async () => ({}) }
  }
  return 셈
}

;(async () => {

head('열쇠 갱신이 TOKEN_EXPIRED 면 「로그인 끝남」 — 한 번만 알리고 더는 안 부른다')
{
  const 셈 = 가짜인터넷()
  let 알림 = 0
  const api = new ApiClient({ idToken: 'old', refreshToken: 'dead', onAuthExpired: () => 알림++ })
  api.tokenExpiresAt = 0
  let e1 = null, e2 = null
  try { await api.ensureFreshToken() } catch (e) { e1 = e }
  try { await api.request('firestore', { action: 'x' }) } catch (e) { e2 = e }
  ok('첫 오류는 auth-expired', e1?.code === 'auth-expired', e1?.message)
  ok('사람 말로 알린다 (영어 TOKEN_EXPIRED 가 아님)', /로그인이 끝났어요/.test(e1?.message || ''))
  ok('두 번째 부름도 auth-expired', e2?.code === 'auth-expired')
  ok('열쇠 갱신은 딱 한 번만 시도', 셈.refresh === 1, `${셈.refresh}번`)
  ok('우리 서버는 아예 안 불렀다', 셈.api === 0, `${셈.api}번`)
  ok('앱 알림은 한 번', 알림 === 1, `${알림}번`)
  ok('dead 표시', api.dead === true)
}

head('USER_DISABLED · INVALID_REFRESH_TOKEN · 열쇠 없음도 같은 「로그인 끝남」')
for (const code of ['USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_REFRESH_TOKEN', 'TOKEN_EXPIRED : extra']) {
  가짜인터넷({ refresh: code })
  const api = new ApiClient({ idToken: 'old', refreshToken: 'dead' })
  api.tokenExpiresAt = 0
  let err = null
  try { await api.ensureFreshToken() } catch (e) { err = e }
  ok(`${code} → auth-expired`, err?.code === 'auth-expired')
}
{
  const api = new ApiClient({ idToken: 'old', refreshToken: '' })
  api.tokenExpiresAt = 0
  let err = null
  try { await api.ensureFreshToken() } catch (e) { err = e }
  ok('열쇠가 아예 없음 → auth-expired', err?.code === 'auth-expired')
}

head('잠깐 끊김(그 밖의 답)은 로그인 끝남이 아니다 — 다음에 다시 해 본다')
{
  const 셈 = 가짜인터넷({ refresh: 'TOO_MANY_ATTEMPTS_TRY_LATER' })
  let 알림 = 0
  const api = new ApiClient({ idToken: 'old', refreshToken: 'rt', onAuthExpired: () => 알림++ })
  api.tokenExpiresAt = 0
  let err = null
  try { await api.ensureFreshToken() } catch (e) { err = e }
  ok('auth-expired 가 아니다', err && err.code !== 'auth-expired', err?.message)
  ok('dead 아님', api.dead === false)
  ok('알림 없음', 알림 === 0)
  try { await api.ensureFreshToken() } catch (_) {}
  ok('다음 번에 다시 시도한다', 셈.refresh === 2, `${셈.refresh}번`)
}

head('다시 로그인(revive)하면 되살아난다')
{
  가짜인터넷()
  const api = new ApiClient({ idToken: 'old', refreshToken: 'dead' })
  api.tokenExpiresAt = 0
  try { await api.ensureFreshToken() } catch (_) {}
  api.revive({ idToken: 'fresh', refreshToken: 'fresh-rt' })
  let err = null
  try { await api.ensureFreshToken() } catch (e) { err = e }
  ok('dead 풀림', api.dead === false)
  ok('새 열쇠로 바로 통과', err === null && api.idToken === 'fresh')
}

head('동기화 중 로그인이 끝나면 — 파일은 「실패」 가 아니라 「대기」, 서버는 한 번만')
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pofol-auth-'))
  const proj = path.join(dir, '작업A')
  fs.mkdirSync(proj)
  /* 진짜 이미지 파일 (1x1 PNG) 세 개 */
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const files = ['a.png', 'b.png', 'c.png'].map(f => { const p = path.join(proj, f); fs.writeFileSync(p, png); return p })

  const 셈 = 가짜인터넷()
  let 알림 = 0
  const api = new ApiClient({ idToken: 'old', refreshToken: 'dead', onAuthExpired: () => 알림++ })
  api.tokenExpiresAt = 0
  const statuses = []
  const e = new Engine({
    uid: 'u1', watchDir: dir, statePath: path.join(dir, '.state.json'), api,
    onFileStatus: (s) => statuses.push(s), onError: () => {},
  })
  e.approvedFolders.add('작업A')
  for (const f of files) await e.syncFile(f)

  const 실패 = statuses.filter(s => s.status === 'failed')
  const 대기 = statuses.filter(s => s.status === 'held')
  ok('「실패」 로 쌓인 파일 없음', 실패.length === 0, 실패.map(s => `${s.fileName}:${s.error}`).join(', '))
  ok('붙들어 둔 파일 3개 (failedFiles)', e.failedFiles.size === 3, `${e.failedFiles.size}개`)
  ok('화면엔 세 파일 모두 「대기」 로 보인다', new Set(대기.map(s => s.fileName)).size === 3, `${대기.length}개`)
  ok('대기 문구는 사람 말', 대기.every(s => /다시 로그인하면 올려요/.test(s.phase || '')))
  ok('영어 오류(TOKEN_EXPIRED)가 화면에 안 나간다', !statuses.some(s => /TOKEN_EXPIRED/.test(String(s.error || ''))))
  ok('열쇠 갱신 시도는 한 번', 셈.refresh === 1, `${셈.refresh}번`)
  ok('앱 알림은 한 번', 알림 === 1, `${알림}번`)

  /* 다시 로그인 → 붙든 파일을 다시 올린다 */
  api.revive({ idToken: 'fresh', refreshToken: 'fresh-rt' })
  const 다시 = []
  e.syncFile = async (f) => { 다시.push(path.basename(f)) }
  await e.retryAllFailed()
  ok('다시 로그인 뒤 세 파일 모두 다시 올린다', 다시.sort().join(',') === 'a.png,b.png,c.png', 다시.join(','))
  ok('붙든 목록이 비었다', e.failedFiles.size === 0)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(`\n${fail ? '❌ 실패 ' + fail : '✅ 모두 통과'}`)
process.exit(fail ? 1 : 0)
})()
