const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell, session } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const http = require('http')
const crypto = require('crypto')

let mainWindow = null
let tray = null
const STATE_PATH = path.join(app.getPath('userData'), 'sync-state.json')
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

/* ── 옛 이름(assi-sync) 폴더에서 설정 옮겨오기 — 2026-08-31 ──
   보이는 이름을 '포폴 싱크' 로 바꾸면서 설정 저장 폴더도 바뀐다.
   ⚠️ 그냥 두면 로그인·동기화 폴더는 물론 sync-state.json 까지 잃는다.
      그러면 앱이 폴더 전체를 처음 보는 것처럼 다시 훑고 다시 올린다.
      한 번만, 새 폴더가 비어 있을 때만 옮긴다. 원본은 지우지 않는다. */
;(function migrateFromOldName() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return          // 이미 새 폴더에 있다
    const oldDir = path.join(app.getPath('appData'), 'assi-sync')
    if (!fs.existsSync(oldDir)) return
    const newDir = app.getPath('userData')
    fs.mkdirSync(newDir, { recursive: true })
    let moved = 0
    for (const f of ['config.json', 'sync-state.json', 'classification.json', 'device.json']) {
      const from = path.join(oldDir, f)
      if (fs.existsSync(from) && !fs.existsSync(path.join(newDir, f))) {
        fs.copyFileSync(from, path.join(newDir, f)); moved++
      }
    }
    if (moved) console.log(`[Migrate] 옛 폴더에서 설정 ${moved}개를 옮겨왔다: ${oldDir}`)
  } catch (e) {
    console.warn('[Migrate] 설정 옮기기 실패:', e.message)
  }
})()

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }
  catch { return {} }
}

function saveConfig(data) {
  const prev = loadConfig()
  /* ⚠️ 계정이 바뀌면 감시 폴더를 물려주면 안 된다.
     로그아웃할 때는 지우고 있었지만, 로그아웃 없이 다른 계정으로 로그인하면
     이전 계정의 폴더가 그대로 남아 있었다. 그 상태로 동기화를 시작하면
     남의 파일이 새 계정으로 올라간다.
     로그인 통로가 셋(애플·구글·이메일)이라 여기 한 곳에서 막는다. */
  if (data && data.uid && prev.uid && data.uid !== prev.uid) {
    data = { ...data, watchDir: '' }
    try { if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH) } catch {}
    console.log('[Config] 계정이 바뀌어 감시 폴더와 동기화 기록을 비웠다')
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...prev, ...data }, null, 2))
}


/* ──────────────────────────────────────────────────────────────
   응용 프로그램 폴더로 옮기기 — 2026-08-31

   왜 필요한가:
     맥은 인터넷에서 받은 앱을 '다운로드 폴더에서' 실행하면 원본 대신
     읽기 전용 임시 복사본을 만들어 거기서 돌린다(App Translocation).
     자동 업데이트는 자기 자신을 덮어쓰는 일이라, 이 상태에서는 매번
     "Cannot update while running on a read-only volume" 로 실패한다.
     압축을 풀고 그냥 더블클릭하는 게 가장 자연스러운 행동인데,
     그렇게 하면 업데이트가 영원히 안 된다 — 아무도 안 알려주니까.

   ⚠️ 안내문만 띄우면 안 된다. 사람은 안내를 읽고도 안 옮긴다.
      앱이 직접 옮기고 스스로 다시 켜야 실제로 해결된다.
   ────────────────────────────────────────────────────────────── */
function ensureInApplications() {
  if (process.platform !== 'darwin') return
  if (!app.isPackaged) return                 // 개발 중에는 건드리지 않는다
  try { if (app.isInApplicationsFolder()) return } catch { return }

  const answer = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['응용 프로그램 폴더로 옮기기', '나중에'],
    defaultId: 0,
    cancelId: 1,
    title: '포폴 싱크',
    message: '앱을 응용 프로그램 폴더로 옮길까요?',
    detail: [
      '지금은 다운로드 폴더에서 실행되고 있습니다.',
      '이 상태에서는 맥의 보안 기능 때문에 자동 업데이트가 되지 않습니다.',
      '',
      '옮기면 앱이 한 번 다시 켜지고, 그 뒤로는 업데이트가 정상으로 됩니다.',
      '로그인과 감시 폴더 설정은 그대로 유지됩니다.',
    ].join('\n'),
  })
  if (answer !== 0) return

  try {
    /* 같은 이름의 앱이 이미 응용 프로그램 폴더에 있을 수 있다.
       실제로 옛 버전이 남아 있어서 옮기기가 막힌 적이 있다. */
    app.moveToApplicationsFolder({
      conflictHandler: (type) => {
        if (type === 'existsAndRunning') {
          dialog.showMessageBoxSync({
            type: 'warning', title: '포폴 싱크',
            message: '같은 앱이 이미 실행 중입니다',
            detail: '응용 프로그램 폴더에 있는 포폴 싱크를 먼저 끄고 다시 시도해 주세요.',
          })
          return false
        }
        return true   // 옛 버전이 남아 있으면 덮어쓴다
      },
    })
    /* 성공하면 일렉트론이 알아서 옮기고 다시 켠다 — 여기 아래는 안 온다 */
  } catch (e) {
    dialog.showMessageBoxSync({
      type: 'warning', title: '포폴 싱크',
      message: '옮기지 못했습니다',
      detail: [
        e.message,
        '',
        'Finder 에서 앱을 응용 프로그램 폴더로 직접 끌어다 놓아 주세요.',
        '그렇게만 하면 자동 업데이트가 정상으로 됩니다.',
      ].join('\n'),
    })
  }
}

function createWindow() {
  /* 창틀 — 2026-08-31
     ⚠️ 예전에는 맥에서도 창틀을 끄고(frame:false) 동그라미 세 개를 HTML 로
        직접 그렸다. 색은 진짜 맥과 같은데 자리가 오른쪽이고 순서도 반대여서
        "맥 창인 줄 알고 봤는데 계속 어긋나는" 느낌이 났다.
        맥에서는 시스템이 그린 진짜 버튼을 왼쪽 위에 쓴다. */
  const isMac = process.platform === 'darwin'
  mainWindow = new BrowserWindow({
    /* 420×640 은 휴대폰 비율이라 맥 앱치고 너무 좁았다.
       휴지통 카드가 잘린 것도 이 폭 때문이었다. */
    width: 560,
    height: 720,
    minWidth: 440,
    minHeight: 560,
    resizable: true,
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 14 } }
      : { frame: false }),
    transparent: false,
    backgroundColor: '#F4F3EE',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadFile('renderer/index.html')

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  // macOS: Template 이미지 사용 (다크/라이트 모드 자동 대응)
  const isMac = process.platform === 'darwin'
  const iconName = isMac ? 'tray-iconTemplate.png' : 'tray-icon.png'
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', iconName))
  if (isMac) icon.setTemplateImage(true)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('포폴 싱크')
  tray.on('click', () => mainWindow?.show())

  const contextMenu = Menu.buildFromTemplate([
    { label: '포폴 싱크 열기', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: '동기화 상태',
      enabled: false,
      id: 'sync-status',
    },
    {
      label: '동기화 폴더 변경',
      click: () => {
        mainWindow?.show()
        mainWindow?.webContents.send('tray-action', 'change-folder')
      },
    },
    { type: 'separator' },
    {
      label: '업데이트 확인',
      click: () => {
        autoUpdater.checkForUpdatesAndNotify()
        mainWindow?.show()
      },
    },
    {
      label: '설정',
      click: () => {
        mainWindow?.show()
        mainWindow?.webContents.send('tray-action', 'settings')
      },
    },
    { type: 'separator' },
    {
      label: '로그아웃',
      click: () => {
        mainWindow?.show()
        mainWindow?.webContents.send('tray-action', 'logout')
      },
    },
    { label: '종료', click: () => { app.isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(contextMenu)
}

app.whenReady().then(() => {
  /* ⚠️ 창을 만들기 전에 해야 한다. 옮기기가 성공하면 앱이 그 자리에서
     다시 켜지므로, 창을 먼저 띄우면 빈 창이 깜빡이고 사라진다. */
  ensureInApplications()
  createWindow()
  createTray()

  // ──── Auto Updater ────
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    mainWindow?.show()
    mainWindow?.webContents.send('update-status', { status: 'available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-status', { status: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send('update-status', { status: 'ready', version: info.version, releaseNotes: info.releaseNotes || '' })
  })
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-status', { status: 'up-to-date' })
  })
  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater]', err.message)
    mainWindow?.webContents.send('update-status', { status: 'error', message: err.message })
  })

  // 앱 시작 5초 후 업데이트 체크 (알림 대신 직접 체크)
  setTimeout(() => autoUpdater.checkForUpdates(), 5000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ──── IPC Handlers ────

ipcMain.handle('open-external', (_, url) => shell.openExternal(url))

// ── 휴지통 ──
// ⚠️ 중복 판정은 서버가 한다. 여기서는 서버에 묻고 결과를 넘기기만 한다.
//    파일 위치를 Finder/탐색기에서 열어주는 건 여기서만 할 수 있다.
ipcMain.handle('find-duplicates', async () => {
  if (!syncEngine?.api) return { error: '동기화가 시작되지 않았습니다' }
  try { return await syncEngine.api.findDuplicates() }
  catch (e) { return { error: e.message } }
})

ipcMain.handle('trash-assets', async (_, assetIds) => {
  if (!syncEngine?.api) return { error: '동기화가 시작되지 않았습니다' }
  try {
    const r = await syncEngine.api.trashAssets(assetIds)
    /* ⚠️ 클라우드만 지우면 컴퓨터의 원본이 그대로 남아 디스크가 안 준다.
       로컬 파일도 _Trash 로 옮긴다. 되돌릴 수 있게 원래 자리를 적어둔다. */
    let local = { moved: 0 }
    try { local = syncEngine.trashAssetFiles(assetIds) } catch (e) { console.warn('[trash] 로컬 이동 실패:', e.message) }
    return { ...r, localMoved: local.moved }
  }
  catch (e) { return { error: e.message } }
})

ipcMain.handle('list-trashed', async () => {
  if (!syncEngine?.api) return { error: '동기화가 시작되지 않았습니다' }
  try { return await syncEngine.api.listTrashedAssets() }
  catch (e) { return { error: e.message } }
})

ipcMain.handle('untrash-assets', async (_, assetIds) => {
  if (!syncEngine?.api) return { error: '동기화가 시작되지 않았습니다' }
  try {
    const r = await syncEngine.api.untrashAssets(assetIds)
    let local = { restored: 0 }
    try { local = syncEngine.restoreAssetFiles(assetIds) } catch (e) { console.warn('[trash] 로컬 복구 실패:', e.message) }
    return { ...r, localRestored: local.restored }
  }
  catch (e) { return { error: e.message } }
})

// 폴더 위치 열기 — 파일이 있으면 그 파일을 고른 채로, 없으면 폴더만
ipcMain.handle('reveal-in-folder', (_, { folder, fileName }) => {
  const root = syncEngine?.watchDir
  if (!root) return { ok: false, error: '동기화 폴더를 모릅니다' }
  const fsMod = require('fs')
  const pathMod = require('path')
  const dir = pathMod.join(root, ...String(folder || '').split('/'))
  const file = pathMod.join(dir, fileName || '')
  if (fileName && fsMod.existsSync(file)) { shell.showItemInFolder(file); return { ok: true, at: 'file' } }
  if (fsMod.existsSync(dir)) { shell.openPath(dir); return { ok: true, at: 'folder' } }
  return { ok: false, error: '이 컴퓨터에 아직 내려받지 않은 파일입니다' }
})
ipcMain.handle('minimize-window', () => mainWindow?.minimize())
ipcMain.handle('maximize-window', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('close-window', () => mainWindow?.hide())
ipcMain.handle('check-update', () => autoUpdater.checkForUpdates())
ipcMain.handle('install-update', async () => {
  try {
    app.isQuitting = true
    mainWindow?.webContents.send('update-status', { status: 'installing' })
    // macOS: forceRunAfter=true 필수 (안하면 설치 후 앱이 안 열림)
    // isSilent=false: macOS에서 silent 모드가 설치를 막을 수 있음
    const isMac = process.platform === 'darwin'
    await new Promise(r => setTimeout(r, 300))
    autoUpdater.quitAndInstall(isMac, false)
    return { success: true }
  } catch (err) {
    console.error('[AutoUpdater] quitAndInstall failed:', err)
    app.isQuitting = false
    mainWindow?.webContents.send('update-status', { status: 'error', message: '설치 실패: ' + err.message })
    return { success: false, error: err.message }
  }
})
ipcMain.handle('get-app-version', () => app.getVersion())


/* ──────────────────────────────────────────────────────────────
   이메일 로그인 — 2026-08-31

   앱에는 애플·구글 로그인만 있었고, 그 아래 'UID 직접 입력' 칸이 열려 있었다.
   UID 는 우리끼리 쓰는 말이고, 고객이 자기 UID 를 알 방법도 없다.
   웹에는 이메일 로그인이 있는데 앱에만 없어서 생긴 구멍이었다.

   ⚠️ 비밀번호는 여기서 Firebase 로 바로 보내고 **저장하지 않는다.**
      config.json 에 남는 건 토큰뿐이다 (다른 로그인 방식과 같다).
   ────────────────────────────────────────────────────────────── */
const FIREBASE_API_KEY = 'AIzaSyD-JUPcZ5iIIBEtoCE7YPye0PRP4WTPGgg'

ipcMain.handle('email-login', async (_e, { email, password }) => {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }) })
    const data = await res.json()
    if (data.error) {
      /* 서버가 주는 말(EMAIL_NOT_FOUND 등)은 고객이 읽을 말이 아니다.
         무엇을 하면 되는지로 바꿔서 돌려준다. */
      const code = data.error.message || ''
      const say =
        /EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/.test(code)
          ? '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요.'
        : /TOO_MANY_ATTEMPTS/.test(code)
          ? '잠시 후에 다시 시도해 주세요.'
        : /USER_DISABLED/.test(code)
          ? '사용할 수 없는 계정이에요. 고객센터로 문의해 주세요.'
          : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.'
      return { error: say }
    }
    const userData = {
      uid: data.localId,
      name: data.displayName || '',
      email: data.email || email,
      photo: '',
      idToken: data.idToken,
      refreshToken: data.refreshToken,
    }
    saveConfig(userData)
    return userData
  } catch (e) {
    return { error: '연결하지 못했어요. 인터넷을 확인해 주세요.' }
  }
})

// ──── OAuth via localhost (Google + Apple) ────
// Generic Firebase Auth popup flow. provider 인자로 'google' / 'apple' 분기.
function buildAuthHandler(providerKind) {
  // providerKind: 'google' | 'apple'
  return async () => new Promise((resolve) => {
    const port = 18234 + Math.floor(Math.random() * 1000)

    const subLabel = providerKind === 'apple' ? 'APPLE LOGIN' : 'GOOGLE LOGIN'
    const statusText = providerKind === 'apple' ? 'Apple 로그인 중...' : 'Google 로그인 중...'
    const providerJsExpr = providerKind === 'apple'
      ? `(() => { const p = new firebase.auth.OAuthProvider('apple.com'); p.addScope('email'); p.addScope('name'); return p })()`
      : `new firebase.auth.GoogleAuthProvider()`

    const authHTML = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>ASSI Login</title>
      <style>
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
        * { margin:0; padding:0; box-sizing:border-box; font-family:'Pretendard Variable',sans-serif; }
        body { background:#F4F3EE; display:flex; align-items:center; justify-content:center; height:100vh; }
        .card { text-align:center; padding:40px; }
        .logo { font-size:32px; font-weight:900; color:#1A1A1A; }
        .sub { font-size:11px; letter-spacing:0.2em; color:#828DF8; font-weight:700; margin-bottom:24px; }
        .status { font-size:13px; color:#999; margin-top:16px; }
        .spinner { width:24px; height:24px; border:3px solid #ddd; border-top:3px solid #828DF8;
          border-radius:50%; animation:spin 0.8s linear infinite; margin:16px auto; }
        @keyframes spin { to { transform:rotate(360deg) } }
      </style>
      <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
      <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
    </head><body>
      <div class="card">
        <div class="logo">ASSI</div>
        <div class="sub">${subLabel}</div>
        <div class="spinner" id="spinner"></div>
        <p class="status" id="status">${statusText}</p>
      </div>
      <script>
        firebase.initializeApp({
          apiKey: "AIzaSyD-JUPcZ5iIIBEtoCE7YPye0PRP4WTPGgg",
          authDomain: "assi-app-6ea04.firebaseapp.com",
          projectId: "assi-app-6ea04",
        });
        const provider = ${providerJsExpr};
        firebase.auth().signInWithPopup(provider).then(async (result) => {
          const u = result.user;
          const idToken = await u.getIdToken();
          document.getElementById('status').textContent = '로그인 성공! 창이 닫힙니다...';
          document.getElementById('spinner').style.display = 'none';
          fetch('/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: u.uid,
              name: u.displayName || '',
              email: u.email || '',
              photo: u.photoURL || '',
              idToken: idToken,
              refreshToken: u.refreshToken || '',
            }),
          });
        }).catch(err => {
          document.getElementById('status').textContent = '로그인 실패: ' + err.message;
          document.getElementById('spinner').style.display = 'none';
          setTimeout(() => fetch('/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message }),
          }), 2000);
        });
      </script>
    </body></html>`

    let authWindow = null
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`)

      if (url.pathname === '/auth') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(authHTML)
      } else if (url.pathname === '/callback' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('OK')

          let data
          try { data = JSON.parse(body) } catch { data = { error: 'Parse error' } }

          setTimeout(() => {
            authWindow?.close()
            authWindow = null
            server.close()

            if (data.uid) {
              const userData = {
                uid: data.uid,
                name: data.name || '',
                email: data.email || '',
                photo: data.photo || '',
                idToken: data.idToken || '',
                refreshToken: data.refreshToken || '',
              }
              saveConfig(userData)
              resolve(userData)
            } else {
              resolve({ error: data.error || 'Login failed' })
            }
          }, 500)
        })
      } else if (url.pathname === '/callback' && req.method === 'GET') {
        // Fallback for GET (backward compat)
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('OK')

        const uid = url.searchParams.get('uid')
        const error = url.searchParams.get('error')

        setTimeout(() => {
          authWindow?.close()
          authWindow = null
          server.close()

          if (uid) {
            const userData = {
              uid,
              name: url.searchParams.get('name') || '',
              email: url.searchParams.get('email') || '',
              photo: url.searchParams.get('photo') || '',
            }
            saveConfig(userData)
            resolve(userData)
          } else {
            resolve({ error: error || 'Login failed' })
          }
        }, 500)
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    server.listen(port, '127.0.0.1', () => {
      authWindow = new BrowserWindow({
        width: 500,
        height: 650,
        resizable: false,
        parent: mainWindow,
        modal: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })
      authWindow.setMenuBarVisibility(false)
      authWindow.loadURL(`http://127.0.0.1:${port}/auth`)

      authWindow.on('closed', () => {
        authWindow = null
        server.close()
        resolve({ error: 'Window closed' })
      })
    })
  })
}

// Google 은 generic signInWithPopup 흐름 사용 (Google 은 localhost context 허용)
ipcMain.handle('google-login', buildAuthHandler('google'))

// Apple 은 호스팅된 페이지 (assifolio.com/auth-popup.html) 를 BrowserWindow 로 띄움.
// Apple Service ID Domain 에 assifolio.com 등록 → signInWithPopup 의 context_uri 가 assifolio.com →
// Apple 검증 통과. 페이지가 성공 시 location.hash 로 결과 박아두면 Electron 이 가로채서 닫음.
ipcMain.handle('apple-login', () => new Promise((resolve) => {
  const popupURL = 'https://assifolio.com/auth-popup.html?provider=apple'
  let captured = false
  let authWindow = new BrowserWindow({
    width: 500, height: 700, resizable: false, parent: mainWindow, modal: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  authWindow.setMenuBarVisibility(false)

  // 페이지가 결과를 location.hash 에 박으면 (#assi-result=<base64 json>) 가로채서 결과 추출.
  const handleNavigate = (_event, url) => {
    try {
      const u = new URL(url)
      const hash = u.hash || ''
      const m = hash.match(/#assi-result=([^&]+)/)
      if (!m) return
      const json = decodeURIComponent(atob(m[1]))
      const data = JSON.parse(json)
      captured = true
      authWindow?.close()
      if (data.uid) {
        const userData = { uid: data.uid, name: data.name || '', email: data.email || '', photo: data.photo || '' }
        if (data.idToken) userData.idToken = data.idToken
        if (data.refreshToken) userData.refreshToken = data.refreshToken
        saveConfig(userData)
        resolve(userData)
      } else {
        resolve({ error: data.error || 'Apple login failed' })
      }
    } catch (e) {
      console.error('[apple-login] hash parse', e)
    }
  }
  authWindow.webContents.on('did-navigate', handleNavigate)
  authWindow.webContents.on('did-navigate-in-page', handleNavigate)

  authWindow.on('closed', () => {
    if (!captured) resolve({ error: 'Window closed' })
    authWindow = null
  })

  authWindow.loadURL(popupURL)
}))


// sync-state.json 청소 — 로그아웃 시 호출. 다음 계정으로 fresh sync 시작.
ipcMain.handle('clear-sync-state', () => {
  try {
    if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH)
  } catch (e) {
    console.warn('[clear-sync-state]', e)
  }
  return true
})

ipcMain.handle('get-config', () => loadConfig())

ipcMain.handle('save-config', (_, data) => {
  saveConfig(data)
  return true
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '감시할 폴더 선택',
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// ──── Sync Engine (runs in main process) ────
// Now uses ApiClient instead of Firebase Admin SDK
let syncEngine = null

const pendingFolderApprovals = new Map()

ipcMain.handle('approve-folder', (_, { id, approved }) => {
  const resolve = pendingFolderApprovals.get(id)
  if (resolve) {
    resolve(approved)
    pendingFolderApprovals.delete(id)
    if (!approved && syncEngine) {
      setTimeout(() => {
        mainWindow?.webContents.send('pending-folders-updated', syncEngine.getPendingFolders())
      }, 300)
    }
  }
  return true
})

ipcMain.handle('start-sync', async (_, { uid, watchDir }) => {
  if (syncEngine) {
    syncEngine.stop()
  }

  saveConfig({ uid, watchDir })

  // Load tokens from config
  const config = loadConfig()
  const idToken = config.idToken
  const refreshToken = config.refreshToken

  if (!idToken) {
    mainWindow?.webContents.send('sync-error', { message: '인증 토큰이 없습니다. 다시 로그인해주세요.' })
    return false
  }

  // Create API client (no credentials stored locally!)
  const { ApiClient } = require('./lib/api-client.js')
  const api = new ApiClient({
    idToken,
    refreshToken,
    onTokenRefreshed: (tokens) => {
      // Persist refreshed tokens
      saveConfig({ idToken: tokens.idToken, refreshToken: tokens.refreshToken })
    },
  })

  // [v1.9.15] main process 의 console.log/warn 을 renderer DevTools 로 forward.
  // sync-engine 의 진단 로그가 사용자 DevTools (renderer) 에 안 보이던 문제 해결.
  const origLog = console.log
  const origWarn = console.warn
  const origErr = console.error
  console.log = (...args) => { origLog(...args); try { mainWindow?.webContents.send('main-log', { lvl: 'log', msg: args.map(String).join(' ') }) } catch {} }
  console.warn = (...args) => { origWarn(...args); try { mainWindow?.webContents.send('main-log', { lvl: 'warn', msg: args.map(String).join(' ') }) } catch {} }
  console.error = (...args) => { origErr(...args); try { mainWindow?.webContents.send('main-log', { lvl: 'error', msg: args.map(String).join(' ') }) } catch {} }

  const { SyncEngine } = require('./lib/sync-engine.js')
  syncEngine = new SyncEngine({
    uid,
    watchDir,
    statePath: STATE_PATH,
    api,
    onProgress: (data) => mainWindow?.webContents.send('sync-progress', data),
    onFileStatus: (data) => mainWindow?.webContents.send('file-status', data),
    onError: (data) => mainWindow?.webContents.send('sync-error', data),
    onFolderRemoved: () => {
      mainWindow?.webContents.send('synced-folders-updated', syncEngine.getSyncedFolders())
    },
    onFolderDeletionRequested: (info) => {
      // Finder 에서 동기화된 폴더 삭제 감지 → 사용자 confirm 대기 (자동 삭제 X)
      mainWindow?.webContents.send('folder-deletion-requested', info)
    },
    onNewFolder: (data) => {
      // 자동 승인 — 폴더 넣으면 바로 동기화 시작
      mainWindow?.webContents.send('new-folder-auto', { name: data.name, fileCount: data.fileCount })
      return true
    },
  })

  await syncEngine.start()
  return true
})

ipcMain.handle('stop-sync', () => {
  syncEngine?.stop()
  syncEngine = null
  return true
})

// 진단 — DevTools 에서 window.electronAPI.diagnoseSync() 호출 → 현재 sync 상태 dump
ipcMain.handle('diagnose-sync', () => {
  if (!syncEngine) return { error: 'syncEngine not running' }
  return syncEngine.diagnose()
})

// 진단 — 특정 자산을 강제 다운로드 (skip 우회). DevTools 에서 assetId 박아서 테스트.
ipcMain.handle('force-download-asset', async (_, assetId) => {
  if (!syncEngine) return { error: 'syncEngine not running' }
  try {
    const assets = await syncEngine.api.request('firestore', { action: 'getAsset', id: assetId }).catch(() => null)
    if (!assets) return { error: 'asset not found' }
    return await syncEngine.downloadRemoteAsset(assets)
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('retry-file', async (_, relativePath) => {
  if (!syncEngine) return false
  await syncEngine.retryFile(relativePath)
  return true
})

ipcMain.handle('retry-all-failed', async () => {
  if (!syncEngine) return false
  await syncEngine.retryAllFailed()
  return true
})

ipcMain.handle('rescan', async () => {
  if (!syncEngine) return false
  // 1) 로컬 폴더 재스캔 (기존 — 업로드용)
  await syncEngine.rescan()
  // 2) 다운로드 풀스캔 — downloadSince/cursor 리셋 후 즉시 폴링 트리거.
  //    웹에 있는데 데스크탑에 없는 누락 자산 회수.
  if (syncEngine.state) {
    syncEngine.state.downloadSince = null
    syncEngine.state.downloadCursor = null
    syncEngine.saveState?.()
    console.log('[rescan] 다운로드 풀스캔 ─ downloadSince/cursor null 리셋')
  }
  await syncEngine.triggerDownloadPollNow?.().catch(e => console.warn('[rescan] download poll error:', e?.message))
  return true
})

ipcMain.handle('check-shares', async () => {
  if (!syncEngine) return { error: 'sync engine not running' }
  return await syncEngine.checkPendingShares()
})

ipcMain.handle('get-pending-folders', () => {
  if (!syncEngine) return []
  return syncEngine.getPendingFolders()
})

ipcMain.handle('approve-pending-folder', async (_, projectKey) => {
  if (!syncEngine) return false
  await syncEngine.approvePendingFolder(projectKey)
  mainWindow?.webContents.send('pending-folders-updated', syncEngine.getPendingFolders())
  return true
})

ipcMain.handle('remove-pending-folder', (_, projectKey) => {
  if (!syncEngine) return false
  syncEngine.removePendingFolder(projectKey)
  mainWindow?.webContents.send('pending-folders-updated', syncEngine.getPendingFolders())
  return true
})

ipcMain.handle('get-synced-folders', () => {
  if (!syncEngine) return []
  return syncEngine.getSyncedFolders()
})

ipcMain.handle('resync-folder', async (_, projectKey) => {
  if (!syncEngine) return false
  await syncEngine.resyncFolder(projectKey)
  mainWindow?.webContents.send('synced-folders-updated', syncEngine.getSyncedFolders())
  return true
})

ipcMain.handle('delete-synced-folder', async (_, projectKey) => {
  if (!syncEngine) return false
  await syncEngine.deleteSyncedFolder(projectKey)
  mainWindow?.webContents.send('synced-folders-updated', syncEngine.getSyncedFolders())
  return true
})

// 사용자가 "삭제 confirm" 다이얼로그에서 "예" 누르면 호출 — soft delete (휴지통 7일).
ipcMain.handle('confirm-folder-deletion', async (_, { projectId }) => {
  if (!syncEngine || !projectId) return { ok: false }
  try {
    const r = await syncEngine.api.softDeleteProject(projectId)
    return { ok: true, ...r }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// 사용자가 "취소" 누르면 — 그대로 두고 다음 폴링에서 자동 재다운로드되게 다운로드 트리거
ipcMain.handle('cancel-folder-deletion', async () => {
  if (!syncEngine) return { ok: false }
  await syncEngine.triggerDownloadPollNow?.().catch(() => {})
  return { ok: true }
})

// ── Folder Tree Explorer ──
const fsPromises = require('fs').promises
const DEFAULT_CATS = ['FASHION', 'BEAUTY', 'CELEBRITY', 'AD', 'PORTRAIT', 'PERSONAL WORK']
const IMG_RE = /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tif|tiff|avif|cr2|nef|arw|dng|raf|mp4|mov|avi|mkv|webm|m4v|wmv|flv)$/i

ipcMain.handle('scan-folder-tree', async () => {
  if (!syncEngine) return null
  const root = syncEngine.watchDir
  if (!root) return null
  const synced = new Set(Object.keys(syncEngine.state.syncedFiles).map(k => k.split('/').slice(0, -1).join('/')))

  async function readDir(dir, depth) {
    if (depth > 5) return []
    let entries
    try { entries = await fsPromises.readdir(dir, { withFileTypes: true }) } catch { return [] }
    const out = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = require('path').join(dir, e.name)
      if (e.isDirectory()) {
        const children = await readDir(full, depth + 1)
        const fileCount = (await fsPromises.readdir(full).catch(() => []))
          .filter(n => IMG_RE.test(n)).length
        out.push({ name: e.name, path: full, isDir: true, depth, fileCount, children })
      }
    }
    return out
  }

  const tree = await readDir(root, 0)
  // 뱃지 계산:
  // depth 0 = 카테고리 (1차), 직속 파일 무시
  // depth 1+ = 하위 폴더 없는 리프 폴더 → 프로젝트 (업로드됨/대기/비어있음)
  //            하위 폴더 있는 폴더 → 중간 그루핑 폴더
  function annotate(nodes) {
    for (const n of nodes) {
      if (n.depth === 0) {
        const norm = n.name.trim().toUpperCase()
        n.badge = DEFAULT_CATS.includes(norm) ? 'category' : 'category-custom'
        n.fileCount = 0  // 카테고리 직속 파일은 무시
      } else {
        const isLeaf = !n.children || n.children.length === 0
        if (isLeaf) {
          // 리프 폴더 = 프로젝트
          const rel = require('path').relative(root, n.path).split(require('path').sep).join('/')
          n.badge = synced.has(rel) ? 'uploaded' : (n.fileCount > 0 ? 'pending' : 'empty')
        }
        // 중간 폴더(자식 있음)는 뱃지 없이 그대로 표시
      }
      if (n.children?.length) annotate(n.children)
    }
  }
  annotate(tree)
  return { root, tree }
})

ipcMain.handle('move-folder', async (_, { from, to }) => {
  try {
    await fsPromises.rename(from, to)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('open-in-explorer', (_, p) => {
  shell.showItemInFolder(p)
  return true
})

// ── Explorer: Rename & Reorder ──

ipcMain.handle('rename-project', async (_, { projectKey, newName }) => {
  if (!syncEngine) return { ok: false, error: '동기화가 실행 중이 아닙니다' }
  try {
    const result = await syncEngine.renameProject(projectKey, newName)
    mainWindow?.webContents.send('synced-folders-updated', syncEngine.getSyncedFolders())
    return result
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('rename-file', async (_, { relPath, newFileName }) => {
  if (!syncEngine) return { ok: false, error: '동기화가 실행 중이 아닙니다' }
  try {
    return await syncEngine.renameFile(relPath, newFileName)
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('get-project-files', async (_, projectKey) => {
  if (!syncEngine) return []
  try {
    return await syncEngine.getProjectFiles(projectKey)
  } catch { return [] }
})

ipcMain.handle('reorder-files', async (_, orderedAssetIds) => {
  if (!syncEngine) return { ok: false }
  try {
    return await syncEngine.reorderFiles(orderedAssetIds)
  } catch (err) {
    return { ok: false, error: err.message }
  }
})
