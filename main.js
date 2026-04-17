const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const http = require('http')

let mainWindow = null
let tray = null
const STATE_PATH = path.join(app.getPath('userData'), 'sync-state.json')
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }
  catch { return {} }
}

function saveConfig(data) {
  const prev = loadConfig()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...prev, ...data }, null, 2))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 480,
    resizable: true,
    frame: false,
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
  tray.setToolTip('ASSI Sync')
  tray.on('click', () => mainWindow?.show())

  const contextMenu = Menu.buildFromTemplate([
    { label: 'ASSI Sync 열기', click: () => mainWindow?.show() },
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

// ──── Google OAuth via localhost ────
// Now captures ID token + refresh token for secure API calls
ipcMain.handle('google-login', async () => {
  return new Promise((resolve) => {
    const port = 18234 + Math.floor(Math.random() * 1000)

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
        <div class="sub">GOOGLE LOGIN</div>
        <div class="spinner" id="spinner"></div>
        <p class="status" id="status">Google 로그인 중...</p>
      </div>
      <script>
        firebase.initializeApp({
          apiKey: "AIzaSyD-JUPcZ5iIIBEtoCE7YPye0PRP4WTPGgg",
          authDomain: "assi-app-6ea04.firebaseapp.com",
          projectId: "assi-app-6ea04",
        });
        const provider = new firebase.auth.GoogleAuthProvider();
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
  await syncEngine.rescan()
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

// ─── Keynote Import 파이프라인 ─────────────────────────────
const { parseKeynoteFile } = require('./lib/keynote-parser')
const { extractAllImages } = require('./lib/keynote-extractor')
const { classifyWithClaude } = require('./lib/keynote-ai')
const { applyClassification: applyFoldering } = require('./lib/local-foldering')
const os = require('os')

const { buildReviewHtml } = require('./scripts/keynote-ai-classify')

// 활성 세션 (sessionId → { sessionDir, parsed, extracted, classification })
const keynoteSessions = new Map()
const keynoteReviewWindows = new Map() // sessionId → BrowserWindow

function openKeynoteReviewWindow(sessionId, data) {
  const sess = keynoteSessions.get(sessionId)
  if (!sess) return null
  const htmlPath = path.join(sess.sessionDir, 'review.html')
  const html = buildReviewHtml(data)
  fs.writeFileSync(htmlPath, html)

  const win = new BrowserWindow({
    width: 1200, height: 860, minWidth: 900, minHeight: 600,
    backgroundColor: '#F4F3EE',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    parent: mainWindow,
  })
  win.setMenu(null)
  win.loadFile(htmlPath)
  win.on('closed', () => keynoteReviewWindows.delete(sessionId))
  keynoteReviewWindows.set(sessionId, win)
  return win
}

function sendKnProgress(payload) {
  try { mainWindow?.webContents.send('keynote-progress', payload) } catch {}
}

ipcMain.handle('keynote:select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Keynote', extensions: ['key'] }],
  })
  if (canceled || !filePaths[0]) return null
  return filePaths[0]
})

ipcMain.handle('keynote:parse', async (_, { filePath, apiKey }) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) throw new Error('file not found')
    const sessionId = 'kn-' + Date.now()
    const sessionDir = path.join(os.homedir(), '.assi-sync', 'keynote-sessions', sessionId)
    fs.mkdirSync(sessionDir, { recursive: true })

    sendKnProgress({ sessionId, phase: 'parse', status: 'start' })
    const parsed = await parseKeynoteFile(filePath, p => sendKnProgress({ sessionId, phase: 'parse', ...p }))
    parsed.sourcePath = filePath
    parsed.sourceName = path.basename(filePath)
    sendKnProgress({ sessionId, phase: 'parse', status: 'done', slides: parsed.slides.length, images: parsed.images.length })

    sendKnProgress({ sessionId, phase: 'extract', status: 'start' })
    const extracted = await extractAllImages(filePath, parsed, sessionDir, p => sendKnProgress({ sessionId, phase: 'extract', ...p }))
    sendKnProgress({ sessionId, phase: 'extract', status: 'done', count: extracted.length })

    // AI 분류용 이미지 목록 (순서 유지 + textTokens 포함)
    const seen = new Set()
    const orderedImages = []
    const metaByFn = new Map()
    for (const ex of extracted) metaByFn.set(ex.fileName, ex)
    const slideGroups = parsed.groups.filter(g => g.slideIndex != null).sort((a,b)=>a.slideIndex - b.slideIndex)
    for (const sg of slideGroups) {
      let pos = 0
      for (const fn of sg.imageNames) {
        if (seen.has(fn)) continue
        seen.add(fn)
        const meta = metaByFn.get(fn)
        if (!meta?.thumbPath) continue
        orderedImages.push({
          fileName: fn, slideIndex: sg.slideIndex, slideTitle: (sg.title || '').trim(),
          textTokens: sg.textTokens || [], positionInSlide: pos++,
          extractedPath: meta.extractedPath, thumbPath: meta.thumbPath,
        })
      }
    }
    for (const ex of extracted) {
      if (!seen.has(ex.fileName) && ex.thumbPath) {
        orderedImages.push({ fileName: ex.fileName, slideIndex: -1, slideTitle: '', textTokens: [], positionInSlide: 0, extractedPath: ex.extractedPath, thumbPath: ex.thumbPath })
      }
    }

    let classification
    if (apiKey) {
      sendKnProgress({ sessionId, phase: 'ai', status: 'start' })
      const aiResult = await classifyWithClaude({
        apiKey, images: orderedImages,
        onProgress: p => sendKnProgress({ sessionId, phase: 'ai', ...p }),
      })
      classification = { projects: aiResult.projects, excludedOverview: aiResult.excludedOverview, usage: aiResult.usage }
      sendKnProgress({ sessionId, phase: 'ai', status: 'done', projects: aiResult.projects.length })
    } else {
      // 키 없음 → 미분류 단일 그룹 폴백
      classification = {
        projects: [{ title: '미분류', category: null, imageFileNames: orderedImages.map(i => i.fileName), reasoning: 'API 키 없음 — 수동 분류 필요', titleIndicatorIndex: null, order: 0 }],
      }
    }

    // 세션 영속화
    const payload = {
      sessionId, sourcePath: filePath, sourceName: parsed.sourceName,
      sessionDir, orderedImages, classification,
      imageMeta: Object.fromEntries(orderedImages.map(i => [i.fileName, { extractedPath: i.extractedPath, thumbPath: i.thumbPath }])),
    }
    keynoteSessions.set(sessionId, payload)
    try { fs.writeFileSync(path.join(sessionDir, 'session.json'), JSON.stringify(payload, null, 2)) } catch {}

    // renderer 로 돌려줄 때 thumbUrl 변환 (file:// URL)
    const toFileUrl = p => 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23')
    const imagesByFn = {}
    for (const im of orderedImages) {
      imagesByFn[im.fileName] = { slideIndex: im.slideIndex, slideTitle: im.slideTitle, thumbUrl: im.thumbPath ? toFileUrl(im.thumbPath) : null }
    }

    // 분류 결과 리뷰 창 자동 오픈
    const reviewData = {
      sessionId, sourceName: parsed.sourceName,
      totalImages: orderedImages.length,
      imagesByFn, projects: classification.projects,
      modelTag: apiKey ? 'claude-sonnet-4' : 'fallback',
    }
    openKeynoteReviewWindow(sessionId, reviewData)

    return {
      ok: true, sessionId, sourceName: parsed.sourceName,
      totalImages: orderedImages.length,
      projectsCount: classification.projects.length,
      modelTag: apiKey ? 'claude-sonnet-4' : 'fallback',
    }
  } catch (e) {
    console.error('[Keynote:parse] fail', e)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('keynote:apply', async (_, { sessionId, classification, watchDir: explicitWatchDir }) => {
  try {
    const sess = keynoteSessions.get(sessionId)
    if (!sess) throw new Error('세션 없음: ' + sessionId)
    // watchDir 우선순위: 인자 > syncEngine > config
    const cfg = loadConfig()
    const watchDir = explicitWatchDir || syncEngine?.watchDir || cfg.watchDir
    if (!watchDir) throw new Error('동기화 폴더가 설정되지 않았습니다')
    if (!fs.existsSync(watchDir)) throw new Error('폴더가 존재하지 않습니다: ' + watchDir)
    const imageMeta = new Map(Object.entries(sess.imageMeta))
    sendKnProgress({ sessionId, phase: 'folder', status: 'start' })
    const result = await applyFoldering({
      sessionDir: sess.sessionDir,
      watchDir,
      classification,
      imageMeta,
      onProgress: p => sendKnProgress({ sessionId, phase: 'folder', ...p }),
    })
    sendKnProgress({ sessionId, phase: 'folder', status: 'done', ...result })
    // sync-engine 이 이미 돌고 있으면 rescan, 아니면 스킵 (사용자가 나중에 수동 시작)
    try { if (syncEngine?.rescan) await syncEngine.rescan() } catch {}
    return { ok: true, ...result, watchDir }
  } catch (e) {
    console.error('[Keynote:apply] fail', e)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('keynote:cleanup', (_, { sessionId }) => {
  try {
    const sess = keynoteSessions.get(sessionId)
    if (sess?.sessionDir && fs.existsSync(sess.sessionDir)) {
      fs.rmSync(sess.sessionDir, { recursive: true, force: true })
    }
    keynoteSessions.delete(sessionId)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('keynote:get-api-key', () => loadConfig().anthropicApiKey || '')
ipcMain.handle('keynote:set-api-key', (_, key) => { saveConfig({ anthropicApiKey: key || '' }); return { ok: true } })

// 바탕화면에 ASSI Sync 폴더 자동 생성 + config 에 watchDir 저장
ipcMain.handle('keynote:ensure-watchdir', async (_, { mode }) => {
  try {
    const cfg = loadConfig()
    if (cfg.watchDir && fs.existsSync(cfg.watchDir)) return { ok: true, watchDir: cfg.watchDir, existed: true }
    let watchDir
    if (mode === 'desktop-auto') {
      const desktop = app.getPath('desktop')
      watchDir = path.join(desktop, 'ASSI Sync')
      fs.mkdirSync(watchDir, { recursive: true })
    } else if (mode === 'pick') {
      const r = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'ASSI Sync 폴더 선택 (없으면 새로 만들기)',
      })
      if (r.canceled || !r.filePaths[0]) return { ok: false, cancelled: true }
      watchDir = r.filePaths[0]
    } else {
      throw new Error('invalid mode')
    }
    saveConfig({ watchDir })
    return { ok: true, watchDir, existed: false }
  } catch (e) { return { ok: false, error: e.message } }
})
