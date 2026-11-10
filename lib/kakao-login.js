/* 카카오 로그인 — 컴퓨터 앱 (11/10 대표님 「가 하고 카카오로그인까지 붙여서 업뎃한번하자」)
 *
 * 웹 · 아이폰과 같은 서버 길(api/auth/kakao/*)을 쓴다 — 같은 카카오면 같은 pofol 계정, 설정에서 연결한 카카오도 그 계정.
 * 아이폰 앱(assi-ios AuthService.swift kakaoLoginToken, 10/19)과 같은 순서다:
 *   ① 앱이 비밀을 만들고 지문(sha256)만 서버에 보낸다 → 카카오 로그인 화면 주소
 *   ② 앱 안 창(따로 쓰는 빈 세션 — 끝나면 쿠키도 같이 버린다)에서 카카오 로그인
 *   ③ 서버가 assi://kakao-login?kc=<1회용 코드> 로 돌려보낸다 → 창이 그 주소로 가기 전에 앱이 가로채고 창을 닫는다(밖으로 안 나간다)
 *   ④ 1회용 코드 + 비밀 원본 → 서버가 로그인 열쇠(custom token) → Firebase 로그인 → 다른 로그인처럼 열쇠 둘(idToken · refreshToken)만 남긴다
 * ⚠️ 코드는 2분 · 한 번만 · 비밀 원본을 낸 앱만 바꿀 수 있다(서버 코드확인). 코드가 새도 비밀이 없으면 못 쓴다.
 * ⚠️ 비밀 · 로그인 열쇠는 어디에도 적지 않는다(로그에도). 남는 건 config.json 의 열쇠뿐 — 구글 · 애플 · 메일과 같다.
 * 처음 오는 카카오면 웹처럼 새 계정이 된다(구글 · 애플도 앱에서 처음이면 새 계정이다 — 「앱에는 가입이 없다」는 메일 비밀번호 얘기).
 */
const crypto = require('crypto')

const 서버 = 'https://pofol.co'   // ⚠️ 카카오 시작은 pofol.co 에서만 받는다(서버 같은호스트인가) — assifolio.com 은 안 된다
const 돌아올주소 = 'assi://kakao-login'
const 코드모양 = /^[A-Za-z0-9_-]{43}$/

const 비밀만들기 = () => crypto.randomBytes(32).toString('base64url')
/** 서버 api/_lib/kakao.js 지문 · 앱지문모양과 같은 꼴 — sha256 → base64url 43자 */
const 지문 = v => crypto.createHash('sha256').update(String(v)).digest('base64url')

/** 서버 이유 → 화면 글 (웹 src/lib/kakao-login.js 카카오오류글 · 아이폰 kakaoErrorMessage 와 같은 뜻, 해요체) */
function 오류글(이유) {
  switch (이유) {
    case 'off': return '카카오 로그인은 아직 준비 중이에요.'
    case 'state': case 'expired': return '시간이 지났어요. 다시 눌러 주세요.'
    case 'profile': return '카카오 정보를 받지 못했어요. 다시 해 주세요.'
    default: return '카카오 로그인을 마치지 못했어요. 잠시 뒤 다시 해 주세요.'
  }
}

/** 창이 가려는 주소가 우리 돌아올 주소인가 → { kc } | { 오류 } | { 그만둠 } . 아니면 null */
function 돌아온주소읽기(url) {
  let u
  try { u = new URL(String(url || '')) } catch { return null }
  if (u.protocol !== 'assi:' || u.hostname !== 'kakao-login') return null
  const 이유 = u.searchParams.get('error')
  if (이유) return 이유 === 'cancelled' ? { 그만둠: true } : { 오류: 오류글(이유) }
  const kc = u.searchParams.get('kc') || ''
  return 코드모양.test(kc) ? { kc } : { 오류: 오류글('kakao') }
}

async function 받기(fetchImpl, 주소, 몸) {
  let r, j = {}
  try {
    r = await fetchImpl(주소, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(몸), signal: AbortSignal.timeout(15000) })
    j = await r.json().catch(() => ({}))
  } catch { throw new Error('연결하지 못했어요. 인터넷을 확인해 주세요.') }
  return { ok: r.ok, status: r.status, j }
}

/** ① 카카오 로그인 화면 주소 — 서버엔 지문만 간다 */
async function 시작주소({ 비밀, fetchImpl = fetch, 주소 = 서버 } = {}) {
  const { ok, j } = await 받기(fetchImpl, `${주소}/api/auth/kakao/start`, { app: 지문(비밀) })
  const url = String(j.url || '')
  if (!ok || !url.startsWith('https://kauth.kakao.com/')) throw new Error(j.error || '카카오 로그인을 열지 못했어요.')
  return url
}

/** ④ 1회용 코드 + 비밀 → 로그인 열쇠 → Firebase 로그인 → 앱이 쓰는 사용자 정보(다른 로그인과 같은 모양) */
async function 로그인마치기({ kc, 비밀, apiKey, fetchImpl = fetch, 주소 = 서버 } = {}) {
  const 바꿈 = await 받기(fetchImpl, `${주소}/api/auth/kakao/exchange`, { code: kc, verifier: 비밀 })
  if (!바꿈.ok || !바꿈.j.token) throw new Error(바꿈.j.error || 오류글('server'))
  const 구 = 'https://identitytoolkit.googleapis.com/v1/accounts'
  const 들어감 = await 받기(fetchImpl, `${구}:signInWithCustomToken?key=${apiKey}`, { token: 바꿈.j.token, returnSecureToken: true })
  if (!들어감.ok || !들어감.j.idToken || !들어감.j.refreshToken) throw new Error(오류글('server'))
  const 나 = await 받기(fetchImpl, `${구}:lookup?key=${apiKey}`, { idToken: 들어감.j.idToken })
  const u = (나.ok && Array.isArray(나.j.users) && 나.j.users[0]) || {}
  const uid = u.localId || 들어감.j.localId || ''
  if (!uid) throw new Error(오류글('server'))
  return {
    uid,
    name: u.displayName || '',
    email: u.email || '',
    photo: u.photoUrl || '',
    idToken: 들어감.j.idToken,
    refreshToken: 들어감.j.refreshToken,
  }
}

/**
 * ②③ 앱 안 창에서 카카오 로그인 → 돌아올 주소(assi://kakao-login?…)를 가로채 돌려준다. 사람이 창을 닫으면 null.
 * electron 의 BrowserWindow · session · shell 을 받아서 쓴다(시험에서 가짜 서버로 돌려 본다).
 */
function 창으로받기({ BrowserWindow, session, shell, 주소, 부모 = null, 크기 = { width: 480, height: 720 } }) {
  return new Promise(resolve => {
    /* 따로 쓰는 빈 세션 — 'persist:' 를 안 붙이면 메모리에만 있고 창과 함께 사라진다(카카오 로그인이 이 컴퓨터에 남지 않는다) */
    const ses = session.fromPartition(`kakao-login-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`)
    let 끝 = false
    const win = new BrowserWindow({
      ...크기, resizable: false, parent: 부모 || undefined, modal: !!부모, show: true,
      title: '카카오로 계속하기',
      webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true },
    })
    win.setMenuBarVisibility?.(false)
    const 마치기 = 값 => {
      if (끝) return
      끝 = true
      resolve(값)
      setImmediate(() => { try { if (!win.isDestroyed()) win.destroy() } catch {} })
      ses.clearStorageData?.().catch?.(() => {})
    }
    /* 서버가 돌려보내는 302(will-redirect) · 페이지가 옮기는 이동(will-navigate) 둘 다 본다 — 창이 assi:// 로 가기 전에 멈춘다 */
    const 살피기 = (event, url) => {
      const 주소값 = event?.url || url
      if (!String(주소값 || '').startsWith('assi:')) return
      event.preventDefault?.()
      마치기(주소값)
    }
    win.webContents.on('will-redirect', 살피기)
    win.webContents.on('will-navigate', 살피기)
    /* 카카오 화면의 새 창(도움말 · 비밀번호 찾기 등)은 기본 인터넷 앱으로 — 앱 안에 창을 더 띄우지 않는다 */
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell?.openExternal?.(url)
      return { action: 'deny' }
    })
    win.on('closed', () => 마치기(null))
    win.loadURL(주소).catch(() => {})   // assi:// 로 멈추면 load 가 실패로 끝난다 — 그건 정상
  })
}

/** 한 번에 — main.js 가 부른다. 돌려주는 값은 다른 로그인과 같은 모양({ uid, … } 또는 { error } · 그만두면 { error, 그만둠 }) */
async function 카카오로그인({ BrowserWindow, session, shell, 부모, apiKey, fetchImpl = fetch, 주소 = 서버 }) {
  const 비밀 = 비밀만들기()
  try {
    const 로그인주소 = await 시작주소({ 비밀, fetchImpl, 주소 })
    const 돌아옴 = await 창으로받기({ BrowserWindow, session, shell, 주소: 로그인주소, 부모 })
    const 읽음 = 돌아옴 ? 돌아온주소읽기(돌아옴) : { 그만둠: true }
    if (!읽음 || 읽음.그만둠) return { error: '로그인 창이 닫혔어요', 그만둠: true }
    if (읽음.오류) return { error: 읽음.오류 }
    return await 로그인마치기({ kc: 읽음.kc, 비밀, apiKey, fetchImpl, 주소 })
  } catch (e) {
    return { error: e?.message || 오류글('server') }
  }
}

module.exports = { 카카오로그인, 시작주소, 로그인마치기, 창으로받기, 돌아온주소읽기, 오류글, 지문, 비밀만들기, 돌아올주소 }
