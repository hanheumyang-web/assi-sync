/* 카카오 로그인 — 컴퓨터 앱 (11/10). 실행: node test/kakao-login.test.js
 * 깨지면 무엇을 잃나: 웹 · 아이폰에서 카카오로 쓰던 사람이 컴퓨터 앱에서 다른 계정으로 들어가거나(같은 서버 길이 아니면),
 *   비밀 원본이 서버 · 주소로 새어 남이 1회용 코드로 로그인하거나, 창을 닫았는데 오류 창이 뜬다.
 * 서버 대역(가짜 fetch)만 — 실제 서버 · 카카오 · 계정에 닿지 않는다. 앱 안 창 가로채기는 진짜 앱 창으로 따로 봤다(판 mac-1110-판.md).
 */
const path = require('path')
const K = require(path.join(__dirname, '..', 'lib', 'kakao-login.js'))

let fail = 0
const ok = (n, c, extra) => { console.log((c ? '  ✅ ' : '  ❌ ') + n + (extra ? '  ' + extra : '')); if (!c) fail++ }
const head = t => console.log(`\n${'━'.repeat(64)}\n${t}`)
const 코드 = 'A'.repeat(43)

/* 가짜 서버 — 부른 주소 · 몸을 적고, 실제 서버 답 모양 그대로 돌려준다 */
function 대역(바꿀 = {}) {
  const 부른것 = []
  const 답 = {
    start: { status: 200, j: { url: 'https://kauth.kakao.com/oauth/authorize?client_id=x&state=y' } },
    exchange: { status: 200, j: { token: 'custom-token', to: '/', claimed: false, moved: false } },
    signIn: { status: 200, j: { idToken: 'id-token', refreshToken: 'refresh-token', localId: 'linked-uid' } },
    lookup: { status: 200, j: { users: [{ localId: 'linked-uid', displayName: '하미', photoUrl: 'https://k.kakaocdn.net/a.jpg' }] } },
    ...바꿀,
  }
  const fetchImpl = async (url, o) => {
    const body = JSON.parse(o.body)
    부른것.push({ url, body })
    const 이름 = url.includes('/kakao/start') ? 'start' : url.includes('/kakao/exchange') ? 'exchange' : url.includes(':signInWithCustomToken') ? 'signIn' : 'lookup'
    const a = 답[이름]
    return { ok: a.status < 400, status: a.status, json: async () => a.j }
  }
  return { fetchImpl, 부른것 }
}

;(async () => {
head('1. 비밀의 지문 — 서버(api/_lib/kakao.js 지문)와 같은 값 · 같은 꼴(43자)')
{
  /* 값은 서버 함수로 만든 것 (assi-proto api/_lib/kakao.js 지문('desktop-test-verifier-1110'), 11/10) */
  ok('서버와 같은 지문', K.지문('desktop-test-verifier-1110') === 'xKRBoPMSBDDwT5njiN9tepbAG9z0Y8MH3FVZ-mWnrIs')
  const v = K.비밀만들기()
  ok('비밀은 43자 · 매번 다름', /^[A-Za-z0-9_-]{43}$/.test(v) && v !== K.비밀만들기())
  ok('지문도 43자 (서버 앱지문모양)', /^[A-Za-z0-9_-]{43}$/.test(K.지문(v)))
}

head('2. 시작 — 서버엔 지문만, 비밀 원본은 안 간다 · pofol.co 로 (assifolio.com 은 서버가 막는다)')
{
  const { fetchImpl, 부른것 } = 대역()
  const 비밀 = K.비밀만들기()
  const url = await K.시작주소({ 비밀, fetchImpl })
  ok('카카오 로그인 화면 주소', url.startsWith('https://kauth.kakao.com/'))
  ok('pofol.co 의 시작 주소', 부른것[0].url === 'https://pofol.co/api/auth/kakao/start')
  ok('몸 = { app: 지문 } 하나뿐', JSON.stringify(부른것[0].body) === JSON.stringify({ app: K.지문(비밀) }))
  ok('비밀 원본은 어디에도 없음', !JSON.stringify(부른것).includes(비밀))
  const 꺼짐 = 대역({ start: { status: 503, j: { error: '카카오 로그인은 아직 준비 중이에요.' } } })
  let 글 = ''
  try { await K.시작주소({ 비밀, fetchImpl: 꺼짐.fetchImpl }) } catch (e) { 글 = e.message }
  ok('서버가 꺼 두면 서버 글 그대로', 글 === '카카오 로그인은 아직 준비 중이에요.')
  const 이상 = 대역({ start: { status: 200, j: { url: 'https://evil.example/login' } } })
  let 막힘 = false
  try { await K.시작주소({ 비밀, fetchImpl: 이상.fetchImpl }) } catch { 막힘 = true }
  ok('카카오가 아닌 주소는 열지 않음', 막힘)
}

head('3. 돌아온 주소 읽기 — assi://kakao-login 만 · 코드 꼴 확인 · 취소는 조용히')
{
  ok('코드', K.돌아온주소읽기(`assi://kakao-login?kc=${코드}`)?.kc === 코드)
  ok('취소', K.돌아온주소읽기('assi://kakao-login?error=cancelled')?.그만둠 === true)
  ok('시간 지남 → 해요체 글', K.돌아온주소읽기('assi://kakao-login?error=state')?.오류 === '시간이 지났어요. 다시 눌러 주세요.')
  ok('모르는 이유 → 기본 글', K.돌아온주소읽기('assi://kakao-login?error=server')?.오류 === '카카오 로그인을 마치지 못했어요. 잠시 뒤 다시 해 주세요.')
  ok('코드 꼴이 틀리면 오류', !!K.돌아온주소읽기('assi://kakao-login?kc=short')?.오류)
  ok('다른 assi 주소는 우리 것 아님', K.돌아온주소읽기(`assi://other?kc=${코드}`) === null)
  ok('https 주소는 우리 것 아님', K.돌아온주소읽기(`https://pofol.co/?kc=${코드}`) === null)
  for (const 이유 of ['off', 'state', 'expired', 'profile', 'server', 'x']) {
    const 글 = K.오류글(이유)
    ok(`글 「${이유}」 해요체 · 남의 제품 이름 없음`, /(요|요\.)$/.test(글) && !/습니다|크롬|사파리|chrome|safari/i.test(글), 글)
  }
}

head('4. 마치기 — 코드 + 비밀 원본으로 열쇠 → Firebase 로그인 → 다른 로그인과 같은 모양 (연결한 카카오면 그 계정 uid)')
{
  const { fetchImpl, 부른것 } = 대역()
  const 비밀 = K.비밀만들기()
  const u = await K.로그인마치기({ kc: 코드, 비밀, apiKey: 'KEY', fetchImpl })
  ok('바꾸기 몸 = { code, verifier }', JSON.stringify(부른것[0].body) === JSON.stringify({ code: 코드, verifier: 비밀 }) && 부른것[0].url === 'https://pofol.co/api/auth/kakao/exchange')
  ok('Firebase 에 열쇠로 로그인', 부른것[1].url.includes(':signInWithCustomToken?key=KEY') && 부른것[1].body.token === 'custom-token' && 부른것[1].body.returnSecureToken === true)
  ok('서버가 정한 계정 uid 그대로 (설정에서 연결한 카카오 = 그 계정)', u.uid === 'linked-uid')
  ok('앱이 쓰는 모양', u.idToken === 'id-token' && u.refreshToken === 'refresh-token' && u.name === '하미' && u.email === '' && u.photo.startsWith('https://'))
  const 만료 = 대역({ exchange: { status: 410, j: { error: '로그인 정보가 만료됐어요. 처음 화면에서 다시 눌러 주세요.', reason: 'expired' } } })
  let 글 = ''
  try { await K.로그인마치기({ kc: 코드, 비밀, apiKey: 'KEY', fetchImpl: 만료.fetchImpl }) } catch (e) { 글 = e.message }
  ok('코드가 지났으면 서버 글', 글.includes('만료'))
  ok('그때 Firebase 는 안 부름', 만료.부른것.length === 1)
}

head('5. 한 번에 — 창을 닫으면 조용히, 오류는 글로 (창은 가짜)')
{
  const 가짜창 = 돌려줄 => ({
    BrowserWindow: class { constructor() { this.webContents = { on: (n, f) => { if (n === 'will-redirect') setImmediate(() => 돌려줄 && f({ url: 돌려줄, preventDefault() {} })) }, setWindowOpenHandler() {} }; this._닫힘 = [] }
      setMenuBarVisibility() {} on(n, f) { if (n === 'closed') { this._닫힘.push(f); if (!돌려줄) setImmediate(f) } } loadURL() { return Promise.resolve() } isDestroyed() { return false } destroy() {} },
    session: { fromPartition: () => ({ clearStorageData: () => Promise.resolve() }) },
    shell: { openExternal() {} },
  })
  const 닫음 = await K.카카오로그인({ ...가짜창(null), apiKey: 'KEY', fetchImpl: 대역().fetchImpl })
  ok('창을 닫으면 { error, 그만둠 } (화면은 아무 말 없이 단추만 되돌림)', 닫음.그만둠 === true && !닫음.uid)
  const 됨 = await K.카카오로그인({ ...가짜창(`assi://kakao-login?kc=${코드}`), apiKey: 'KEY', fetchImpl: 대역().fetchImpl })
  ok('돌아오면 로그인', 됨.uid === 'linked-uid')
  const 거절 = await K.카카오로그인({ ...가짜창('assi://kakao-login?error=profile'), apiKey: 'KEY', fetchImpl: 대역().fetchImpl })
  ok('카카오 정보 거절은 글로', 거절.error === '카카오 정보를 받지 못했어요. 다시 해 주세요.' && !거절.그만둠)
}

console.log(`\n${fail ? '❌ ' + fail + '개 실패' : '✅ 모두 통과'}`)
process.exit(fail ? 1 : 0)
})()
