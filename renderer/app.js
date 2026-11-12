// Firebase client SDK (loaded via CDN in a real app, but here we use the preload bridge)
// Auth is handled via Google OAuth popup

let currentUser = null
let selectedFolder = null
const fileStatuses = new Map() // path → status data

// [v1.9.15] main process 로그 forward — DevTools Console 에 [main] 표시
if (window.api?.onMainLog) {
  window.api.onMainLog(({ lvl, msg }) => {
    const style = lvl === 'error' ? 'color:#EF4444;font-weight:bold' : lvl === 'warn' ? 'color:#F59E0B' : 'color:#828DF8'
    console.log(`%c[main] %c${msg}`, style, '')
  })
}

/* ══════════════════════════════════════════════════════════
   새 디자인 한 벌 (11/13) — 웹 새 디자인(ui2)과 같은 아이콘 · 같은 앱 안 창.
   값 · 부품 꼴은 index.html <style> 에 있다(웹 ui-tokens.css · ui2/parts.css 를 옮김).
   ══════════════════════════════════════════════════════════ */

/* 아이콘 한 벌 — 웹 src/components/ui2/icons.jsx 의 길을 그대로 옮겼다(선 2.3 · 끝 둥글게 · 색은 글자색).
   웹 한 벌에 없던 꼴(새로고침 · 멈춤 · 시계 · 느낌표 · 내려받기)은 같은 굵기 · 같은 끝으로 더했다. */
const 아이콘길 = {
  globe: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.3 2.3 3.4 5.1 3.4 8.5s-1.1 6.2-3.4 8.5M12 3.5C9.7 5.8 8.6 8.6 8.6 12s1.1 6.2 3.4 8.5',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5.5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  search: 'M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l4.5 4.5',
  check: 'M6 12.5l4 4 8-9',
  folder: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z',
  grid: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  x: 'M6 6l12 12M18 6L6 18',
  star: 'M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7.9-5.6-4-3.9 5.6-.8z',
  pencil: 'M15.6 4.9a2 2 0 0 1 2.9 0l.6.6a2 2 0 0 1 0 2.9L8.6 18.9 4.5 19.5l.6-4.1zM13.8 6.7l3.5 3.5',
  trash: 'M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12M10 11v5.5M14 11v5.5',
  upload: 'M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 14.5v3A2 2 0 0 0 7 19.5h10a2 2 0 0 0 2-2v-3',
  image: 'M5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11A1.5 1.5 0 0 1 5.5 5zM4.5 16l4.2-4.2 3.3 3.3 2.2-2.2 5.3 5.1M15.5 9.3h.01',
  play: 'M8 5.5v13l10.5-6.5z',
  frame: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M10 9.5v5l4.2-2.5z',
  arrowL: 'M19 12H5.5M11 6l-6 6 6 6',
  out: 'M8 16 16.5 7.5M9.5 7.5h7v7',
  mail: 'M5 6h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 6zM4 7.5l8 5.5 8-5.5',
  move: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17zM10 13.4h5.5M13.4 11l2.4 2.4-2.4 2.4',
  undo: 'M9 7.5 5 11.5l4 4M5.5 11.5h8.5a4.5 4.5 0 0 1 0 9H11',
  /* 더한 꼴 (11/13) */
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2',
  pause: 'M9 6v12M15 6v12',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  alert: 'M12 6.5v7M12 17.3h.01',
  download: 'M12 4.5v11M7.5 11 12 15.5 16.5 11M5 14.5v3A2 2 0 0 0 7 19.5h10a2 2 0 0 0 2-2v-3',
}
const 채운아이콘 = new Set(['play'])
/** 아이콘 하나 — 글로 끼워 넣는다(innerHTML 판). 크기는 px */
function ic(name, size = 20, cls = '') {
  const 꽉 = 채운아이콘.has(name)
  return `<svg class="ic ${cls}" data-ui-icon="${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${꽉 ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${아이콘길[name] || ''}"/></svg>`
}
/** index.html 의 <i data-ic="이름" data-s="크기"> 를 아이콘으로 바꾼다 */
function 아이콘칠하기(root = document) {
  root.querySelectorAll('i[data-ic]').forEach(el => {
    const cls = el.className || ''
    el.outerHTML = ic(el.dataset.ic, Number(el.dataset.s) || 20, cls)
  })
}
아이콘칠하기()

/* 앱 안 창 — 브라우저 기본 창(alert · confirm · prompt) 대신. 웹 ui2/Ask.jsx 와 같은 동작이다.
     await 묻기({ 제목, 글, 예, 아니오, 위험 })      → true / false
     await 맞춰쓰기({ 제목, 글, 맞출글, 예, 위험 })  → 맞출글을 그대로 써야 「예」 가 눌린다(휴지통 비우기)
     await 알리기({ 제목, 글, 예 })                  → 단추 하나(「확인」)
     await 실패알림({ 제목, 어떻게, 오류 })          → 무엇이 안 됐는지(제목) + 어떻게 하면 되는지(어떻게). 오류 글은 우리말일 때만
   위험이면 빨간 단추에 첫 초점은 「취소」. Esc · 바깥 누름 = 닫기(아니오). 컴퓨터라서 가운데 카드. */
const 묻기나누기 = o => {
  if (typeof o !== 'string') return o || {}
  const [첫, ...나머지] = o.split('\n')
  return { 제목: 첫, 글: 나머지.join('\n').trim() }
}
document.body.dataset.screen = 'login-screen'
function 창띄우기({ 제목, 글, 예 = '확인', 아니오 = '취소', 위험, 맞출글 }) {
  return new Promise(resolve => {
    const 앞 = document.activeElement
    const 판 = document.createElement('div')
    판.className = 'u2-ask u2-conf' + (맞출글 != null ? ' u2-conf-top' : '') + (아니오 ? '' : ' u2-conf-one')
    판.setAttribute('data-u2-conf', '')
    판.innerHTML = `
      <form class="u2-ask-card u2-conf-card" role="alertdialog" aria-modal="true" aria-labelledby="u2-conf-t" ${글 ? 'aria-describedby="u2-conf-b"' : ''}>
        <h3 id="u2-conf-t" class="u2-conf-title"></h3>
        ${글 ? '<p id="u2-conf-b" class="u2-conf-body"></p>' : ''}
        ${맞출글 != null ? `<input autocomplete="off" spellcheck="false" placeholder="여기에 써 주세요" ${/^\d+$/.test(String(맞출글)) ? 'inputmode="numeric"' : ''} aria-label="${esc(String(맞출글))} 쓰기">` : ''}
        <div class="u2-ask-foot">
          ${아니오 ? '<button type="button" class="u2-btn u2-btn-sm" data-no></button>' : ''}
          <button type="submit" class="u2-btn u2-btn-sm ${위험 ? 'u2-btn-red' : 'u2-btn-blue'}" data-yes></button>
        </div>
      </form>`
    판.querySelector('.u2-conf-title').textContent = 제목 || ''
    if (글) 판.querySelector('.u2-conf-body').textContent = 글
    const 예단추 = 판.querySelector('[data-yes]')
    const 아니오단추 = 판.querySelector('[data-no]')
    const 칸 = 판.querySelector('input')
    예단추.textContent = 예
    if (아니오단추) 아니오단추.textContent = 아니오
    const 됨 = () => 맞출글 == null || String(칸.value).trim() === String(맞출글)
    if (칸) { 예단추.disabled = true; 칸.addEventListener('input', () => { 예단추.disabled = !됨() }) }
    let 끝남 = false
    const 닫기 = v => {
      if (끝남) return
      끝남 = true
      판.remove()
      if (앞 && document.contains(앞)) { try { 앞.focus({ preventScroll: true }) } catch {} }
      resolve(v)
    }
    판.addEventListener('mousedown', e => { if (e.target === 판) 닫기(false) })
    판.querySelector('form').addEventListener('submit', e => { e.preventDefault(); if (됨()) 닫기(true) })
    아니오단추?.addEventListener('click', () => 닫기(false))
    판.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); 닫기(false) } }, true)
    document.body.appendChild(판)
    if (칸) 칸.focus()
    else (위험 && 아니오단추 ? 아니오단추 : 예단추).focus({ preventScroll: true })
  })
}
function 묻기(o) { return 창띄우기(묻기나누기(o)) }
function 맞춰쓰기(o) { return 창띄우기(o) }
function 알리기(o) { return 창띄우기({ ...묻기나누기(o), 아니오: null }).then(() => {}) }
/* 오류 글 고르기 — 우리말 오류는 보여 주고, 영어 기술 오류는 손님 말로 바꾸거나 숨긴다(개발자 콘솔에는 남는다) */
function 오류까닭(e) {
  const 글 = String(e?.message ?? e ?? '').trim()
  if (!글) return ''
  if (/[가-힣]/.test(글)) return 글
  console.warn('[오류 원문]', 글)
  if (/network|fetch|offline|unavailable|timed? ?out|deadline|ENOTFOUND|ECONN/i.test(글)) return '인터넷 연결이 불안정해요.'
  if (/quota|storage limit|ENOSPC/i.test(글)) return '저장 공간이 가득 찼어요. 휴지통을 비우거나 안 쓰는 파일을 지운 뒤 다시 해 주세요.'
  if (/permission|unauth|auth\/|EPERM|EACCES/i.test(글)) return /EPERM|EACCES/.test(글) ? '이 컴퓨터가 파일을 바꾸지 못하게 막았어요. 파일이 다른 앱에서 열려 있는지 봐 주세요.' : '로그인이 풀렸어요. 다시 로그인한 뒤 해 주세요.'
  if (/EEXIST/i.test(글)) return '같은 이름이 이미 있어요.'
  if (/ENOENT/i.test(글)) return '폴더나 파일을 찾지 못했어요.'
  return ''
}
function 실패알림({ 제목, 어떻게 = '잠시 뒤 다시 해 주세요.', 오류 }) {
  const 까닭 = 오류까닭(오류)
  const 글 = 까닭 && /주세요/.test(까닭) ? 까닭 : [까닭, 어떻게].filter(Boolean).join('\n')
  return 알리기({ 제목, 글 })
}
/* 진행 글 — 동기화 엔진이 쓰는 속말(서비스 이름 · 영어)을 손님 말로 */
function 진행말(p) {
  if (!p) return ''
  return String(p)
    .replace(/Bunny 업로드 중\.\.\./, '영상 올리는 중')
    .replace(/Firestore 기록 중\.\.\./, '기록하는 중')
    .replace(/동기화 에코 — 스킵|재사용 — 재업로드 없음/, '이미 올라가 있어요')
    .replace(/Figma 썸네일 추출 중\.\.\./, '미리보기 만드는 중')
    .replace(/\.fig 업로드 중\.\.\./, '파일 올리는 중')
    .replace(/Figma 파일 \+ 썸네일 완료|Figma 파일 완료 \(썸네일 없음\)/, '다 올렸어요')
    .replace(/메타\/자켓 추출 중\.\.\./, '정보 읽는 중')
    .replace(/자켓 업로드 중\.\.\./, '표지 올리는 중')
    .replace(/\.\.\.$/, '')
}

// ── Screen Navigation ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(id).classList.add('active')
  document.body.dataset.screen = id
  closeWebMenu()
}

// ── OAuth Login (Google + Apple + 카카오 11/10) ──
async function handleOAuthLogin(providerKind) {
  const btnId = { apple: 'btn-apple-login', google: 'btn-google-login', kakao: 'btn-kakao-login' }[providerKind]
  const btn = document.getElementById(btnId)
  const originalHTML = btn.innerHTML
  btn.disabled = true
  btn.innerHTML = '<span class="lg-spin" aria-hidden="true"></span>로그인 중이에요'
  try {
    const apiCall = { apple: window.api.appleLogin, google: window.api.googleLogin, kakao: window.api.kakaoLogin }[providerKind]
    const result = await apiCall()
    /* 카카오 창을 사람이 닫았으면 아무 말 없이 단추만 되돌린다 */
    if (result.error && result.그만둠) {
      btn.disabled = false
      btn.innerHTML = originalHTML
      return
    }
    if (result.error) {
      btn.disabled = false
      btn.innerHTML = originalHTML
      실패알림({ 제목: '로그인하지 못했어요', 어떻게: '잠시 뒤 다시 해 주세요.', 오류: result.error })
      return
    }
    currentUser = { uid: result.uid, name: result.name || '', email: result.email || '' }
    selectedFolder = (await window.api.getConfig()).watchDir || null
    /* 단추를 되돌려 둔다 — 「다시 로그인」으로 이 화면에 돌아오면 「로그인 중...」 인 채 눌리지 않았다 (2026-10-13) */
    btn.disabled = false
    btn.innerHTML = originalHTML
    showSetup()
  } catch (err) {
    btn.disabled = false
    btn.innerHTML = originalHTML
    실패알림({ 제목: '로그인하지 못했어요', 어떻게: '잠시 뒤 다시 해 주세요.', 오류: err })
  }
}

document.getElementById('btn-google-login').addEventListener('click', () => handleOAuthLogin('google'))
document.getElementById('btn-apple-login').addEventListener('click', () => handleOAuthLogin('apple'))
document.getElementById('btn-kakao-login').addEventListener('click', () => handleOAuthLogin('kakao'))

// ── UID Login (fallback) ──
/* ⚠️ 예전엔 여기서 UID 를 그대로 받아 저장했다. 비밀번호 확인 없이
   아이디만으로 들어가는 셈이라 위험하기도 했고, 애초에 고객이 자기 UID 를
   알 방법이 없었다. 웹과 같은 이메일 로그인으로 바꾼다. */
function showEmailError(msg) {
  const el = document.getElementById('email-error')
  el.textContent = msg
  el.style.display = msg ? 'block' : 'none'
}

async function doEmailLogin() {
  const btn = document.getElementById('btn-email-login')
  const email = document.getElementById('email-input').value.trim()
  const password = document.getElementById('password-input').value
  showEmailError('')
  if (!email) { document.getElementById('email-input').focus(); return }
  if (!password) { document.getElementById('password-input').focus(); return }

  const was = btn.textContent
  btn.textContent = '로그인 중이에요'
  btn.disabled = true
  try {
    const r = await window.api.emailLogin(email, password)
    if (!r || r.error) { showEmailError((r && r.error) || '로그인하지 못했어요.'); return }
    currentUser = { uid: r.uid, name: r.name || '', email: r.email || email }
    const config = await window.api.getConfig()
    selectedFolder = config.watchDir || null
    /* 비밀번호는 화면에도 남기지 않는다 */
    document.getElementById('password-input').value = ''
    showSetup()
  } catch (err) {
    showEmailError('로그인하지 못했어요. 잠시 후 다시 시도해 주세요.')
  } finally {
    btn.textContent = was
    btn.disabled = false
  }
}

document.getElementById('btn-email-login').addEventListener('click', doEmailLogin)
document.getElementById('password-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doEmailLogin()
})
document.getElementById('email-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('password-input').focus()
})
/* 「이메일로 로그인」 을 누르면 칸이 펼쳐진다(새 디자인 판 3절 3번) — 예전엔 늘 펼쳐져 있었다 */
function 이메일칸열기(열기 = true) {
  document.getElementById('btn-email-open').hidden = 열기
  document.getElementById('email-form').hidden = !열기
  if (!열기) showEmailError('')
}
document.getElementById('btn-email-open').addEventListener('click', () => {
  이메일칸열기(true)
  const 칸 = document.getElementById('email-input')
  ;(칸.value ? document.getElementById('password-input') : 칸).focus()
})

function showSetup() {
  /* 다시 로그인한 같은 계정이면 고르기 화면 없이 바로 이어서 올린다 (켜면서 폴더를 다시 훑어 못 올린 파일부터 올린다) */
  if (다시로그인중 && currentUser?.uid === 다시로그인중 && selectedFolder) {
    다시로그인중 = null
    document.getElementById('btn-start').disabled = false
    document.getElementById('btn-start').click()
    return
  }
  다시로그인중 = null
  /* 웹 홈과 같은 인사(「안녕하세요, 하늘님」) — 예전엔 이름만 덩그러니 떴다 */
  document.getElementById('welcome-name').textContent = currentUser.name ? `안녕하세요, ${currentUser.name}님` : '반가워요'
  document.getElementById('welcome-email').textContent = currentUser.email || ''
  if (selectedFolder) updateFolderDisplay(selectedFolder)
  showScreen('setup-screen')
  /* 고른 폴더가 없으면 바탕화면 pofol 폴더를 만들어 미리 골라 둔다 — 처음 온 사람이 폴더 찾기에서 멈추지 않게 */
  if (!selectedFolder && window.api.ensureDefaultFolder) {
    window.api.ensureDefaultFolder().then((dir) => {
      if (dir && !selectedFolder) { selectedFolder = dir; updateFolderDisplay(dir) }
      else if (!dir && !selectedFolder) document.getElementById('folder-display').textContent = '동기화할 폴더를 골라 주세요'
    })
  }
}

/* 웹에서 가입 — 앱에는 가입 화면이 없다.
   2026-10-16 대표님 결정: 첫 화면이 아니라 로그인(가입) 창이 바로 열리게 (/?login=1). 앱을 깐 사람에게 필요한 다음 걸음은 가입이다 */
document.getElementById('link-web-signup')?.addEventListener('click', (e) => {
  e.preventDefault()
  window.api.openExternal('https://pofol.co/?login=1')
})

// ── Folder Selection ──
document.getElementById('btn-folder').addEventListener('click', async () => {
  const folder = await window.api.selectFolder()
  if (folder) {
    selectedFolder = folder
    updateFolderDisplay(folder)
  }
})

function updateFolderDisplay(folder) {
  const el = document.getElementById('folder-display')
  el.textContent = folder
  el.title = folder
  el.classList.remove('empty')
  document.getElementById('btn-start').disabled = false
}

/* 동기화 위 카드 — 왼쪽 폴더 이름(경로 끝) · 가운데 상태 원 · 오른쪽 맞춘 파일 수 */
function setHeroFolder(folder) {
  const 이름 = String(folder || '').split(/[\\/]/).filter(Boolean).pop() || '폴더'
  const el = document.getElementById('hero-folder-name')
  if (el) { el.textContent = 이름; el.parentElement.title = folder || '' }
}
/** state: syncing · scanning · watching · error · idle  /  status: 굵은 짧은 말  /  info: 옆 작은 말  /  count: 오른쪽 아래 수 */
function setSync(state, status, info, count) {
  const 원 = document.getElementById('hero-state')
  const 판 = document.getElementById('hero')
  if (원) { 원.dataset.state = state; 원.setAttribute('aria-label', status || '') }
  if (판) { if (state === 'syncing' || state === 'scanning') 판.dataset.busy = ''; else delete 판.dataset.busy }
  document.getElementById('sync-status').textContent = status || ''
  document.getElementById('sync-info').textContent = info || ''
  if (count != null) document.getElementById('hero-count').textContent = Number(count).toLocaleString('ko-KR')
}
document.getElementById('hero-folder').addEventListener('click', e => {
  if (e.target.closest('#btn-change-folder')) return
  if (selectedFolder) window.api.openInExplorer(selectedFolder)
})
document.getElementById('hero-folder').addEventListener('keydown', e => { if (e.key === 'Enter') e.currentTarget.click() })
document.getElementById('hero-site').addEventListener('click', () => {
  if (mySiteSlug) window.api.openExternal(`https://pofol.co/p/${mySiteSlug}`)
  else if (window.api.openWebAuthed) window.api.openWebAuthed('/')
  else window.api.openExternal('https://pofol.co')
})
document.getElementById('hero-site').addEventListener('keydown', e => { if (e.key === 'Enter') e.currentTarget.click() })

// ── Start Sync ──
document.getElementById('btn-start').addEventListener('click', async () => {
  if (!currentUser || !selectedFolder) return
  showScreen('sync-screen')
  setHeroFolder(selectedFolder)
  setSync('syncing', '동기화 시작', '')
  updateSyncUserLabel()
  fileStatuses.clear()
  renderFileList()
  await window.api.startSync({ uid: currentUser.uid, watchDir: selectedFolder })
    setTimeout(peekTrashOnce, 4000)
  refreshMySite()
})

function updateSyncUserLabel() {
  const el = document.getElementById('sync-user-label')
  if (el && currentUser) {
    el.textContent = currentUser.name || currentUser.email || currentUser.uid
  }
}

// ── Stop Sync ──
document.getElementById('btn-stop').addEventListener('click', async () => {
  await window.api.stopSync()
  showSetup()
})

// ── Change Folder ──
document.getElementById('btn-change-folder').addEventListener('click', async () => {
  const folder = await window.api.selectFolder()
  if (folder) {
    await window.api.stopSync()
    selectedFolder = folder
    await window.api.saveConfig({ watchDir: folder })
    showScreen('sync-screen')
    setHeroFolder(folder)
    setSync('syncing', '동기화 시작', '')
    fileStatuses.clear()
    renderFileList()
    await window.api.startSync({ uid: currentUser.uid, watchDir: folder })
    setTimeout(peekTrashOnce, 4000)
  }
})

/* 어느 운영체제인지 화면에 표시해 둔다 — 맥이면 가짜 창 버튼을 감춘다.
   맥에서는 시스템이 진짜 창 버튼을 왼쪽 위에 그린다. */
document.body.dataset.os = (window.api && window.api.platform) || 'unknown'

// ── 웹과 잇기 ──
/* 지구 단추 — 작은 메뉴(웹 포트폴리오 보기 · 웹에서 꾸미기). 예전엔 머리줄에 단추 둘이 따로 있었다 */
function closeWebMenu() {
  const m = document.getElementById('web-menu')
  if (m && !m.hidden) { m.hidden = true; document.getElementById('btn-web')?.setAttribute('aria-expanded', 'false') }
}
document.getElementById('btn-web').addEventListener('click', e => {
  e.stopPropagation()
  const m = document.getElementById('web-menu')
  if (!m.hidden) { closeWebMenu(); return }
  const r = e.currentTarget.getBoundingClientRect()
  m.hidden = false
  m.style.top = `${r.bottom + 8}px`
  m.style.left = `${Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`
  e.currentTarget.setAttribute('aria-expanded', 'true')
  m.querySelector('button:not([style*="none"])')?.focus({ preventScroll: true })
})
document.addEventListener('mousedown', e => { if (!e.target.closest('#web-menu, #btn-web')) closeWebMenu() })
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeWebMenu() })

/* 웹에서 꾸미기: 로그인이 이어진 채 대시보드가 열린다 (예전엔 로그인 안 된 첫 화면이 열렸다) */
document.getElementById('btn-open-web').addEventListener('click', () => {
  closeWebMenu()
  if (window.api.openWebAuthed) window.api.openWebAuthed('/')
  else window.api.openExternal('https://pofol.co')
})
let mySiteSlug = null
document.getElementById('btn-my-site').addEventListener('click', () => {
  closeWebMenu()
  if (mySiteSlug) window.api.openExternal(`https://pofol.co/p/${mySiteSlug}`)
})
function showMySite(slug) {
  mySiteSlug = slug || null
  document.getElementById('btn-my-site').style.display = mySiteSlug ? '' : 'none'
  const 주소 = document.getElementById('my-site-addr')
  if (주소) 주소.textContent = mySiteSlug ? `pofol.co/p/${mySiteSlug}` : ''
  const 판 = document.getElementById('hero-site')
  if (판) 판.title = mySiteSlug ? `웹 포트폴리오 열기 — pofol.co/p/${mySiteSlug}` : '웹에서 꾸미기'
}
async function refreshMySite() {
  try { const s = await window.api.getMySite?.(); showMySite(s?.slug) } catch (_) {}
}

/* 알림 줄 — kind: ok · warn · error. actions: [{ label, run }] */
function showNotice(kind, html, actions = []) {
  const el = document.getElementById('sync-notice')
  el.dataset.kind = kind
  el.style.display = 'flex'
  el.innerHTML = `<span class="n-ico">${ic(kind === 'ok' ? 'check' : 'alert', 16)}</span><span class="n-text">${html}</span><span class="n-acts"></span>`
  const 단추칸 = el.querySelector('.n-acts')
  actions.forEach(({ label, run, out }) => {
    const b = document.createElement('button')
    b.className = 'n-act'
    b.innerHTML = esc(label) + (out ? ic('out', 14) : '')
    b.addEventListener('click', run)
    단추칸.appendChild(b)
  })
  const x = document.createElement('button')
  x.className = 'n-x'
  x.setAttribute('aria-label', '알림 닫기')
  x.innerHTML = ic('x', 16)
  x.addEventListener('click', hideNotice)
  단추칸.appendChild(x)
}
function hideNotice() { document.getElementById('sync-notice').style.display = 'none' }
let limitNoticeOn = false

// ── Logout ──
/* 로그아웃은 두 화면에 있다 — 준비 화면과 동기화 화면.
   같은 일을 하므로 한 곳에서 처리한다. */
document.getElementById('btn-logout-setup')?.addEventListener('click', () =>
  document.getElementById('btn-logout').click())

document.getElementById('btn-logout').addEventListener('click', async () => {
  await window.api.stopSync()
  // 계정 바꿀 때 다른 사람 파일 충돌 막으려고 sync state 도 청소 — 다음 로그인 시 fresh sync.
  try { await window.api.clearSyncState() } catch {}
  await window.api.saveConfig({ uid: '', watchDir: '', name: '', email: '', idToken: '', refreshToken: '' })
  currentUser = null
  selectedFolder = null
  document.getElementById('email-input').value = ''
  document.getElementById('password-input').value = ''
  closeSettings()
  이메일칸열기(false)
  /* 앞 계정의 흔적을 지운다 — 예전엔 다른 계정으로 들어와도 앞 사람의 「사이트가 생겼어요」 알림 · 내 사이트 단추 · 중복 용량이 남았다 */
  hideNotice()
  showMySite(null)
  document.getElementById('hero-count').textContent = ''
  trashData = null; trashPeeked = false; trashDel.clear()
  document.getElementById('tab-trash').textContent = '중복'
  showScreen('login-screen')
})

/* 다시 로그인 — 로그아웃과 달리 고른 폴더·동기화 기록을 지우지 않는다. 같은 계정으로 들어오면 바로 이어서 올린다 (showSetup).
   다른 계정으로 들어오면 main.js saveConfig 가 폴더·기록을 비운다 (남의 파일이 섞이지 않게) */
let 다시로그인중 = null
async function 다시로그인() {
  hideNotice()
  await window.api.stopSync()
  다시로그인중 = currentUser?.uid || null
  await window.api.saveConfig({ idToken: '', refreshToken: '' })
  const config = await window.api.getConfig()
  document.getElementById('email-input').value = config.email || ''
  document.getElementById('password-input').value = ''
  closeSettings()
  showScreen('login-screen')
}
window.다시로그인 = 다시로그인

// ── Retry ──
document.getElementById('btn-retry-all').addEventListener('click', () => {
  if (limitNoticeOn) { hideNotice(); limitNoticeOn = false }
  window.api.retryAllFailed()
})

// ── Rescan (새로고침) + 공유 체크 ──
document.getElementById('btn-trash')?.addEventListener('click', openTrash)

document.getElementById('btn-rescan').addEventListener('click', async () => {
  const btn = document.getElementById('btn-rescan')
  btn.disabled = true
  btn.classList.add('spin')   // 예전엔 글자 그림(⏳ · 🔄)을 바꿔 끼웠다 — 아이콘이 돈다
  try {
    await window.api.rescan()
    // rescan 후 공유 대기 건도 확인
    const shareResult = await window.api.checkShares()
    if (shareResult?.error) {
      console.error('[Share]', shareResult.error)
    }
  } catch {}
  btn.disabled = false
  btn.classList.remove('spin')
})

// ── Event Handlers ──
/* 상태는 가운데 원 하나(초록 체크 = 다 맞춤 · 파랑 = 올리는 중 · 빨강 = 멈춤)와 아래 한 줄 글로 (새 디자인 판 4절) */
window.api.onSyncProgress((data) => {
  const infoEl = document.getElementById('sync-info')

  if (data.phase === 'scanning') {
    setSync('scanning', '파일 찾는 중', `${data.total}개를 찾았어요`)
  } else if (data.phase === 'syncing') {
    setSync('syncing', '올리는 중', `${data.completed} / ${data.total}`)
  } else if (data.phase === 'watching') {
    /* 올리는 중과 끝난 뒤가 같은 글이라 끝났는지 알 수 없었다 (2026-09-25) */
    setSync('watching', '올리기 끝', '폴더에 넣으면 바로 올라가요', data.total)
    document.getElementById('hero-state').title = `파일 ${data.total}개를 맞췄어요 · 폴더를 지켜보고 있어요`
    refreshSyncedFolders()
  } else if (data.phase === 'site_ready') {
    /* 첫 동기화 뒤 서버가 웹 포트폴리오를 만들었다(또는 새 것을 실었다) */
    showMySite(data.slug)
    const n = data.madePublic ? ` · 최신 ${data.madePublic}개를 실었어요` : ''
    showNotice('ok', data.created
      ? `<b>내 웹 포트폴리오가 생겼어요</b> pofol.co/p/${esc(data.slug)}${n}`
      : `<b>내 웹 포트폴리오에 올렸어요</b> pofol.co/p/${esc(data.slug)}${n}`,
      [{ label: '보기', out: true, run: () => window.api.openExternal(`https://pofol.co/p/${data.slug}`) },
       { label: '웹에서 꾸미기', out: true, run: () => window.api.openWebAuthed?.('/') }])
  } else if (data.phase === 'share_uploading') {
    /* 이름 칸에 실려 오는 글 속 ❌ 같은 글자 그림은 뺀다 */
    const 이름 = String(data.projectName || '공유').replace(/❌\s*/g, '못 올림 · ')
    setSync('syncing', '원본을 그대로 올리는 중', `${이름} · ${data.completed} / ${data.total}`)
  } else if (data.phase === 'share_complete') {
    setSync('watching', '올리기 끝', `원본 ${data.total}개를 올렸어요`)
    setTimeout(() => {
      infoEl.textContent = `파일 ${Object.keys(window._lastSyncTotal || {}).length || data.total}개를 맞췄어요`
    }, 3000)
  } else if (data.phase === 'share_error') {
    const 까닭 = 오류까닭(data.message)
    setSync('watching', '원본을 올리지 못했어요', 까닭 || '잠시 뒤 다시 해요')
  }
})

window.api.onFileStatus((data) => {
  fileStatuses.set(data.path, data)
  updateFileItem(data)
  updateSummary()
})

window.api.onSyncError((data) => {
  console.error('Sync error:', data)
  /* 사람이 읽어야 하는 오류는 화면에 — 예전엔 개발자 콘솔에만 남아 "동기화 중…" 에서 멈춘 것처럼 보였다 (2026-09-25) */
  if (data?.kind === 'project-limit') {
    limitNoticeOn = true
    const 지금 = data.current != null ? ` (지금 ${data.current}개)` : ''
    showNotice('warn', `<b>무료는 프로젝트 ${data.limit ?? 20}개까지예요</b>${지금} · 올릴 폴더만 남기거나 요금제를 올려 주세요`,
      [{ label: '요금제 보기', out: true, run: () => window.api.openWebAuthed ? window.api.openWebAuthed('/pricing') : window.api.openExternal('https://pofol.co/pricing') },
       { label: '다시 확인', run: () => { hideNotice(); limitNoticeOn = false; window.api.retryAllFailed() } }])
    updateSummary()
    return
  }
  const msg = String(data?.message || data?.error || '알 수 없는 문제')
  /* 로그인이 끝났다 (2026-10-13) — 파일마다 실패시키지 않고 이 알림 하나. 「다시 로그인」은 폴더·동기화 기록을 지우지 않는다 */
  if (data?.kind === 'auth-expired' || /토큰|로그인/.test(msg)) {
    setSync('error', '로그인이 끝났어요', '다시 로그인하면 멈춘 파일부터 이어서 올려요')
    showNotice('error', `<b>로그인이 끝났어요</b> · 다시 로그인하면 멈춘 파일부터 이어서 올려요`, [{ label: '다시 로그인', run: 다시로그인 }])
  } else {
    /* 영어 기술 오류는 손님 말로 바꾸거나 숨긴다(웹 오류까닭과 같은 규칙) */
    const 까닭 = 오류까닭(msg)
    showNotice('error', `<b>올리다가 문제가 생겼어요</b> · ${esc((까닭 || '새로고침을 눌러 다시 해 주세요').slice(0, 120))}`)
  }
})

// ── New Folder Auto-Sync Notification ──
window.api.onNewFolder((data) => {
  // 자동 승인 — 간단한 알림만 표시
  const container = document.getElementById('folder-toasts')
  const toast = document.createElement('div')
  toast.className = 'folder-toast'
  toast.setAttribute('role', 'status')
  const fileText = data.fileCount > 0 ? ` · ${data.fileCount}개` : ''
  toast.innerHTML = `
    <span class="tile tile-folder tile-sm" aria-hidden="true">${ic('folder', 22)}</span>
    <div class="toast-main">
      <div class="toast-title">${esc(data.name)}${fileText}</div>
      <div class="toast-desc">올리기 시작했어요</div>
    </div>`
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
})

// ── Pending Folders ──
async function refreshPendingFolders() {
  const folders = await window.api.getPendingFolders()
  renderPendingFolders(folders)
}

function renderPendingFolders(folders) {
  const section = document.getElementById('pending-section')
  const list = document.getElementById('pending-list')

  if (!folders || folders.length === 0) {
    section.style.display = 'none'
    return
  }

  section.style.display = 'block'
  /* 줄 하나 = 흰 카드(높이 64 · 둥글기 16) · 단추는 작은 단추(40 · 둥글기 12) — 예전 📦 · 📁 글자 그림은 아이콘으로 */
  list.innerHTML = (folders.length > 1 ? `
    <div class="pending-item">
      <div class="pending-icon all">${ic('upload', 20)}</div>
      <div class="pending-info">
        <div class="pending-name">폴더 ${folders.length}개 모두</div>
        <div class="pending-meta">한 번에 모두 올려요</div>
      </div>
      <div class="pending-actions">
        <button class="sm-btn blue btn-pending upload" onclick="approveAllPendingFolders()">모두 올리기</button>
      </div>
    </div>
  ` : '') + folders.map(f => `
    <div class="pending-item" id="pending-${f.key.replace(/[^a-zA-Z0-9]/g, '_')}">
      <div class="pending-icon wait">${ic('clock', 20)}</div>
      <div class="pending-info">
        <div class="pending-name" title="${esc(f.key)}">${esc(f.name)}</div>
        <div class="pending-meta">${f.fileCount}개 · 기다리는 중</div>
      </div>
      <div class="pending-actions">
        <button class="sm-btn red btn-pending remove" onclick="removePendingFolder('${jsq(f.key)}')">지우기</button>
        <button class="sm-btn blue btn-pending upload" onclick="approvePendingFolder('${jsq(f.key)}')">올리기</button>
      </div>
    </div>
  `).join('')
}

async function approvePendingFolder(key) {
  // 버튼 비활성화
  const el = document.getElementById('pending-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
  if (el) {
    const btn = el.querySelector('.btn-pending.upload')
    if (btn) { btn.textContent = '올리는 중'; btn.disabled = true }
  }
  await window.api.approvePendingFolder(key)
}
window.approvePendingFolder = approvePendingFolder

async function removePendingFolder(key) {
  await window.api.removePendingFolder(key)
}
window.removePendingFolder = removePendingFolder

async function approveAllPendingFolders() {
  const folders = await window.api.getPendingFolders()
  for (const f of folders) {
    await window.api.approvePendingFolder(f.key)
  }
}
window.approveAllPendingFolders = approveAllPendingFolders

// 대기 목록 업데이트 이벤트
window.api.onPendingFoldersUpdated((folders) => {
  renderPendingFolders(folders)
})

// ── Synced Folders ──
async function refreshSyncedFolders() {
  const folders = await window.api.getSyncedFolders()
  renderSyncedFolders(folders)
}

function renderSyncedFolders(folders) {
  const section = document.getElementById('synced-section')
  const list = document.getElementById('synced-list')

  if (!folders || folders.length === 0) {
    section.style.display = 'none'
    return
  }

  section.style.display = 'block'
  // 전체선택 체크박스 리셋
  const cbAll = document.getElementById('cb-select-all')
  if (cbAll) cbAll.checked = false
  updateBatchButtons()

  list.innerHTML = folders.map(f => `
    <div class="pending-item" id="synced-${f.key.replace(/[^a-zA-Z0-9]/g, '_')}" data-folder-key="${esc(f.key)}">
      <input type="checkbox" class="cb item-cb" data-key="${esc(f.key)}" onchange="onItemCheckChange()" aria-label="${esc(f.name)} 고르기">
      <div class="pending-icon">${ic('folder', 20)}</div>
      <div class="pending-info">
        <div class="pending-name" title="${esc(f.key)}">${esc(f.name)}</div>
        <div class="pending-meta">${f.fileCount}개 · <span class="synced-badge">${ic('check', 14)}올라감</span></div>
      </div>
      <div class="pending-actions">
        <button class="sm-btn btn-pending resync" onclick="resyncFolder('${jsq(f.key)}')">다시 올리기</button>
        <button class="sm-btn red btn-pending remove" onclick="deleteSyncedFolder('${jsq(f.key)}')">지우기</button>
      </div>
    </div>
  `).join('')
}

// ── 체크박스 전체선택/해제 ──
function toggleSelectAll(cb) {
  const checkboxes = document.querySelectorAll('#synced-list .item-cb')
  checkboxes.forEach(c => c.checked = cb.checked)
  onItemCheckChange()
}
window.toggleSelectAll = toggleSelectAll

function onItemCheckChange() {
  const all = document.querySelectorAll('#synced-list .item-cb')
  const checked = document.querySelectorAll('#synced-list .item-cb:checked')
  const cbAll = document.getElementById('cb-select-all')
  const label = document.getElementById('select-all-label')
  if (cbAll) cbAll.checked = all.length > 0 && checked.length === all.length
  /* 처음 글(index.html)은 「전부 고르기」 인데 여기서 「전체선택」 으로 바꿔 써서 두 말이 섞였다 — 한 말로 */
  if (label) label.textContent = checked.length > 0 ? `${checked.length}개 고름` : '전부 고르기'
  updateBatchButtons()
}
window.onItemCheckChange = onItemCheckChange

/* 고른 폴더가 있을 때만 아래에 검은 막대(웹 .u2-bar 꼴)가 뜬다 — 예전엔 머리줄 끝에 작은 단추 둘이 나타났다 */
function updateBatchButtons() {
  const checked = document.querySelectorAll('#synced-list .item-cb:checked')
  const bar = document.getElementById('sel-bar')
  if (bar) bar.classList.toggle('on', checked.length > 0)
  const n = document.getElementById('sel-count')
  if (n) n.textContent = `${checked.length}개 고름`
}

function getSelectedKeys() {
  return Array.from(document.querySelectorAll('#synced-list .item-cb:checked'))
    .map(cb => cb.dataset.key)
    .filter(Boolean)
}

// ── 일괄 재업로드 ──
async function batchResync() {
  const keys = getSelectedKeys()
  if (!keys.length) return
  if (!await 묻기({ 제목: `폴더 ${keys.length}개를 다시 올릴까요?`, 예: '다시 올리기' })) return
  for (const key of keys) {
    const el = document.getElementById('synced-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
    if (el) {
      const btn = el.querySelector('.btn-pending.resync')
      if (btn) { btn.textContent = '기다리는 중'; btn.disabled = true }
    }
  }
  for (const key of keys) {
    await window.api.resyncFolder(key)
  }
}
window.batchResync = batchResync

// ── 일괄 삭제 ──
async function batchDelete() {
  const keys = getSelectedKeys()
  if (!keys.length) return
  if (!await 묻기({
    제목: `폴더 ${keys.length}개를 휴지통으로 옮길까요?`,
    글: '30일 안에는 언제든 되돌릴 수 있어요.',
    예: '휴지통으로 옮기기', 위험: true,
  })) return
  for (const key of keys) {
    const el = document.getElementById('synced-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
    if (el) {
      const btn = el.querySelector('.btn-pending.remove')
      if (btn) { btn.textContent = '옮기는 중'; btn.disabled = true }
    }
  }
  for (const key of keys) {
    await window.api.deleteSyncedFolder(key)
  }
}
window.batchDelete = batchDelete

// ── 개별 재업로드/삭제 (기존) ──
async function resyncFolder(key) {
  const el = document.getElementById('synced-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
  if (el) {
    const btn = el.querySelector('.btn-pending.resync')
    if (btn) { btn.textContent = '올리는 중'; btn.disabled = true }
  }
  await window.api.resyncFolder(key)
}
window.resyncFolder = resyncFolder

async function deleteSyncedFolder(key) {
  const 이름 = String(key || '').split('/').pop()
  if (!await 묻기({
    제목: 이름 ? `「${이름}」 폴더를 휴지통으로 옮길까요?` : '이 폴더를 휴지통으로 옮길까요?',
    글: '30일 안에는 언제든 되돌릴 수 있어요.\n컴퓨터의 원본도 폴더 안 _Trash 로 옮겨지고, 되살리면 제자리로 돌아와요.',
    예: '휴지통으로 옮기기', 위험: true,
  })) return
  const el = document.getElementById('synced-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
  if (el) {
    const btn = el.querySelector('.btn-pending.remove')
    if (btn) { btn.textContent = '옮기는 중'; btn.disabled = true }
  }
  await window.api.deleteSyncedFolder(key)
}
window.deleteSyncedFolder = deleteSyncedFolder

window.api.onSyncedFoldersUpdated((folders) => {
  renderSyncedFolders(folders)
})

// ── Finder 폴더 삭제 confirm 다이얼로그 ──
// ── 웹 → 로컬 받기 ─────────────────────────────────────────────
// 평소에는 로컬이 기준이라 웹에서 뭘 고쳐도 로컬은 그대로다.
// 이 버튼만 반대 방향이고, 로컬을 덮어쓰므로 반드시 먼저 경고한다.
/* 단추는 설정 창 안으로 옮겼다(11/13 새 디자인 — 판 4절 「웹→로컬 받기 · 웹에서 꾸미기 · 로그아웃은 설정 안으로」) */
document.getElementById('btn-pull-web')?.addEventListener('click', async () => {
  const ok = await 묻기({
    제목: '웹의 폴더를 이 컴퓨터로 받아올까요?',
    글: '· 이 컴퓨터에서 지웠던 파일도 다시 내려와요\n' +
        '· 이 컴퓨터에서 옮기거나 이름을 바꾼 것은 웹 기준으로 다시 만들어져요\n' +
        '· 이 컴퓨터에만 있고 웹에 없는 파일은 그대로 둬요',
    예: '받아오기', 위험: true,
  })
  if (!ok) return
  const btn = document.getElementById('btn-pull-web')
  const label = btn.innerHTML
  btn.disabled = true
  btn.innerHTML = `${ic('refresh', 20, 'spin')}받는 중이에요`
  try {
    const r = await window.api.pullFromWeb()
    if (!r?.ok) 실패알림({ 제목: '웹에서 받아오지 못했어요', 오류: r?.error })
  } finally {
    btn.disabled = false
    btn.innerHTML = label
  }
})

// chokidar 가 unlinkDir 감지하면 main 이 'folder-deletion-requested' 이벤트 보냄.
// 사용자에게 "웹에서도 삭제할래?" 확인 받음. 자동 삭제 안 함.
window.api.onFolderDeletionRequested(async (info) => {
  const { folderName, projectId, fileCount, folderKey, whileClosed } = info
  if (!projectId) {
    console.warn('[folder-deletion] projectId 없음, 다이얼로그 스킵')
    return
  }
  const head = whileClosed
    ? `앱이 꺼져 있는 동안 「${folderName}」 폴더가 없어졌어요`
    : `「${folderName}」 폴더를 지웠어요`
  /* 「아니오」(바깥 누름 · Esc 포함)는 예전 「취소」 와 같다 — 다음 동기화 때 다시 받아진다 */
  const ok = await 묻기({
    제목: head,
    글: `웹에서도 지울까요? (파일 ${fileCount}개)\n지워도 휴지통에 30일 동안 있어요.\n「다시 받기」를 누르면 다음 동기화 때 폴더가 돌아와요.`,
    예: '웹에서도 지우기', 아니오: '다시 받기', 위험: true,
  })
  if (ok) {
    const r = await window.api.confirmFolderDeletion({ projectId })
    if (r?.ok) {
      console.log(`[folder-deletion] soft-deleted ${folderName} (assets: ${r.markedAssets})`)
    } else {
      실패알림({ 제목: '웹에서 지우지 못했어요', 오류: r?.error })
    }
  } else {
    await window.api.cancelFolderDeletion({ folderKey })
    console.log(`[folder-deletion] 취소됨 — 다음 폴링에서 ${folderName} 자동 복구`)
  }
})

// ── Explorer Mode ──
let dragNode = null

// 탭 세 개 — 활동 / 탐색기 / 휴지통
// ⚠️ 예전에는 둘뿐이라 'isExp' 참·거짓으로 갈랐는데, 셋이 되면서 그 방식으로는 안 된다.
const TABS = ['activity', 'explorer', 'trash']
TABS.forEach(t => document.getElementById('tab-' + t).addEventListener('click', () => switchTab(t)))

/* 기본 화면은 탐색기다 — 사람이 제일 먼저 궁금해하는 건
   '내 폴더가 어떻게 잡혔나' 이지 '지금 뭐가 올라가는 중인가' 가 아니다. */
function switchTab(tab) {
  TABS.forEach(t => {
    const on = t === tab
    const btn = document.getElementById('tab-' + t)
    /* 칸 고르기 알약 — 고른 칸은 옅은 파랑(웹 .u2-seg 와 같다). 예전엔 검은 칸 · 흰 칸을 글자 꼴로 칠했다 */
    if (on) btn.setAttribute('data-on', ''); else btn.removeAttribute('data-on')
    btn.setAttribute('aria-selected', on ? 'true' : 'false')
  })
  document.getElementById('explorer-pane').style.display = tab === 'explorer' ? 'block' : 'none'
  document.getElementById('trash-pane').style.display = tab === 'trash' ? 'block' : 'none'
  document.getElementById('activity-pane').style.display = tab === 'activity' ? 'block' : 'none'
  if (tab === 'explorer') refreshExplorer()
  if (tab === 'trash') loadTrash()
}

let explorerRoot = ''

async function refreshExplorer() {
  const pane = document.getElementById('explorer-pane')
  /* 다시 그릴 때 내려 둔 자리를 지킨다 — 이름을 바꾸거나 옮긴 뒤 맨 위로 튀지 않게 */
  const 보기 = `${expCat || ''}|${expProj?.key || ''}`
  const 자리 = pane.dataset.view === 보기 ? pane.scrollTop : 0
  pane.dataset.view = 보기
  if (!pane.querySelector('.exp-grid')) pane.innerHTML = '<div class="pane-msg">폴더를 읽는 중이에요</div>'
  const data = await window.api.scanFolderTree()
  /* 아직 준비가 안 된 것뿐이면 "폴더 없어요" 라고 하지 않는다 — 잠깐 뒤에 다시 본다 */
  if (data && data.notReady) {
    pane.innerHTML = '<div class="pane-msg">폴더를 읽는 중이에요</div>'
    clearTimeout(window._explorerRetry)
    window._explorerRetry = setTimeout(() => { refreshExplorer() }, 1500)
    return
  }
  if (!data) { pane.innerHTML = '<div class="pane-msg">아직 연결한 폴더가 없어요</div>'; return }
  explorerRoot = data.root
  expandedProjects.clear()
  /* 크기 막대(예전 🔍 + 숫자 px) — 카드 크기를 바꾼다. 값은 예전과 같은 30~200 */
  const currentSize = 탐색기크기
  const toolbarHtml = `
    <label class="exp-size" title="카드 크기">${ic('image', 16)}
      <input type="range" class="u2-range u2-range-sm" min="30" max="200" value="${currentSize}" style="--p:${(currentSize - 30) / 170}" oninput="setThumbSize(this.value)" aria-label="카드 크기">
      ${ic('image', 22)}</label>`
  /* ⚠️ 끌어놓기·이름변경 처리기가 .tree-node 와 data-* 에 붙는다.
     모양만 바꾸고 그 둘은 그대로 둔다. 안 그러면 기능이 통째로 죽는다. */
  pane.innerHTML = renderExplorerGrid(data.tree, data.root, toolbarHtml)
  attachExplorerHandlers(data.root)
  attachGridNav()
  pane.scrollTop = 자리
  if (expProj) fillExplorerFiles()
}


/* ══════════════════════════════════════════════════════════
   탐색기 — 웹의 프로젝트 화면과 같은 방식으로 (2026-09-01)
   왼쪽에 분류 목록, 오른쪽에 폴더 아이콘 격자.
   ⚠️ 처리기가 .tree-node · data-path · data-project-key 에 붙어 있다.
      모양만 바꾸고 그 셋은 반드시 그대로 둔다.
   ══════════════════════════════════════════════════════════ */
let expCat = null    // 지금 열어본 분류 (null 이면 분류 목록)
let expProj = null   // 지금 열어본 프로젝트 { key, name } — 파일까지 보여준다

/* 카드 한 장 — 웹 정답 그림의 폴더 카드 꼴(흰 카드 24 · 위 정사각 판 · 아래 이름 + 수 · 오른쪽 위 상태 원).
   ⚠️ 대표 사진은 아직 못 넣는다 — 앱이 폴더 속 사진 주소를 아는 때는 프로젝트를 연 뒤(서버에 묻는다)뿐이다.
      프로젝트마다 서버에 두 번씩 묻게 되면 폴더가 많은 손님(170개 넘는 분도 있다)에게 무겁다. 그래서 폴더 그림으로 둔다.
   ⚠️ .node-name · .btn-rename 은 이름 바꾸기 처리기가 찾는 이름이다(예전엔 격자 카드에 .node-name 이 없어 이름 바꾸기가 조용히 깨져 있었다). */
function folderCard(n, root, big) {
  const isProject = n.depth === 1
  const key = isProject ? getProjectKey(n.path, root) : ''
  const kids = (n.children || []).length
  const cnt = n.depth === 0 ? kids : (n.fileCount || kids || 0)
  const 수 = n.depth === 0
    ? `<span class="exp-cnt" title="프로젝트 ${kids}개">${kids}</span>`
    : (n.badge2 === 'empty' && !cnt ? '<span class="exp-cnt dim">비어 있어요</span>' : `<span class="exp-cnt" title="파일 ${cnt}개">${cnt}</span>`)
  return `<div class="tree-node exp-card" data-path="${esc(n.path)}"
       data-depth="${n.depth}" data-project-key="${esc(key)}" draggable="${n.depth !== 0}"
       data-cat="${n.depth === 0 ? esc(n.name) : ''}" tabindex="-1">
    <div class="exp-thumb">${ic('folder', 64)}${badgeHtml(n.badge2) || badgeHtml(n.badge)}</div>
    <div class="exp-meta"><span class="exp-name node-name" title="${esc(n.name)}">${esc(n.name)}</span>${수}</div>
    ${isProject ? `<div class="node-actions"><button class="btn-rename" title="이름 바꾸기" aria-label="이름 바꾸기">${ic('pencil', 16)}</button></div>` : ''}
  </div>`
}

function renderExplorerGrid(nodes, root, tools = '') {
  if (!nodes.length) return renderExplorerShell(nodes, '<div class="exp-grid"><div class="exp-empty">폴더가 없어요 · 연결한 폴더 안에 분류 폴더를 만들어 주세요</div></div>', tools)
  const cat = expCat ? nodes.find(n => n.name === expCat) : null
  /* 프로젝트를 열었으면 그 안의 파일을 보여준다. 목록은 뒤에 채워 넣는다
     (파일은 서버에서 받아오므로 지금 당장은 없다). */
  if (expProj) return renderExplorerShell(nodes, `<div class="exp-grid exp-files" id="exp-files">
      <div class="exp-empty">불러오는 중이에요</div></div>`, tools)
  const shown = cat ? (cat.children || []) : nodes
  return renderExplorerShell(nodes, `<div class="exp-grid">
      ${shown.length ? shown.map(n => folderCard(n, root, !!cat)).join('')
                     : '<div class="exp-empty">비어 있어요</div>'}
    </div>`, tools)
}

/** 경로줄(‹ 전체 프로젝트 › 분류 › 프로젝트) + 분류 알약 줄 — 폴더 화면과 파일 화면이 같이 쓴다.
    예전 왼쪽 기둥(분류 목록)은 창이 좁아 카드가 두 줄로 밀려서, 분류 안에 들어갔을 때 위 알약 줄로 옮겼다(같은 data-go). */
function renderExplorerShell(nodes, inner, tools = '') {
  const total = nodes.reduce((s, n) => s + (n.children || []).length, 0)
  const 알약 = (expCat || expProj) ? `
      <div class="exp-cats" role="toolbar" aria-label="분류">
        <button class="exp-side-item ${expCat ? '' : 'on'}" data-go="">전체<em>${total}</em></button>
        ${nodes.map(n => `<button class="exp-side-item ${expCat === n.name ? 'on' : ''}"
          data-go="${esc(n.name)}">${esc(n.name)}<em>${(n.children || []).length}</em></button>`).join('')}
      </div>` : ''
  return `
    <div class="exp-main">
      <div class="exp-top">
        <button class="u2-icon-btn sm exp-back" id="exp-backbtn" ${expBack.length ? '' : 'disabled'} title="뒤로" aria-label="뒤로">${ic('back', 20)}</button>
        <nav class="exp-path" aria-label="지금 위치">
          ${expCat ? `<button class="exp-crumb" data-go="">전체 프로젝트</button>` : `<b>전체 프로젝트 <span class="exp-cnt">${total}</span></b>`}
          ${expCat ? `<span class="exp-sep">${ic('next', 14)}</span>${expProj
            ? `<button class="exp-crumb" data-go="${esc(expCat)}">${esc(expCat)}</button>`
            : `<b>${esc(expCat)}</b>`}` : ''}
          ${expProj ? `<span class="exp-sep">${ic('next', 14)}</span><b>${esc(expProj.name)}</b>` : ''}
        </nav>
        <span id="exp-selinfo" class="exp-selinfo"></span>
        ${tools}
      </div>
      ${알약}
      ${inner}
    </div>`
}


/* ══════════════════════════════════════════════════════════
   파인더처럼 — 2026-09-01
   "데스크톱의 폴더랑 똑같은 경험" 이 목표다. 맥 파인더의 약속 다섯 가지:
     ① 한 번 누르면 고르고, 두 번 누르면 연다 (전엔 한 번에 열려서 실수가 잦았다)
     ② 고른 것이 파랗게 보인다 · ⌘/Shift 로 여러 개
     ③ 우클릭에 할 수 있는 일이 나온다
     ④ 방향키로 옮기고 Enter 로 열고 ⌘↑ 로 위로
     ⑤ 어디 있는지(경로)와 되돌아갈 길(뒤로)이 늘 보인다
   ⚠️ 끌어놓기·이름변경은 기존 처리기가 .tree-node 에 붙는다. 건드리지 않는다.
   ══════════════════════════════════════════════════════════ */
let expSel = new Set()     // 고른 것들의 경로
let expLast = null         // Shift 범위의 기준
let expBack = []           // 뒤로 갈 길

function expCards() { return [...document.querySelectorAll('.exp-card')] }

function expPaint() {
  expCards().forEach(c => {
    const on = expSel.has(c.dataset.path)
    c.classList.toggle('on', on)
  })
  const bar = document.getElementById('exp-selinfo')
  if (bar) bar.textContent = expSel.size ? `${expSel.size}개 선택` : ''
}

function expPick(card, e) {
  const cards = expCards()
  const path = card.dataset.path
  if (e && (e.metaKey || e.ctrlKey)) {
    expSel.has(path) ? expSel.delete(path) : expSel.add(path)
  } else if (e && e.shiftKey && expLast) {
    const a = cards.findIndex(c => c.dataset.path === expLast)
    const b = cards.indexOf(card)
    if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) expSel.add(cards[i].dataset.path)
  } else {
    expSel = new Set([path])
  }
  expLast = path
  expPaint()
}

/** 여는 동작 — 분류면 안으로, 프로젝트면 파인더에서 */
function expOpen(card) {
  expBack.push({ cat: expCat, proj: expProj })
  if (card.dataset.depth === '0') { expCat = card.dataset.cat; expProj = null }
  else {
    /* ⚠️ 예전엔 프로젝트를 열면 파인더가 떴다. 앱 안에서 파일을 봐야
       무엇이 올라갔는지·대표가 뭔지 알 수 있다. 앱 안에서 연다. */
    expProj = { key: card.dataset.projectKey, name: card.querySelector('.exp-name')?.textContent || '' }
  }
  expSel.clear(); refreshExplorer()
}

/* 오른쪽 누름 메뉴 — 웹 .u2-ctx 꼴(카드 16 · 줄 40 · 아이콘 · 위험 줄은 빨강). 메뉴와 파일 메뉴가 같이 쓴다 */
function 누름메뉴(x, y, items) {
  document.getElementById('exp-menu')?.remove()
  const m = document.createElement('div')
  m.id = 'exp-menu'
  m.className = 'ctx'
  m.setAttribute('role', 'menu')
  m.style.left = `${x}px`; m.style.top = `${y}px`
  const close = () => { m.remove(); document.removeEventListener('mousedown', 바깥); document.removeEventListener('keydown', 키) }
  const 바깥 = ev => { if (!m.contains(ev.target)) close() }
  const 키 = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close() } }
  items.forEach(({ label, icon, run, danger }) => {
    const b = document.createElement('button')
    b.setAttribute('role', 'menuitem')
    if (danger) b.className = 'red'
    b.innerHTML = ic(icon, 18) + esc(label)
    b.onclick = () => { close(); run() }
    m.appendChild(b)
  })
  document.body.appendChild(m)
  const r = m.getBoundingClientRect()
  if (r.bottom > innerHeight - 8) m.style.top = `${Math.max(8, y - r.height)}px`
  if (r.right > innerWidth - 8) m.style.left = `${Math.max(8, x - r.width)}px`
  setTimeout(() => { document.addEventListener('mousedown', 바깥); document.addEventListener('keydown', 키, true) }, 0)
  return m
}

/* 「Finder 에서 보기」 → 「폴더에서 보기」 — 남의 제품 이름을 빼고, 윈도우(탐색기)에서도 맞는 말로 */
function expMenu(card, x, y) {
  const isProject = card.dataset.depth === '1'
  const items = [
    { label: isProject ? '열기' : '안으로 들어가기', icon: isProject ? 'frame' : 'next', run: () => expOpen(card) },
    { label: '폴더에서 보기', icon: 'folder', run: () => window.api.openInExplorer(card.dataset.path) },
  ]
  if (isProject) {
    items.push({ label: '이름 바꾸기', icon: 'pencil', run: () => startRenameProject(card, card.dataset.projectKey) })
    items.push({ label: '이 폴더 지우기', icon: 'trash', danger: true, run: () => deleteSyncedFolder(card.dataset.projectKey) })
  }
  누름메뉴(x, y, items)
}

function expKeys(e) {
  const pane = document.getElementById('explorer-pane')
  if (!pane || pane.style.display === 'none') return
  if (document.querySelector('.rename-input')) return   // 이름 고치는 중에는 비켜준다
  /* 앱 안 창 · 설정 · 휴지통 창이 떠 있으면 비켜준다(뒤 탐색기가 Enter · 방향키를 먹지 않게) */
  if (document.querySelector('.u2-ask, #trash-modal') || document.getElementById('settings-panel')?.style.display === 'block') return
  if (e.target?.closest?.('input, textarea')) return
  /* ⌘↑ 는 맨 먼저 — 예전엔 아래 「↑」 줄이 먼저 잡아서 위로 가기가 한 번도 안 됐다(빈 분류 안에서도 안 됐다) */
  if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') { e.preventDefault(); expUp(); return }
  const cards = expCards()
  if (!cards.length) return
  const i = cards.findIndex(c => c.dataset.path === expLast)
  /* 한 줄 칸 수 — 격자가 실제로 그린 칸 수를 센다(예전엔 칸 폭을 92 로 박아 셌다. 새 카드는 더 넓다) */
  const 격자 = pane.querySelector('.exp-grid')
  const cols = Math.max(1, 격자 ? getComputedStyle(격자).gridTemplateColumns.split(' ').filter(Boolean).length : 1)
  let next = null
  if (e.key === 'ArrowRight') next = Math.min(cards.length - 1, i + 1)
  else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1)
  else if (e.key === 'ArrowDown') next = Math.min(cards.length - 1, i + cols)
  else if (e.key === 'ArrowUp') next = Math.max(0, i - cols)
  else if (e.key === 'Enter') { const c = cards[i]; if (c) { e.preventDefault(); expOpen(c) } return }
  else if (e.key === 'Escape') { expSel.clear(); expPaint(); return }
  else return
  e.preventDefault()
  const c = cards[Math.max(0, next)]
  if (c) { expPick(c, e.shiftKey ? e : null); c.scrollIntoView({ block: 'nearest' }) }
}

function expUp() {
  if (!expCat && !expProj) return
  expBack.push({ cat: expCat, proj: expProj })
  if (expProj) expProj = null
  else expCat = null
  expSel.clear()
  refreshExplorer()
}


/** 프로젝트 안의 파일을 격자로 — 대표 사진과 순서가 한눈에 보여야 한다.
    ⚠️ 이름 바꾸기·순서 바꾸기 처리기가 .tree-file 과 data-* 에 붙는다. 그대로 둔다. */
async function fillExplorerFiles() {
  const box = document.getElementById('exp-files')
  if (!box || !expProj) return
  const files = await window.api.getProjectFiles(expProj.key).catch(() => [])
  if (!files || !files.length) {
    box.innerHTML = '<div class="exp-empty">이 폴더는 비어 있어요</div>'
    return
  }
  /* ⚠️ .file-name · .file-order 는 이름 바꾸기 · 순서 바꾸기 처리기가 찾는 이름이다.
        예전 격자에는 둘 다 없어서 ✏️ 를 눌러도, 끌어 놓아도 조용히 아무 일이 없었다(11/13 단추 눌러 보기에서 찾음). */
  box.innerHTML = files.map((f, i) => {
    const src = f.isVideo ? (f.videoThumbnailUrl || '') : (f.url || '')
    return `<div class="tree-file exp-file" draggable="true"
         data-asset-id="${esc(f.assetId)}" data-rel-path="${esc(f.relPath || '')}" data-index="${i}">
      <div class="exp-fthumb">
        ${src ? `<img src="${esc(src)}" loading="lazy" draggable="false" alt="" onerror="this.style.display='none'">` : ''}
        ${src ? '' : ic(f.isVideo ? 'play' : 'image', 28)}
        ${f.isThumbnail ? `<em class="exp-fbadge">${ic('star', 14)}대표</em>` : ''}
        ${f.isVideo && src ? `<em class="exp-fvideo" aria-label="영상">${ic('play', 14)}</em>` : ''}
        <i class="exp-fnum file-order">${i + 1}</i>
      </div>
      <div class="exp-name file-name" title="${esc(f.fileName || '')}">${esc(f.fileName || '')}</div>
      <button class="btn-rename" title="이름 바꾸기" aria-label="이름 바꾸기">${ic('pencil', 16)}</button>
    </div>`
  }).join('')
  attachFileHandlers(box, expProj.key)
  /* 파일에서도 파인더처럼 — 두 번 누르면 Finder 에서 보기, 우클릭에 할 일 */
  box.querySelectorAll('.exp-file').forEach(el => {
    el.addEventListener('dblclick', e => {
      if (e.target.closest('.btn-rename') || e.target.closest('.rename-input')) return
      revealAsset(expProj.key, el.querySelector('.exp-name')?.textContent || '')
    })
    el.addEventListener('contextmenu', e => {
      e.preventDefault()
      expFileMenu(el, e.clientX, e.clientY)
    })
  })
}

function expFileMenu(el, x, y) {
  const name = el.querySelector('.exp-name')?.textContent || ''
  누름메뉴(x, y, [
    { label: '폴더에서 보기', icon: 'folder', run: () => revealAsset(expProj.key, name) },
    { label: '이름 바꾸기', icon: 'pencil', run: () => el.querySelector('.btn-rename')?.click() },
  ])
}

function attachGridNav() {
  document.querySelectorAll('[data-go]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation(); expBack.push({ cat: expCat, proj: expProj })
      expCat = b.dataset.go || null; expProj = null; expSel.clear(); refreshExplorer()
    }))
  document.getElementById('exp-backbtn')?.addEventListener('click', () => {
    const prev = expBack.pop()
    expCat = prev ? prev.cat : null
    expProj = prev ? prev.proj : null
    expSel.clear(); refreshExplorer()
  })
  expCards().forEach(c => {
    c.addEventListener('click', e => {
      if (e.target.closest('.btn-rename') || e.target.closest('.rename-input')) return
      expPick(c, e)
    })
    c.addEventListener('dblclick', e => {
      if (e.target.closest('.btn-rename') || e.target.closest('.rename-input')) return
      e.stopPropagation(); expOpen(c)
    })
    c.addEventListener('contextmenu', e => { e.preventDefault(); expPick(c, null); expMenu(c, e.clientX, e.clientY) })
  })
  /* 빈 곳을 누르면 선택 해제 — 파인더와 같다 */
  document.querySelector('.exp-main')?.addEventListener('mousedown', e => {
    if (!e.target.closest('.exp-card')) { expSel.clear(); expPaint() }
  })
  expPaint()
}

document.addEventListener('keydown', expKeys)

/* 폴더 상태 — 카드 오른쪽 위 원 하나(정답 그림: 초록 체크 = 올라감 · 시계 = 기다림).
   예전 글자 딱지(📂 카테고리 · 🗂 프로젝트)는 카드 판 색이 말해 줘서 뺐다(분류 = 옅은 파랑 판, 프로젝트 = 회색 판).
   빈 폴더는 원 대신 카드 아래 수 자리에 「비어 있어요」 */
function badgeHtml(b) {
  const map = {
    'misplaced': `<span class="exp-st warn" title="자리가 맞지 않아요">${ic('alert', 16)}</span>`,
    'uploaded': `<span class="exp-st" title="올라감">${ic('check', 16)}</span>`,
    'pending': `<span class="exp-st wait" title="기다리는 중">${ic('clock', 16)}</span>`,
  }
  return map[b] || ''
}

function renderTree(nodes, root) {
  if (!nodes.length) return '<div class="pane-msg">폴더가 없어요</div>'
  return `<div style="font-size:12px">${nodes.map(n => renderNode(n, root)).join('')}</div>`
}

function getProjectKey(fullPath, root) {
  // fullPath에서 root 기준 상대 경로 추출
  let rel = fullPath.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/')
  if (rel.startsWith(r)) rel = rel.slice(r.length)
  if (rel.startsWith('/')) rel = rel.slice(1)
  return rel
}

function renderNode(n, root) {
  const isCat = n.depth === 0
  const isProject = n.depth === 1
  const indent = n.depth * 16
  const icon = ic(isCat ? 'grid' : 'folder', 18)
  const childHtml = n.children?.length
    ? n.children.map(c => renderNode(c, root)).join('')
    : (isCat ? '<div class="pane-msg" style="padding:4px 0 4px 32px;text-align:left">비어 있어요</div>' : '')
  const projectKey = isProject ? getProjectKey(n.path, root) : ''
  return `
    <div class="tree-node" data-path="${n.path.replace(/"/g, '&quot;')}" data-depth="${n.depth}" data-project-key="${projectKey}" draggable="${!isCat}"
         style="padding:6px 8px;margin-left:${indent}px;border-radius:8px;display:flex;align-items:center;gap:8px;cursor:${isCat ? 'default' : 'pointer'};border:1px solid transparent">
      <span>${icon}</span>
      <span class="node-name" style="font-weight:${isCat ? '700' : '600'}">${esc(n.name)}</span>
      ${badgeHtml(n.badge)}${badgeHtml(n.badge2)}
      <span class="exp-cnt dim">${n.fileCount || 0}</span>
      ${isProject ? `<div class="node-actions"><button class="btn-rename" title="이름 바꾸기" aria-label="이름 바꾸기">${ic('pencil', 16)}</button></div>` : ''}
    </div>
    ${isProject ? `<div class="tree-files" id="files-${projectKey.replace(/[^a-zA-Z0-9]/g, '_')}" style="display:none"></div>` : ''}
    ${childHtml}
  `
}

let expandedProjects = new Set()
let fileDragData = null

function attachExplorerHandlers(root) {
  document.querySelectorAll('.tree-node').forEach(el => {
    const depth = parseInt(el.dataset.depth)
    const fullPath = el.dataset.path
    const projectKey = el.dataset.projectKey

    // 카테고리 간 프로젝트 이동 (기존)
    if (depth > 0) {
      el.addEventListener('dragstart', (e) => {
        if (fileDragData) { e.preventDefault(); return } // 파일 드래그 중이면 무시
        dragNode = fullPath; el.style.opacity = '0.4'
      })
      el.addEventListener('dragend', () => { el.style.opacity = '1'; dragNode = null })
    }

    if (depth === 0) {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop-on') })
      el.addEventListener('dragleave', () => el.classList.remove('drop-on'))
      el.addEventListener('drop', async (e) => {
        e.preventDefault()
        el.classList.remove('drop-on')
        if (!dragNode) return
        const name = dragNode.split(/[/\\]/).pop()
        /* ⚠️ 예전엔 사이 글자를 늘 「\」 로 붙였다 — 맥에서는 「인물\봄 인물」 이라는 이름의 폴더가 바깥에 생긴다(11/13 찾음).
              맥 · 윈도우 저마다의 사이 글자로 */
        const sep = window.api.platform === 'win32' ? '\\' : '/'
        const target = fullPath + (fullPath.endsWith(sep) ? '' : sep) + name
        const result = await window.api.moveFolder(dragNode, target)
        if (result.ok) {
          setTimeout(refreshExplorer, 500)
        } else {
          실패알림({ 제목: '폴더를 옮기지 못했어요', 오류: result.error })
        }
      })
    }

    // 프로젝트 클릭 → 파일 목록 펼치기/접기
    if (depth === 1 && projectKey) {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.btn-rename') || e.target.closest('.rename-input')) return
        toggleProjectFiles(projectKey, root)
      })

      // 이름 변경 버튼
      const renameBtn = el.querySelector('.btn-rename')
      if (renameBtn) {
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          startRenameProject(el, projectKey)
        })
      }
    }

    /* ⚠️ 격자 카드에는 attachGridNav 가 더블클릭을 따로 붙인다.
       여기서 또 붙이면 한 번에 두 번 열린다. 격자가 아닐 때만 붙인다. */
    if (!el.classList.contains('exp-card')) {
      el.addEventListener('dblclick', (e) => {
        if (e.target.closest('.btn-rename') || e.target.closest('.rename-input')) return
        window.api.openInExplorer(fullPath)
      })
    }
  })
}

async function toggleProjectFiles(projectKey, root) {
  const safeId = 'files-' + projectKey.replace(/[^a-zA-Z0-9]/g, '_')
  const container = document.getElementById(safeId)
  if (!container) return

  if (expandedProjects.has(projectKey)) {
    expandedProjects.delete(projectKey)
    container.style.display = 'none'
    container.innerHTML = ''
    return
  }

  expandedProjects.add(projectKey)
  container.style.display = 'block'
  container.innerHTML = '<div class="pane-msg">불러오는 중이에요</div>'

  const files = await window.api.getProjectFiles(projectKey)
  if (files.length === 0) {
    container.innerHTML = '<div class="pane-msg">이 폴더는 비어 있어요</div>'
    return
  }

  container.innerHTML = files.map((f, i) => {
    const thumbSrc = f.isVideo
      ? (f.videoThumbnailUrl || '')
      : (f.url || '')
    const thumbHtml = thumbSrc
      ? `<img class="file-thumb" src="${thumbSrc}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="file-thumb" style="display:grid;place-items:center">${ic(f.isVideo ? 'play' : 'image', 18)}</div>`
    const badges = []
    if (f.isThumbnail) badges.push('<span class="badge-thumb">대표</span>')
    if (f.isVideo) badges.push('<span class="badge-video">영상</span>')
    return `
      <div class="tree-file" draggable="true" data-asset-id="${f.assetId}" data-rel-path="${f.relPath.replace(/"/g, '&quot;')}" data-index="${i}">
        <span class="file-grip">${ic('grid', 14)}</span>
        ${thumbHtml}
        <span class="file-name">${f.fileName}</span>
        ${badges.join('')}
        <span class="file-order">#${i + 1}</span>
        <button class="btn-rename" title="이름 바꾸기" aria-label="이름 바꾸기">${ic('pencil', 16)}</button>
      </div>
    `
  }).join('')

  attachFileHandlers(container, projectKey)
}

function attachFileHandlers(container, projectKey) {
  const fileEls = container.querySelectorAll('.tree-file')

  fileEls.forEach(el => {
    // 파일 이름 변경
    el.querySelector('.btn-rename').addEventListener('click', (e) => {
      e.stopPropagation()
      startRenameFile(el)
    })

    // 드래그 순서 변경
    el.addEventListener('dragstart', (e) => {
      e.stopPropagation()
      fileDragData = { el, assetId: el.dataset.assetId, index: parseInt(el.dataset.index) }
      el.classList.add('dragging')
    })
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging')
      fileDragData = null
      container.querySelectorAll('.tree-file').forEach(f => f.classList.remove('drag-over'))
    })
    el.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!fileDragData) return
      container.querySelectorAll('.tree-file').forEach(f => f.classList.remove('drag-over'))
      el.classList.add('drag-over')
    })
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
    el.addEventListener('drop', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      el.classList.remove('drag-over')
      if (!fileDragData || fileDragData.assetId === el.dataset.assetId) return

      // 순서 재배치
      const allFiles = [...container.querySelectorAll('.tree-file')]
      const fromIdx = allFiles.indexOf(fileDragData.el)
      const toIdx = allFiles.indexOf(el)
      if (fromIdx < 0 || toIdx < 0) return

      // DOM 이동
      if (fromIdx < toIdx) {
        el.after(fileDragData.el)
      } else {
        el.before(fileDragData.el)
      }

      // 순서 번호 업데이트 + Firestore 저장
      const reordered = [...container.querySelectorAll('.tree-file')]
      const orderedIds = reordered.map((f, i) => {
        const 번호 = f.querySelector('.file-order')
        if (번호) 번호.textContent = 번호.classList.contains('exp-fnum') ? String(i + 1) : `#${i + 1}`
        f.dataset.index = i
        return f.dataset.assetId
      })

      await window.api.reorderFiles(orderedIds)
    })
  })
}

function startRenameProject(nodeEl, projectKey) {
  const nameSpan = nodeEl.querySelector('.node-name')
  if (!nameSpan) return
  const oldName = nameSpan.textContent
  const input = document.createElement('input')
  input.type = 'text'
  input.value = oldName
  input.className = 'rename-input'
  input.setAttribute('aria-label', '새 이름')
  nameSpan.replaceWith(input)
  input.focus()
  input.select()

  /* ⚠️ Enter 와 칸 벗어남(blur)이 둘 다 끝내기를 부른다 — 한 번만 */
  let 끝 = false
  const finish = async (save) => {
    if (끝) return
    끝 = true
    const newName = input.value.trim()
    if (save && newName && newName !== oldName) {
      const result = await window.api.renameProject(projectKey, newName)
      if (!result.ok) {
        실패알림({ 제목: '이름을 바꾸지 못했어요', 오류: result.error })
      }
    }
    setTimeout(refreshExplorer, 300)
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true) }
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}

function startRenameFile(fileEl) {
  const nameSpan = fileEl.querySelector('.file-name')
  if (!nameSpan) return
  const relPath = fileEl.dataset.relPath
  const oldName = nameSpan.textContent
  const input = document.createElement('input')
  input.type = 'text'
  input.value = oldName
  input.className = 'rename-input'
  input.setAttribute('aria-label', '새 이름')
  input.draggable = false
  nameSpan.replaceWith(input)
  input.focus()

  // 확장자 앞까지만 선택
  const dotIdx = oldName.lastIndexOf('.')
  if (dotIdx > 0) input.setSelectionRange(0, dotIdx)
  else input.select()

  let 끝 = false
  const finish = async (save) => {
    if (끝) return
    끝 = true
    const newName = input.value.trim()
    if (save && newName && newName !== oldName) {
      const result = await window.api.renameFile(relPath, newName)
      if (!result.ok) {
        실패알림({ 제목: '이름을 바꾸지 못했어요', 오류: result.error })
      }
    }
    // 파일 목록 새로고침 — 격자(탐색기)면 격자를, 예전 줄 목록이면 줄을
    if (expProj && document.getElementById('exp-files')) { fillExplorerFiles(); return }
    const projectKey = relPath.split('/').slice(0, -1).join('/')
    expandedProjects.delete(projectKey)
    toggleProjectFiles(projectKey)
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true) }
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}

// ── Explorer View Size ──
/* 크기 막대 — 예전엔 글자 크기 · 칸 여백을 키웠다. 새 꼴에선 카드 폭을 키운다(값 30~200, 60 이 보통).
   글자 크기는 단계(17 · 13)를 지킨다 */
let 탐색기크기 = 60
function setThumbSize(val) {
  val = parseInt(val)
  탐색기크기 = val
  document.documentElement.style.setProperty('--thumb-size', val + 'px')
  document.documentElement.style.setProperty('--exp-col', Math.round(96 + val * 0.9) + 'px')
  document.querySelectorAll('.exp-size input').forEach(el => el.style.setProperty('--p', (val - 30) / 170))
}
window.setThumbSize = setThumbSize

// ── File List Rendering ──
function renderFileList() {
  const list = document.getElementById('file-list')
  list.innerHTML = `<div class="empty-state"><span class="empty-ico">${ic('search', 26)}</span><p>파일을 찾는 중이에요</p></div>`
}

function updateFileItem(data) {
  const list = document.getElementById('file-list')

  // Remove empty state
  const empty = list.querySelector('.empty-state')
  if (empty) empty.remove()

  const safeId = 'file-' + data.path.replace(/[^a-zA-Z0-9]/g, '_')
  let item = document.getElementById(safeId)
  if (!item) {
    item = document.createElement('div')
    item.className = 'file-item'
    item.id = safeId
    list.prepend(item)
  }

  const iconClass = data.isVideo ? 'video' : 'image'

  let statusHtml = ''
  let progressHtml = ''

  if (data.status === 'uploading') {
    statusHtml = `<span class="file-status uploading">${data.progress}%</span>`
    progressHtml = `<div class="file-progress"><div class="file-progress-bar" style="width:${data.progress}%"></div></div>`
  } else if (data.status === 'encoding') {
    /* 「인코딩」 은 손님 말이 아니다 — 영상을 웹에 맞게 바꾸는 중 */
    statusHtml = `<span class="file-status encoding">바꾸는 중</span>`
    progressHtml = `<div class="file-progress"><div class="file-progress-bar enc" style="width:${data.progress}%"></div></div>`
  } else if (data.status === 'done') {
    statusHtml = `<span class="file-status done" aria-label="올라감">${ic('check', 15)}</span>`
  } else if (data.status === 'failed') {
    statusHtml = `<button class="btn-retry" onclick="retryFile('${jsq(data.path)}')">${ic('refresh', 15)}다시 시도</button>`
  } else if (data.status === 'renamed') {
    statusHtml = '<span class="file-status">이름 바뀜</span>'
  } else if (data.status === 'deleted') {
    statusHtml = '<span class="file-status">지워짐</span>'
  } else if (data.status === 'held') {
    /* 로그인이 끝나 붙들어 둔 파일 — 다시 로그인하면 올라간다 */
    statusHtml = '<span class="file-status">기다림</span>'
  }

  /* 실패 까닭은 우리말만 보인다(영어 기술 오류 → 손님 말 또는 「올리지 못했어요」) */
  const 까닭 = data.status === 'failed' ? (오류까닭(data.error) || '올리지 못했어요') : ''
  const meta = [data.size || '', 진행말(data.phase), 까닭].filter(Boolean).join(' · ')
  item.innerHTML = `
    <div class="file-icon ${iconClass}">${ic(data.isVideo ? 'play' : 'image', 20)}</div>
    <div class="file-info">
      <div class="file-name" title="${esc(data.path)}">${esc(data.fileName)}</div>
      <div class="file-meta">${esc(meta)}</div>
      ${progressHtml}
    </div>
    ${statusHtml}
  `

}

function retryFile(path) {
  window.api.retryFile(path)
}
window.retryFile = retryFile

function updateSummary() {
  const bar = document.getElementById('summary-bar')
  const text = document.getElementById('summary-text')
  const retryBtn = document.getElementById('btn-retry-all')

  let done = 0, failed = 0, uploading = 0, encoding = 0, held = 0
  for (const [, data] of fileStatuses) {
    if (data.status === 'done') done++
    else if (data.status === 'failed') failed++
    else if (data.status === 'uploading') uploading++
    else if (data.status === 'encoding') encoding++
    else if (data.status === 'held') held++
  }

  const total = done + failed + uploading + encoding + held
  if (total === 0) { bar.style.display = 'none'; return }

  bar.style.display = 'flex'
  let parts = [`<strong>${done}</strong> 올라감`]
  if (encoding > 0) parts.push(`<span class="s-enc">${encoding} 영상 바꾸는 중</span>`)
  if (uploading > 0) parts.push(`${uploading} 올리는 중`)
  if (failed > 0) parts.push(`<span class="s-fail">${failed} 실패</span>`)
  if (held > 0) parts.push(`${held} 로그인 기다림`)
  text.innerHTML = parts.join(' · ')

  retryBtn.style.display = failed > 0 ? '' : 'none'
  /* 상한에 걸린 실패는 눌러도 같은 답이다 — 버튼 말을 바꾼다 */
  retryBtn.textContent = limitNoticeOn ? '요금제 바꿨어요 · 다시 확인' : '전부 다시 시도'
}

// ── Tray Menu Actions ──
window.api.onTrayAction((action) => {
  if (action === 'change-folder') {
    document.getElementById('btn-change-folder')?.click()
  } else if (action === 'logout') {
    document.getElementById('btn-logout')?.click()
  } else if (action === 'settings') {
    openSettings()
  }
})

// ── Auto Update UI ──
let updateReady = false
window.api.onUpdateStatus((data) => {
  const banner = document.getElementById('update-banner')
  if (!banner) return

  // ready 상태면 installing/error 외에는 덮어쓰지 않음
  if (updateReady && data.status !== 'ready' && data.status !== 'installing' && data.status !== 'error') return

  /* 업데이트 창 — 가운데 카드(새 꼴). 글자 그림(⬇️ ✨ ✅ ⏳ ⚠️)은 아이콘 원으로 */
  if (data.status === 'available') {
    banner.style.display = 'block'
    banner.innerHTML = `
      <div class="upd">
        <div class="upd-row">
          <span class="upd-ico">${ic('download', 20)}</span>
          <div class="update-text">새 버전 v${esc(data.version)} 내려받는 중이에요
            <div class="update-progress"><div class="update-progress-bar" style="width:0%"></div></div>
          </div>
        </div>
      </div>
    `
  } else if (data.status === 'downloading') {
    banner.style.display = 'block'
    const bar = banner.querySelector('.update-progress-bar')
    const text = banner.querySelector('.update-text')
    if (bar) bar.style.width = `${data.percent}%`
    if (text && !text.querySelector('.update-progress')) {
      // already showing, just update percentage text
    }
  } else if (data.status === 'ready') {
    updateReady = true
    banner.style.display = 'block'
    // releaseNotes: markdown/html → 텍스트 줄로 변환
    let notesHtml = ''
    if (data.releaseNotes) {
      const raw = typeof data.releaseNotes === 'string' ? data.releaseNotes : ''
      const lines = raw.replace(/<\/(li|p|div|h\d)>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').split(/\n/).map(l => l.trim()).filter(Boolean).slice(0, 5)
      if (lines.length > 0) {
        notesHtml = `<div class="upd-notes">${lines.map(l => esc(l.replace(/^[•\-*]\s*/, ''))).map(l => '· ' + l).join('<br>')}</div>`
      }
    }
    banner.innerHTML = `
      <div class="upd">
        <div class="upd-row">
          <span class="upd-ico">${ic('star', 20)}</span>
          <div class="update-text">새 버전 v${esc(data.version)} 준비됐어요<small>설치하면 앱이 잠깐 꺼졌다 다시 켜져요</small></div>
        </div>
        ${notesHtml}
        <div class="upd-btns">
          <button class="u2-btn u2-btn-sm" onclick="document.getElementById('update-banner').style.display='none';updateReady=false">나중에</button>
          <button class="u2-btn u2-btn-sm u2-btn-blue" onclick="window.api.installUpdate()">지금 설치</button>
        </div>
      </div>
    `
  } else if (data.status === 'up-to-date') {
    banner.style.display = 'block'
    banner.innerHTML = `
      <div class="upd">
        <div class="upd-row">
          <span class="upd-ico ok">${ic('check', 20)}</span>
          <div class="update-text">최신 버전이에요</div>
          <button class="u2-icon-btn sm sh-x" onclick="document.getElementById('update-banner').style.display='none'" aria-label="닫기">${ic('x', 18)}</button>
        </div>
      </div>
    `
    /* ⚠️ 스스로 사라지게 한다 — 2026-09-08.
       이 알림은 목록 위에 떠서 폴더 서너 줄을 가린다. 그런데 닫기를 누르기 전엔
       영영 안 사라져서, 몇 분째 화면을 덮고 있었다.
       알려주기만 하면 되는 내용이라 잠깐 보이고 물러나는 게 맞다.
       (오류 알림은 이미 그렇게 하고 있었다) */
    clearTimeout(window._upToDateTimer)
    window._upToDateTimer = setTimeout(() => {
      const b = document.getElementById('update-banner')
      if (b && b.textContent.includes('최신 버전이에요')) b.style.display = 'none'
    }, 4000)
  } else if (data.status === 'installing') {
    banner.style.display = 'block'
    banner.innerHTML = `
      <div class="upd">
        <div class="upd-row">
          <span class="upd-ico">${ic('refresh', 20, 'spin')}</span>
          <div class="update-text">업데이트를 설치하고 있어요<small>곧 앱이 다시 켜져요</small></div>
        </div>
      </div>
    `
  } else if (data.status === 'error') {
    updateReady = false
    banner.style.display = 'block'
    /* 업데이트 모듈의 오류는 영어다(net::ERR_… 등) — 우리말만 보이고 나머지는 「인터넷 …」 으로 */
    const 까닭 = 오류까닭(data.message)
    banner.innerHTML = `
      <div class="upd">
        <div class="upd-row">
          <span class="upd-ico bad">${ic('alert', 20)}</span>
          <div class="update-text">업데이트를 확인하지 못했어요<small>${esc(까닭 || '잠시 뒤 다시 해 주세요.')}</small></div>
          <button class="u2-icon-btn sm sh-x" onclick="document.getElementById('update-banner').style.display='none'" aria-label="닫기">${ic('x', 18)}</button>
        </div>
      </div>
    `
    setTimeout(() => { banner.style.display = 'none' }, 5000)
  }
})

// ── Settings Panel ──
function openSettings() {
  closeWebMenu()
  document.getElementById('settings-overlay').style.display = 'block'
  document.getElementById('settings-panel').style.display = 'block'
  /* 계정 — 예전엔 동기화 화면 왼쪽 위에 이름만 있었다. 로그아웃과 같이 여기로 */
  updateSyncUserLabel()
  document.getElementById('set-account').hidden = !currentUser   // 로그인 전(트레이 「설정」)엔 계정 칸을 숨긴다
  document.getElementById('set-email').textContent = currentUser?.email && currentUser.email !== currentUser.name ? currentUser.email : ''
  // 현재 스케일 값 반영
  const config = window._cachedConfig || {}
  const scale = config.uiScale || 100
  const 막대 = document.getElementById('ui-scale-slider')
  막대.value = scale
  막대.style.setProperty('--p', (scale - 50) / 100)
  document.getElementById('ui-scale-label').textContent = scale + '%'
  document.getElementById('settings-panel').querySelector('.sh-x')?.focus({ preventScroll: true })
  // 앱 버전 표시
  window.api.getAppVersion().then(v => {
    document.getElementById('settings-version').textContent = 'v' + v
  })
}
window.openSettings = openSettings

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none'
  document.getElementById('settings-panel').style.display = 'none'
}
window.closeSettings = closeSettings

function setUiScale(val) {
  val = parseInt(val)
  document.getElementById('ui-scale-label').textContent = val + '%'
  document.getElementById('ui-scale-slider')?.style.setProperty('--p', (val - 50) / 100)
  // CSS zoom 적용 (titlebar 제외한 전체)
  const factor = val / 100
  document.querySelectorAll('.screen').forEach(s => { s.style.zoom = factor })
  // 설정 저장
  window.api.saveConfig({ uiScale: val })
  if (window._cachedConfig) window._cachedConfig.uiScale = val
}
window.setUiScale = setUiScale

function resetUiScale() {
  setUiScale(100)
  document.getElementById('ui-scale-slider').value = 100
}
window.resetUiScale = resetUiScale

function applyUiScale(val) {
  if (!val || val === 100) {
    document.querySelectorAll('.screen').forEach(s => { s.style.zoom = '' })
    return
  }
  const factor = val / 100
  document.querySelectorAll('.screen').forEach(s => { s.style.zoom = factor })
}

document.getElementById('btn-settings').addEventListener('click', openSettings)
/* 설정 창 · 휴지통 창은 Esc 로 닫힌다(앱 안 창이 떠 있으면 그 창이 먼저 닫힌다) */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || document.querySelector('.u2-ask')) return
  if (document.getElementById('trash-modal')) { document.getElementById('trash-modal').remove(); return }
  if (document.getElementById('settings-panel').style.display !== 'none') closeSettings()
})

// ── Init: check saved config ──
;(async () => {
  const config = await window.api.getConfig()
  window._cachedConfig = config

  // 저장된 UI 스케일 적용
  if (config.uiScale && config.uiScale !== 100) {
    applyUiScale(config.uiScale)
  }

  if (config.uid) {
    currentUser = { uid: config.uid, name: config.name || '', email: config.email || '' }
    selectedFolder = config.watchDir || null

    if (selectedFolder) {
      // UID + 폴더 모두 있으면 바로 동기화 시작
      showScreen('sync-screen')
      setHeroFolder(selectedFolder)
      setSync('syncing', '동기화 시작', '')
      updateSyncUserLabel()
      fileStatuses.clear()
      renderFileList()
      await window.api.startSync({ uid: currentUser.uid, watchDir: selectedFolder })
    setTimeout(peekTrashOnce, 4000)
      refreshMySite()
    } else {
      showSetup()
    }
  }
})()

/* ══════════════════════════════════════════════════════════
   휴지통 — 2026-08-31
   같은 파일이 여러 벌 올라간 것을 찾아 고객이 직접 정리한다.

   ⚠️ 우리가 지우지 않는다. 후보만 보여주고 고객이 남길 것을 고른다.
      판정 근거에 따라 말이 다르다:
        완전히 같은 파일  바이트 지문이 같다 — 미리보기 하나만 보여준다.
                        (썸네일은 업로드마다 다른 프레임이 잡혀서
                         나란히 놓으면 다른 영상처럼 보인다. 한 번 데였다.)
        같은 영상        화면 지문이 가깝다 — 재생해서 확인 권함
        확인 필요        크기만 같다 — 반드시 재생
   ══════════════════════════════════════════════════════════ */
let trashData = null
/* ⚠️ 예전엔 '남길 것 하나' 를 골랐다. 그런데 사람이 화면에서 하려는 일은
   "이 파일을 지운다" 지 "이 파일을 남긴다" 가 아니다. 셋 이상일 때도
   남길 것 하나만 고르면 나머지가 통째로 날아가 무섭다.
   그래서 지울 것을 하나씩 표시하는 방식으로 바꿨다. 최소 한 장은 남는다. */
/* ⚠️ 예전엔 '무리 번호 → 고른 파일' 로 기억했다. 탐색기에 갔다 돌아오면
   목록을 다시 불러오면서 번호가 바뀌고, 골라둔 게 통째로 날아갔다.
   실제로 "삭제가 된 거야 만 거야" 라는 말을 들었다.
   파일 자체를 기억하면 다시 불러와도 그대로 남는다. */
const trashDel = new Set()   // 지울 자산 id

/* '알아요' 로 접은 경고. 무리는 순서가 바뀔 수 있으니 번호가 아니라
   파일 지문으로 기억한다 — 번호로 기억하면 엉뚱한 경고가 접힌다. */
const groupKey = g => (g.items[0] && (g.items[0].contentHash || g.items[0].id)) || ''
let warnHidden = new Set()
try { warnHidden = new Set(JSON.parse(localStorage.getItem('trash-warn-hidden') || '[]')) } catch {}
function hideWarn(key) {
  warnHidden.add(key)
  try { localStorage.setItem('trash-warn-hidden', JSON.stringify([...warnHidden])) } catch {}
  renderTrash()
}

/* ⚠️ 여기 말투가 번역체라는 지적을 받았다. '바이트까지 똑같습니다' 같은 말은
   우리끼리 쓰는 말이지 고객의 말이 아니다.
   기준: 사진 찍는 사람이 읽고 바로 무슨 뜻인지 알 것. 전문 용어 금지. */
/* 문구 규칙 — 2026-08-31
 *
 * ⚠️ 처음엔 여기에 설명 문장을 썼다.
 *    "똑같은 파일이 여러 개 있습니다 / 내용이 하나도 다르지 않습니다. 하나만 남기면 됩니다."
 *    번역기 돌린 것 같다는 말을 들었고, 맞는 말이었다. 이유는 셋이다.
 *      ① 화면이 이미 보여주는 걸 문장으로 또 말했다 (파일 두 장이 나란히 있는데)
 *      ② 당연한 걸 설명했다 ("하나만 남기면 됩니다")
 *      ③ '-합니다' 체를 썼다. 국내 서비스는 해요체를 쓴다.
 *
 * 그래서 규칙을 이렇게 둔다:
 *   · 목록 머리글은 문장이 아니라 **라벨**이다. 개수·용량은 옆에 숫자로.
 *   · 보조 설명은 **화면이 못 보여주는 새 정보**가 있을 때만 붙인다.
 *     '똑같은 파일' 은 근거가 확실하니 더 할 말이 없다 — 그래서 비운다.
 *     '같은 영상 같아요' 는 확실치 않으니 무엇을 해야 하는지 한 줄 붙인다.
 *   · 말투는 해요체. 소리 내어 읽어서 어색하면 다시 쓴다.
 */
const LV = {
  sure:   { t: '중복 파일',        c: 'var(--ui-green)', sub: '' },
  likely: { t: '같은 영상 같아요', c: 'var(--ui-yellow)', sub: '재생해서 확인해 주세요' },
  maybe:  { t: '크기만 같아요',    c: 'var(--ui-orange-b)', sub: '내용은 다를 수 있어요' },
}
const tMB = n => (n / 1048576).toFixed(1)
const tGB = n => (n / 1073741824).toFixed(2)
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/* 홑따옴표 글(onclick="함수('…')") 안에 넣을 값 — 이름에 ' 나 \ 가 있어도 깨지지 않게 */
const jsq = t => esc(String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/'/g, "\\'"))

let trashedList = null   // 이미 휴지통에 넣은 것들


/* ══════════════════════════════════════════════════════════
   휴지통 — 지운 파일이 실제로 어디 있는지 보여주는 자리.
   ⚠️ 예전엔 중복 정리 화면 안에 묻혀 있어서, 지우고 나서
      "그래서 어디 갔냐" 를 알 수가 없었다.
   30일 동안 여기 있다가 서버가 영구 삭제한다.
   ══════════════════════════════════════════════════════════ */
async function openTrash() {
  let box = document.getElementById('trash-modal')
  if (!box) {
    box = document.createElement('div')
    box.id = 'trash-modal'
    box.innerHTML = '<div class="ov" style="z-index:200"></div><div class="sheet-card tr-card" style="z-index:201" role="dialog" aria-modal="true" aria-labelledby="tr-title"></div>'
    box.firstChild.addEventListener('click', () => box.remove())
    document.body.appendChild(box)
  }
  const inner = box.querySelector('.tr-card')
  inner.innerHTML = `<div class="sh-head"><h2 id="tr-title">휴지통</h2>
      <button class="u2-icon-btn sm sh-x" onclick="document.getElementById('trash-modal').remove()" aria-label="닫기">${ic('x', 20)}</button></div>
    <div class="pane-msg">불러오는 중이에요</div>`
  const t = await window.api.listTrashed().catch(e => ({ error: e?.message || '알 수 없는 문제' }))
  trashedList = t
  if (!document.body.contains(inner)) return

  const 머리 = (n, gb) => `
    <div class="sh-head">
      <h2 id="tr-title">휴지통${n != null ? `<small>${n}개 · ${gb} GB</small>` : ''}</h2>
      <button class="u2-icon-btn sm sh-x" onclick="document.getElementById('trash-modal').remove()" aria-label="닫기">${ic('x', 20)}</button>
    </div>`
  if (t && t.error) {
    const 까닭 = 오류까닭(t.error)
    inner.innerHTML = 머리() + `<div class="dp-note red">휴지통을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.${까닭 ? `<small>${esc(까닭.slice(0, 120))}</small>` : ''}</div>`
    return
  }
  const items = (t && t.items) || []
  const hiddenCount = warnHidden.size
  inner.innerHTML = 머리(items.length, tGB(t?.bytes || 0)) + `
    <p class="set-desc">30일이 지나면 완전히 지워져요. 그 전에는 언제든 되돌릴 수 있어요.<br>
      컴퓨터의 원본은 동기화 폴더 안 <b>_Trash</b> 로 옮겨져 있어요.</p>
    ${items.length ? `
      <div class="tr-list">
        ${items.slice(0, 200).map(a => `
          <div class="tr-row">
            <!-- ⚠️ 이름만 있으면 어떤 사진인지 알 수 없어 되돌릴지 판단이 안 된다. 서버가 주는 thumb 를 쓴다. -->
            <span class="tr-thumb">${a.thumb ? `<img src="${esc(a.thumb)}" alt="">` : ic(a.isVideo ? 'play' : 'image', 18)}</span>
            <span class="tr-main"><b title="${esc(a.fileName)}">${esc(a.fileName)}</b>
              <span>${tMB(a.fileSize)} MB · </span><span class="${a.daysLeft <= 3 ? 'soon' : ''}">${a.daysLeft}일 남음</span></span>
            <button class="sm-btn" onclick="restoreOne('${jsq(a.id)}')">${ic('undo', 16)}되돌리기</button>
          </div>`).join('')}
      </div>
      <div class="tr-foot">
        <button class="sm-btn" onclick="restoreAll()">전부 되돌리기</button>
        <!-- ⚠️ 되돌릴 수 없는 동작이라 색으로도 구분한다 -->
        <button class="sm-btn red-soft" onclick="purgeAll()">${ic('trash', 18)}휴지통 비우기</button>
      </div>`
      : `<div class="empty-state"><span class="empty-ico">${ic('trash', 26)}</span><p>휴지통이 비어 있어요</p></div>`}
    ${hiddenCount ? `
      <div class="tr-hidden">
        <div class="set-label">숨긴 제안 ${hiddenCount}개</div>
        <p class="set-desc">「메시지 삭제하기」 로 뺀 중복 제안이에요.</p>
        <button class="sm-btn" onclick="unhideWarns()">다시 보기</button>
      </div>` : ''}`
}

function unhideWarns() {
  warnHidden.clear()
  try { localStorage.setItem('trash-warn-hidden', '[]') } catch {}
  document.getElementById('trash-modal')?.remove()
  renderTrash()
}

async function loadTrash() {
  const pane = document.getElementById('trash-pane')
  pane.innerHTML = '<div class="pane-msg">중복을 찾는 중이에요</div>'
  // ⚠️ 되돌릴 길이 없으면 '휴지통' 이 아니라 즉시 삭제다. 넣은 것도 같이 보여준다.
  /* ⚠️ 예전엔 .catch(() => null) 로 실패를 조용히 삼켰다.
     서버 조회가 색인 문제로 통째로 실패하고 있었는데 화면엔 아무 말도 없어서,
     "휴지통이 비었다" 와 "못 불러왔다" 가 구분이 안 됐다. 실제로 79개가 있었다.
     못 불러온 건 못 불러왔다고 말해야 한다. */
  trashedList = await window.api.listTrashed().catch(e => ({ error: e?.message || '알 수 없는 문제' }))
  const r = await window.api.findDuplicates()
  if (r?.error) {
    pane.innerHTML = `<div class="pane-msg red">${esc(오류까닭(r.error) || '중복을 찾지 못했어요. 잠시 뒤 다시 해 주세요.')}</div>`
    return
  }
  trashData = r
  /* ⚠️ 예전엔 열자마자 한 장만 남기고 나머지를 지울 것으로 미리 골라뒀다.
     그랬더니 아무것도 안 눌렀는데 '삭제됨' 이 떠서
     "왜 삭제한다고 안 했는데 삭제됐냐" 는 말을 들었다.
     지우는 건 되돌리기 어려운 일이다. 아무것도 안 고른 채로 시작한다.
     한 번에 고르고 싶은 사람을 위해 위에 '한 장씩만 남기고 모두' 를 둔다. */
  /* 다시 불러와도 골라둔 것은 지킨다. 없어진 파일만 정리한다. */
  const alive = new Set(r.groups.flatMap(g => g.items.map(a => a.id)))
  for (const id of [...trashDel]) if (!alive.has(id)) trashDel.delete(id)
  markTrashTab()
  renderTrash()
}

function renderTrash() {
  const pane = document.getElementById('trash-pane')
  const d = trashData
  if (!d || !d.groups.length) {
    pane.innerHTML = `<div class="empty-state"><span class="empty-ico">${ic('check', 26)}</span><p>중복된 파일이 없어요</p></div>`
    return
  }
  // 고객이 고른 대로 다시 계산 — 남길 것 빼고 나머지가 비는 값
  // ⚠️ 비는 값은 안전한 무리만 센다. 두 프로젝트에 다 살아있는 건
  //    지워도 자리가 안 빈다 — 넣으면 "10GB 비울 수 있어요" 가 거짓말이 된다.
  let free = 0, picked = 0, maxFree = 0, pickedBytes = 0
  d.groups.forEach((g, i) => {
    const del = trashDel
    // 고른 개수·크기는 위험한 무리도 센다 (사람이 직접 골랐으니)
    g.items.forEach(a => { if (del.has(a.id)) { picked++; pickedBytes += a.fileSize } })
    if (g.kind === 'shared') return
    g.items.forEach(a => { if (del.has(a.id)) free += a.fileSize })
    // 한 장씩만 남겼을 때 비는 값 — '여기까지 비울 수 있어요' 의 근거
    g.items.slice(1).forEach(a => { maxFree += a.fileSize })
  })

  /* 위 카드 — 쓰는 양(큰 숫자 28) · 비울 수 있는 양 · 휴지통으로 옮기기 */
  const head = `
    <section class="card dp-head">
      <div><div class="dp-num">${tGB(d.usedBytes)} GB</div>
           <div class="dp-sub">쓰는 중 · 파일 ${d.assetCount}개</div></div>
      <div class="dp-free">
        <b class="${picked ? 'on' : ''}">${picked ? '' : '최대 '}${tGB(picked ? free : maxFree)} GB</b>
        <span>비울 수 있어요</span>
        <button class="sm-btn dark" onclick="applyTrash()" ${picked ? '' : 'disabled'}>${ic('trash', 16)}${picked ? `${picked}개 휴지통으로 옮기기` : '휴지통으로 옮기기'}</button>
      </div>
    </section>`

  // ── 휴지통에 넣은 것 — 30일 안에는 되돌릴 수 있다 ──
  const t = trashedList
  /* 못 불러왔으면 그렇게 말한다. 빈 것과 다르다. */
  const 휴지통까닭 = (t && t.error) ? 오류까닭(t.error) : ''
  const trashedErr = (t && t.error) ? `
    <div class="dp-note">휴지통 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.${휴지통까닭 ? `<small>${esc(휴지통까닭.slice(0, 90))}</small>` : ''}</div>` : ''
  /* ⚠️ 휴지통 목록이 중복 정리 화면 안에 묻혀 있었다. 지우고 나서
     어디로 갔는지 찾을 수가 없었다. 별도 창으로 뺀다 (위 openTrash).
     여기서는 '몇 개 들어 있다' 만 알리고 들어가는 자리를 둔다. */
  const inBin = (t && !t.error && t.items?.length) ? t.items.length : 0
  const trashed = inBin ? `
    <button class="dp-bin" onclick="openTrash()">
      <span class="bi">${ic('trash', 20)}</span>
      <b>휴지통에 ${inBin}개</b>
      <span>${tGB(t.bytes)} GB · 30일 안에는 되돌릴 수 있어요</span>
      <span class="go">열기${ic('next', 14)}</span>
    </button>` : ''

  /* 숨긴 제안은 목록에서 아예 뺀다 — 메시지만 감추는 게 아니다. */
  const body = d.groups.map((g, i) => {
    if (g.kind === 'shared' && warnHidden.has(groupKey(g))) return ''
    const lv = LV[g.level] || LV.maybe
    const del = trashDel
    const allGone = g.items.every(a => del.has(a.id))
    const picked0 = g.items.filter(a => del.has(a.id)).length
    const thumb = g.items.find(a => a.thumb)
    const one = g.level === 'sure'
    // ⚠️ 사진에 '재생' 을 붙이면 안 된다. 영상만.
    const play = a => (a.isVideo && a.play)
      ? `<button class="dp-play" onclick="window.api.openExternal('${jsq(a.play)}')">${ic('play', 14)}재생</button>` : ''
    const reveal = a => `<button class="dp-btn" onclick="revealAsset('${jsq(a.folder)}','${jsq(a.fileName)}')">${ic('folder', 15)}폴더 열기</button>`
    /* ⚠️ 예전엔 '삭제함 · 되돌리기' 라고 썼다. 아직 아무것도 안 지웠는데
       이미 지운 것처럼 읽혀서 "왜 삭제한다고 안 했는데 삭제됐냐" 는 말을 들었다.
       지금은 '앞으로 이렇게 할 계획' 이라는 게 드러나는 말만 쓴다. */
    /* ⚠️ 예전엔 여기에 '먼저 올라온 파일이라 이걸 남깁니다' 같은 설명을 달았다.
       기본 선택이 있던 시절의 문장인데, 이제 사람이 직접 고르므로 그 말이
       사실과 달라진다 — 실제로 고아 파일을 남겨 놓고 '먼저 올라와서' 라고
       적혀 있었다. 설명 대신, 잘못 고른 것 같을 때만 짚어준다. */
    const keepWhy = a => {
      if (del.has(a.id) || del.size === 0) return ''
      // 프로젝트에 든 걸 지우고 어디에도 없는 걸 남기려 한다 — 대개 반대로 하려던 것이다
      const losingLive = g.items.some(x => del.has(x.id) && !x.orphan)
      if (!(a.orphan && losingLive)) return ''
      return `<span class="dp-why">프로젝트에 있는 쪽을 남기는 게 좋아요</span>`
    }
    const delBtn = a => {
      /* ⚠️ **두 프로젝트에 걸친 것은 지우지 못하게 한다** — 2026-09-08 대표님 결정.
            실제 사고: 테스터가 여기서 영상을 지웠는데 남긴 짝이 다른 프로젝트 것이라
            원래 프로젝트가 통째로 비었다. 본인은 지운 줄도 몰라 "누락" 으로 제보했다.
            "중복이니 하나만 남겨라" 라고 해놓고 작업물이 빠지면 말과 동작이 갈라진 것이다.
            애초에 지울 이유도 없다 — 저장 공간이 줄지도 않는다. */
      if (g.kind === 'shared') return `<span class="dp-tag keep">${ic('check', 14)}그대로 둬요</span>`
      const on = del.has(a.id)
      /* 짝이 되는 말이어야 한다 — 하기 ↔ 되돌리기.
         '지울 예정 / 그냥 두기' 는 짝이 안 맞아 뭘 누르는 건지 헷갈렸다. */
      /* 이 무리에서 하나라도 골랐고 이건 안 골랐으면 = 남을 것.
         누르면 이것도 지울 수 있다 (무리째 지우는 것도 이제 허용한다). */
      if (!on && picked0 > 0) return `<span class="dp-tag keep">${ic('check', 14)}남길 것</span>
          <button class="dp-btn red" onclick="toggleDel(${i},'${jsq(a.id)}')">${ic('trash', 15)}삭제하기</button>`
      /* ⚠️ 여기 '삭제됨' 이라고 썼다가, 아직 아무것도 안 지웠는데 지운 것처럼
         읽혀서 "삭제가 된 거야 만 거야" 라는 말을 들었다.
         실제로 지우는 건 아래 막대의 '휴지통으로 옮기기' 다. 그때까지는 표시일 뿐이다. */
      if (on) return `<span class="dp-tag del">지울 것</span>
          <button class="dp-btn" onclick="toggleDel(${i},'${jsq(a.id)}')">${ic('undo', 15)}되돌리기</button>`
      return `<button class="dp-btn red" onclick="toggleDel(${i},'${jsq(a.id)}')">${ic('trash', 15)}삭제하기</button>`
    }
    const loc = a => `
      <div class="dp-loc ${del.has(a.id) ? 'del' : ''}">
        <span class="dp-pill ${a.orphan ? 'orphan' : ''}" title="${esc(a.folder || '')}">${a.orphan ? '프로젝트 없음' : esc(a.folder)}</span>
        <b class="dp-fn">${esc(a.fileName)}</b>
        <span class="dp-fs">${tMB(a.fileSize)} MB · ${esc((a.createdAt || '').slice(0, 10))}</span>
        ${keepWhy(a)}
        <span class="dp-acts">${reveal(a)}${delBtn(a)}</span>
      </div>`
    const card = a => `
      <div class="dp-card">
        <div class="dp-img">${a.thumb ? `<img src="${esc(a.thumb)}" alt="">` : '미리보기 없음'}${play(a)}</div>
        ${loc(a)}
      </div>`
    /* ⚠️ 같은 사진을 두 프로젝트에 '일부러' 넣어두는 경우가 있다.
       그런 사람에게는 이 경고가 매번 뜨는 잔소리가 된다. 접을 수 있게 한다.
       접은 것은 앱을 꺼도 기억한다 — 매번 다시 접게 하면 안 접느니만 못하다. */
    /* ⚠️ '메시지 삭제하기' 는 메시지만 숨기는 게 아니라
       이 무리를 제안에서 통째로 빼는 것이다 (일부러 두 곳에 넣은 사람에게는
       매번 뜨는 잔소리다). 실수로 눌렀으면 휴지통의 '숨긴 제안' 에서 되살린다. */
    const warn = (g.kind === 'shared' && !warnHidden.has(groupKey(g)))
      ? `<div class="dp-note dp-warn">
           <span><b>두 프로젝트에서 같이 쓰는 사진이에요</b> — 중복이 아니에요.
           지워도 저장 공간은 안 줄고 <b>그 프로젝트에서만 사진이 없어지기</b> 때문에 지우지 않아요.</span>
           <button class="dp-btn" onclick="hideWarn('${jsq(groupKey(g))}')">메시지 삭제하기</button>
         </div>` : ''
    const inner = one
      ? `<div class="dp-one">
           <div class="dp-img">${thumb ? `<img src="${esc(thumb.thumb)}" alt="">` : '미리보기 없음'}${thumb ? play(thumb) : ''}</div>
           <div class="dp-locs">${g.items.map(loc).join('')}</div>
         </div>`
      : `<div class="dp-cards">${g.items.map(card).join('')}</div>`
    return `
      <section class="card dp-group">
        <div class="dp-gh">
          <i class="dp-dot" style="background:${lv.c}"></i>
          <b class="dp-gt">${lv.t}</b>
          <em class="dp-gm" style="font-style:normal">${tMB(g.items[0].fileSize)} MB × ${g.items.length}개</em>
          ${g.kind === 'shared' ? '' : `<button class="dp-btn ${allGone ? '' : 'red'}" onclick="toggleWholeGroup(${i})">${allGone
                     ? `${ic('undo', 15)}되돌리기` : (g.items.length === 2 ? '둘 다 삭제' : `${g.items.length}개 모두 삭제`)}</button>`}
        </div>
        ${allGone ? `<div class="dp-note red" style="margin:12px 0 0">이 파일은 한 장도 안 남아요. 30일 안에는 되돌릴 수 있어요.</div>` : ''}
        ${lv.sub ? `<p class="dp-gsub">${lv.sub}</p>` : '<div class="dp-gap"></div>'}
        ${warn}${inner}
      </section>`
  }).join('')

  /* ⚠️ 지우는 버튼이 화면 맨 위에만 있었다. 아래에서 파일을 고르고 나면
     그 버튼이 화면 밖이라, 골라놓고도 '지워진 거야 만 거야' 가 됐다.
     고른 게 있으면 아래에 붙어 따라다니는 막대를 띄운다. */
  const barHtml = picked ? `
    <div class="dp-bar">
      <b>${picked}개 고름</b>
      <span>${tMB(pickedBytes)} MB${
        free < pickedBytes ? ` · 공간은 ${tMB(free)} MB 만 줄어요` : ''}</span>
      <button class="ghost gap" onclick="clearTrashPick()">고르기 풀기</button>
      <button class="main" onclick="applyTrash()">휴지통으로 옮기기</button>
    </div>` : ''
  pane.innerHTML = head + trashedErr + trashed + body + barHtml
}

/* 탭 이름 옆에 비울 수 있는 용량을 적는다 — 열어보기 전에도 값어치가 보이게 */
function markTrashTab() {
  const btn = document.getElementById('tab-trash')
  if (!btn || !trashData) return
  /* ⚠️ 여기서 매번 글자를 덮어써서, index.html 에서 '중복 파일' 로 바꿔놔도
     화면에는 계속 '휴지통' 이 떴다. 이름은 한 곳에서만 정한다. */
  /* 새 꼴(11/13): 칸 이름은 정답 그림대로 「중복」, 용량은 옆 작은 알약(좁은 창에선 알약을 숨긴다) */
  const g = tGB(trashData.freeableBytes || 0)
  btn.innerHTML = Number(g) > 0.01 ? `중복<span class="seg-pill">${g}GB</span>` : '중복'
  btn.title = Number(g) > 0.01 ? `중복 파일 — ${g}GB 비울 수 있어요` : '중복 파일'
}

/* 앱을 켜두면 한 번은 조용히 확인해 둔다. 탭을 안 눌러도 용량이 보이게. */
let trashPeeked = false
async function peekTrashOnce() {
  if (trashPeeked) return
  trashPeeked = true
  try {
    const r = await window.api.findDuplicates()
    if (r && !r.error) { trashData = r; markTrashTab() }
  } catch {}
}

/* 한 장씩만 남기고 나머지를 고른다.
   ⚠️ 위험한 무리(두 프로젝트에 걸친 것)는 건드리지 않는다 — 지우면 자리도 안 비고
      한쪽 프로젝트에서 사진만 사라진다. 그건 사람이 직접 골라야 한다. */
function pickAllDupes() {
  trashData.groups.forEach((g) => {
    if (g.kind === 'shared') return
    g.items.slice(1).forEach(a => trashDel.add(a.id))
  })
  renderTrash()
}

function toggleDel(groupIdx, assetId) {
  if (trashDel.has(assetId)) trashDel.delete(assetId)
  else trashDel.add(assetId)
  renderTrash()
}

/* 한 무리를 통째로 — 둘 다(또는 전부) 지우고 싶을 때.
   ⚠️ 예전엔 '마지막 한 장은 못 지운다' 로 막아뒀다. 그런데 두 장 다
      어느 프로젝트에도 없는 파일이면 둘 다 지우는 게 맞다. 막지 않는다.
      대신 무리가 통째로 사라진다는 걸 그 자리에서 알려준다. */
function clearTrashPick() { trashDel.clear(); renderTrash() }

function toggleWholeGroup(groupIdx) {
  const g = trashData.groups[groupIdx]
  const all = g.items.every(a => trashDel.has(a.id))
  g.items.forEach(a => all ? trashDel.delete(a.id) : trashDel.add(a.id))
  renderTrash()
}

async function revealAsset(folder, fileName) {
  const r = await window.api.revealInFolder({ folder, fileName })
  if (!r?.ok) 실패알림({ 제목: '폴더를 열지 못했어요', 어떻게: '', 오류: r?.error || '폴더를 찾지 못했어요.' })
}

async function restoreOne(id) {
  const r = await window.api.untrashAssets([id])
  if (r?.error) { 실패알림({ 제목: '되돌리지 못했어요', 오류: r.error }); return }
  loadTrash()
  if (document.getElementById('trash-modal')) openTrash()
}

/* ⚠️ 예전 확인 글이 「…휴지통으로 옮길게요」 였고(되돌리는 단추인데), 그 글을 만들다 없는 값(bytes)을 불러
      단추를 누르면 아무 일 없이 멈췄다 — 11/13 단추 눌러 보기에서 찾음. 되돌린다는 말로 고치고 크기는 휴지통 합으로. */
async function restoreAll() {
  const ids = (trashedList?.items || []).map(a => a.id)
  if (!ids.length) return
  if (!await 묻기({
    제목: `파일 ${ids.length}개를 모두 되돌릴까요?`,
    글: `${tGB(trashedList?.bytes || 0)}GB · 웹 포트폴리오와 컴퓨터 폴더의 원래 자리로 돌아가요.`,
    예: '전부 되돌리기',
  })) return
  const r = await window.api.untrashAssets(ids)
  if (r?.error) { 실패알림({ 제목: '되돌리지 못했어요', 오류: r.error }); return }
  await 알리기({ 제목: `${r.restored}개를 되돌렸어요` })
  loadTrash()
  if (document.getElementById('trash-modal')) openTrash()
}

/* 휴지통 영구 비우기.
   ⚠️ 되돌릴 수 없다. 그래서 그냥 「예」 로는 안 된다 — 개수를 손으로 적어야 빨간 단추가 눌린다(웹 「맞춰쓰기」 꼴).
      예전엔 확인 창 한 번 + 숫자 적는 창 한 번, 두 창이었다. 웹과 같게 한 창 안에서 둘을 한다.
      「예」 한 번으로 사진 수백 장이 영구히 사라지면 안 된다.
   ⚠️ 컴퓨터 안 _Trash 폴더는 건드리지 않는다. 그건 사용자가 직접 보고 지울 몫이다 —
      우리가 두 곳을 한꺼번에 지우면 되돌릴 방법이 아예 없어진다. */
async function purgeAll() {
  const items = trashedList?.items || []
  const n = items.length
  if (!n) return
  const gb = tGB(trashedList?.bytes || 0)
  const ok = await 맞춰쓰기({
    제목: `휴지통의 파일 ${n}개(${gb}GB)를 영구히 지울까요?`,
    글: `되돌릴 수 없어요. 지우려면 아래 칸에 ${n} 을 써 주세요.\n컴퓨터 안 _Trash 폴더의 원본은 그대로 남아 있어요.`,
    맞출글: String(n), 예: '영구히 지우기', 위험: true,
  })
  if (!ok) return
  const r = await window.api.purgeTrashed(items.map(a => a.id))
  if (!r?.ok) { 실패알림({ 제목: '휴지통을 비우지 못했어요', 오류: r?.error }); return }
  if (r.failed?.length) {
    await 알리기({ 제목: `${r.deleted}개를 지웠어요`, 글: `${r.failed.length}개는 지우지 못했어요. 잠시 뒤 다시 해 주세요.` })
  } else {
    await 알리기({ 제목: `${r.deleted}개를 영구히 지웠어요` })
  }
  loadTrash()
  openTrash()
}

async function applyTrash() {
  /* ⚠️ 예전엔 '두 프로젝트에 다 있는 무리' 를 여기서 통째로 걸렀다.
     그런데 그건 자동으로 고를 때 빼야 하는 것이지, **사람이 직접 고른 것**까지
     버리면 안 된다. 실제로 3개를 골라 눌렀는데 아무 일도 안 일어났다 —
     아무 말도 없이. 고른 것은 고른 대로 옮긴다. */
  const ids = []
  let riskyCount = 0
  trashData.groups.forEach((g) => {
    g.items.forEach(a => {
      if (!trashDel.has(a.id)) return
      ids.push(a.id)
      if (g.kind === 'shared') riskyCount++
    })
  })
  if (!ids.length) { 알리기({ 제목: '고른 파일이 없어요', 글: '지울 파일의 「삭제하기」 를 먼저 눌러 주세요.' }); return }
  /* 고른 크기와 실제로 비는 크기는 다르다. 두 프로젝트에 다 있는 파일은
     지워도 저장 공간이 안 준다 — 숨기면 나중에 "왜 안 줄었냐" 가 된다. */
  let total = 0
  trashData.groups.forEach(g => g.items.forEach(a => { if (trashDel.has(a.id)) total += a.fileSize }))
  const lines = [`모두 ${tMB(total)}MB예요.`]
  if (riskyCount) lines.push(`이 중 ${riskyCount}개는 두 프로젝트에 모두 있어서 저장 공간은 안 줄어요.`)
  lines.push('컴퓨터의 원본도 동기화 폴더 안 _Trash 로 옮겨져요.')
  lines.push('30일 안에는 되돌릴 수 있어요.')
  if (!await 묻기({ 제목: `파일 ${ids.length}개를 휴지통으로 옮길까요?`, 글: lines.join('\n'), 예: '휴지통으로 옮기기', 위험: true })) return
  const r = await window.api.trashAssets(ids)
  if (r?.error) { 실패알림({ 제목: '휴지통으로 옮기지 못했어요', 오류: r.error }); return }
  await 알리기({
    제목: `${r.moved}개를 휴지통으로 옮겼어요`,
    글: `${r.localMoved ? `컴퓨터의 원본 ${r.localMoved}개도 _Trash 로 옮겼어요.\n` : ''}30일 안에는 되돌릴 수 있어요.`,
  })
  loadTrash()
}

/* 기본 화면은 탐색기다 — 사람이 제일 먼저 궁금해하는 건
   '내 폴더가 어떻게 잡혔나' 이지 '지금 뭐가 올라가는 중인가' 가 아니다.
   ⚠️ 이 줄은 반드시 파일 맨 끝이어야 한다. 위에 두면 아직 만들어지지 않은
      변수(explorerRoot 등)를 건드려 앱이 시작하자마자 터진다 — 실제로 그랬다. */
switchTab('explorer')

/* ── 웹을 폴더 기준으로 다시 연결 ──
   폴더를 정리한 뒤 웹에 옛 프로젝트가 남아 어긋나는 경우를 바로잡는다.
   ⚠️ 맥 폴더는 손대지 않는다. 웹 쪽만 휴지통으로 보내고 폴더를 처음부터 다시 읽는다.
   ⚠️ 되돌릴 수 있다는 점을 반드시 먼저 말한다 — 사람이 겁먹고 못 누르면 없는 기능이다. */
async function resetAndResync() {
  const btn = document.getElementById('btn-resync')
  const msg = document.getElementById('resync-msg')
  if (!btn || btn.disabled) return
  const 글색 = 색 => { msg.style.color = 색 === 'red' ? 'var(--ui-red)' : 색 === 'green' ? 'var(--tone-green-ink)' : '' }
  글색()
  msg.textContent = '웹에 무엇이 있는지 보는 중이에요'
  btn.disabled = true

  const 미리 = await window.api.resetAndResyncPreview().catch(e => ({ error: e?.message }))
  if (!미리 || 미리.error) { 글색('red'); msg.textContent = 오류까닭(미리?.error) || '확인하지 못했어요. 잠시 뒤 다시 해 주세요.'; btn.disabled = false; return }

  const 수 = 미리.프로젝트수 || 0
  const 다시올릴 = 미리.다시올릴파일 ?? null
  const 예시 = (미리.이름들 || []).slice(0, 5).join(', ')

  /* ⚠️ **다시 올라갈 파일 수를 먼저 보여준다** — 2026-09-09.
        포맷은 보통 파일을 다시 올리지 않는다 (휴지통에서 꺼내 쓴다).
        그런데 짝을 못 찾는 폴더가 있으면 그만큼 통째로 다시 올라가 용량과 시간이 또 든다.
        그 숫자를 숨기면 사람이 모르고 반복해서 누른다. */
  const 용량줄 = 다시올릴 === null
    ? ''
    : (다시올릴 === 0
        ? `· 다시 올라갈 파일: 없음 (있는 것을 그대로 써요)\n`
        : `· 다시 올라갈 파일: ${다시올릴}개 — 그만큼 용량과 시간이 또 들어요\n`)

  /* 브라우저 기본 확인 창 → 앱 안 창(11/13). 글은 그대로, 해요체로 */
  const 물음 =
    (예시 ? `예: ${예시}${수 > 5 ? ' 외 ' + (수 - 5) + '개' : ''}\n\n` : '') +
    `· 컴퓨터 폴더의 파일은 하나도 지우지 않아요\n` +
    `· 폴더에 있는 프로젝트는 그대로 되살아나요\n` +
    `· 폴더에 없는 것만 휴지통에 남아요 (30일 안에 되돌릴 수 있어요)\n` +
    용량줄
  if (!await 묻기({ 제목: `웹의 프로젝트 ${수}개를 휴지통으로 보내고 폴더를 처음부터 다시 읽을까요?`, 글: 물음.trim(), 예: '다시 연결', 위험: true })) {
    msg.textContent = ''; btn.disabled = false; return
  }

  /* 다시 올릴 게 많으면 한 번 더 막는다 — 먼저 동기화를 돌리면 대개 0 이 된다 */
  if (다시올릴 > 0) {
    const 폴더들 = (미리.다시올릴폴더 || []).slice(0, 5).map(x => `· ${x.폴더} (${x.파일}개)`).join('\n')
    const 두번째 =
      (폴더들 ? 폴더들 + '\n\n' : '') +
      `앱을 켜 둔 채 1~2분 기다렸다가 다시 누르면 대개 다시 올릴 파일이 없어져요.`
    if (!await 묻기({ 제목: `짝을 못 찾은 폴더가 있어 파일 ${다시올릴}개가 다시 올라가요. 그래도 지금 할까요?`, 글: 두번째, 예: '지금 하기', 아니오: '기다리기', 위험: true })) {
      msg.textContent = '기다렸다가 다시 눌러 주세요.'; btn.disabled = false; return
    }
  }

  msg.textContent = '웹을 비우고 폴더를 다시 읽는 중이에요. 창을 닫지 마세요.'
  const r = await window.api.resetAndResync({}).catch(e => ({ error: e?.message }))

  if (r?.막힘) {
    글색('red')
    msg.textContent = r.안내
    if (await 묻기({ 제목: '그래도 계속할까요?', 글: r.안내, 예: '계속', 위험: true })) {
      글색()
      msg.textContent = '웹을 비우고 폴더를 다시 읽는 중이에요'
      const r2 = await window.api.resetAndResync({ 강행: true }).catch(e => ({ error: e?.message }))
      finishResync(r2, btn, msg)
      return
    }
    btn.disabled = false
    return
  }
  finishResync(r, btn, msg)
}

function finishResync(r, btn, msg) {
  btn.disabled = false
  if (!r || r.error) { msg.style.color = 'var(--ui-red)'; msg.textContent = 오류까닭(r?.error) || '다시 연결하지 못했어요. 잠시 뒤 다시 해 주세요.'; return }
  msg.style.color = 'var(--tone-green-ink)'
  msg.textContent = `끝났어요. 프로젝트 ${r.프로젝트 || 0}개를 휴지통으로 보내고 폴더를 다시 읽는 중이에요. `
    + '잠시 뒤 웹을 새로고침하면 폴더와 같아져 있어요.'
}
window.resetAndResync = resetAndResync
